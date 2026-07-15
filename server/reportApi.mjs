// ========================================
// HTTP proxy: POST /api/ai-report → Doubao Ark text API
// Ported from local/doubaoTextBridge.ts
// ========================================

import {
  sanitizeReportRequest,
  buildDoubaoReportMessages,
  getArkMessageContent,
} from './shared/doubaoReport.mjs'

const DEFAULT_ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

// ── helpers ──────────────────────────────────────────────

function writeJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req, maxBytes = 96_000) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > maxBytes) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// ── main export ──────────────────────────────────────────

/**
 * Create a request handler for POST /api/ai-report.
 *
 * @param {object} options
 * @param {string} options.apiKey  - ARK_API_KEY
 * @param {string} options.model   - ARK_TEXT_MODEL
 * @param {string} [options.endpoint]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<boolean>}
 *   Returns true when the handler consumed the request.
 */
export function createReportHandler(options) {
  const apiKey = options.apiKey?.trim() || ''
  const model = options.model?.trim() || ''
  const endpoint = options.endpoint?.trim() || DEFAULT_ARK_ENDPOINT

  return async function handleReport(req, res) {
    const pathname = req.url?.split('?')[0] ?? ''
    if (pathname !== '/api/ai-report') return false
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'METHOD_NOT_ALLOWED' })
      return true
    }
    if (!apiKey || !model) {
      writeJson(res, 503, { error: 'DOUBAO_TEXT_NOT_CONFIGURED' })
      return true
    }

    let rawBody
    try {
      rawBody = await readJsonBody(req)
    } catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') {
        writeJson(res, 413, { error: 'REQUEST_TOO_LARGE' })
      } else {
        writeJson(res, 400, { error: 'INVALID_JSON' })
      }
      return true
    }

    const reportRequest = sanitizeReportRequest(rawBody)
    if (!reportRequest) {
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
          messages: buildDoubaoReportMessages(reportRequest),
          temperature: 0.2,
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          max_tokens: 4_000,
        }),
        signal: AbortSignal.timeout(45_000),
      })

      const payload = await upstream.json().catch(() => null)
      if (!upstream.ok) {
        writeJson(res, 502, { error: 'DOUBAO_SERVICE_ERROR' })
        return true
      }

      const content = getArkMessageContent(payload)
      if (!content) {
        writeJson(res, 502, { error: 'DOUBAO_INVALID_REPORT' })
        return true
      }

      const report = JSON.parse(content)
      writeJson(res, 200, { report, provider: 'doubao', schemaVersion: 1 })
    } catch {
      writeJson(res, 502, { error: 'DOUBAO_SERVICE_UNAVAILABLE' })
    }

    return true
  }
}
