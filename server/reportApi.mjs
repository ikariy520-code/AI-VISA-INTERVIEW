import {
  buildDeterministicF1FallbackReport,
  buildF1ReportMessages,
  getModelMessageContent,
  repairF1ReportEvidence,
  sanitizeReportRequest as sanitizeF1ReportRequest,
  validateF1StructuredReport,
} from './shared/f1ReportContract.mjs'
import {
  buildB2ReportMessages,
  buildDeterministicB2FallbackReport,
  sanitizeB2ReportRequest,
  validateB2StructuredReport,
} from './shared/b2ReportContract.mjs'
import { createHash } from 'node:crypto'
import { request as httpsRequest } from 'node:https'

const REPORT_PATH = '/api/ai-report'
const HEALTH_PATH = '/api/report-health'
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const MAX_BODY_BYTES = 96_000
// One initial draft plus at most two bounded repair passes. This guarantees the
// validator cannot create an unbounded token loop while giving each repair pass
// enough room to fix every reported issue at once.
const MAX_REPORT_ATTEMPTS = 3
const MAX_OUTPUT_TOKENS_PER_ATTEMPT = 32_000
const REPORT_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_REPORT_CACHE_ENTRIES = 200
const MAX_B2_REPORT_ATTEMPTS = 2
const MAX_B2_OUTPUT_TOKENS = 10_000
const RETRYABLE_NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UPSTREAM_RESPONSE_ABORTED',
])

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

function postJsonWithoutDeadline(endpoint, { headers, body, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('CLIENT_DISCONNECTED'))
      return
    }

    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abortRequest)
      callback(value)
    }
    const request = httpsRequest(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      response.once('error', error => finish(reject, error))
      response.once('aborted', () => finish(reject, Object.assign(new Error('UPSTREAM_RESPONSE_ABORTED'), {
        code: 'UPSTREAM_RESPONSE_ABORTED',
      })))
      response.once('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let payload = null
        try {
          payload = JSON.parse(text)
        } catch {
          // Invalid upstream JSON is handled by the existing report validation/retry path.
        }
        const status = response.statusCode || 502
        finish(resolve, { ok: status >= 200 && status < 300, status, payload })
      })
    })
    const abortRequest = () => {
      request.destroy(signal?.reason instanceof Error ? signal.reason : new Error('CLIENT_DISCONNECTED'))
    }
    signal?.addEventListener('abort', abortRequest, { once: true })
    request.once('error', error => finish(reject, error))
    request.end(body)
  })
}

