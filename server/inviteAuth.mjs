import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const COOKIE_NAME = 'visa_test_session'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 8
const MAX_BODY_BYTES = 4 * 1024
const REALTIME_RESUME_WINDOW_MS = 90 * 60 * 1000

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

function normalizeAttemptId(value) {
  const attemptId = String(value || '').trim()
  return /^[a-zA-Z0-9-]{8,80}$/.test(attemptId) ? attemptId : ''
}

function digest(value) {
  return createHash('sha256').update(value).digest()
}

function digestHex(value) {
  return createHash('sha256').update(value).digest('hex')
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
  return forwarded || req.socket?.remoteAddress || 'unknown'
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
  return await new Promise((resolvePromise, reject) => {
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
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 }))
      }
    })
    req.on('error', reject)
  })
}

function loadLimitedCodes(filePath) {
  if (!filePath || !existsSync(filePath)) return []
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    if (parsed?.version !== 1 || !Array.isArray(parsed.codes)) throw new Error('unsupported schema')
    return parsed.codes
  } catch (error) {
    throw new Error(`Unable to load limited invite codes from ${filePath}: ${error instanceof Error ? error.message : error}`)
  }
}

function validateLimitedCodes(entries) {
  const ids = new Set()
  const hashes = new Set()
  return entries.map((entry, index) => {
    const id = String(entry?.id || '').trim()
    const codeHash = String(entry?.codeHash || '').trim().toLowerCase()
    const maxUses = Number(entry?.maxUses)
    if (!/^[A-Z0-9_-]{1,32}$/i.test(id)) throw new Error(`Invalid limited invite id at index ${index}`)
    if (!/^[a-f0-9]{64}$/.test(codeHash)) throw new Error(`Invalid limited invite hash for ${id}`)
    if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 1000) throw new Error(`Invalid maxUses for ${id}`)
    if (ids.has(id) || hashes.has(codeHash)) throw new Error(`Duplicate limited invite entry for ${id}`)
    ids.add(id)
    hashes.add(codeHash)
    return { id, codeHash, maxUses, enabled: entry.enabled !== false }
  })
}

