interface Env {
  ASSETS: Fetcher
  DB: D1Database
  AI_API_KEY?: string
  AI_API_BASE?: string
  AI_MODEL?: string
  ADMIN_API_TOKEN?: string
  RATE_LIMIT_SALT?: string
}

interface AccessRow {
  activation_id: string
  invite_code_id: string
  status: string
  max_interviews: number
  interviews_used: number
  access_expires_at: string | null
}

const ACCESS_COOKIE = 'visa_access'
const DEFAULT_AI_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions'

function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  })
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie') ?? ''
  return Object.fromEntries(
    header.split(';').map((item) => item.trim()).filter(Boolean).map((item) => {
      const separator = item.indexOf('=')
      return separator === -1
        ? [item, '']
        : [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))]
    }),
  )
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
  return `VISA-${value.slice(0, 4)}-${value.slice(4)}`
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
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

async function getActivation(request: Request, env: Env): Promise<AccessRow | null> {
  const token = parseCookies(request)[ACCESS_COOKIE]
  if (!token) return null
  const tokenHash = await hashText(token)
  const row = await env.DB.prepare(`
    SELECT
      a.id AS activation_id,
      a.invite_code_id,
      c.status,
      c.max_interviews,
      c.interviews_used,
      c.access_expires_at
    FROM activations a
    JOIN invite_codes c ON c.id = a.invite_code_id
    WHERE a.token_hash = ?1
      AND a.revoked_at IS NULL
      AND (c.access_expires_at IS NULL OR datetime(c.access_expires_at) > CURRENT_TIMESTAMP)
    LIMIT 1
  `).bind(tokenHash).first<AccessRow>()

  if (row) {
    await env.DB.prepare('UPDATE activations SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?1')
      .bind(row.activation_id).run()
  }
  return row ?? null
}

async function hasAuthorizedSession(request: Request, env: Env, access: AccessRow): Promise<boolean> {
  const sessionKey = request.headers.get('X-Interview-Session')?.trim()
  if (!sessionKey) return false
  const row = await env.DB.prepare(`
    SELECT session_key FROM interview_usage
    WHERE session_key = ?1 AND invite_code_id = ?2 AND activation_id = ?3
    LIMIT 1
  `).bind(sessionKey, access.invite_code_id, access.activation_id).first()
  return Boolean(row)
}

async function requireAccess(request: Request, env: Env): Promise<AccessRow | Response> {
  const access = await getActivation(request, env)
  if (!access) return json({ error: 'INVITE_REQUIRED' }, 403)
  if (access.status === 'disabled') return json({ error: 'ACCESS_DISABLED' }, 403)
  if (access.status === 'active' && access.interviews_used < access.max_interviews) return access
  if (await hasAuthorizedSession(request, env, access)) return access
  return json({ error: 'INTERVIEW_LIMIT_REACHED' }, 403)
}

function accessPayload(access: AccessRow, sessionAuthorized = false) {
  return {
    unlocked: access.status !== 'disabled' && (access.interviews_used < access.max_interviews || sessionAuthorized),
    remainingInterviews: Math.max(0, access.max_interviews - access.interviews_used),
    maxInterviews: access.max_interviews,
    expiresAt: access.access_expires_at,
  }
}

async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const ipHash = await hashText(`${env.RATE_LIMIT_SALT ?? 'invite-rate-limit'}:${ip}`)
  const attempt = await env.DB.prepare(`
    SELECT attempt_count, window_started_at, blocked_until
    FROM redeem_attempts WHERE ip_hash = ?1
  `).bind(ipHash).first<{ attempt_count: number; window_started_at: string; blocked_until: string | null }>()
  return Boolean(attempt?.blocked_until && new Date(`${attempt.blocked_until}Z`).getTime() > Date.now())
}