export async function generateF1Report({
  apiKey,
  endpoint,
  model,
  input,
  signal,
  requestJson = postJsonWithoutDeadline,
}) {
  let lastError
  let repairContext = ''
  for (let attempt = 0; attempt < MAX_REPORT_ATTEMPTS; attempt += 1) {
    try {
      const messages = buildF1ReportMessages(input, repairContext)
      const upstream = await requestJson(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: 'json_object' },
          thinking: { type: 'enabled' },
          reasoning_effort: 'high',
          max_tokens: MAX_OUTPUT_TOKENS_PER_ATTEMPT,
          stream: false,
        }),
        signal,
      })

      const payload = upstream.payload
      if (!upstream.ok) {
        const error = Object.assign(new Error('DEEPSEEK_REPORT_SERVICE_ERROR'), {
          code: 'DEEPSEEK_REPORT_SERVICE_ERROR',
          upstreamStatus: upstream.status,
        })
        if (upstream.status < 500 && upstream.status !== 429) throw error
        lastError = error
        continue
      }

      const originalDraft = parseModelContent(payload)
      let validationIssues = []
      let report = validateF1StructuredReport(originalDraft, input, {
        onIssue: issue => { validationIssues.push(issue) },
      })
      let draft = originalDraft
      if (!report) {
        const repairEvents = []
        const evidenceRepairedDraft = repairF1ReportEvidence(originalDraft, input, {
          onRepair: event => { repairEvents.push(event) },
        })
        if (repairEvents.length > 0) {
          const repairedValidationIssues = []
          const evidenceRepairedReport = validateF1StructuredReport(evidenceRepairedDraft, input, {
            onIssue: issue => { repairedValidationIssues.push(issue) },
            allowMaterializedEvidence: true,
          })
          console.warn(`[report] Corrected report evidence references: ${repairEvents.join(',')}`)
          if (evidenceRepairedReport) return evidenceRepairedReport
          draft = evidenceRepairedDraft
          validationIssues = repairedValidationIssues
        }
      }
      if (!report) {
        throw Object.assign(new Error('DEEPSEEK_REPORT_VALIDATION_FAILED'), {
          code: 'DEEPSEEK_REPORT_VALIDATION_FAILED',
          validationIssues: validationIssues.length > 0 ? [...new Set(validationIssues)] : ['UNKNOWN_VALIDATION_FAILURE'],
          reportDraft: draft,
        })
      }
      return report
    } catch (error) {
      lastError = error
      if (error?.code === 'CLIENT_DISCONNECTED' || signal?.aborted) throw error
      if (error?.code === 'DEEPSEEK_REPORT_VALIDATION_FAILED') {
        const issues = Array.isArray(error.validationIssues) && error.validationIssues.length > 0
          ? error.validationIssues
          : ['UNKNOWN_VALIDATION_FAILURE']
        repairContext = { issues, draft: error.reportDraft }
        console.warn(`[report] Report draft rejected by validator: ${issues.join(',')}`)
      } else if (error instanceof SyntaxError) {
        repairContext = { issues: ['INVALID_JSON'], draft: null }
      }
      const upstreamStatus = Number(error?.upstreamStatus)
      const retryable = error?.name === 'TimeoutError'
        || error?.name === 'AbortError'
        || error instanceof TypeError
        || error instanceof SyntaxError
        || error?.code === 'EMPTY_MODEL_RESPONSE'
        || error?.code === 'DEEPSEEK_REPORT_VALIDATION_FAILED'
        || RETRYABLE_NETWORK_CODES.has(error?.code)
        || upstreamStatus === 429
        || upstreamStatus >= 500
      if (!retryable) break
    }
  }
  const fallbackEligible = lastError?.code === 'DEEPSEEK_REPORT_VALIDATION_FAILED'
    || lastError?.code === 'EMPTY_MODEL_RESPONSE'
    || lastError instanceof SyntaxError
  if (!fallbackEligible) throw lastError || new Error('DEEPSEEK_REPORT_SERVICE_UNAVAILABLE')
  const fallback = buildDeterministicF1FallbackReport(input)
  const validatedFallback = validateF1StructuredReport(fallback, input, {
    allowMaterializedEvidence: true,
    analysisMode: 'evidence_only',
  })
  if (!validatedFallback) throw lastError || new Error('DEEPSEEK_REPORT_SERVICE_UNAVAILABLE')
  console.warn(`[report] Using bounded evidence fallback after report generation failure: ${lastError?.code || lastError?.name || 'UNKNOWN'}`)
  return validatedFallback
}

export async function generateB2Report({
  apiKey,
  endpoint,
  model,
  input,
  signal,
  requestJson = postJsonWithoutDeadline,
}) {
  let lastError
  let repairContext = ''
  for (let attempt = 0; attempt < MAX_B2_REPORT_ATTEMPTS; attempt += 1) {
    try {
      const upstream = await requestJson(endpoint, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: buildB2ReportMessages(input, repairContext),
          response_format: { type: 'json_object' },
          thinking: { type: 'enabled' },
          reasoning_effort: 'high',
          max_tokens: MAX_B2_OUTPUT_TOKENS,
          stream: false,
        }),
        signal,
      })
      if (!upstream.ok) {
        const error = Object.assign(new Error('DEEPSEEK_REPORT_SERVICE_ERROR'), {
          code: 'DEEPSEEK_REPORT_SERVICE_ERROR', upstreamStatus: upstream.status,
        })
        if (upstream.status < 500 && upstream.status !== 429) throw error
        lastError = error
        continue
      }
      const draft = parseModelContent(upstream.payload)
      const issues = []
      const report = validateB2StructuredReport(draft, input, { onIssue: issue => issues.push(issue) })
      if (report) return report
      throw Object.assign(new Error('DEEPSEEK_REPORT_VALIDATION_FAILED'), {
        code: 'DEEPSEEK_REPORT_VALIDATION_FAILED', validationIssues: issues.length ? [...new Set(issues)] : ['UNKNOWN_VALIDATION_FAILURE'],
      })
    } catch (error) {
      lastError = error
      if (error?.code === 'CLIENT_DISCONNECTED' || signal?.aborted) throw error
      if (error?.code === 'DEEPSEEK_REPORT_VALIDATION_FAILED') repairContext = error.validationIssues
      else if (error instanceof SyntaxError) repairContext = ['INVALID_JSON']
      const status = Number(error?.upstreamStatus)
      const retryable = error instanceof SyntaxError
        || error?.code === 'EMPTY_MODEL_RESPONSE'
        || error?.code === 'DEEPSEEK_REPORT_VALIDATION_FAILED'
        || RETRYABLE_NETWORK_CODES.has(error?.code)
        || status === 429 || status >= 500
      if (!retryable) break
    }
  }
  if (!(lastError instanceof SyntaxError)
    && lastError?.code !== 'EMPTY_MODEL_RESPONSE'
    && lastError?.code !== 'DEEPSEEK_REPORT_VALIDATION_FAILED') throw lastError || new Error('DEEPSEEK_REPORT_SERVICE_UNAVAILABLE')
  const fallback = buildDeterministicB2FallbackReport(input)
  const validated = validateB2StructuredReport(fallback, input, { analysisMode: 'evidence_only' })
  if (!validated) throw lastError || new Error('DEEPSEEK_REPORT_SERVICE_UNAVAILABLE')
  return validated
}

