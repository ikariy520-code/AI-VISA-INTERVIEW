import { createClient } from '@supabase/supabase-js'

interface Env {
  ASSETS: Fetcher
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_MODEL?: string
}

interface AuthResult {
  ok: true
  userId: string
  token: string
}

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions'

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function requireEntitlement(request: Request, env: Env): Promise<AuthResult | Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return json({ error: 'AUTH_NOT_CONFIGURED' }, 503)
  }

  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return json({ error: 'AUTH_REQUIRED' }, 401)

  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'INVALID_SESSION' }, 401)

  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: entitlement, error: entitlementError } = await userClient
    .from('user_entitlements')
    .select('status, expires_at')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (entitlementError) return json({ error: 'ACCESS_CHECK_FAILED' }, 503)
  const expired = entitlement?.expires_at && new Date(entitlement.expires_at).getTime() <= Date.now()
  if (entitlement?.status !== 'active' || expired) {
    return json({ error: 'INVITE_REQUIRED' }, 403)
  }

  return { ok: true, userId: userData.user.id, token }
}

async function parseJsonBody(request: Request, maxBytes = 64_000): Promise<any | Response> {
  const length = Number(request.headers.get('Content-Length') ?? 0)
  if (length > maxBytes) return json({ error: 'REQUEST_TOO_LARGE' }, 413)
  try {
    return await request.json()
  } catch {
    return json({ error: 'INVALID_JSON' }, 400)
  }
}

async function callDeepSeek(env: Env, requestBody: Record<string, unknown>): Promise<Response> {
  if (!env.DEEPSEEK_API_KEY) return json({ error: 'AI_NOT_CONFIGURED' }, 503)

  try {
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    if (!response.ok) {
      console.error('[AI] Upstream error', response.status, responseText.slice(0, 500))
      return json({ error: 'AI_SERVICE_ERROR' }, 502)
    }
    return new Response(responseText, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[AI] Network error', error)
    return json({ error: 'AI_SERVICE_UNAVAILABLE' }, 502)
  }
}

async function handleAiChat(request: Request, env: Env): Promise<Response> {
  const auth = await requireEntitlement(request, env)
  if (auth instanceof Response) return auth

  const body = await parseJsonBody(request)
  if (body instanceof Response) return body
  const messages = Array.isArray(body.messages) ? body.messages : null
  if (!messages || messages.length === 0 || messages.length > 30) {
    return json({ error: 'INVALID_MESSAGES' }, 400)
  }

  const sanitizedMessages = messages.map((message: any) => ({
    role: ['system', 'assistant', 'user'].includes(message?.role) ? message.role : 'user',
    content: String(message?.content ?? '').slice(0, 6000),
  }))
  const totalLength = sanitizedMessages.reduce((sum: number, message: any) => sum + message.content.length, 0)
  if (totalLength > 24_000) return json({ error: 'CONVERSATION_TOO_LONG' }, 400)

  return callDeepSeek(env, {
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: sanitizedMessages,
    temperature: Math.min(Math.max(Number(body.temperature ?? 0.7), 0), 1.5),
    max_tokens: Math.min(Math.max(Number(body.max_tokens ?? 512), 1), 1000),
    ...(body.response_format ? { response_format: body.response_format } : {}),
  })
}

async function handleAiScore(request: Request, env: Env): Promise<Response> {
  const auth = await requireEntitlement(request, env)
  if (auth instanceof Response) return auth

  const body = await parseJsonBody(request, 32_000)
  if (body instanceof Response) return body
  const question = String(body.question ?? '').trim().slice(0, 2000)
  const answer = String(body.answer ?? '').trim().slice(0, 6000)
  if (!question || !answer) return json({ error: 'MISSING_QUESTION_OR_ANSWER' }, 400)

  const scoringPrompt = `You are evaluating a US visa interview answer.\n\nQuestion: ${question}\n\nAnswer: ${answer}\n\nReturn ONLY valid JSON with this structure:\n{\n  "content": {\n    "logic": { "score": 1, "comment": "" },\n    "specificity": { "score": 1, "comment": "" },\n    "persuasion": { "score": 1, "comment": "" },\n    "ties": { "score": 1, "comment": "" }\n  },\n  "voice": { "confidence": 1, "emotion": "natural", "description": "" },\n  "verdict": "neutral",\n  "summary": "",\n  "suggestions": ["", ""]\n}`

  return callDeepSeek(env, {
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are an expert visa interview coach. Always respond with valid JSON only.' },
      { role: 'user', content: scoringPrompt },
    ],
    temperature: 0.5,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true })
    }
    if (url.pathname === '/api/ai-chat' && request.method === 'POST') {
      return handleAiChat(request, env)
    }
    if (url.pathname === '/api/ai-score' && request.method === 'POST') {
      return handleAiScore(request, env)
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'NOT_FOUND' }, 404)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
