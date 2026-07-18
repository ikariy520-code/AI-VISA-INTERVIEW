import {
  buildF1ReportMessages,
  getModelMessageContent,
  sanitizeReportRequest,
  validateF1StructuredReport,
} from './shared/f1ReportContract.mjs'
import { createHash } from 'node:crypto'

const REPORT_PATH = '/api/ai-report'
const HEALTH_PATH = '/api/report-health'
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const MAX_BODY_BYTES = 96_000
const REQUEST_TIMEOUT_MS = 120_000
const MAX_REPORT_ATTEMPTS = 2
const MAX_OUTPUT_TOKENS_PER_ATTEMPT = 32_000
const RATE_WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 6
const MAX_ACTIVE_REQUESTS = 4
const TOKEN_BUDGET_WINDOW_MS = 60 * 60 * 1000
const MAX_IP_COMPLETION_TOKENS_PER_WINDOW = 192_000
const MAX_GLOBAL_COMPLETION_TOKENS_PER_WINDOW = 768_000
const REPORT_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_REPORT_CACHE_ENTRIES = 200

function writeJson(res, status, body, extraHeaders = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value)
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function safeEndpoint(value) {
  try {
    const url = new URL(String(value || DEFAULT_DEEPSEEK_BASE_URL).trim())
    if (url.protocol !== 'https:' || url.hostname !== 'api.deepseek.com') {
      return `${DEFAULT_DEEPSEEK_BASE_URL}/chat/completions`
    }
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/$/, '')
    if (!url.pathname.endsWith('/chat/completions')) {
      url.pathname = `${url.pathname}/chat/completions`.replace(/\/+/g, '/')
    }
    return url.toString()
  } catch {
    return `${DEFAULT_DEEPSEEK_BASE_URL}/chat/completions`
  }
}

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(value => value.trim()).filter(Boolean)
  return forwarded.at(-1) || req.socket.remoteAddress || 'unknown'
}

