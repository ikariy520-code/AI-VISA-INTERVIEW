import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import {
  buildDoubaoReportMessages,
  getArkMessageContent,
  sanitizeReportRequest,
  validateF1StructuredReport,
} from '../server/shared/doubaoReport.mjs'

const REPORT_PATH = '/api/ai-report'
const DEFAULT_ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

interface Options {
  apiKey: string
  model: string
  endpoint?: string
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(body))
}

async function readJsonBody(request: IncomingMessage, maxBytes = 96_000): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > maxBytes) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function safeEndpoint(value?: string) {
  try {
    const url = new URL(value?.trim() || DEFAULT_ARK_ENDPOINT)
    return url.protocol === 'https:' && url.hostname === 'ark.cn-beijing.volces.com'
      ? url.toString()
      : DEFAULT_ARK_ENDPOINT
  } catch {
    return DEFAULT_ARK_ENDPOINT
  }
}

export function doubaoTextBridge(options: Options): Plugin {
  const apiKey = options.apiKey.trim()
  const model = options.model.trim()
  const endpoint = safeEndpoint(options.endpoint)

  return {
    name: 'doubao-final-report-local-bridge',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0] ?? ''
        if (pathname !== REPORT_PATH) return next()
        if (request.method !== 'POST') return writeJson(response, 405, { error: 'METHOD_NOT_ALLOWED' })
        if (!apiKey || !model) return writeJson(response, 503, { error: 'DOUBAO_REPORT_NOT_CONFIGURED' })

        let rawBody: unknown
        try {
          rawBody = await readJsonBody(request)
        } catch (error) {
          return writeJson(response, error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
            error: error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
          })
        }
        const input = sanitizeReportRequest(rawBody)
        if (!input) return writeJson(response, 400, { error: 'INVALID_REPORT_REQUEST' })

        try {
          const upstream = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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
          if (!upstream.ok) return writeJson(response, 502, { error: 'DOUBAO_REPORT_SERVICE_ERROR', upstreamStatus: upstream.status })
          const content = getArkMessageContent(payload)
          if (!content) return writeJson(response, 502, { error: 'DOUBAO_REPORT_EMPTY' })
          const report = validateF1StructuredReport(JSON.parse(content), input)
          if (!report) return writeJson(response, 502, { error: 'DOUBAO_REPORT_VALIDATION_FAILED' })
          return writeJson(response, 200, { report, provider: 'doubao-ark', model, schemaVersion: 2 })
        } catch {
          return writeJson(response, 502, { error: 'DOUBAO_REPORT_SERVICE_UNAVAILABLE' })
        }
      })
      server.config.logger.info('豆包方舟最终报告桥接已启用：/api/ai-report')
    },
  }
}
