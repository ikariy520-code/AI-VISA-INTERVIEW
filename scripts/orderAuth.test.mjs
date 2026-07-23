import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createOrderAuth } from '../server/orderAuth.mjs'

const CUSTOMER_ORDER = 'DY202607230001'
const SECRET = 'order-auth-test-secret-that-is-longer-than-32-characters'

function hash(value) {
  return createHash('sha256').update(String(value).trim().toUpperCase()).digest('hex')
}

function request(method, pathname, body, cookie = '') {
  const source = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = Readable.from(source)
  req.method = method
  req.url = pathname
  req.headers = {
    host: 'example.test',
    origin: 'https://example.test',
    cookie,
  }
  req.socket = { remoteAddress: '127.0.0.1' }
  return req
}

class MockResponse {
  constructor() {
    this.statusCode = 200
    this.headers = new Map()
    this.body = ''
  }

  setHeader(name, value) {
    this.headers.set(name.toLowerCase(), value)
  }

  end(value = '') {
    this.body += String(value)
  }

  payload() {
    return JSON.parse(this.body || '{}')
  }
}

async function api(auth, method, pathname, body, cookie = '') {
  const req = request(method, pathname, body, cookie)
  const res = new MockResponse()
  assert.equal(await auth.handleRequest(req, res, pathname), true)
  return { req, res, payload: res.payload() }
}

function cookieFrom(res) {
  return String(res.headers.get('set-cookie')).split(';')[0]
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'visa-order-auth-'))
const usageFile = join(temporaryRoot, 'order-usage.json')
const options = {
  adminOrderNumbers: 'ADMIN-ONE,ADMIN-TWO',
  sessionSecret: SECRET,
  usageFile,
  orders: [{ id: 'ORDER-01', orderNumberHash: hash(CUSTOMER_ORDER), maxUses: 2, enabled: true }],
}