async function recordFailedAttempt(request: Request, env: Env): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const ipHash = await hashText(`${env.RATE_LIMIT_SALT ?? 'invite-rate-limit'}:${ip}`)
  const current = await env.DB.prepare(`
    SELECT attempt_count, window_started_at FROM redeem_attempts WHERE ip_hash = ?1
  `).bind(ipHash).first<{ attempt_count: number; window_started_at: string }>()
  const windowExpired = !current || Date.now() - new Date(`${current.window_started_at}Z`).getTime() > 15 * 60 * 1000
  const nextCount = windowExpired ? 1 : current.attempt_count + 1
  const blockedUntil = nextCount >= 10 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
  await env.DB.prepare(`
    INSERT INTO redeem_attempts (ip_hash, attempt_count, window_started_at, blocked_until, updated_at)
    VALUES (?1, ?2, CURRENT_TIMESTAMP, ?3, CURRENT_TIMESTAMP)
    ON CONFLICT(ip_hash) DO UPDATE SET
      attempt_count = excluded.attempt_count,
      window_started_at = CASE WHEN ?4 = 1 THEN CURRENT_TIMESTAMP ELSE window_started_at END,
      blocked_until = excluded.blocked_until,
      updated_at = CURRENT_TIMESTAMP
  `).bind(ipHash, nextCount, blockedUntil, windowExpired ? 1 : 0).run()
}

async function handleAccess(request: Request, env: Env): Promise<Response> {
  const access = await getActivation(request, env)
  if (!access || access.status === 'disabled') return json({ unlocked: false })
  const sessionAuthorized = await hasAuthorizedSession(request, env, access)
  return json(accessPayload(access, sessionAuthorized))
}

