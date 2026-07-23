import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const COOKIE_NAME = 'visa_order_session'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
const RESERVATION_TTL_MS = 4 * 60 * 60 * 1000
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

function normalizeOrderNumber(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
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

function loadOrders(filePath) {
  if (!filePath || !existsSync(filePath)) return []
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    if (parsed?.version !== 1 || !Array.isArray(parsed.orders)) throw new Error('unsupported schema')
    return parsed.orders
  } catch (error) {
    throw new Error(`Unable to load orders from ${filePath}: ${error instanceof Error ? error.message : error}`)
  }
}

function validateOrders(entries) {
  const ids = new Set()
  const hashes = new Set()
  return entries.map((entry, index) => {
    const id = String(entry?.id || '').trim()
    const orderNumberHash = String(entry?.orderNumberHash || '').trim().toLowerCase()
    const maxUses = Number(entry?.maxUses)
    const expiresAt = entry?.expiresAt ? String(entry.expiresAt) : null
    if (!/^[A-Z0-9_-]{1,64}$/i.test(id)) throw new Error(`Invalid order id at index ${index}`)
    if (!/^[a-f0-9]{64}$/.test(orderNumberHash)) throw new Error(`Invalid order hash for ${id}`)
    if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 1000) throw new Error(`Invalid maxUses for ${id}`)
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) throw new Error(`Invalid expiresAt for ${id}`)
    if (ids.has(id) || hashes.has(orderNumberHash)) throw new Error(`Duplicate order entry for ${id}`)
    ids.add(id)
    hashes.add(orderNumberHash)
    return {
      id,
      orderNumberHash,
      maxUses,
      enabled: entry.enabled !== false,
      expiresAt,
      channel: String(entry.channel || '').trim().slice(0, 40),
      displaySuffix: String(entry.displaySuffix || '').trim().slice(-8),
    }
  })
}

