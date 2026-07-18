import assert from 'node:assert/strict'
import {
  F1_REPORT_DIMENSION_IDS,
  buildF1ReportMessages,
  sanitizeReportRequest,
  validateF1StructuredReport,
} from '../src/shared/f1ReportContract.ts'
import {
  F1_OFFICIAL_CRITERIA,
  F1_OFFICIAL_CRITERIA_VERSION,
  F1_OFFICIAL_RULE_IDS,
} from '../src/modules/practice/data/f1OfficialCriteria.ts'
import {
  F1_OFFICIAL_CRITERIA as SERVER_CRITERIA,
  F1_OFFICIAL_CRITERIA_VERSION as SERVER_CRITERIA_VERSION,
} from '../server/shared/f1OfficialCriteria.mjs'
import { validateF1StructuredReport as validateServerReport } from '../server/shared/f1ReportContract.mjs'

const input = sanitizeReportRequest({
  visaType: 'F1',
  safeContext: {
    school: 'Example University',
    major: 'Computer Science',
    funding: 'My parents will pay USD 60,000 per year.',
    privateIdentifiers: 'E12345678 N123456789 AA12345678 student@example.com 13812345678 6222021234567890123',
  },
  answers: [
    { index: 1, questionId: 'f1_01', question: 'Which school will you study at?', answer: 'Example University.', timestamp: '00:10' },
    { index: 2, questionId: 'f1_12', question: 'Who will support your study?', answer: 'My parents.', timestamp: '00:35' },
    { index: 3, questionId: 'f1_19', question: 'Have you experienced harm or mistreatment in your country?', answer: 'No.', timestamp: '01:02' },
    { index: 4, questionId: 'f1_20', question: 'Do you fear harm or mistreatment in returning to your country?', answer: 'No.', timestamp: '01:20' },
  ],
})

assert.ok(input)
assert.equal(input.criteriaVersion, F1_OFFICIAL_CRITERIA_VERSION)
assert.equal(F1_OFFICIAL_CRITERIA.length, 6)
assert.deepEqual(SERVER_CRITERIA.map(rule => rule.id), [...F1_OFFICIAL_RULE_IDS])
assert.equal(SERVER_CRITERIA_VERSION, F1_OFFICIAL_CRITERIA_VERSION)
assert.ok(F1_OFFICIAL_CRITERIA.every(rule => rule.url.startsWith('https://travel.state.gov/') || rule.url.startsWith('https://fam.state.gov/')))

const privateContext = JSON.stringify(input.safeContext)
for (const secret of ['E12345678', 'N123456789', 'AA12345678', 'student@example.com', '13812345678', '6222021234567890123']) {
  assert.equal(privateContext.includes(secret), false, `identifier was not redacted: ${secret}`)
}

const ruleForDimension = [
  'DOS_ACADEMIC_PREPARATION',
  'DOS_DEPARTURE_INTENT',
  'DOS_ACADEMIC_PREPARATION',
  'DOS_FINANCIAL_CAPACITY',
  'FAM_PRESENT_INTENT_CALIBRATION',
  'FAM_RESIDENCE_ABROAD',
] as const

const validReport = {
  schemaVersion: 2,
  reportType: 'practice_readiness',
  criteriaVersion: F1_OFFICIAL_CRITERIA_VERSION,
  overallScore: 82,
  readiness: '准备较充分',
  headline: '核心信息回答直接，资金细节仍需在下一轮补充验证。',
  summary: '本次评价只依据脱敏背景和四个实际回答。',
  dimensions: F1_REPORT_DIMENSION_IDS.map((id, index) => ({
    id,
    label: id,
    score: index === 3 ? 68 : 82,
    status: index === 3 ? 'needs_evidence' : 'stable',
    summary: '该判断有用户原话作为依据。',
    evidence: index === 3
      ? [{ source: 'profile', reference: 'profile', quote: 'My parents will pay USD 60,000 per year.' }]
      : [{ source: 'answer', reference: 'f1_01', quote: 'Example University.' }],
    officialRuleIds: [ruleForDimension[index]],
    reasoning: '仅依据现有资料判断准备情况，不补充未提供的事实。',
    actions: ['核对自己的真实资料并保持前后一致。'],
  })),
  strengths: [{
    title: '学校信息直接',
    detail: '用户明确回答了学校名称。',
    evidenceRefs: ['f1_01'],
    officialRuleIds: ['DOS_ACADEMIC_PREPARATION'],
  }],
  priorities: [{
    title: '继续核对完整资金链',
    detail: '现有背景提供了年度金额，但本轮口头回答只说明了资助人。',
    evidenceRefs: ['profile', 'f1_12'],
    officialRuleIds: ['DOS_FINANCIAL_CAPACITY'],
  }],
  questionReviews: input.answers.map(answer => ({
    index: answer.index,
    questionId: answer.questionId,
    score: answer.answer === 'No.' ? 95 : 85,
    verdict: 'complete',
    summary: answer.answer === 'No.' ? '这是一个可以由直接否定完整回答的是非题。' : '回答直接回应了问题。',
    answerEvidence: answer.answer,
    strengths: ['直接回答问题。'],
    improvements: [],
    preparationDirection: '继续使用真实、简洁且与资料一致的回答。',
  })),
  actionPlan: [
    { label: 'STEP 1', title: '核对资料', detail: '核对学校、专业、金额和资助人。' },
    { label: 'STEP 2', title: '验证逻辑', detail: '用自己的真实情况串联学习和回国计划。' },
    { label: 'STEP 3', title: '再次练习', detail: '保持口语化并直接回答。' },
  ],
  disclaimer: 'practice only',
}