async function handleRedeem(request: Request, env: Env): Promise<Response> {
  if (await isRateLimited(request, env)) return json({ error: 'TOO_MANY_ATTEMPTS' }, 429)
  const body = await parseJsonBody(request, 4_000)
  if (body instanceof Response) return body
  const code = normalizeCode(String(body.code ?? ''))
  if (!/^VISA-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
    await recordFailedAttempt(request, env)
    return json({ error: 'INVALID_INVITE_CODE' }, 400)
  }

  const codeHash = await hashText(code)
  const invite = await env.DB.prepare('SELECT id FROM invite_codes WHERE code_hash = ?1 LIMIT 1')
    .bind(codeHash).first<{ id: string }>()
  if (!invite) {
    await recordFailedAttempt(request, env)
    return json({ error: 'INVALID_INVITE_CODE' }, 400)
  }

  const rawToken = randomToken()
  const tokenHash = await hashText(rawToken)
  const userAgentHash = await hashText(request.headers.get('User-Agent') ?? 'unknown')
  try {
    await env.DB.prepare(`
      INSERT INTO activations (id, invite_code_id, token_hash, user_agent_hash)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(crypto.randomUUID(), invite.id, tokenHash, userAgentHash).run()
  } catch (error) {
    console.warn('[Invite] Activation rejected', error)
    await recordFailedAttempt(request, env)
    return json({ error: 'INVITE_UNAVAILABLE' }, 409)
  }

  await env.DB.prepare('DELETE FROM redeem_attempts WHERE ip_hash = ?1')
    .bind(await hashText(`${env.RATE_LIMIT_SALT ?? 'invite-rate-limit'}:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`)).run()

  const access = await getActivation(new Request(request.url, {
    headers: { Cookie: `${ACCESS_COOKIE}=${rawToken}` },
  }), env)
  return json(access ? accessPayload(access) : { unlocked: true }, 200, {
    'Set-Cookie': `${ACCESS_COOKIE}=${encodeURIComponent(rawToken)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`,
  })
}

async function handleInterviewStart(request: Request, env: Env): Promise<Response> {
  const access = await requireAccess(request, env)
  if (access instanceof Response) return access
  const body = await parseJsonBody(request, 4_000)
  if (body instanceof Response) return body
  const sessionKey = String(body.sessionKey ?? '').trim()
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(sessionKey)) return json({ error: 'INVALID_SESSION_KEY' }, 400)

  const existing = await env.DB.prepare('SELECT session_key FROM interview_usage WHERE session_key = ?1')
    .bind(sessionKey).first()
  if (!existing) {
    try {
      await env.DB.prepare(`
        INSERT INTO interview_usage (session_key, invite_code_id, activation_id)
        VALUES (?1, ?2, ?3)
      `).bind(sessionKey, access.invite_code_id, access.activation_id).run()
    } catch (error) {
      console.warn('[Interview] Start rejected', error)
      return json({ error: 'INTERVIEW_LIMIT_REACHED' }, 403)
    }
  }

  const refreshed = await getActivation(request, env)
  return json(refreshed ? accessPayload(refreshed, true) : { unlocked: true })
}

async function callAI(env: Env, body: Record<string, unknown>): Promise<Response> {
  if (!env.AI_API_KEY) return json({ error: 'AI_NOT_CONFIGURED' }, 503)
  try {
    const response = await fetch(env.AI_API_BASE || DEFAULT_AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) {
      console.error('[AI] Provider error', response.status, text.slice(0, 300))
      return json({ error: 'AI_SERVICE_ERROR' }, 502)
    }
    return new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[AI] Network error', error)
    return json({ error: 'AI_SERVICE_UNAVAILABLE' }, 502)
  }
}

async function handleAiChat(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody(request)
  if (body instanceof Response) return body
  const messages = Array.isArray(body.messages) ? body.messages : null
  if (!messages || messages.length === 0 || messages.length > 30) return json({ error: 'INVALID_MESSAGES' }, 400)
  const sanitized = messages.map((message: any) => ({
    role: ['system', 'assistant', 'user'].includes(message?.role) ? message.role : 'user',
    content: String(message?.content ?? '').slice(0, 6000),
  }))
  const totalLength = sanitized.reduce((sum: number, message: any) => sum + message.content.length, 0)
  if (totalLength > 24_000) return json({ error: 'CONVERSATION_TOO_LONG' }, 400)
  return callAI(env, {
    model: env.AI_MODEL || 'deepseek-chat',
    messages: sanitized,
    temperature: Math.min(Math.max(Number(body.temperature ?? 0.7), 0), 1.5),
    max_tokens: Math.min(Math.max(Number(body.max_tokens ?? 512), 1), 1000),
    ...(body.response_format ? { response_format: body.response_format } : {}),
  })
}

async function handleAiScore(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody(request, 32_000)
  if (body instanceof Response) return body
  const question = String(body.question ?? '').trim().slice(0, 2000)
  const answer = String(body.answer ?? '').trim().slice(0, 6000)
  if (!question || !answer) return json({ error: 'MISSING_QUESTION_OR_ANSWER' }, 400)
  const prompt = `Evaluate this US visa interview answer.\nQuestion: ${question}\nAnswer: ${answer}\nReturn ONLY JSON with content scores for logic, specificity, persuasion and ties (1-5), voice confidence (1-100), verdict, summary and two suggestions.`
  return callAI(env, {
    model: env.AI_MODEL || 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are an expert visa interview coach. Always respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  })
}

function isAdmin(request: Request, env: Env): boolean {
  const token = request.headers.get('X-Admin-Token')?.trim() ?? ''
  const expectedToken = env.ADMIN_API_TOKEN?.trim() ?? ''
  return Boolean(expectedToken && token && safeEqual(token, expectedToken))
}

async function handleAdminList(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return json({ error: 'ADMIN_REQUIRED' }, 401)
  const result = await env.DB.prepare(`
    SELECT id, code_hint, batch_name, status, max_devices, activation_count,
      max_interviews, interviews_used, access_days, access_expires_at,
      code_expires_at, created_at
    FROM invite_codes ORDER BY created_at DESC LIMIT 500
  `).all()
  return json({ codes: result.results })
}

async function handleAdminGenerate(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return json({ error: 'ADMIN_REQUIRED' }, 401)
  const body = await parseJsonBody(request, 8_000)
  if (body instanceof Response) return body
  const count = Math.min(Math.max(Number(body.count ?? 1), 1), 200)
  const maxDevices = Math.min(Math.max(Number(body.maxDevices ?? 2), 1), 10)
  const maxInterviews = Math.min(Math.max(Number(body.maxInterviews ?? 10), 1), 1000)
  const accessDays = Math.min(Math.max(Number(body.accessDays ?? 30), 1), 3650)
  const codeValidityDays = Math.min(Math.max(Number(body.codeValidityDays ?? 365), 1), 3650)
  const batchName = String(body.batchName ?? '默认批次').trim().slice(0, 80) || '默认批次'
  const expiresAt = new Date(Date.now() + codeValidityDays * 24 * 60 * 60 * 1000).toISOString()

  const rawCodes: string[] = []
  const statements: D1PreparedStatement[] = []
  for (let index = 0; index < count; index += 1) {
    const code = randomInviteCode()
    rawCodes.push(code)
    statements.push(env.DB.prepare(`
      INSERT INTO invite_codes (
        id, code_hash, code_hint, batch_name, max_devices,
        max_interviews, access_days, code_expires_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(
      crypto.randomUUID(),
      await hashText(code),
      `${code.slice(0, 9)}***`,
      batchName,
      maxDevices,
      maxInterviews,
      accessDays,
      expiresAt,
    ))
  }
  await env.DB.batch(statements)
  await env.DB.prepare('INSERT INTO admin_audit (id, action, details) VALUES (?1, ?2, ?3)')
    .bind(crypto.randomUUID(), 'generate_codes', JSON.stringify({ count, batchName })).run()
  return json({ codes: rawCodes, batchName, maxDevices, maxInterviews, accessDays, codeValidityDays })
}

async function handleAdminUpdate(request: Request, env: Env, id: string): Promise<Response> {
  if (!isAdmin(request, env)) return json({ error: 'ADMIN_REQUIRED' }, 401)
  const body = await parseJsonBody(request, 4_000)
  if (body instanceof Response) return body
  const action = String(body.action ?? '')
  if (action === 'disable' || action === 'activate') {
    await env.DB.prepare('UPDATE invite_codes SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2')
      .bind(action === 'disable' ? 'disabled' : 'active', id).run()
  } else if (action === 'reset_activations') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM activations WHERE invite_code_id = ?1').bind(id),
      env.DB.prepare('UPDATE invite_codes SET activation_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?1').bind(id),
    ])
  } else {
    return json({ error: 'INVALID_ACTION' }, 400)
  }
  await env.DB.prepare('INSERT INTO admin_audit (id, action, target_id) VALUES (?1, ?2, ?3)')
    .bind(crypto.randomUUID(), action, id).run()
  return json({ ok: true })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, aiConfigured: Boolean(env.AI_API_KEY), adminConfigured: Boolean(env.ADMIN_API_TOKEN) })
    }
    if (url.pathname === '/api/access' && request.method === 'GET') return handleAccess(request, env)
    if (url.pathname === '/api/invite/redeem' && request.method === 'POST') return handleRedeem(request, env)
    if (url.pathname === '/api/interview/start' && request.method === 'POST') return handleInterviewStart(request, env)
    if (url.pathname === '/api/ai-chat' && request.method === 'POST') return handleAiChat(request, env)
    if (url.pathname === '/api/ai-score' && request.method === 'POST') return handleAiScore(request, env)
    if (url.pathname === '/api/admin/invites' && request.method === 'GET') return handleAdminList(request, env)
    if (url.pathname === '/api/admin/invites/generate' && request.method === 'POST') return handleAdminGenerate(request, env)
    const adminMatch = url.pathname.match(/^\/api\/admin\/invites\/([^/]+)$/)
    if (adminMatch && request.method === 'PATCH') return handleAdminUpdate(request, env, adminMatch[1])
    if (url.pathname.startsWith('/api/')) return json({ error: 'NOT_FOUND' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