function createLimitedInviteStore(entries, usageFile) {
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const byHash = new Map(entries.map(entry => [entry.codeHash, entry]))
  const absoluteUsageFile = resolve(usageFile)
  let usage = { version: 1, codes: {} }

  if (existsSync(absoluteUsageFile)) {
    try {
      const parsed = JSON.parse(readFileSync(absoluteUsageFile, 'utf8'))
      if (parsed?.version !== 1 || typeof parsed.codes !== 'object' || !parsed.codes) {
        throw new Error('unsupported schema')
      }
      usage = parsed
    } catch (error) {
      throw new Error(`Unable to load invite usage from ${absoluteUsageFile}: ${error instanceof Error ? error.message : error}`)
    }
  }

  function entryStatus(entry) {
    if (!entry) return null
    const rawUsed = Number(usage.codes[entry.id]?.used)
    const usedUses = Number.isSafeInteger(rawUsed) && rawUsed > 0 ? Math.min(rawUsed, entry.maxUses) : 0
    return {
      id: entry.id,
      enabled: entry.enabled,
      totalUses: entry.maxUses,
      usedUses,
      remainingUses: Math.max(0, entry.maxUses - usedUses),
    }
  }

  function activeAttempt(entry, attemptId) {
    const normalized = normalizeAttemptId(attemptId)
    if (!entry || !normalized) return false
    const attemptHash = digestHex(normalized)
    const updatedAt = Date.parse(String(usage.codes[entry.id]?.attempts?.[attemptHash] || ''))
    return Number.isFinite(updatedAt) && Date.now() - updatedAt <= REALTIME_RESUME_WINDOW_MS
  }

  function persist() {
    mkdirSync(dirname(absoluteUsageFile), { recursive: true })
    const temporary = `${absoluteUsageFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    writeFileSync(temporary, `${JSON.stringify(usage, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, absoluteUsageFile)
  }

  return {
    count: entries.length,
    usageFile: absoluteUsageFile,
    find(code) {
      const entry = byHash.get(digestHex(normalizeCode(code)))
      return entryStatus(entry)
    },
    status(id) {
      return entryStatus(byId.get(id))
    },
    canResume(id, attemptId) {
      return activeAttempt(byId.get(id), attemptId)
    },
    consume(id, attemptId) {
      const entry = byId.get(id)
      const status = entryStatus(entry)
      if (!status || !status.enabled) return { allowed: false, code: 'INVITE_DISABLED' }
      if (activeAttempt(entry, attemptId)) {
        return {
          allowed: true,
          resumed: true,
          role: 'tester',
          unlimited: false,
          totalUses: status.totalUses,
          usedUses: status.usedUses,
          remainingUses: status.remainingUses,
        }
      }
      if (status.remainingUses <= 0) {
        return { allowed: false, code: 'INVITE_QUOTA_EXHAUSTED', ...status }
      }
      const next = status.usedUses + 1
      const now = new Date().toISOString()
      const normalizedAttemptId = normalizeAttemptId(attemptId)
      const attempts = { ...(usage.codes[id]?.attempts || {}) }
      if (normalizedAttemptId) attempts[digestHex(normalizedAttemptId)] = now
      usage.codes[id] = { used: next, updatedAt: now, attempts }
      persist()
      return {
        allowed: true,
        role: 'tester',
        unlimited: false,
        totalUses: status.totalUses,
        usedUses: next,
        remainingUses: status.totalUses - next,
      }
    },
  }
}

function accessPayload(principal, limitedStore) {
  if (!principal) return null
  if (principal.kind === 'vip') {
    return {
      authenticated: true,
      role: 'vip',
      unlimited: true,
      totalUses: null,
      usedUses: null,
      remainingUses: null,
    }
  }
  const status = limitedStore.status(principal.id)
  if (!status || !status.enabled) return null
  return {
    authenticated: true,
    role: 'tester',
    unlimited: false,
    totalUses: status.totalUses,
    usedUses: status.usedUses,
    remainingUses: status.remainingUses,
  }
}

export function createInviteAuth(options = {}) {
  const vipCodes = String(options.codes || '')
    .split(',')
    .map(normalizeCode)
    .filter(Boolean)
  const vipIds = new Set(vipCodes.map(code => digestHex(code).slice(0, 16)))
  const limitedCodesFile = resolve(options.limitedCodesFile || 'server/inviteCodes.json')
  const limitedEntries = validateLimitedCodes(options.limitedCodes || loadLimitedCodes(limitedCodesFile))
  const usageFile = options.usageFile || 'data/invite-usage.json'
  const limitedStore = createLimitedInviteStore(limitedEntries, usageFile)
  const sessionSecret = String(options.sessionSecret || '').trim()
  const secureCookies = Boolean(options.secureCookies)
  const configured = (vipCodes.length > 0 || limitedEntries.length > 0) && sessionSecret.length >= 32
  const failedAttempts = new Map()

  function sign(value) {
    return createHmac('sha256', sessionSecret).update(value).digest('base64url')
  }

  function createSessionToken(principal) {
    const issuedAt = Math.floor(Date.now() / 1000).toString(36)
    const nonce = randomBytes(18).toString('base64url')
    const encodedPrincipal = Buffer.from(JSON.stringify(principal)).toString('base64url')
    const unsigned = `v2.${issuedAt}.${nonce}.${encodedPrincipal}`
    return `${unsigned}.${sign(unsigned)}`
  }

  function validIssuedAt(value) {
    const issuedAt = Number.parseInt(value, 36)
    const now = Math.floor(Date.now() / 1000)
    return Number.isFinite(issuedAt) && issuedAt <= now + 60 && now - issuedAt <= SESSION_MAX_AGE_SECONDS
  }

  function verifySessionToken(token) {
    if (!configured) return null
    const parts = String(token || '').split('.')

    // Sessions issued before quota support came from the two original VIP codes.
    // Keep them valid for their original seven-day lifetime.
    if (parts.length === 4 && parts[0] === 'v1') {
      const unsigned = parts.slice(0, 3).join('.')
      return safeEqual(parts[3], sign(unsigned)) && validIssuedAt(parts[1])
        ? { kind: 'vip', id: 'legacy' }
        : null
    }

    if (parts.length !== 5 || parts[0] !== 'v2') return null
    const unsigned = parts.slice(0, 4).join('.')
    if (!safeEqual(parts[4], sign(unsigned)) || !validIssuedAt(parts[1])) return null
    try {
      const principal = JSON.parse(Buffer.from(parts[3], 'base64url').toString('utf8'))
      if (principal?.kind === 'vip' && (principal.id === 'legacy' || vipIds.has(principal.id))) return principal
      if (principal?.kind === 'tester' && limitedStore.status(principal.id)) return principal
      return null
    } catch {
      return null
    }
  }

  function principalForRequest(req) {
    const token = parseCookies(req.headers.cookie).get(COOKIE_NAME)
    return verifySessionToken(token)
  }

  function getAccess(req) {
    return accessPayload(principalForRequest(req), limitedStore)
  }

  function isAuthorized(req) {
    return Boolean(getAccess(req))
  }

  function realtimeAccess(req, attemptId = '') {
    const access = getAccess(req)
    if (!access) return { allowed: false, statusCode: 401, code: 'INVITE_REQUIRED', message: '请先输入有效邀请码。' }
    const principal = principalForRequest(req)
    const canResume = principal?.kind === 'tester' && limitedStore.canResume(principal.id, attemptId)
    if (!access.unlimited && access.remainingUses <= 0 && !canResume) {
      return { allowed: false, statusCode: 403, code: 'INVITE_QUOTA_EXHAUSTED', message: '该邀请码的 3 次测试机会已经用完。', ...access }
    }
    return { allowed: true, ...access }
  }

  function consumeRealtimeUse(req, attemptId = '') {
    const principal = principalForRequest(req)
    const access = accessPayload(principal, limitedStore)
    if (!principal || !access) {
      return { allowed: false, statusCode: 401, code: 'INVITE_REQUIRED', message: '请先输入有效邀请码。' }
    }
    if (principal.kind === 'vip') return { allowed: true, ...access }
    const result = limitedStore.consume(principal.id, attemptId)
    if (!result.allowed) {
      return {
        ...result,
        statusCode: result.code === 'INVITE_QUOTA_EXHAUSTED' ? 403 : 401,
        message: result.code === 'INVITE_QUOTA_EXHAUSTED'
          ? '该邀请码的 3 次测试机会已经用完。'
          : '该邀请码当前不可用。',
      }
    }
    return result
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
      const access = getAccess(req)
      if (!access) {
        unauthorized(res)
        return true
      }
      json(res, 200, access)
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
        const vipIndex = vipCodes.findIndex(code => safeEqual(submitted, code))
        const limited = vipIndex === -1 ? limitedStore.find(submitted) : null

        if (vipIndex === -1 && !limited) {
          attempts.count += 1
          json(res, 401, {
            authenticated: false,
            code: 'INVALID_INVITE_CODE',
            message: '邀请码不正确，请重新输入。',
          })
          return true
        }

        if (limited && (!limited.enabled || limited.remainingUses <= 0)) {
          json(res, 403, {
            authenticated: false,
            code: limited.enabled ? 'INVITE_QUOTA_EXHAUSTED' : 'INVITE_DISABLED',
            message: limited.enabled ? '该邀请码的 3 次测试机会已经用完。' : '该邀请码当前不可用。',
          })
          return true
        }

        failedAttempts.delete(ip)
        const principal = vipIndex >= 0
          ? { kind: 'vip', id: digestHex(vipCodes[vipIndex]).slice(0, 16) }
          : { kind: 'tester', id: limited.id }
        const token = createSessionToken(principal)
        json(res, 200, accessPayload(principal, limitedStore), {
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
    limitedCodeCount: limitedStore.count,
    usageFile: limitedStore.usageFile,
    handleRequest,
    isAuthorized,
    realtimeAccess,
    consumeRealtimeUse,
    unauthorized,
  }
}
