const SESSION_PATH = '/api/realtime/session'
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-live-preview'
const DEFAULT_OPENAI_MODEL = 'gpt-realtime-2.1'
const GEMINI_TOKEN_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens'
const GEMINI_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'
const OPENAI_TOKEN_URL = 'https://api.openai.com/v1/realtime/client_secrets'
const OPENAI_LIVE_URL = 'https://api.openai.com/v1/realtime/calls'
const MAX_BODY_BYTES = 64_000

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
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function cleanText(value, maximum) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, maximum) : ''
}

function safeSilence(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(2000, Math.max(500, Math.round(number))) : 1200
}

async function upstreamJson(url, init) {
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Provider returned HTTP ${response.status}`
    throw Object.assign(new Error(message), { status: response.status })
  }
  return payload
}

function normalizeOpenAIVoice(value, fallback) {
  const allowed = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'])
  const voice = cleanText(value, 32).toLowerCase()
  return allowed.has(voice) ? voice : fallback
}

function normalizeGeminiVoice(value, fallback) {
  const voice = cleanText(value, 64)
  return /^[a-z0-9_-]+$/i.test(voice) ? voice : fallback
}

function combinedInstructions(body) {
  return [
    cleanText(body.instructions, 30_000),
    cleanText(body.speakingStyle, 2_000),
  ].filter(Boolean).join('\n\n')
}

export function createRealtimeSessionHandler(options = {}) {
  const provider = cleanText(options.provider, 32).toLowerCase()
  const geminiApiKey = cleanText(options.geminiApiKey, 512)
  const geminiModel = cleanText(options.geminiModel, 128) || DEFAULT_GEMINI_MODEL
  const geminiVoice = normalizeGeminiVoice(options.geminiVoice, 'Kore')
  const openaiApiKey = cleanText(options.openaiApiKey, 512)
  const openaiModel = cleanText(options.openaiModel, 128) || DEFAULT_OPENAI_MODEL
  const openaiVoice = normalizeOpenAIVoice(options.openaiVoice, 'marin')

  async function handleRealtimeSession(req, res) {
    if ((req.url || '').split('?')[0] !== SESSION_PATH) return false
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'METHOD_NOT_ALLOWED' })
      return true
    }
    try {
      const body = await readJsonBody(req)
      const requestedProvider = cleanText(body.provider, 32).toLowerCase()
      if (requestedProvider !== provider) {
        writeJson(res, 409, { error: 'VOICE_PROVIDER_MISMATCH', message: '当前启用的语音模型与客户端请求不一致。' })
        return true
      }
      const instructions = combinedInstructions(body)
      if (!instructions) {
        writeJson(res, 400, { error: 'INSTRUCTIONS_REQUIRED', message: '面签官规则不能为空。' })
        return true
      }
      if (provider === 'gemini') {
        if (!geminiApiKey) {
          writeJson(res, 503, { error: 'REALTIME_NOT_CONFIGURED', message: '请配置 Gemini API Key。' })
          return true
        }
        const now = Date.now()
        const token = await upstreamJson(GEMINI_TOKEN_URL, {
          method: 'POST',
          headers: { 'x-goog-api-key': geminiApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uses: 1,
            expireTime: new Date(now + 30 * 60_000).toISOString(),
            newSessionExpireTime: new Date(now + 60_000).toISOString(),
            liveConnectConstraints: {
              model: `models/${geminiModel}`,
              config: { responseModalities: ['AUDIO'], sessionResumption: {} },
            },
          }),
        })
        writeJson(res, 200, {
          provider,
          token: token.name,
          model: geminiModel,
          voice: geminiVoice,
          endpoint: GEMINI_LIVE_URL,
          silenceDurationMs: safeSilence(body.endOfTurnSilenceMs),
        })
        return true
      }
      if (provider === 'openai') {
        if (!openaiApiKey) {
          writeJson(res, 503, { error: 'REALTIME_NOT_CONFIGURED', message: '请配置 OpenAI API Key。' })
          return true
        }
        const voice = openaiVoice
        const session = {
          session: {
            type: 'realtime',
            model: openaiModel,
            output_modalities: ['audio'],
            instructions,
            audio: {
              input: {
                transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' },
                turn_detection: {
                  type: 'semantic_vad',
                  eagerness: 'low',
                  create_response: true,
                  interrupt_response: true,
                },
              },
              output: { voice },
            },
          },
        }
        const token = await upstreamJson(OPENAI_TOKEN_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(session),
        })
        writeJson(res, 200, {
          provider,
          token: token.value,
          model: openaiModel,
          voice,
          endpoint: OPENAI_LIVE_URL,
          expiresAt: token.expires_at,
        })
        return true
      }
      writeJson(res, 400, { error: 'SESSION_NOT_REQUIRED', message: '豆包实时语音使用本地安全代理，不创建浏览器令牌。' })
      return true
    } catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 502
      writeJson(res, status, {
        error: 'REALTIME_SESSION_FAILED',
        message: error instanceof Error ? error.message : '创建实时语音会话失败。',
      })
      return true
    }
  }

  handleRealtimeSession.provider = provider
  handleRealtimeSession.configured = provider === 'doubao'
    ? Boolean(cleanText(options.doubaoAppId, 512) && cleanText(options.doubaoAccessKey, 512))
    : provider === 'gemini' ? Boolean(geminiApiKey) : provider === 'openai' ? Boolean(openaiApiKey) : false
  return handleRealtimeSession
}
