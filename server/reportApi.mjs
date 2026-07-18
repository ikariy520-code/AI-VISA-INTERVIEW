import {
  buildDoubaoReportMessages,
  getArkMessageContent,
  sanitizeReportRequest,
  validateF1StructuredReport,
} from './shared/doubaoReport.mjs'

const REPORT_PATH = '/api/ai-report'
const DEFAULT_ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
const MAX_BODY_BYTES = 96_000

function writeJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
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
    const url = new URL(value || DEFAULT_ARK_ENDPOINT)
    return url.protocol === 'https:' && url.hostname === 'ark.cn-beijing.volces.com'
      ? url.toString()
      : DEFAULT_ARK_ENDPOINT
  } catch {
    return DEFAULT_ARK_ENDPOINT
  }
}

export function createReportHandler(options = {}) {
  const apiKey = String(options.apiKey || '').trim()
  const model = String(options.model || '').trim()
  const endpoint = safeEndpoint(String(options.endpoint || ''))

  return async function handleReport(req, res) {
    const pathname = req.url?.split('?')[0] ?? ''
    if (pathname !== REPORT_PATH) return false
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'METHOD_NOT_ALLOWED' })
      return true
    }
    if (!apiKey || !model) {
      writeJson(res, 503, { error: 'DOUBAO_REPORT_NOT_CONFIGURED' })
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

    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: buildDoubaoReportMessages(input),
          temperature: 0.1,
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          max_tokens: 4_500,
        }),
        signal: AbortSignal.timeout(90_000),
      })

      const payload = await upstream.json().catch(() => null)
      if (!upstream.ok) {
        writeJson(res, 502, { error: 'DOUBAO_REPORT_SERVICE_ERROR', upstreamStatus: upstream.status })
        return true
      }
      const content = getArkMessageContent(payload)
      if (!content) {
        writeJson(res, 502, { error: 'DOUBAO_REPORT_EMPTY' })
        return true
      }
      const parsed = JSON.parse(content)
      const report = validateF1StructuredReport(parsed, input)
      if (!report) {
        writeJson(res, 502, { error: 'DOUBAO_REPORT_VALIDATION_FAILED' })
        return true
      }
      writeJson(res, 200, { report, provider: 'doubao-ark', model, schemaVersion: 2 })
    } catch {
      writeJson(res, 502, { error: 'DOUBAO_REPORT_SERVICE_UNAVAILABLE' })
    }
    return true
  }
}
