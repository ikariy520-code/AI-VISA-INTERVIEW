import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import {
  buildDoubaoDecisionMessages,
  getArkMessageContent,
  parseDoubaoAssessment,
  sanitizeF1DecisionRequest,
  redactPotentialIdentifiers,
} from '../src/shared/doubaoDecision'
import { buildDoubaoScoreMessages } from '../src/shared/doubaoScore'

const HANDLED_PATHS = new Set(['/api/ai-chat', '/api/ai-score', '/api/interview/decision'])
const DEFAULT_ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

interface DoubaoTextBridgeOptions {
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

async function readJsonBody(request: IncomingMessage, maxBytes = 64_000): Promise<unknown> {
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

export function doubaoTextBridge(options: DoubaoTextBridgeOptions): Plugin {
  const apiKey = options.apiKey.trim()
  const model = options.model.trim()
  const endpoint = options.endpoint?.trim() || DEFAULT_ARK_ENDPOINT

  async function callDoubao(body: Record<string, unknown>) {
    if (!apiKey || !model) {
      return { ok: false as const, status: 503, payload: { error: 'DOUBAO_TEXT_NOT_CONFIGURED' } }
    }
    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ ...body, model }),
        signal: AbortSignal.timeout(30_000),
      })
      const payload = await upstream.json().catch(() => null)
      if (!upstream.ok) {
        return { ok: false as const, status: 502, payload: { error: 'DOUBAO_SERVICE_ERROR' } }
      }
      return { ok: true as const, status: 200, payload }
    } catch {
      return { ok: false as const, status: 502, payload: { error: 'DOUBAO_SERVICE_UNAVAILABLE' } }
    }
  }

  return {
    name: 'doubao-text-local-bridge',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0] ?? ''
        if (!HANDLED_PATHS.has(pathname)) return next()
        if (request.method !== 'POST') return writeJson(response, 405, { error: 'METHOD_NOT_ALLOWED' })

        let body: any
        try {
          body = await readJsonBody(request, pathname === '/api/interview/decision' ? 24_000 : 64_000)
        } catch (error) {
          return writeJson(response, error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
            error: error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
          })
        }

        if (pathname === '/api/interview/decision') {
          const decisionRequest = sanitizeF1DecisionRequest(body)
          if (!decisionRequest) return writeJson(response, 400, { error: 'INVALID_DECISION_REQUEST' })
          const provider = await callDoubao({
            messages: buildDoubaoDecisionMessages(decisionRequest),
            temperature: 0.1,
            thinking: { type: 'disabled' },
            response_format: { type: 'json_object' },
            max_tokens: 350,
          })
          if (!provider.ok) return writeJson(response, provider.status, provider.payload)
          const content = getArkMessageContent(provider.payload)
          const assessment = content
            ? parseDoubaoAssessment(
              content,
              decisionRequest.allowedFollowUps.map(item => item.id),
              decisionRequest.candidateNextQuestions.map(item => item.id),
            )
            : null
          return assessment
            ? writeJson(response, 200, { assessment, provider: 'doubao', schemaVersion: 2 })
            : writeJson(response, 502, { error: 'DOUBAO_INVALID_DECISION' })
        }

        if (pathname === '/api/ai-score') {
          const question = redactPotentialIdentifiers(String(body?.question ?? '').trim()).slice(0, 2_000)
          const answer = redactPotentialIdentifiers(String(body?.answer ?? '').trim()).slice(0, 6_000)
          if (!question || !answer) return writeJson(response, 400, { error: 'MISSING_QUESTION_OR_ANSWER' })
          const provider = await callDoubao({
            messages: buildDoubaoScoreMessages(question, answer),
            temperature: 0.2,
            thinking: { type: 'disabled' },
            response_format: { type: 'json_object' },
            max_tokens: 900,
          })
          return writeJson(response, provider.status, provider.payload)
        }

        const messages = Array.isArray(body?.messages) ? body.messages : null
        if (!messages || messages.length === 0 || messages.length > 30) {
          return writeJson(response, 400, { error: 'INVALID_MESSAGES' })
        }
        const sanitized = messages.map((message: any) => ({
          role: ['system', 'assistant', 'user'].includes(message?.role) ? message.role : 'user',
          content: String(message?.content ?? '').slice(0, 6_000),
        }))
        const totalLength = sanitized.reduce((sum: number, message: any) => sum + message.content.length, 0)
        if (totalLength > 24_000) return writeJson(response, 400, { error: 'CONVERSATION_TOO_LONG' })
        const provider = await callDoubao({
          messages: sanitized,
          temperature: Math.min(Math.max(Number(body?.temperature ?? 0.7), 0), 1.5),
          max_tokens: Math.min(Math.max(Number(body?.max_tokens ?? 512), 1), 1_000),
          ...(body?.response_format ? { response_format: body.response_format } : {}),
        })
        return writeJson(response, provider.status, provider.payload)
      })

      server.config.logger.info('豆包文本本地桥接已启用：/api/interview/decision')
    },
  }
}