function isSameOrigin(req) {
  const origin = String(req.headers.origin || '')
  const host = String(req.headers.host || '')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function parseModelContent(payload) {
  const content = getModelMessageContent(payload)
  if (!content) throw Object.assign(new Error('EMPTY_MODEL_RESPONSE'), { code: 'EMPTY_MODEL_RESPONSE' })
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(normalized)
}

export function createTokenBudget(options = {}) {
  const windowMs = Number(options.windowMs) || TOKEN_BUDGET_WINDOW_MS
  const perIpLimit = Number(options.perIpLimit) || MAX_IP_COMPLETION_TOKENS_PER_WINDOW
  const globalLimit = Number(options.globalLimit) || MAX_GLOBAL_COMPLETION_TOKENS_PER_WINDOW
  const reservationSize = Number(options.reservationSize) || MAX_OUTPUT_TOKENS_PER_ATTEMPT
  const now = typeof options.now === 'function' ? options.now : Date.now
  const ipWindows = new Map()
  let globalWindow = { used: 0, startedAt: now() }

  function currentWindow(bucket, timestamp) {
    return !bucket || timestamp - bucket.startedAt >= windowMs
      ? { used: 0, startedAt: timestamp }
      : bucket
  }

  function reserve(ip) {
    const timestamp = now()
    globalWindow = currentWindow(globalWindow, timestamp)
    if (ipWindows.size > 1_000) {
      for (const [key, bucket] of ipWindows) {
        if (timestamp - bucket.startedAt >= windowMs) ipWindows.delete(key)
      }
      while (ipWindows.size > 2_000) ipWindows.delete(ipWindows.keys().next().value)
    }
    const ipWindow = currentWindow(ipWindows.get(ip), timestamp)
    ipWindows.set(ip, ipWindow)

    const ipRetryAfter = Math.max(1, Math.ceil((windowMs - (timestamp - ipWindow.startedAt)) / 1_000))
    const globalRetryAfter = Math.max(1, Math.ceil((windowMs - (timestamp - globalWindow.startedAt)) / 1_000))
    if (ipWindow.used + reservationSize > perIpLimit) return { allowed: false, retryAfter: ipRetryAfter, scope: 'ip' }
    if (globalWindow.used + reservationSize > globalLimit) return { allowed: false, retryAfter: globalRetryAfter, scope: 'global' }

    ipWindow.used += reservationSize
    globalWindow.used += reservationSize
    let settled = false
    return {
      allowed: true,
      settle(actualTokens) {
        if (settled) return
        settled = true
        const reported = Number(actualTokens)
        if (!Number.isFinite(reported) || reported < 0) return
        const actual = Math.min(reservationSize, Math.ceil(reported))
        const refund = reservationSize - actual
        ipWindow.used = Math.max(0, ipWindow.used - refund)
        globalWindow.used = Math.max(0, globalWindow.used - refund)
      },
    }
  }

  return { reserve }
}

async function callDeepSeek({ apiKey, endpoint, model, input, tokenBudget, ip, signal }) {
  let lastError
  for (let attempt = 0; attempt < MAX_REPORT_ATTEMPTS; attempt += 1) {
    const reservation = tokenBudget.reserve(ip)
    if (!reservation.allowed) {
      throw Object.assign(new Error('REPORT_TOKEN_BUDGET_EXCEEDED'), {
        code: 'REPORT_TOKEN_BUDGET_EXCEEDED',
        retryAfter: reservation.retryAfter,
        budgetScope: reservation.scope,
      })
    }
    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: buildF1ReportMessages(input),
          response_format: { type: 'json_object' },
          thinking: { type: 'enabled' },
          reasoning_effort: 'high',
          max_tokens: MAX_OUTPUT_TOKENS_PER_ATTEMPT,
          stream: false,
        }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
          : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      const payload = await upstream.json().catch(() => null)
      reservation.settle(payload?.usage?.completion_tokens)
      if (!upstream.ok) {
        const error = Object.assign(new Error('DEEPSEEK_REPORT_SERVICE_ERROR'), {
          code: 'DEEPSEEK_REPORT_SERVICE_ERROR',
          upstreamStatus: upstream.status,
        })
        if (upstream.status < 500 && upstream.status !== 429) throw error
        lastError = error
        continue
      }

      const report = validateF1StructuredReport(parseModelContent(payload), input)
      if (!report) {
        throw Object.assign(new Error('DEEPSEEK_REPORT_VALIDATION_FAILED'), {
          code: 'DEEPSEEK_REPORT_VALIDATION_FAILED',
        })
      }
      return report
    } catch (error) {
      lastError = error
      const upstreamStatus = Number(error?.upstreamStatus)
      const retryable = error?.name === 'TimeoutError'
        || error?.name === 'AbortError'
        || error instanceof TypeError
        || error instanceof SyntaxError
        || error?.code === 'EMPTY_MODEL_RESPONSE'
        || error?.code === 'DEEPSEEK_REPORT_VALIDATION_FAILED'
        || upstreamStatus === 429
        || upstreamStatus >= 500
      if (!retryable) throw error
    }
  }
  throw lastError || new Error('DEEPSEEK_REPORT_SERVICE_UNAVAILABLE')
}

