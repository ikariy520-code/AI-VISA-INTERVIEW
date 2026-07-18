import assert from 'node:assert/strict'
import { clientIp, createTokenBudget } from '../server/reportApi.mjs'

assert.equal(clientIp({
  headers: { 'x-forwarded-for': '198.51.100.99, 203.0.113.42' },
  socket: { remoteAddress: '127.0.0.1' },
}), '203.0.113.42', 'a spoofed first X-Forwarded-For value bypassed the real client IP limit')

let now = 1_000
const budget = createTokenBudget({
  windowMs: 60_000,
  perIpLimit: 64_000,
  globalLimit: 96_000,
  reservationSize: 32_000,
  now: () => now,
})

const first = budget.reserve('198.51.100.10')
const second = budget.reserve('198.51.100.10')
assert.equal(first.allowed, true)
assert.equal(second.allowed, true)
assert.equal(budget.reserve('198.51.100.10').allowed, false, 'per-IP hard limit did not block a third full reservation')

first.settle(1_000)
second.settle(1_000)
const third = budget.reserve('198.51.100.10')
assert.equal(third.allowed, true, 'unused reserved tokens were not refunded')
assert.equal(budget.reserve('203.0.113.20').allowed, true)
assert.equal(budget.reserve('192.0.2.30').allowed, false, 'global hard limit did not block aggregate reservations')

third.settle(1_000)
assert.equal(budget.reserve('192.0.2.30').allowed, true, 'actual usage settlement did not restore global capacity')

now += 60_001
assert.equal(budget.reserve('198.51.100.10').allowed, true, 'hourly token window did not reset')

console.log('report-token-budget=passed')
