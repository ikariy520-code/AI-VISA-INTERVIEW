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
const BASIC_OUTPUT_TOKENS = 6_000
const STRONG_OUTPUT_TOKENS = 9_000
const FULL_OUTPUT_TOKENS = 12_000
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
      instruction: 'FULL DEPTH: perform the complete cross-answer analysis. Check all evidence chains and contradictions carefully while keeping every field concise.',
    }
  }
  if (tier === 'strong') {
    return {
      thinking: { type: 'enabled' },
      reasoningEffort: 'medium',
      maxTokens: STRONG_OUTPUT_TOKENS,
      instruction: 'STRONG ANALYSIS: cross-check the supplied answers and profile, identify the strongest evidence and the most important preparation gaps, and keep the report concise.',
    }
  }
  return {
    thinking: { type: 'disabled' },
    reasoningEffort: 'low',
    maxTokens: BASIC_OUTPUT_TOKENS,
    instruction: 'FAST BASIC ANALYSIS: assess each answered question directly, identify only the clearest strengths and gaps, and avoid unnecessary elaboration while completing the required JSON schema.',
  }
}

function repairInvalidReportSections(draft, input, issues) {
  const fallback = buildDeterministicF1FallbackReport(input)
  const missingMostAnalysis = issues.some(issue => issue.startsWith('DIMENSION_'))
    && issues.some(issue => issue.startsWith('QUESTION_REVIEW_'))
    && issues.includes('HEADLINE')
    && issues.includes('SUMMARY')
  if (
    !draft
    || typeof draft !== 'object'
    || Array.isArray(draft)
    || issues.includes('FORBIDDEN_CLAIM')
    || missingMostAnalysis
  ) {
    return { draft: fallback, evidenceOnly: true }
  }
  const repaired = JSON.parse(JSON.stringify(draft))
  repaired.schemaVersion = 2
  repaired.reportType = 'practice_readiness'
  repaired.criteriaVersion = input.criteriaVersion
  if (issues.includes('OVERALL_SCORE')) repaired.overallScore = fallback.overallScore
  if (issues.includes('READINESS')) repaired.readiness = fallback.readiness
  if (issues.includes('HEADLINE')) repaired.headline = fallback.headline
  if (issues.includes('SUMMARY')) repaired.summary = fallback.summary
  if (issues.includes('STRENGTHS')) repaired.strengths = fallback.strengths
  if (issues.includes('PRIORITIES')) repaired.priorities = fallback.priorities
  if (issues.includes('ACTION_PLAN')) repaired.actionPlan = fallback.actionPlan
  if (issues.some(issue => issue.startsWith('DIMENSION_'))) repaired.dimensions = fallback.dimensions
  if (issues.some(issue => issue.startsWith('QUESTION_REVIEW_'))) repaired.questionReviews = fallback.questionReviews
  return { draft: repaired, evidenceOnly: false }
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
  requestJson = postJsonWithoutDeadline,
}) {
  const tier = reportTierForAnswerCount(input.answers.length)
  const config = tierConfig(tier)
  try {
    const messages = buildF1ReportMessages(input)
    messages[0] = { ...messages[0], content: `${messages[0].content}\n\n${config.instruction}` }
    const upstream = await requestJson(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        thinking: config.thinking,
        reasoning_effort: config.reasoningEffort,
        max_tokens: config.maxTokens,
        stream: false,
      }),
      signal,
    })

    if (!upstream.ok) {
      throw Object.assign(new Error('DEEPSEEK_REPORT_SERVICE_ERROR'), {
        code: 'DEEPSEEK_REPORT_SERVICE_ERROR',
        upstreamStatus: upstream.status,
      })
    }

    const originalDraft = parseModelContent(upstream.payload)
    const validationIssues = []
    const report = validateF1StructuredReport(originalDraft, input, {
      onIssue: issue => { validationIssues.push(issue) },
    })
    if (report) return report

    const repairEvents = []
    const evidenceRepairedDraft = repairF1ReportEvidence(originalDraft, input, {
      onRepair: event => { repairEvents.push(event) },
    })
    const repairedIssues = []
    const evidenceRepairedReport = validateF1StructuredReport(evidenceRepairedDraft, input, {
      onIssue: issue => { repairedIssues.push(issue) },
      allowMaterializedEvidence: true,
    })
    if (evidenceRepairedReport) {
      console.warn(`[report] Corrected report evidence references without another AI call: ${repairEvents.join(',')}`)
      return evidenceRepairedReport
    }

    const issues = repairedIssues.length > 0 ? [...new Set(repairedIssues)] : [...new Set(validationIssues)]
    const structuralRepair = repairInvalidReportSections(evidenceRepairedDraft, input, issues)
    const structurallyRepairedReport = validateF1StructuredReport(structuralRepair.draft, input, {
      allowMaterializedEvidence: true,
      analysisMode: structuralRepair.evidenceOnly ? 'evidence_only' : undefined,
    })
    if (structurallyRepairedReport) {
      console.warn(`[report] Corrected invalid report sections without another AI call: ${issues.join(',')}`)
      return structurallyRepairedReport
    }
    throw Object.assign(new Error('DEEPSEEK_REPORT_VALIDATION_FAILED'), {
      code: 'DEEPSEEK_REPORT_VALIDATION_FAILED',
    })
  } catch (error) {
    if (error?.code === 'CLIENT_DISCONNECTED' || signal?.aborted) throw error
    const upstreamStatus = Number(error?.upstreamStatus)
    const fallbackEligible = error?.code === 'DEEPSEEK_REPORT_VALIDATION_FAILED'
      || error?.code === 'EMPTY_MODEL_RESPONSE'
      || error instanceof SyntaxError
      || RETRYABLE_NETWORK_CODES.has(error?.code)
      || upstreamStatus === 429
      || upstreamStatus >= 500
    if (!fallbackEligible) throw error
    const fallback = buildDeterministicF1FallbackReport(input)
    const validatedFallback = validateF1StructuredReport(fallback, input, {
      allowMaterializedEvidence: true,
      analysisMode: 'evidence_only',
    })
    if (!validatedFallback) throw error
    console.warn(`[report] Using evidence fallback after report generation failure: ${error?.code || error?.name || 'UNKNOWN'}`)
    return validatedFallback
  }
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
    let reportTask = activeReports.get(key)
    if (!reportTask) {
      const startedAt = Date.now()
      reportTask = (input.visaType === 'B2'
        ? generateB2Report({ apiKey, endpoint, model, input })
        : generateF1Report({ apiKey, endpoint, model, input }))
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
          provider: report.analysisMode === 'evidence_only' ? 'evidence-only' : 'deepseek',
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
      console.error('[report] DeepSeek final report failed:', error?.code || error?.name || 'UNKNOWN')
      writeJson(res, status, {
        error: timeout
          ? 'DEEPSEEK_REPORT_TIMEOUT'
          : upstreamStatus === 429
            ? 'DEEPSEEK_REPORT_RATE_LIMITED'
            : error?.code || 'DEEPSEEK_REPORT_SERVICE_UNAVAILABLE',
      })
    }
    return true
  }

  handleReport.configured = configured
  handleReport.model = model
  return handleReport
}