try {
  const auth = createOrderAuth(options)
  assert.equal(auth.configured, true)
  assert.equal(auth.orderCount, 1)

  const invalid = await api(auth, 'POST', '/api/auth/order', { orderNumber: 'wrong-order' })
  assert.equal(invalid.res.statusCode, 401)
  assert.equal(invalid.payload.code, 'INVALID_ORDER_NUMBER')

  const login = await api(auth, 'POST', '/api/auth/order', { orderNumber: CUSTOMER_ORDER.toLowerCase() })
  assert.equal(login.res.statusCode, 200)
  assert.equal(login.payload.role, 'customer')
  assert.equal(login.payload.remainingUses, 2)
  assert.equal(login.payload.availableUses, 2)
  const customerCookie = cookieFrom(login.res)

  const attemptA = 'attempt-aaaaaaaa'
  const attemptB = 'attempt-bbbbbbbb'
  const attemptC = 'attempt-cccccccc'
  const customerRequest = request('GET', '/api/realtime-voice', undefined, customerCookie)

  assert.equal(auth.realtimeAccess(customerRequest, attemptA).allowed, true)
  assert.equal(auth.reportAccess(customerRequest, attemptA).allowed, false, 'report generation requires a verified interview attempt')
  const reservedA = auth.reserveInterview(customerRequest, attemptA)
  assert.equal(reservedA.allowed, true)
  assert.equal(reservedA.usedUses, 0, 'starting an interview must not consume an order use')
  assert.equal(reservedA.remainingUses, 2)
  assert.equal(reservedA.availableUses, 1)
  assert.equal(auth.reportAccess(customerRequest, attemptA).allowed, true, 'the verified attempt may generate its report without entering the order again')

  const resumedA = auth.reserveInterview(customerRequest, attemptA)
  assert.equal(resumedA.allowed, true)
  assert.equal(resumedA.resumed, true)
  assert.equal(resumedA.usedUses, 0, 'reconnecting the same attempt must not consume a use')

  const reservedB = auth.reserveInterview(customerRequest, attemptB)
  assert.equal(reservedB.allowed, true)
  assert.equal(reservedB.availableUses, 0)

  const blockedC = auth.realtimeAccess(customerRequest, attemptC)
  assert.equal(blockedC.allowed, false)
  assert.equal(blockedC.code, 'ORDER_CAPACITY_RESERVED')

  const completedA = await api(auth, 'POST', '/api/auth/complete', { attemptId: attemptA }, customerCookie)
  assert.equal(completedA.res.statusCode, 200)
  assert.equal(completedA.payload.completed, true)
  assert.equal(completedA.payload.usedUses, 1)
  assert.equal(completedA.payload.remainingUses, 1)

  const repeatedA = await api(auth, 'POST', '/api/auth/complete', { attemptId: attemptA }, customerCookie)
  assert.equal(repeatedA.res.statusCode, 200)
  assert.equal(repeatedA.payload.alreadyCompleted, true)
  assert.equal(repeatedA.payload.usedUses, 1, 'showing the same report again must not consume twice')
  assert.equal(auth.reportAccess(customerRequest, attemptA).allowed, true, 'the completed attempt remains valid for an idempotent report retry')

  const completedB = await api(auth, 'POST', '/api/auth/complete', { attemptId: attemptB }, customerCookie)
  assert.equal(completedB.res.statusCode, 200)
  assert.equal(completedB.payload.usedUses, 2)
  assert.equal(completedB.payload.remainingUses, 0)

  const statusAfter = await api(auth, 'GET', '/api/auth/status', undefined, customerCookie)
  assert.equal(statusAfter.res.statusCode, 200, 'an exhausted order session can still access its report request')
  assert.equal(statusAfter.payload.remainingUses, 0)
  assert.equal(auth.isAuthorized(statusAfter.req), true)
  assert.equal(auth.realtimeAccess(customerRequest, attemptC).code, 'ORDER_QUOTA_EXHAUSTED')

  const exhaustedLogin = await api(auth, 'POST', '/api/auth/order', { orderNumber: CUSTOMER_ORDER })
  assert.equal(exhaustedLogin.res.statusCode, 403)
  assert.equal(exhaustedLogin.payload.code, 'ORDER_QUOTA_EXHAUSTED')

  const restarted = createOrderAuth(options)
  const persistedStatus = await api(restarted, 'GET', '/api/auth/status', undefined, customerCookie)
  assert.equal(persistedStatus.payload.remainingUses, 0, 'completed usage must survive a server restart')

  for (const adminNumber of ['ADMIN-ONE', 'ADMIN-TWO']) {
    const adminLogin = await api(restarted, 'POST', '/api/auth/order', { orderNumber: adminNumber })
    assert.equal(adminLogin.payload.role, 'admin')
    assert.equal(adminLogin.payload.unlimited, true)
    const adminCookie = cookieFrom(adminLogin.res)
    const adminRequest = request('GET', '/api/realtime-voice', undefined, adminCookie)
    assert.equal(restarted.reportAccess(adminRequest, `admin-${adminNumber}-attempt`).allowed, true)
    assert.equal(restarted.reserveInterview(adminRequest, `admin-${adminNumber}-attempt`).allowed, true)
    const adminComplete = await api(restarted, 'POST', '/api/auth/complete', { attemptId: `admin-${adminNumber}-attempt` }, adminCookie)
    assert.equal(adminComplete.payload.completed, true)
    assert.equal(adminComplete.payload.unlimited, true)
  }

  const dynamicOrdersFile = join(temporaryRoot, 'orders.json')
  const dynamicAuth = createOrderAuth({
    sessionSecret: SECRET,
    ordersFile: dynamicOrdersFile,
    usageFile: join(temporaryRoot, 'dynamic-usage.json'),
  })
  assert.equal(dynamicAuth.configured, false)
  writeFileSync(dynamicOrdersFile, `${JSON.stringify({
    version: 1,
    orders: [{ id: 'ORDER-LIVE', orderNumberHash: hash('LIVE-ORDER-001'), maxUses: 1, enabled: true }],
  }, null, 2)}\n`)
  assert.equal(dynamicAuth.configured, true, 'new orders added by the admin command must become available without restarting the server')
  const dynamicLogin = await api(dynamicAuth, 'POST', '/api/auth/order', { orderNumber: 'LIVE-ORDER-001' })
  assert.equal(dynamicLogin.payload.role, 'customer')
  const dynamicCookie = cookieFrom(dynamicLogin.res)
  const dynamicRequest = request('GET', '/api/realtime-voice', undefined, dynamicCookie)
  const abandonedAttempt = 'attempt-release-one'
  assert.equal(dynamicAuth.reserveInterview(dynamicRequest, abandonedAttempt).allowed, true)

  const released = await api(dynamicAuth, 'POST', '/api/auth/release', { attemptId: abandonedAttempt }, dynamicCookie)
  assert.equal(released.res.statusCode, 200)
  assert.equal(released.payload.released, true)
  assert.equal(released.payload.usedUses, 0, 'abandoning an interview must not consume an order use')
  assert.equal(dynamicAuth.reportAccess(dynamicRequest, abandonedAttempt).allowed, false, 'a released attempt must not be able to generate a report')
  assert.equal(dynamicAuth.reserveInterview(dynamicRequest, 'attempt-after-release').allowed, true, 'a released reservation must free capacity for the next interview')

  console.log('order-auth=passed')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
