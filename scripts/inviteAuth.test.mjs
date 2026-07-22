import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createInviteAuth } from '../server/inviteAuth.mjs'

const TESTER_CODE = 'TEST-AAAA-BBBB-CCCC-DDDD'
const SECRET = 'invite-auth-test-secret-that-is-longer-than-32-characters'

function hash(code) {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
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

const temporaryRoot = mkdtempSync(join(tmpdir(), 'visa-invite-auth-'))
const usageFile = join(temporaryRoot, 'invite-usage.json')
const options = {
  codes: 'VIP-ONE,VIP-TWO',
  sessionSecret: SECRET,
  usageFile,
  limitedCodes: [{ id: 'T01', codeHash: hash(TESTER_CODE), maxUses: 3, enabled: true }],
}

try {
  const auth = createInviteAuth(options)
  assert.equal(auth.configured, true)
  assert.equal(auth.limitedCodeCount, 1)

  const invalid = await api(auth, 'POST', '/api/auth/invite', { code: 'wrong-code' })
  assert.equal(invalid.res.statusCode, 401)
  assert.equal(invalid.payload.code, 'INVALID_INVITE_CODE')

  const testerLogin = await api(auth, 'POST', '/api/auth/invite', { code: TESTER_CODE.toLowerCase() })
  assert.equal(testerLogin.res.statusCode, 200)
  assert.equal(testerLogin.payload.role, 'tester')
  assert.equal(testerLogin.payload.remainingUses, 3)
  const testerCookie = cookieFrom(testerLogin.res)

  const statusBefore = await api(auth, 'GET', '/api/auth/status', undefined, testerCookie)
  assert.equal(statusBefore.payload.remainingUses, 3)
  assert.equal(auth.realtimeAccess(statusBefore.req).allowed, true)

  const attemptIds = ['attempt-aaaaaaaa', 'attempt-bbbbbbbb', 'attempt-cccccccc']
  for (const [index, remainingUses] of [2, 1, 0].entries()) {
    const consumed = auth.consumeRealtimeUse(
      request('GET', '/api/realtime-voice', undefined, testerCookie),
      attemptIds[index],
    )
    assert.equal(consumed.allowed, true)
    assert.equal(consumed.remainingUses, remainingUses)
    const resumed = auth.consumeRealtimeUse(
      request('GET', '/api/realtime-voice', undefined, testerCookie),
      attemptIds[index],
    )
    assert.equal(resumed.allowed, true)
    assert.equal(resumed.resumed, true)
    assert.equal(resumed.remainingUses, remainingUses, 'reconnecting the same interview must not consume quota')
  }

  const exhausted = auth.consumeRealtimeUse(
    request('GET', '/api/realtime-voice', undefined, testerCookie),
    'attempt-dddddddd',
  )
  assert.equal(exhausted.allowed, false)
  assert.equal(exhausted.code, 'INVITE_QUOTA_EXHAUSTED')
  assert.equal(auth.realtimeAccess(request('GET', '/api/realtime-voice', undefined, testerCookie)).allowed, false)
  assert.equal(
    auth.realtimeAccess(request('GET', '/api/realtime-voice', undefined, testerCookie), attemptIds[2]).allowed,
    true,
    'the final consumed attempt remains reconnectable after quota reaches zero',
  )

  const statusAfter = await api(auth, 'GET', '/api/auth/status', undefined, testerCookie)
  assert.equal(statusAfter.res.statusCode, 200, 'an exhausted tester can still view the completed report')
  assert.equal(statusAfter.payload.remainingUses, 0)

  const exhaustedLogin = await api(auth, 'POST', '/api/auth/invite', { code: TESTER_CODE })
  assert.equal(exhaustedLogin.res.statusCode, 403)
  assert.equal(exhaustedLogin.payload.code, 'INVITE_QUOTA_EXHAUSTED')

  const restarted = createInviteAuth(options)
  const persistedStatus = await api(restarted, 'GET', '/api/auth/status', undefined, testerCookie)
  assert.equal(persistedStatus.payload.remainingUses, 0, 'quota survives a server restart')

  const vipLogin = await api(restarted, 'POST', '/api/auth/invite', { code: 'vip-one' })
  assert.equal(vipLogin.payload.role, 'vip')
  assert.equal(vipLogin.payload.unlimited, true)
  const vipCookie = cookieFrom(vipLogin.res)
  for (let index = 0; index < 5; index += 1) {
    const consumed = restarted.consumeRealtimeUse(request('GET', '/api/realtime-voice', undefined, vipCookie))
    assert.equal(consumed.allowed, true)
    assert.equal(consumed.unlimited, true)
  }

  console.log('invite-auth=passed')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
