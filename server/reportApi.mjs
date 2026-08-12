import {
  buildF1AnalysisMessages,
  buildDeterministicF1FallbackReport,
  composeF1ReportFromAnalysis,
  getModelMessageContent,
  sanitizeReportRequest as sanitizeF1ReportRequest,
  validateF1AnalysisPacket,
  validateF1StructuredReport,
} from './shared/f1ReportContract.mjs'
import {
  buildB2ReportMessages,
  buildDeterministicB2FallbackReport,
  sanitizeB2ReportRequest,
  validateB2StructuredReport,
} from './shared/b2ReportContract.mjs'
import { createHash } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

const REPORT_PATH = '/api/ai-report'
const HEALTH_PATH = '/api/report-health'
const DEFAULT_REPORT_BASE_URL = 'https://api.deepseek.com'
const MAX_BODY_BYTES = 96_000
const BASIC_OUTPUT_TOKENS = 2_500
const STRONG_OUTPUT_TOKENS = 4_000
const FULL_OUTPUT_TOKENS = 6_000
const MAX_F1_REPORT_ATTEMPTS = 2
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
    const url = new URL(String(value || DEFAULT_REPORT_BASE_URL).trim())
    const loopbackHttp = url.protocol === 'http:' && ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
    if (url.protocol !== 'https:' && !loopbackHttp) return ''
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/$/, '')
    if (!url.pathname.endsWith('/chat/completions')) {
      url.pathname = `${url.pathname}/chat/completions`.replace(/\/+/g, '/')
    }
    return url.toString()
  } catch {
    return ''
  }
}

function modelHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
}