assert.ok(validateF1StructuredReport(validReport, input), 'client contract rejected valid evidence-bound report')
assert.ok(validateServerReport(validReport, input), 'server contract rejected valid evidence-bound report')
assert.equal(validReport.questionReviews[2].score, 95, 'concise yes/no answer should be allowed to score highly')

const structuredQuestionEvidence: any = structuredClone(validReport)
structuredQuestionEvidence.questionReviews[0].answerEvidence = {
  source: 'answer',
  reference: 'f1_01',
  quote: 'Example University.',
}
assert.ok(validateF1StructuredReport(structuredQuestionEvidence, input), 'client contract rejected grounded structured answer evidence')
assert.ok(validateServerReport(structuredQuestionEvidence, input), 'server contract rejected grounded structured answer evidence')

const fabricatedQuestionEvidence = structuredClone(structuredQuestionEvidence)
fabricatedQuestionEvidence.questionReviews[0].answerEvidence.quote = 'A school never supplied by the user.'
assert.equal(validateF1StructuredReport(fabricatedQuestionEvidence, input), null)
assert.equal(validateServerReport(fabricatedQuestionEvidence, input), null)

const stringDimensionAction: any = structuredClone(validReport)
stringDimensionAction.dimensions[0].actions = '核对自己的真实资料并保持前后一致。'
assert.deepEqual(validateF1StructuredReport(stringDimensionAction, input)?.dimensions[0].actions, ['核对自己的真实资料并保持前后一致。'])
assert.deepEqual(validateServerReport(stringDimensionAction, input)?.dimensions[0].actions, ['核对自己的真实资料并保持前后一致。'])

const missingDimensionRule = structuredClone(validReport)
missingDimensionRule.dimensions[0].officialRuleIds = []
assert.deepEqual(validateF1StructuredReport(missingDimensionRule, input)?.dimensions[0].officialRuleIds, ['DOS_ACADEMIC_PREPARATION'])
assert.deepEqual(validateServerReport(missingDimensionRule, input)?.dimensions[0].officialRuleIds, ['DOS_ACADEMIC_PREPARATION'])

const fabricatedEvidence = structuredClone(validReport)
fabricatedEvidence.dimensions[0].evidence[0].quote = 'A school never supplied by the user.'
assert.equal(validateF1StructuredReport(fabricatedEvidence, input), null)
assert.equal(validateServerReport(fabricatedEvidence, input), null)

const wrongAnswerReference = structuredClone(validReport)
wrongAnswerReference.dimensions[0].evidence[0].reference = 'f1_12'
assert.equal(validateF1StructuredReport(wrongAnswerReference, input), null)

const unknownRule = structuredClone(validReport)
unknownRule.dimensions[0].officialRuleIds.push('UNOFFICIAL_RULE')
assert.equal(validateF1StructuredReport(unknownRule, input), null)
assert.equal(validateServerReport(unknownRule, input), null)

const lengthPenalty = structuredClone(validReport)
lengthPenalty.questionReviews[2].summary = '回答过短，因此评分较低。'
assert.equal(validateF1StructuredReport(lengthPenalty, input), null)

const prediction = structuredClone(validReport)
prediction.summary = '获签概率为 90%。'
assert.equal(validateF1StructuredReport(prediction, input), null)

const messages = buildF1ReportMessages(input)
assert.match(messages[0].content, /Never reward length/)
assert.match(messages[0].content, /A direct yes\/no can fully answer/)
assert.match(messages[0].content, /never approval\/refusal probability/)
assert.match(messages[0].content, /answerEvidence must be the exact original answer text/)
assert.match(messages[0].content, /actions must be a JSON array/)
assert.match(messages[0].content, /must contain its own numeric score/)

console.log('f1-report-contract=passed')
