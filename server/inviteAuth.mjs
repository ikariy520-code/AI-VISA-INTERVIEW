import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'visa_test_session'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 8
const MAX_BODY_BYTES = 4 * 1024

function json(res, statusCode, payload, extraHeaders = {}) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value)
  res.end(JSON.stringify(payload))
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase()
}

function digest(value) {
  return createHash('sha256').update(value).digest()
}

function safeEqual(left, right) {
  return timingSafeEqual(digest(left), digest(right))
}

function parseCookies(header) {
  const cookies = new Map()
  for (const part of String(header || '').split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name) cookies.set(name, value)
  }
  return cookies
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || req.socket.remoteAddress || 'unknown'
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

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', chunk => {
      if (tooLarge) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 }))
      }
    })
    req.on('error', reject)
  })
}

export function createInviteAuth(options = {}) {
  const validCodes = String(options.codes || '')
    .split(',')
    .map(normalizeCode)
    .filter(Boolean)
  const sessionSecret = String(options.sessionSecret || '').trim()
  const secureCookies = Boolean(options.secureCookies)
  const configured = validCodes.length > 0 && sessionSecret.length >= 32
  const failedAttempts = new Map()

  function sign(value) {
    return createHmac('sha256', sessionSecret).update(value).digest('base64url')
  }

  function createSessionToken() {
    const issuedAt = Math.floor(Date.now() / 1000).toString(36)
    const nonce = randomBytes(18).toString('base64url')
    const unsigned = `v1.${issuedAt}.${nonce}`
    return `${unsigned}.${sign(unsigned)}`
  }

  function verifySessionToken(token) {
    if (!configured) return false
    const parts = String(token || '').split('.')
    if (parts.length !== 4 || parts[0] !== 'v1') return false
    const unsigned = parts.slice(0, 3).join('.')
    if (!safeEqual(parts[3], sign(unsigned))) return false
    const issuedAt = Number.parseInt(parts[1], 36)
    const now = Math.floor(Date.now() / 1000)
    return Number.isFinite(issuedAt)
      && issuedAt <= now + 60
      && now - issuedAt <= SESSION_MAX_AGE_SECONDS
  }

  function isAuthorized(req) {
    const token = parseCookies(req.headers.cookie).get(COOKIE_NAME)
    return verifySessionToken(token)
  }

  function sessionCookie(token, maxAge = SESSION_MAX_AGE_SECONDS) {
    return [
      `${COOKIE_NAME}=${token}`,
      'Path=/',
      `Max-Age=${maxAge}`,
      'HttpOnly',
      'SameSite=Strict',
      ...(secureCookies ? ['Secure'] : []),
    ].join('; ')
  }

  function attemptState(ip) {
    const now = Date.now()
    const current = failedAttempts.get(ip)
    if (!current || now - current.startedAt >= ATTEMPT_WINDOW_MS) {
      const fresh = { count: 0, startedAt: now }
      failedAttempts.set(ip, fresh)
      return fresh
    }
    return current
  }

  function unauthorized(res) {
    json(res, 401, {
      authenticated: false,
      code: 'INVITE_REQUIRED',
      message: '请输入有效邀请码后继续。',
    })
  }

  async function handleRequest(req, res, pathname) {
    if (!pathname.startsWith('/api/auth/')) return false

    if (pathname === '/api/auth/status' && (req.method === 'GET' || req.method === 'HEAD')) {
      if (!configured) {
        json(res, 503, {
          authenticated: false,
          code: 'INVITE_AUTH_NOT_CONFIGURED',
          message: '测试访问暂未配置，请联系管理员。',
        })
        return true
      }
      if (!isAuthorized(req)) {
        unauthorized(res)
        return true
      }
      json(res, 200, { authenticated: true })
      return true
    }

    if (pathname === '/api/auth/invite' && req.method === 'POST') {
      if (!configured) {
        json(res, 503, {
          authenticated: false,
          code: 'INVITE_AUTH_NOT_CONFIGURED',
          message: '测试访问暂未配置，请联系管理员。',
        })
        return true
      }
      if (!isSameOrigin(req)) {
        json(res, 403, { authenticated: false, message: '请求来源无效。' })
        return true
      }

      const ip = clientIp(req)
      const attempts = attemptState(ip)
      if (attempts.count >= MAX_FAILED_ATTEMPTS) {
        const retryAfter = Math.max(1, Math.ceil((ATTEMPT_WINDOW_MS - (Date.now() - attempts.startedAt)) / 1000))
        json(res, 429, {
          authenticated: false,
          message: '尝试次数过多，请稍后再试。',
        }, { 'Retry-After': String(retryAfter) })
        return true
      }

      try {
        const payload = await readJson(req)
        const submitted = normalizeCode(payload?.code)
        const valid = validCodes.some(code => safeEqual(submitted, code))
        if (!valid) {
          attempts.count += 1
          json(res, 401, {
            authenticated: false,
            code: 'INVALID_INVITE_CODE',
            message: '邀请码不正确，请重新输入。',
          })
          return true
        }

        failedAttempts.delete(ip)
        const token = createSessionToken()
        json(res, 200, { authenticated: true }, {
          'Set-Cookie': sessionCookie(token),
        })
      } catch (error) {
        json(res, Number(error?.statusCode) || 400, {
          authenticated: false,
          message: '邀请码提交失败，请重新输入。',
        })
      }
      return true
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      if (!isSameOrigin(req)) {
        json(res, 403, { authenticated: false, message: '请求来源无效。' })
        return true
      }
      json(res, 200, { authenticated: false }, {
        'Set-Cookie': sessionCookie('', 0),
      })
      return true
    }

    json(res, 405, { message: 'Method Not Allowed' })
    return true
  }

  return {
    configured,
    handleRequest,
    isAuthorized,
    unauthorized,
  }
}