export function createReportHandler(options = {}) {
  const apiKey = String(options.apiKey || '').trim()
  const model = String(options.model || 'deepseek-v4-pro').trim()
  const endpoint = safeEndpoint(options.baseUrl)
  const configured = Boolean(apiKey && model)
  const requestWindows = new Map()
  const tokenBudget = createTokenBudget()
  const reportCache = new Map()
  const activeReportKeys = new Set()
  let activeRequests = 0

  function reportKey(ip, input) {
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    return `${ip}:${digest}`
  }

  function cachedReport(key) {
    const now = Date.now()
    const cached = reportCache.get(key)
    if (cached && cached.expiresAt > now) return cached.report
    if (cached) reportCache.delete(key)
    if (reportCache.size > MAX_REPORT_CACHE_ENTRIES) {
      for (const [cacheKey, value] of reportCache) {
        if (value.expiresAt <= now || reportCache.size > MAX_REPORT_CACHE_ENTRIES) reportCache.delete(cacheKey)
      }
    }
    return null
  }

  function takeRateSlot(ip) {
    const now = Date.now()
    if (requestWindows.size > 1_000) {
      for (const [key, value] of requestWindows) {
        if (now - value.startedAt >= RATE_WINDOW_MS) requestWindows.delete(key)
      }
    }
    const current = requestWindows.get(ip)
    if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
      requestWindows.set(ip, { count: 1, startedAt: now })
      return { allowed: true }
    }
    if (current.count >= MAX_REQUESTS_PER_WINDOW) {
      const retryAfter = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1_000))
      return { allowed: false, retryAfter }
    }
    current.count += 1
    return { allowed: true }
  }

  async function handleReport(req, res) {
    const pathname = req.url?.split('?')[0] ?? ''

    if (pathname === HEALTH_PATH && (req.method === 'GET' || req.method === 'HEAD')) {
      writeJson(res, configured ? 200 : 503, {
        ok: configured,
        provider: 'deepseek-report',
        model,
        ...(configured ? {} : { error: 'DEEPSEEK_REPORT_NOT_CONFIGURED' }),
      })
      return true
    }

    if (pathname !== REPORT_PATH) return false
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'METHOD_NOT_ALLOWED' })
      return true
    }
    if (!configured) {
      writeJson(res, 503, { error: 'DEEPSEEK_REPORT_NOT_CONFIGURED' })
      return true
    }
    if (!isSameOrigin(req)) {
      writeJson(res, 403, { error: 'INVALID_ORIGIN' })
      return true
    }

    const ip = clientIp(req)
    const rate = takeRateSlot(ip)
    if (!rate.allowed) {
      writeJson(res, 429, { error: 'REPORT_RATE_LIMITED' }, { 'Retry-After': String(rate.retryAfter) })
      return true
    }
    if (activeRequests >= MAX_ACTIVE_REQUESTS) {
      writeJson(res, 503, { error: 'REPORT_BUSY' })
      return true
    }

    let rawBody
    try {
      rawBody = await readJsonBody(req)
    } catch (error) {
      writeJson(res, error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
        error: error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      })
      return true
    }

    const input = sanitizeReportRequest(rawBody)
    if (!input) {
      writeJson(res, 400, { error: 'INVALID_REPORT_REQUEST' })
      return true
    }

    const key = reportKey(ip, input)
    const cached = cachedReport(key)
    if (cached) {
      writeJson(res, 200, { report: cached, provider: 'deepseek', model, schemaVersion: 2, cached: true })
      return true
    }
    if (activeReportKeys.has(key)) {
      writeJson(res, 409, { error: 'REPORT_ALREADY_IN_PROGRESS' })
      return true
    }

    activeReportKeys.add(key)
    activeRequests += 1
    const clientAbort = new AbortController()
    const abortOnDisconnect = () => {
      if (!res.writableEnded) {
        clientAbort.abort(Object.assign(new Error('CLIENT_DISCONNECTED'), { code: 'CLIENT_DISCONNECTED' }))
      }
    }
    res.once('close', abortOnDisconnect)
    try {
      const report = await callDeepSeek({ apiKey, endpoint, model, input, tokenBudget, ip, signal: clientAbort.signal })
      reportCache.set(key, { report, expiresAt: Date.now() + REPORT_CACHE_TTL_MS })
      writeJson(res, 200, { report, provider: 'deepseek', model, schemaVersion: 2 })
    } catch (error) {
      if (error?.code === 'CLIENT_DISCONNECTED') return true
      const upstreamStatus = Number(error?.upstreamStatus)
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      const tokenBudgetExceeded = error?.code === 'REPORT_TOKEN_BUDGET_EXCEEDED'
      const status = tokenBudgetExceeded || upstreamStatus === 429 ? 429 : timeout ? 504 : 502
      console.error('[report] DeepSeek final report failed:', error?.code || error?.name || 'UNKNOWN')
      writeJson(res, status, {
        error: tokenBudgetExceeded
          ? 'REPORT_TOKEN_BUDGET_EXCEEDED'
          : timeout
            ? 'DEEPSEEK_REPORT_TIMEOUT'
            : upstreamStatus === 429
              ? 'DEEPSEEK_REPORT_RATE_LIMITED'
              : error?.code || 'DEEPSEEK_REPORT_SERVICE_UNAVAILABLE',
      }, tokenBudgetExceeded ? { 'Retry-After': String(error.retryAfter || 3600) } : {})
    } finally {
      res.off('close', abortOnDisconnect)
      activeReportKeys.delete(key)
      activeRequests -= 1
    }
    return true
  }

  handleReport.configured = configured
  handleReport.model = model
  return handleReport
}