export function createReportHandler(options = {}) {
  const apiKey = String(options.apiKey || '').trim()
  const model = String(options.model || 'deepseek-v4-pro').trim()
  const endpoint = safeEndpoint(options.baseUrl)
  const configured = Boolean(apiKey && model)
  const reportCache = new Map()
  const activeReportKeys = new Set()

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
    let rawBody
    try {
      rawBody = await readJsonBody(req)
    } catch (error) {
      writeJson(res, error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
        error: error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      })
      return true
    }

    const input = sanitizeF1ReportRequest(rawBody) || sanitizeB2ReportRequest(rawBody)
    if (!input) {
      writeJson(res, 400, { error: 'INVALID_REPORT_REQUEST' })
      return true
    }

    const key = reportKey(ip, input)
    const cached = cachedReport(key)
    if (cached) {
      writeJson(res, 200, {
        report: cached,
        provider: cached.analysisMode === 'evidence_only' ? 'evidence-only' : 'deepseek',
        model,
        schemaVersion: 2,
        analysisMode: cached.analysisMode,
        cached: true,
      })
      return true
    }
    if (activeReportKeys.has(key)) {
      writeJson(res, 409, { error: 'REPORT_ALREADY_IN_PROGRESS' })
      return true
    }

    activeReportKeys.add(key)
    const clientAbort = new AbortController()
    const abortOnDisconnect = () => {
      if (!res.writableEnded) {
        clientAbort.abort(Object.assign(new Error('CLIENT_DISCONNECTED'), { code: 'CLIENT_DISCONNECTED' }))
      }
    }
    res.once('close', abortOnDisconnect)
    try {
      const report = input.visaType === 'B2'
        ? await generateB2Report({ apiKey, endpoint, model, input, signal: clientAbort.signal })
        : await generateF1Report({ apiKey, endpoint, model, input, signal: clientAbort.signal })
      reportCache.set(key, { report, expiresAt: Date.now() + REPORT_CACHE_TTL_MS })
      writeJson(res, 200, {
        report,
        provider: report.analysisMode === 'evidence_only' ? 'evidence-only' : 'deepseek',
        model,
        schemaVersion: 2,
        analysisMode: report.analysisMode,
      })
    } catch (error) {
      if (error?.code === 'CLIENT_DISCONNECTED') return true
      const upstreamStatus = Number(error?.upstreamStatus)
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      const status = upstreamStatus === 429 ? 429 : timeout ? 504 : 502
      console.error('[report] DeepSeek final report failed:', error?.code || error?.name || 'UNKNOWN')
      writeJson(res, status, {
        error: timeout
          ? 'DEEPSEEK_REPORT_TIMEOUT'
          : upstreamStatus === 429
            ? 'DEEPSEEK_REPORT_RATE_LIMITED'
            : error?.code || 'DEEPSEEK_REPORT_SERVICE_UNAVAILABLE',
      })
    } finally {
      res.off('close', abortOnDisconnect)
      activeReportKeys.delete(key)
    }
    return true
  }

  handleReport.configured = configured
  handleReport.model = model
  return handleReport
}
