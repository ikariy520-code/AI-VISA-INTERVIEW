import assert from 'node:assert/strict'
import {
  normalizeDeepSeekReport,
  sanitizeFeedbackRequest,
} from '../server/deepseekFeedback.mjs'
import {
  FEEDBACK_POLICY_VERSION,
  buildFeedbackMessages,
} from '../server/prompts/feedbackPolicy.mjs'

const input = sanitizeFeedbackRequest({
  id: 'test-session',
  date: '2026-07-18',
  time: '10:30',
  duration: '04:20',
  visaType: 'F1',
  officerType: 'standard',
  userContext: {
    purpose: 'Example University',
    major: 'Data Science',
    notes: 'Passport E123456789 and phone 13800138000 must be removed.',
    unknownPrivateField: 'must not pass',
  },
  transcript: [
    { role: 'officer', text: 'Why did you choose this university?', timestamp: '00:10' },
    { role: 'user', text: 'Pardon me?', timestamp: '00:12' },
    { role: 'officer', text: 'Why did you choose this university?', timestamp: '00:14' },
    { role: 'user', text: 'Its capstone matches my plan to work in risk analytics in China.', timestamp: '00:28' },
  ],
})

assert.ok(input)
assert.equal(input.pairs.length, 1)
assert.equal(input.pairs[0].questionIndex, 1)
assert.equal(input.context.unknownPrivateField, undefined)
assert.equal(String(input.context.notes).includes('13800138000'), false)
assert.equal(String(input.context.notes).includes('E123456789'), false)

const messages = buildFeedbackMessages({
  visaType: input.visaType,
  officerType: input.officerType,
  applicantContext: input.context,
  questionAnswerPairs: input.pairs,
})
assert.equal(messages.length, 2)
assert.match(messages[0].content, /Return one valid JSON object only/)
assert.match(messages[0].content, /eligibility/)
assert.match(messages[1].content, /questionAnswerPairs/)

const raw = {
  headline: '学习目标较清楚，但资金和回国计划证据不足。',
  summary: '只根据本次回答进行练习评估。',
  dimensions: [
    { id: 'eligibility', score: 80, summary: '清楚', evidence: '学校信息明确' },
    { id: 'authenticity', score: 75, summary: '基本可信', evidence: '说明课程关联' },
    { id: 'academic', score: 70, summary: '基本匹配', evidence: '提到技能目标' },
    { id: 'funding', score: 50, summary: '证据不足', evidence: '本次对话证据不足' },
    { id: 'ties', score: 65, summary: '需要具体', evidence: '提到回国行业' },
    { id: 'risk', score: 70, summary: '未见明显矛盾', evidence: '本次回答一致' },
  ],
  strengths: [{ title: '课程关联', detail: '能够说明课程与目标岗位的关系。' }],
  priorities: [{ title: '资金', detail: '下一轮补充真实来源和金额。' }],
  questionReviews: [{
    questionIndex: 1,
    score: 75,
    verdict: '基本回答',
    summary: '有具体课程联系。',
    didWell: ['直接回答。'],
    improve: ['增加学校比较依据。'],
    betterAnswer: 'I chose this university because [真实课程] supports my career plan in China.',
  }],
  actionPlan: [
    { label: '今天', title: '补事实', detail: '整理真实信息。' },
    { label: '下一轮', title: '重答', detail: '完成一次重答。' },
    { label: '面签前', title: '核对', detail: '核对材料。' },
  ],
}

const report = normalizeDeepSeekReport(input, raw)
assert.equal(report.source, 'deepseek')
assert.equal(report.policyVersion, FEEDBACK_POLICY_VERSION)
assert.equal(report.dimensions.length, 6)
assert.equal(report.questionReviews.length, 1)
assert.equal(report.questionReviews[0].question, input.pairs[0].question)
assert.equal(report.questionReviews[0].answer, input.pairs[0].answer)
assert.equal(report.overallScore, 68)

console.log('deepseek-feedback-tests=passed')
