import assert from 'node:assert/strict'
import {
  buildDeterministicB2FallbackReport,
  sanitizeB2ReportRequest,
  validateB2StructuredReport,
} from '../server/shared/b2ReportContract.mjs'

const input = sanitizeB2ReportRequest({
  visaType: 'B2',
  safeContext: {
    travelPurposeCategory: 'tourism',
    destinations: 'Los Angeles',
    plannedDuration: '8–14 天',
    tripPlanSummary: '洛杉矶七天城市观光',
    privateContact: '13800138000',
  },
  answers: [
    { index: 1, questionId: 'b2_01', question: '您去美国的主要目的是什么？', answer: '我计划去洛杉矶旅游。', timestamp: '00:04' },
    { index: 2, questionId: 'b2_02', question: '您计划什么时候出发，在美国停留多久？', answer: '我计划十月出发，停留十天。', timestamp: '00:18' },
  ],
})
assert.ok(input)
assert.ok(JSON.stringify(input.safeContext).includes('[REDACTED_PHONE]'))

const fallback = buildDeterministicB2FallbackReport(input)
assert.ok(validateB2StructuredReport(fallback, input, { analysisMode: 'evidence_only' }))

const inventedEvidence = structuredClone(fallback)
inventedEvidence.dimensions[0].evidence[0].quote = '用户从未说过的内容'
assert.equal(validateB2StructuredReport(inventedEvidence, input, { analysisMode: 'evidence_only' }), null)

const prediction = structuredClone(fallback)
prediction.summary = '你的获签概率很高。'
assert.equal(validateB2StructuredReport(prediction, input, { analysisMode: 'evidence_only' }), null)

const invalidQuestion = sanitizeB2ReportRequest({
  visaType: 'B2', safeContext: {},
  answers: [{ index: 1, questionId: 'b2_99', question: '未知问题', answer: '回答', timestamp: '00:00' }],
})
assert.equal(invalidQuestion, null)

console.log('b2-report-contract=passed')