function modelRequestBody({ model, messages, config, supportsJsonMode, supportsReasoningOptions }) {
  return {
    model,
    messages,
    ...(supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(supportsReasoningOptions ? {
      thinking: config.thinking,
      reasoning_effort: config.reasoningEffort,
    } : {}),
    max_tokens: config.maxTokens,
    stream: false,
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

export function reportTierForAnswerCount(answerCount) {
  if (answerCount <= 4) return 'more_answers'
  if (answerCount < 7) return 'basic'
  if (answerCount < 10) return 'strong'
  return 'full'
}

function tierConfig(tier) {
  if (tier === 'full') {
    return {
      thinking: { type: 'enabled' },
      reasoningEffort: 'high',
      maxTokens: FULL_OUTPUT_TOKENS,
      instruction: 'FULL DEPTH: check every supplied answer and cross-answer evidence chain, but return only the compact evidence packet.',
    }
  }
  if (tier === 'strong') {
    return {
      thinking: { type: 'enabled' },
      reasoningEffort: 'high',
      maxTokens: STRONG_OUTPUT_TOKENS,
      instruction: 'STRONG ANALYSIS: cross-check the supplied answers and profile, then return only the compact evidence packet.',
    }
  }
  return {
    thinking: { type: 'disabled' },
    reasoningEffort: 'low',
    maxTokens: BASIC_OUTPUT_TOKENS,
    instruction: 'FAST BASIC ANALYSIS: assess each answered question directly and return only the compact evidence packet.',
  }
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
    const requestTransport = new URL(endpoint).protocol === 'http:' ? httpRequest : httpsRequest
    const request = requestTransport(endpoint, {
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
          // Invalid upstream JSON is handled by the deterministic fallback path.
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
  supportsJsonMode = true,
  supportsReasoningOptions = true,
  requestJson = postJsonWithoutDeadline,
}) {
  const tier = reportTierForAnswerCount(input.answers.length)
  const config = tierConfig(tier)
  let lastError
  let repairContext = ''

  for (let attempt = 0; attempt < MAX_F1_REPORT_ATTEMPTS; attempt += 1) {
    try {
      const messages = buildF1AnalysisMessages(input, repairContext)
      messages[0] = { ...messages[0], content: `${messages[0].content}\n\n${config.instruction}` }
      const upstream = await requestJson(endpoint, {
        headers: modelHeaders(apiKey),
        body: JSON.stringify(modelRequestBody({
          model,
          messages,
          config,
          supportsJsonMode,
          supportsReasoningOptions,
        })),
        signal,
      })

      if (!upstream.ok) {
        throw Object.assign(new Error('REPORT_MODEL_SERVICE_ERROR'), {
          code: 'REPORT_MODEL_SERVICE_ERROR',
          upstreamStatus: upstream.status,
        })
      }

      const originalDraft = parseModelContent(upstream.payload)
      const validationIssues = []
      const packet = validateF1AnalysisPacket(originalDraft, input, {
        onIssue: issue => { validationIssues.push(issue) },
      })
      if (packet) {
        const report = composeF1ReportFromAnalysis(packet, input)
        if (report) return report
        validationIssues.push('ANALYSIS_COMPOSITION_FAILED')
      }

      const issues = validationIssues.length > 0 ? [...new Set(validationIssues)] : ['ANALYSIS_VALIDATION_FAILED']
      lastError = Object.assign(new Error('REPORT_MODEL_VALIDATION_FAILED'), {
        code: 'REPORT_MODEL_VALIDATION_FAILED',
        validationIssues: issues,
      })

      if (attempt + 1 < MAX_F1_REPORT_ATTEMPTS) {
        repairContext = { issues, draft: originalDraft }
        continue
      }
      break
    } catch (error) {
      if (error?.code === 'CLIENT_DISCONNECTED' || signal?.aborted) throw error
      lastError = error
      const outputFailure = error?.code === 'EMPTY_MODEL_RESPONSE' || error instanceof SyntaxError
      if (attempt + 1 < MAX_F1_REPORT_ATTEMPTS && outputFailure) {
        repairContext = { issues: [error instanceof SyntaxError ? 'INVALID_JSON' : error.code], draft: null }
        continue
      }
      break
    }
  }

  const upstreamStatus = Number(lastError?.upstreamStatus)
  const fallbackEligible = lastError?.code === 'REPORT_MODEL_VALIDATION_FAILED'
    || lastError?.code === 'EMPTY_MODEL_RESPONSE'
    || lastError instanceof SyntaxError
    || RETRYABLE_NETWORK_CODES.has(lastError?.code)
    || upstreamStatus === 429
    || upstreamStatus >= 500
  if (!fallbackEligible) throw lastError
  const fallback = buildDeterministicF1FallbackReport(input)
  const validatedFallback = validateF1StructuredReport(fallback, input, {
    allowMaterializedEvidence: true,
    analysisMode: 'evidence_only',
  })
  if (!validatedFallback) throw lastError
  console.warn(`[report] Using evidence fallback after report generation failure: ${lastError?.code || lastError?.name || 'UNKNOWN'}`)
  return validatedFallback
}

export async function generateB2Report({
  apiKey,
  endpoint,
  model,
  input,
  signal,
  supportsJsonMode = true,
  supportsReasoningOptions = true,
  requestJson = postJsonWithoutDeadline,
}) {
  let lastError
  let repairContext = ''
  for (let attempt = 0; attempt < MAX_B2_REPORT_ATTEMPTS; attempt += 1) {
    try {
      const upstream = await requestJson(endpoint, {
        headers: modelHeaders(apiKey),
        body: JSON.stringify(modelRequestBody({
          model,
          messages: buildB2ReportMessages(input, repairContext),
          config: {
            thinking: { type: 'enabled' },
            reasoningEffort: 'high',
            maxTokens: MAX_B2_OUTPUT_TOKENS,
          },
          supportsJsonMode,
          supportsReasoningOptions,
        })),
        signal,
      })
      if (!upstream.ok) {
        const error = Object.assign(new Error('REPORT_MODEL_SERVICE_ERROR'), {
          code: 'REPORT_MODEL_SERVICE_ERROR', upstreamStatus: upstream.status,
        })
        if (upstream.status < 500 && upstream.status !== 429) throw error
        lastError = error
        continue
      }
      const draft = parseModelContent(upstream.payload)
      const issues = []
      const report = validateB2StructuredReport(draft, input, { onIssue: issue => issues.push(issue) })
      if (report) return report
      throw Object.assign(new Error('REPORT_MODEL_VALIDATION_FAILED'), {
        code: 'REPORT_MODEL_VALIDATION_FAILED', validationIssues: issues.length ? [...new Set(issues)] : ['UNKNOWN_VALIDATION_FAILURE'],
      })
    } catch (error) {
      lastError = error
      if (error?.code === 'CLIENT_DISCONNECTED' || signal?.aborted) throw error
      if (error?.code === 'REPORT_MODEL_VALIDATION_FAILED') repairContext = error.validationIssues
      else if (error instanceof SyntaxError) repairContext = ['INVALID_JSON']
      const status = Number(error?.upstreamStatus)
      const retryable = error instanceof SyntaxError
        || error?.code === 'EMPTY_MODEL_RESPONSE'
        || error?.code === 'REPORT_MODEL_VALIDATION_FAILED'
        || RETRYABLE_NETWORK_CODES.has(error?.code)
        || status === 429 || status >= 500
      if (!retryable) break
    }
  }
  if (!(lastError instanceof SyntaxError)
    && lastError?.code !== 'EMPTY_MODEL_RESPONSE'
    && lastError?.code !== 'REPORT_MODEL_VALIDATION_FAILED') throw lastError || new Error('REPORT_MODEL_SERVICE_UNAVAILABLE')
  const fallback = buildDeterministicB2FallbackReport(input)
  const validated = validateB2StructuredReport(fallback, input, { analysisMode: 'evidence_only' })
  if (!validated) throw lastError || new Error('REPORT_MODEL_SERVICE_UNAVAILABLE')
  return validated
}

export function createReportHandler(options = {}) {
  const apiKey = String(options.apiKey || '').trim()
  const model = String(options.model || 'deepseek-v4-pro').trim()
  const endpoint = safeEndpoint(options.baseUrl)
  const provider = String(options.provider || 'openai-compatible').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-') || 'openai-compatible'
  const supportsJsonMode = options.supportsJsonMode !== false
  const supportsReasoningOptions = options.supportsReasoningOptions !== false
  const anonymousLoopback = endpoint
    ? (() => {
        const url = new URL(endpoint)
        return url.protocol === 'http:' && ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
      })()
    : false
  const configured = Boolean(model && endpoint && (apiKey || anonymousLoopback))
  const activeReports = new Map()

  function reportKey(ip, input) {
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    return `${ip}:${digest}`
  }

  async function handleReport(req, res) {
    const pathname = req.url?.split('?')[0] ?? ''

    if (pathname === HEALTH_PATH && (req.method === 'GET' || req.method === 'HEAD')) {
      writeJson(res, configured ? 200 : 503, {
        ok: configured,
        provider,
        model,
        ...(configured ? {} : { error: 'REPORT_MODEL_NOT_CONFIGURED' }),
      })
      return true
    }

    if (pathname !== REPORT_PATH) return false
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'METHOD_NOT_ALLOWED' })
      return true
    }
    if (!configured) {
      writeJson(res, 503, { error: 'REPORT_MODEL_NOT_CONFIGURED' })
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
    let reportTask = activeReports.get(key)
    if (!reportTask) {
      const startedAt = Date.now()
      reportTask = (input.visaType === 'B2'
        ? generateB2Report({ apiKey, endpoint, model, input, supportsJsonMode, supportsReasoningOptions })
        : generateF1Report({ apiKey, endpoint, model, input, supportsJsonMode, supportsReasoningOptions }))
        .then(report => {
          const tier = input.visaType === 'F1' ? reportTierForAnswerCount(input.answers.length) : 'b2'
          console.log(`[report] completed visaType=${input.visaType} tier=${tier} mode=${report.analysisMode} answers=${input.answers.length} durationMs=${Date.now() - startedAt}`)
          return report
        })
      activeReports.set(key, reportTask)
      reportTask.then(
        () => activeReports.delete(key),
        () => activeReports.delete(key),
      )
    }
    try {
      const report = await reportTask
      if (!res.writableEnded && !res.destroyed) {
        writeJson(res, 200, {
          report,
          provider: report.analysisMode === 'evidence_only' ? 'evidence-only' : provider,
          model,
          schemaVersion: 2,
          analysisMode: report.analysisMode,
        })
      }
    } catch (error) {
      if (res.writableEnded || res.destroyed) return true
      const upstreamStatus = Number(error?.upstreamStatus)
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      const status = upstreamStatus === 429 ? 429 : timeout ? 504 : 502
      console.error(`[report] ${provider} final report failed:`, error?.code || error?.name || 'UNKNOWN')
      writeJson(res, status, {
        error: timeout
          ? 'REPORT_MODEL_TIMEOUT'
          : upstreamStatus === 429
            ? 'REPORT_MODEL_RATE_LIMITED'
            : error?.code || 'REPORT_MODEL_SERVICE_UNAVAILABLE',
      })
    }
    return true
  }

  handleReport.configured = configured
  handleReport.model = model
  handleReport.provider = provider
  return handleReport
}