function createOrderStore(entries, usageFile) {
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const byHash = new Map(entries.map(entry => [entry.orderNumberHash, entry]))
  const absoluteUsageFile = resolve(usageFile)
  let usage = { version: 1, orders: {} }

  if (existsSync(absoluteUsageFile)) {
    try {
      const parsed = JSON.parse(readFileSync(absoluteUsageFile, 'utf8'))
      if (parsed?.version !== 1 || typeof parsed.orders !== 'object' || !parsed.orders) {
        throw new Error('unsupported schema')
      }
      usage = parsed
    } catch (error) {
      throw new Error(`Unable to load order usage from ${absoluteUsageFile}: ${error instanceof Error ? error.message : error}`)
    }
  }

  function usageRecord(id) {
    const record = usage.orders[id]
    return record && typeof record === 'object' ? record : { used: 0, attempts: {} }
  }

  function attemptRecord(id, attemptId) {
    const normalized = normalizeAttemptId(attemptId)
    if (!normalized) return null
    const record = usageRecord(id).attempts?.[digestHex(normalized)]
    return record && typeof record === 'object' ? record : null
  }

  function reservationIsActive(record) {
    if (record?.state !== 'reserved') return false
    const reservedAt = Date.parse(String(record.reservedAt || ''))
    return Number.isFinite(reservedAt) && Date.now() - reservedAt <= RESERVATION_TTL_MS
  }

  function entryStatus(entry) {
    if (!entry) return null
    const record = usageRecord(entry.id)
    const rawUsed = Number(record.used)
    const usedUses = Number.isSafeInteger(rawUsed) && rawUsed > 0 ? Math.min(rawUsed, entry.maxUses) : 0
    const attempts = record.attempts && typeof record.attempts === 'object' ? record.attempts : {}
    const reservedUses = Object.values(attempts).filter(reservationIsActive).length
    const remainingUses = Math.max(0, entry.maxUses - usedUses)
    return {
      id: entry.id,
      enabled: entry.enabled,
      expired: Boolean(entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()),
      expiresAt: entry.expiresAt,
      totalUses: entry.maxUses,
      usedUses,
      remainingUses,
      reservedUses,
      availableUses: Math.max(0, remainingUses - reservedUses),
    }
  }

  function persist() {
    mkdirSync(dirname(absoluteUsageFile), { recursive: true })
    const temporary = `${absoluteUsageFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    writeFileSync(temporary, `${JSON.stringify(usage, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, absoluteUsageFile)
  }

  function accessResult(status, extra = {}) {
    return {
      allowed: true,
      role: 'customer',
      unlimited: false,
      totalUses: status.totalUses,
      usedUses: status.usedUses,
      remainingUses: status.remainingUses,
      availableUses: status.availableUses,
      expiresAt: status.expiresAt,
      ...extra,
    }
  }

  return {
    count: entries.length,
    usageFile: absoluteUsageFile,
    find(orderNumber) {
      const entry = byHash.get(digestHex(normalizeOrderNumber(orderNumber)))
      return entryStatus(entry)
    },
    status(id) {
      return entryStatus(byId.get(id))
    },
    canResume(id, attemptId) {
      return reservationIsActive(attemptRecord(id, attemptId))
    },
    canAccessReport(id, attemptId) {
      const attempt = attemptRecord(id, attemptId)
      return reservationIsActive(attempt) || attempt?.state === 'completed'
    },
    reserve(id, attemptId) {
      const entry = byId.get(id)
      const status = entryStatus(entry)
      const normalizedAttemptId = normalizeAttemptId(attemptId)
      if (!status || !status.enabled) return { allowed: false, code: 'ORDER_DISABLED' }
      if (status.expired) return { allowed: false, code: 'ORDER_EXPIRED', ...status }
      if (!normalizedAttemptId) return { allowed: false, code: 'ORDER_ATTEMPT_INVALID' }

      const existing = attemptRecord(id, normalizedAttemptId)
      if (existing?.state === 'completed') {
        return { allowed: false, code: 'ORDER_ATTEMPT_COMPLETED', ...status }
      }
      if (reservationIsActive(existing)) return accessResult(status, { resumed: true })
      if (status.availableUses <= 0) {
        return {
          allowed: false,
          code: status.remainingUses <= 0 ? 'ORDER_QUOTA_EXHAUSTED' : 'ORDER_CAPACITY_RESERVED',
          ...status,
        }
      }

      const record = usageRecord(id)
      const now = new Date().toISOString()
      const attempts = { ...(record.attempts || {}) }
      attempts[digestHex(normalizedAttemptId)] = { state: 'reserved', reservedAt: now, updatedAt: now }
      usage.orders[id] = { ...record, attempts, updatedAt: now }
      persist()
      return accessResult(entryStatus(entry), { reserved: true })
    },
    complete(id, attemptId) {
      const entry = byId.get(id)
      const status = entryStatus(entry)
      const normalizedAttemptId = normalizeAttemptId(attemptId)
      if (!status || !status.enabled) return { allowed: false, code: 'ORDER_DISABLED' }
      if (!normalizedAttemptId) return { allowed: false, code: 'ORDER_ATTEMPT_INVALID' }

      const record = usageRecord(id)
      const attemptHash = digestHex(normalizedAttemptId)
      const existing = record.attempts?.[attemptHash]
      if (existing?.state === 'completed') return accessResult(status, { alreadyCompleted: true })
      if (!reservationIsActive(existing)) {
        return { allowed: false, code: 'ORDER_ATTEMPT_NOT_RESERVED', ...status }
      }
      if (status.remainingUses <= 0) return { allowed: false, code: 'ORDER_QUOTA_EXHAUSTED', ...status }

      const now = new Date().toISOString()
      const attempts = {
        ...(record.attempts || {}),
        [attemptHash]: { ...existing, state: 'completed', completedAt: now, updatedAt: now },
      }
      usage.orders[id] = { used: status.usedUses + 1, attempts, updatedAt: now }
      persist()
      return accessResult(entryStatus(entry), { completed: true })
    },
    release(id, attemptId) {
      const entry = byId.get(id)
      const status = entryStatus(entry)
      const normalizedAttemptId = normalizeAttemptId(attemptId)
      if (!status || !status.enabled) return { allowed: false, code: 'ORDER_DISABLED' }
      if (!normalizedAttemptId) return { allowed: false, code: 'ORDER_ATTEMPT_INVALID' }

      const record = usageRecord(id)
      const attemptHash = digestHex(normalizedAttemptId)
      const existing = record.attempts?.[attemptHash]
      if (!existing || existing.state === 'released') return accessResult(status, { released: false })
      if (existing.state === 'completed') return accessResult(status, { released: false, alreadyCompleted: true })

      const now = new Date().toISOString()
      const attempts = {
        ...(record.attempts || {}),
        [attemptHash]: { ...existing, state: 'released', releasedAt: now, updatedAt: now },
      }
      usage.orders[id] = { ...record, attempts, updatedAt: now }
      persist()
      return accessResult(entryStatus(entry), { released: true })
    },
  }
}

function accessPayload(principal, orderStore) {
  if (!principal) return null
  if (principal.kind === 'admin') {
    return {
      authenticated: true,
      role: 'admin',
      unlimited: true,
      totalUses: null,
      usedUses: null,
      remainingUses: null,
      availableUses: null,
      expiresAt: null,
    }
  }
  const status = orderStore.status(principal.id)
  if (!status || !status.enabled) return null
  return {
    authenticated: true,
    role: 'customer',
    unlimited: false,
    totalUses: status.totalUses,
    usedUses: status.usedUses,
    remainingUses: status.remainingUses,
    availableUses: status.availableUses,
    expiresAt: status.expiresAt,
  }
}

function accessError(result) {
  switch (result?.code) {
    case 'ORDER_QUOTA_EXHAUSTED':
      return { statusCode: 403, message: '该订单号的面签次数已经用完。' }
    case 'ORDER_CAPACITY_RESERVED':
      return { statusCode: 409, message: '该订单号的剩余次数正在另一场面签中使用，请稍后再试。' }
    case 'ORDER_EXPIRED':
      return { statusCode: 403, message: '该订单号已过期。' }
    case 'ORDER_ATTEMPT_COMPLETED':
      return { statusCode: 409, message: '本次面签已经完成并展示过报告。' }
    case 'ORDER_ATTEMPT_NOT_RESERVED':
      return { statusCode: 409, message: '未找到本次面签的有效订单预留，请返回并重新进入面签。' }
    default:
      return { statusCode: 401, message: '该订单号当前不可用。' }
  }
}

export function createOrderAuth(options = {}) {
  const adminOrderNumbers = String(options.adminOrderNumbers || '')
    .split(',')
    .map(normalizeOrderNumber)
    .filter(Boolean)
  const adminIds = new Set(adminOrderNumbers.map(number => digestHex(number).slice(0, 16)))
  const ordersFile = resolve(options.ordersFile || 'data/orders.json')
  const suppliedOrders = Array.isArray(options.orders)
  let orderEntries = validateOrders(suppliedOrders ? options.orders : loadOrders(ordersFile))
  const usageFile = options.usageFile || 'data/order-usage.json'
  const absoluteUsageFile = resolve(usageFile)
  let orderStore = createOrderStore(orderEntries, usageFile)
  let ordersFileMtimeMs = suppliedOrders || !existsSync(ordersFile) ? 0 : statSync(ordersFile).mtimeMs
  let usageFileMtimeMs = !existsSync(absoluteUsageFile) ? 0 : statSync(absoluteUsageFile).mtimeMs
  const sessionSecret = String(options.sessionSecret || '').trim()
  const secureCookies = Boolean(options.secureCookies)
  const failedAttempts = new Map()

  function refreshOrderStore() {
    if (suppliedOrders) return
    const nextMtimeMs = existsSync(ordersFile) ? statSync(ordersFile).mtimeMs : 0
    const nextUsageMtimeMs = existsSync(absoluteUsageFile) ? statSync(absoluteUsageFile).mtimeMs : 0
    if (nextMtimeMs === ordersFileMtimeMs && nextUsageMtimeMs === usageFileMtimeMs) return
    if (nextMtimeMs !== ordersFileMtimeMs) orderEntries = validateOrders(loadOrders(ordersFile))
    orderStore = createOrderStore(orderEntries, usageFile)
    ordersFileMtimeMs = nextMtimeMs
    usageFileMtimeMs = nextUsageMtimeMs
  }

  function isConfigured() {
    refreshOrderStore()
    return (adminOrderNumbers.length > 0 || orderEntries.length > 0) && sessionSecret.length >= 32
  }

  function sign(value) {
    return createHmac('sha256', sessionSecret).update(value).digest('base64url')
  }

  function createSessionToken(principal) {
    const issuedAt = Math.floor(Date.now() / 1000).toString(36)
    const nonce = randomBytes(18).toString('base64url')
    const encodedPrincipal = Buffer.from(JSON.stringify(principal)).toString('base64url')
    const unsigned = `v1.${issuedAt}.${nonce}.${encodedPrincipal}`
    return `${unsigned}.${sign(unsigned)}`
  }

  function validIssuedAt(value) {
    const issuedAt = Number.parseInt(value, 36)
    const now = Math.floor(Date.now() / 1000)
    return Number.isFinite(issuedAt) && issuedAt <= now + 60 && now - issuedAt <= SESSION_MAX_AGE_SECONDS
  }

  function verifySessionToken(token) {
    if (!isConfigured()) return null
    const parts = String(token || '').split('.')
    if (parts.length !== 5 || parts[0] !== 'v1') return null
    const unsigned = parts.slice(0, 4).join('.')
    if (!safeEqual(parts[4], sign(unsigned)) || !validIssuedAt(parts[1])) return null
    try {
      const principal = JSON.parse(Buffer.from(parts[3], 'base64url').toString('utf8'))
      if (principal?.kind === 'admin' && adminIds.has(principal.id)) return principal
      if (principal?.kind === 'customer' && orderStore.status(principal.id)) return principal
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
    return accessPayload(principalForRequest(req), orderStore)
  }

  function isAuthorized(req) {
    return Boolean(getAccess(req))
  }

  function realtimeAccess(req, attemptId = '') {
    const principal = principalForRequest(req)
    const access = accessPayload(principal, orderStore)
    if (!principal || !access) {
      return { allowed: false, statusCode: 401, code: 'ORDER_REQUIRED', message: '开始实时面签前，请先输入有效订单号。' }
    }
    if (principal.kind === 'admin') return { allowed: true, ...access }
    const status = orderStore.status(principal.id)
    const canResume = orderStore.canResume(principal.id, attemptId)
    if (status.expired) return { allowed: false, statusCode: 403, code: 'ORDER_EXPIRED', message: '该订单号已过期。', ...access }
    if (status.remainingUses <= 0 && !canResume) {
      return { allowed: false, statusCode: 403, code: 'ORDER_QUOTA_EXHAUSTED', message: '该订单号的面签次数已经用完。', ...access }
    }
    if (status.availableUses <= 0 && !canResume) {
      return { allowed: false, statusCode: 403, code: 'ORDER_CAPACITY_RESERVED', message: '该订单号的剩余次数正在另一场面签中使用。', ...access }
    }
    return { allowed: true, ...access }
  }

  function reserveInterview(req, attemptId = '') {
    const principal = principalForRequest(req)
    const access = accessPayload(principal, orderStore)
    if (!principal || !access) {
      return { allowed: false, statusCode: 401, code: 'ORDER_REQUIRED', message: '开始实时面签前，请先输入有效订单号。' }
    }
    if (principal.kind === 'admin') return { allowed: true, ...access }
    const result = orderStore.reserve(principal.id, attemptId)
    if (result.allowed) return result
    const error = accessError(result)
    return { ...result, ...error }
  }

  function reportAccess(req, attemptId = '') {
    const principal = principalForRequest(req)
    const access = accessPayload(principal, orderStore)
    if (!principal || !access) {
      return { allowed: false, statusCode: 401, code: 'ORDER_REQUIRED', message: '订单会话已失效，请重新进入面签。' }
    }
    if (principal.kind === 'admin') return { allowed: true, ...access }
    if (!orderStore.canAccessReport(principal.id, attemptId)) {
      return { allowed: false, statusCode: 403, code: 'ORDER_ATTEMPT_NOT_RESERVED', message: '当前订单没有对应的已验证面签。' }
    }
    return { allowed: true, ...access }
  }

  function completeInterview(req, attemptId = '') {
    const principal = principalForRequest(req)
    const access = accessPayload(principal, orderStore)
    if (!principal || !access) {
      return { allowed: false, statusCode: 401, code: 'ORDER_REQUIRED', message: '订单会话已失效，请重新进入面签。' }
    }
    if (principal.kind === 'admin') return { allowed: true, completed: true, ...access }
    const result = orderStore.complete(principal.id, attemptId)
    if (result.allowed) return result
    const error = accessError(result)
    return { ...result, ...error }
  }

  function releaseInterview(req, attemptId = '') {
    const principal = principalForRequest(req)
    const access = accessPayload(principal, orderStore)
    if (!principal || !access) {
      return { allowed: false, statusCode: 401, code: 'ORDER_REQUIRED', message: '订单会话已失效。' }
    }
    if (principal.kind === 'admin') return { allowed: true, released: false, ...access }
    const result = orderStore.release(principal.id, attemptId)
    if (result.allowed) return result
    const error = accessError(result)
    return { ...result, ...error }
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

  function unauthorized(res, result = {}) {
    json(res, Number(result.statusCode) || 401, {
      authenticated: false,
      code: result.code || 'ORDER_REQUIRED',
      message: result.message || '开始实时面签前，请输入有效订单号。',
    })
  }

  async function handleRequest(req, res, pathname) {
    if (!pathname.startsWith('/api/auth/')) return false

    if (pathname === '/api/auth/status' && (req.method === 'GET' || req.method === 'HEAD')) {
      if (!isConfigured()) {
        json(res, 503, {
          authenticated: false,
          code: 'ORDER_AUTH_NOT_CONFIGURED',
          message: '订单验证暂未配置，请联系管理员。',
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

    if (pathname === '/api/auth/order' && req.method === 'POST') {
      if (!isConfigured()) {
        json(res, 503, {
          authenticated: false,
          code: 'ORDER_AUTH_NOT_CONFIGURED',
          message: '订单验证暂未配置，请联系管理员。',
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
        const submitted = normalizeOrderNumber(payload?.orderNumber)
        const adminIndex = adminOrderNumbers.findIndex(number => safeEqual(submitted, number))
        const order = adminIndex === -1 ? orderStore.find(submitted) : null

        if (adminIndex === -1 && !order) {
          attempts.count += 1
          json(res, 401, {
            authenticated: false,
            code: 'INVALID_ORDER_NUMBER',
            message: '订单号不存在，请检查后重新输入。',
          })
          return true
        }

        if (order && (!order.enabled || order.expired || order.availableUses <= 0)) {
          const result = !order.enabled
            ? { code: 'ORDER_DISABLED' }
            : order.expired
              ? { code: 'ORDER_EXPIRED' }
              : order.remainingUses <= 0
                ? { code: 'ORDER_QUOTA_EXHAUSTED' }
                : { code: 'ORDER_CAPACITY_RESERVED' }
          const error = accessError(result)
          json(res, error.statusCode, { authenticated: false, code: result.code, message: error.message })
          return true
        }

        failedAttempts.delete(ip)
        const principal = adminIndex >= 0
          ? { kind: 'admin', id: digestHex(adminOrderNumbers[adminIndex]).slice(0, 16) }
          : { kind: 'customer', id: order.id }
        const token = createSessionToken(principal)
        json(res, 200, accessPayload(principal, orderStore), {
          'Set-Cookie': sessionCookie(token),
        })
      } catch (error) {
        json(res, Number(error?.statusCode) || 400, {
          authenticated: false,
          message: '订单号提交失败，请重新输入。',
        })
      }
      return true
    }

    if (pathname === '/api/auth/complete' && req.method === 'POST') {
      if (!isSameOrigin(req)) {
        json(res, 403, { completed: false, message: '请求来源无效。' })
        return true
      }
      try {
        const payload = await readJson(req)
        const result = completeInterview(req, payload?.attemptId)
        json(res, result.allowed ? 200 : result.statusCode || 400, result)
      } catch (error) {
        json(res, Number(error?.statusCode) || 400, {
          completed: false,
          message: '本次面签完成状态提交失败，请重试。',
        })
      }
      return true
    }

    if (pathname === '/api/auth/release' && req.method === 'POST') {
      if (!isSameOrigin(req)) {
        json(res, 403, { released: false, message: '请求来源无效。' })
        return true
      }
      try {
        const payload = await readJson(req)
        const result = releaseInterview(req, payload?.attemptId)
        json(res, result.allowed ? 200 : result.statusCode || 400, result)
      } catch (error) {
        json(res, Number(error?.statusCode) || 400, { released: false, message: '面签预留释放失败。' })
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
    get configured() { return isConfigured() },
    get orderCount() { refreshOrderStore(); return orderStore.count },
    ordersFile,
    usageFile: orderStore.usageFile,
    handleRequest,
    isAuthorized,
    realtimeAccess,
    reserveInterview,
    reportAccess,
    completeInterview,
    releaseInterview,
    unauthorized,
  }
}
