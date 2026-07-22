import assert from 'node:assert/strict'
import { reportDepthForAnswerCount } from '../src/modules/shared/store/reportDepth.ts'

assert.equal(reportDepthForAnswerCount(0), 'more_answers')
assert.equal(reportDepthForAnswerCount(4), 'more_answers')
assert.equal(reportDepthForAnswerCount(5), 'basic')
assert.equal(reportDepthForAnswerCount(6), 'basic')
assert.equal(reportDepthForAnswerCount(7), 'strong')
assert.equal(reportDepthForAnswerCount(9), 'strong')
assert.equal(reportDepthForAnswerCount(10), 'full')
assert.equal(reportDepthForAnswerCount(12), 'full')

console.log('report-depth=passed')
