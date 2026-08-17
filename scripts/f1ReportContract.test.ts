import assert from 'node:assert/strict'
import {
  F1_REPORT_DIMENSION_IDS,
  buildF1EvidenceCatalog,
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
import {
  buildF1AnalysisMessages,
  buildDeterministicF1FallbackReport,
  buildF1ReportMessages as buildServerReportMessages,
  composeF1ReportFromAnalysis,
  repairF1ReportEvidence,
  validateF1AnalysisPacket,
  validateF1StructuredReport as validateServerReport,
} from '../server/shared/f1ReportContract.mjs'
import { generateF1Report, reportTierForAnswerCount } from '../server/reportApi.mjs'

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
assert.equal(F1_OFFICIAL_CRITERIA.length, 11)
assert.deepEqual(SERVER_CRITERIA.map(rule => rule.id), [...F1_OFFICIAL_RULE_IDS])
assert.equal(SERVER_CRITERIA_VERSION, F1_OFFICIAL_CRITERIA_VERSION)
assert.ok(F1_OFFICIAL_CRITERIA.every(rule => rule.url.startsWith('https://travel.state.gov/') || rule.url.startsWith('https://fam.state.gov/')))
assert.ok(F1_OFFICIAL_RULE_IDS.includes('FAM_MISREPRESENTATION_EVIDENCE_STANDARD'))

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
  overallScore: 74,
  readiness: '仍需补充',
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
    summary: answer.answer === 'No.' ? '支持资格：直接否定完整回应了该是非题。' : '支持资格：回答直接提供了本题所核对的事实。',
    answerEvidence: answer.answer,
    strengths: ['直接回答问题。'],
    improvements: [],
    preparationDirection: '下一步核查：保持该事实与申请资料一致，无需主动扩展未问内容。',
  })),
  actionPlan: [
    { label: 'STEP 1', title: '核对资料', detail: '核对学校、专业、金额和资助人。' },
    { label: 'STEP 2', title: '验证逻辑', detail: '用自己的真实情况串联学习和回国计划。' },
    { label: 'STEP 3', title: '再次练习', detail: '保持口语化并直接回答。' },
  ],
  disclaimer: 'practice only',
}

assert.ok(validateF1StructuredReport(validReport, input), 'client contract rejected valid evidence-bound report')
assert.ok(validateServerReport(validReport, input, { allowMaterializedEvidence: true }), 'server contract rejected server-materialized evidence')
assert.equal(validReport.questionReviews[2].score, 95, 'concise yes/no answer should be allowed to score highly')

const evidenceCatalog = buildF1EvidenceCatalog(input)
assert.ok(evidenceCatalog.some(item => item.id === 'answer:f1_01' && item.quote === 'Example University.'))
assert.ok(evidenceCatalog.some(item => item.id === 'profile:school' && item.quote === 'Example University'))
assert.equal(JSON.stringify(evidenceCatalog).includes('N123456789'), false)

const makeAnalysisPacket = (requestInput: any) => {
  const firstQuestionId = requestInput.answers[0].questionId
  const availableIds = new Set(buildF1EvidenceCatalog(requestInput).map(item => item.id))
  const answerEvidenceId = (preferred: string) => availableIds.has(`answer:${preferred}`)
    ? `answer:${preferred}`
    : `answer:${firstQuestionId}`
  const questionFactor = (questionId: string) => {
    if (['f1_11', 'f1_12', 'f1_13'].includes(questionId)) return 'financial_capacity'
    if (['f1_05', 'f1_06', 'f1_07', 'f1_08', 'f1_09', 'f1_10'].includes(questionId)) return 'academic_plan'
    if (['f1_19', 'f1_20', 'f1_21', 'f1_22'].includes(questionId)) return 'departure_intent'
    return 'study_authenticity'
  }
  return {
    schemaVersion: 1,
    analysisType: 'f1_evidence_packet',
    caseSynthesis: '现有回答已建立学校、专业和资助人等可核对事实，但完整资金链、学习计划与完成学业后的离美意图仍需要结合真实材料继续建立。',
    questions: requestInput.answers.map((answer: any) => ({
      questionId: answer.questionId,
      factor: questionFactor(answer.questionId),
      effect: ['f1_19', 'f1_20'].includes(answer.questionId) ? 'neutral' : 'supports',
      finding: ['f1_19', 'f1_20'].includes(answer.questionId)
        ? '该回答直接回应了当前事实问题，但单独不足以建立离境意图。'
        : '该回答直接提供了当前问题所核对的事实。',
      strengths: ['回答直接提供了问题要求核对的事实，并可与申请资料继续交叉核对。'],
      improvements: [],
      nextInquiry: '核对该事实与申请材料及其他回答是否一致。',
    })),
    dimensions: F1_REPORT_DIMENSION_IDS.map(id => ({
      id,
      effect: ['application_consistency', 'overall_credibility'].includes(id) ? 'supports' : 'unestablished',
      concernType: 'none',
      finding: ['application_consistency', 'overall_credibility'].includes(id)
        ? '现有回答中已出现可交叉核对且暂未冲突的事实。'
        : '现有问答提供了部分信息，但尚不足以完整建立该项资格要素。',
      reasoning: ['application_consistency', 'overall_credibility'].includes(id)
        ? '所引用回答包含可与申请摘要相互核对的学校或资助信息，当前记录没有提供相反事实。'
        : '所引用回答只覆盖该要素的一部分，当前记录尚未提供足以完成整条判断链的事实。',
      evidenceIds: [id === 'financial_capacity'
        ? answerEvidenceId('f1_12')
        : id === 'departure_intent'
          ? answerEvidenceId('f1_20')
          : answerEvidenceId('f1_01')],
      nextActions: ['根据本人真实材料补齐关键事实，并检查前后表述一致性。'],
    })),
  }
}

const validAnalysisPacket = makeAnalysisPacket(input)
assert.ok(validateF1AnalysisPacket(validAnalysisPacket, input), 'structured model judgment packet should validate')
const composedReport = composeF1ReportFromAnalysis(validAnalysisPacket, input)
assert.ok(composedReport, 'application code should compose a complete report from the structured packet')
assert.ok(validateServerReport(composedReport, input, { allowMaterializedEvidence: true }))
assert.equal(composedReport.analysisMode, 'model')
assert.equal(composedReport.questionReviews.length, input.answers.length)
assert.equal(composedReport.dimensions.length, F1_REPORT_DIMENSION_IDS.length)
assert.ok(JSON.stringify(validAnalysisPacket).length < JSON.stringify(composedReport).length * 0.7, 'model output should be materially smaller than the composed report')

const ungroundedAnalysisPacket = structuredClone(validAnalysisPacket)
ungroundedAnalysisPacket.dimensions[0].evidenceIds = ['answer:f1_99']
assert.equal(validateF1AnalysisPacket(ungroundedAnalysisPacket, input), null, 'the structured contract must reject invented evidence ids')

const missingQuestionAnalysisPacket = structuredClone(validAnalysisPacket)
missingQuestionAnalysisPacket.questions.pop()
assert.equal(validateF1AnalysisPacket(missingQuestionAnalysisPacket, input), null, 'the structured contract must cover every supplied answer')

const shallowAnalysisPacket = structuredClone(validAnalysisPacket)
shallowAnalysisPacket.caseSynthesis = '信息不足。'
shallowAnalysisPacket.dimensions[0].reasoning = '建议补充。'
assert.equal(validateF1AnalysisPacket(shallowAnalysisPacket, input), null, 'a weak model must not pass with generic placeholder analysis')

const conciseAnalysisPacket = structuredClone(validAnalysisPacket)
conciseAnalysisPacket.questions[2].finding = '直接否认。'
conciseAnalysisPacket.dimensions[0].finding = '暂未冲突。'
conciseAnalysisPacket.dimensions[0].reasoning = '现有回答一致。'
assert.ok(validateF1AnalysisPacket(conciseAnalysisPacket, input), 'concise substantive judgments must not be rejected for length')

const concernAnalysisPacket = structuredClone(validAnalysisPacket)
concernAnalysisPacket.dimensions.find((item: any) => item.id === 'financial_capacity').effect = 'concern'
concernAnalysisPacket.dimensions.find((item: any) => item.id === 'financial_capacity').concernType = 'eligibility_fact'
const concernComposedReport = composeF1ReportFromAnalysis(concernAnalysisPacket, input)
assert.ok(concernComposedReport)
assert.equal(concernComposedReport.dimensions.find((item: any) => item.id === 'financial_capacity').status, 'priority')
assert.ok(concernComposedReport.overallScore <= 59, 'a model concern must be calibrated by application-owned scoring guardrails')

const catalogEvidenceReport: any = structuredClone(validReport)
for (const dimension of catalogEvidenceReport.dimensions) dimension.evidence = [{ evidenceId: 'answer:f1_01' }]
assert.deepEqual(validateF1StructuredReport(catalogEvidenceReport, input)?.dimensions[0].evidence, [{
  source: 'answer',
  reference: 'f1_01',
  quote: 'Example University.',
}])
assert.deepEqual(validateServerReport(catalogEvidenceReport, input)?.dimensions[0].evidence, [{
  source: 'answer',
  reference: 'f1_01',
  quote: 'Example University.',
}])

const structuredQuestionEvidence: any = structuredClone(validReport)
structuredQuestionEvidence.questionReviews[0].answerEvidence = {
  source: 'answer',
  reference: 'f1_01',
  quote: 'Example University.',
}
assert.equal(validateF1StructuredReport(structuredQuestionEvidence, input), null, 'question evidence must be the complete original answer string')
assert.equal(validateServerReport(structuredQuestionEvidence, input, { allowMaterializedEvidence: true }), null)

const fabricatedQuestionEvidence = structuredClone(structuredQuestionEvidence)
fabricatedQuestionEvidence.questionReviews[0].answerEvidence.quote = 'A school never supplied by the user.'
assert.equal(validateF1StructuredReport(fabricatedQuestionEvidence, input), null)
assert.equal(validateServerReport(fabricatedQuestionEvidence, input), null)

const stringDimensionAction: any = structuredClone(catalogEvidenceReport)
stringDimensionAction.dimensions[0].actions = '核对自己的真实资料并保持前后一致。'
assert.deepEqual(validateF1StructuredReport(stringDimensionAction, input)?.dimensions[0].actions, ['核对自己的真实资料并保持前后一致。'])
assert.deepEqual(validateServerReport(stringDimensionAction, input)?.dimensions[0].actions, ['核对自己的真实资料并保持前后一致。'])

const missingDimensionRule = structuredClone(catalogEvidenceReport)
missingDimensionRule.dimensions[0].officialRuleIds = []
assert.deepEqual(validateF1StructuredReport(missingDimensionRule, input)?.dimensions[0].officialRuleIds, ['DOS_ACADEMIC_PREPARATION', 'FAM_MISREPRESENTATION_EVIDENCE_STANDARD'])
assert.deepEqual(validateServerReport(missingDimensionRule, input)?.dimensions[0].officialRuleIds, ['DOS_ACADEMIC_PREPARATION', 'FAM_MISREPRESENTATION_EVIDENCE_STANDARD'])

const fabricatedEvidence = structuredClone(validReport)
fabricatedEvidence.dimensions[0].evidence[0].quote = 'A school never supplied by the user.'
assert.equal(validateF1StructuredReport(fabricatedEvidence, input), null)
assert.equal(validateServerReport(fabricatedEvidence, input, { allowMaterializedEvidence: true }), null)
const serverValidationIssues: string[] = []
assert.equal(validateServerReport(fabricatedEvidence, input, {
  onIssue: (issue: string) => { serverValidationIssues.push(issue) },
  allowMaterializedEvidence: true,
}), null)
assert.ok(serverValidationIssues.includes('DIMENSION_EVIDENCE_UNGROUNDED:application_consistency'))

const mixedEvidence: any = structuredClone(catalogEvidenceReport)
mixedEvidence.dimensions[0].evidence.push({
  evidenceId: 'answer:f1_99',
})
assert.equal(validateServerReport(mixedEvidence, input), null, 'raw report with one fabricated quote must be rejected')
const evidenceRepairEvents: string[] = []
const repairedMixedEvidence = repairF1ReportEvidence(mixedEvidence, input, {
  onRepair: (event: string) => { evidenceRepairEvents.push(event) },
})
assert.ok(validateServerReport(repairedMixedEvidence, input, { allowMaterializedEvidence: true }), 'report should survive after an invalid extra quote is removed')
assert.deepEqual(repairedMixedEvidence.dimensions[0].evidence, validReport.dimensions[0].evidence)
assert.deepEqual(evidenceRepairEvents, ['REMOVED_UNGROUNDED_EVIDENCE:application_consistency'])

const noGroundedDimensionEvidence: any = structuredClone(catalogEvidenceReport)
noGroundedDimensionEvidence.dimensions[0].evidence = [{
  evidenceId: 'answer:f1_99',
}]
const repairedMissingDimension = repairF1ReportEvidence(noGroundedDimensionEvidence, input)
const missingDimensionIssues: string[] = []
assert.equal(validateServerReport(repairedMissingDimension, input, {
  onIssue: (issue: string) => { missingDimensionIssues.push(issue) },
  allowMaterializedEvidence: true,
}), null)
assert.ok(missingDimensionIssues.includes('DIMENSION_EVIDENCE_MISSING:application_consistency'))

const wrongAnswerReference = structuredClone(validReport)
wrongAnswerReference.dimensions[0].evidence[0].reference = 'f1_12'
assert.equal(validateF1StructuredReport(wrongAnswerReference, input), null)

const unknownRule = structuredClone(catalogEvidenceReport)
unknownRule.dimensions[0].officialRuleIds.push('UNOFFICIAL_RULE')
assert.equal(validateF1StructuredReport(unknownRule, input), null)
assert.equal(validateServerReport(unknownRule, input), null)

const caseChangedQuote: any = structuredClone(validReport)
caseChangedQuote.dimensions[0].evidence[0].quote = 'example university.'
assert.equal(validateF1StructuredReport(caseChangedQuote, input), null, 'case changes must not count as an exact quote')
assert.equal(validateServerReport(caseChangedQuote, input, { allowMaterializedEvidence: true }), null)

const paddedEvidenceId: any = structuredClone(catalogEvidenceReport)
paddedEvidenceId.dimensions[0].evidence = [{ evidenceId: ' answer:f1_01 ' }]
assert.equal(validateServerReport(paddedEvidenceId, input), null, 'catalog ids must match character-for-character')

const sixthInvalidEvidence: any = structuredClone(catalogEvidenceReport)
sixthInvalidEvidence.dimensions[0].evidence = [
  { evidenceId: 'answer:f1_01' },
  { evidenceId: 'answer:f1_12' },
  { evidenceId: 'answer:f1_19' },
  { evidenceId: 'answer:f1_20' },
  { evidenceId: 'profile:school' },
  { evidenceId: 'answer:f1_99' },
]
const sixthEvidenceIssues: string[] = []
assert.equal(validateServerReport(sixthInvalidEvidence, input, {
  onIssue: (issue: string) => { sixthEvidenceIssues.push(issue) },
}), null)
assert.ok(sixthEvidenceIssues.includes('DIMENSION_EVIDENCE_LIMIT:application_consistency'))
assert.ok(sixthEvidenceIssues.includes('DIMENSION_EVIDENCE_UNGROUNDED:application_consistency'))

const multipleDefects: any = structuredClone(catalogEvidenceReport)
multipleDefects.dimensions[0].summary = ''
multipleDefects.questionReviews[0].preparationDirection = ''
multipleDefects.actionPlan = []
const multipleIssues: string[] = []
assert.equal(validateServerReport(multipleDefects, input, {
  onIssue: (issue: string) => { multipleIssues.push(issue) },
}), null)
assert.ok(multipleIssues.includes('DIMENSION_SUMMARY:application_consistency'))
assert.ok(multipleIssues.includes('QUESTION_REVIEW_DIRECTION:f1_01'))
assert.ok(multipleIssues.includes('ACTION_PLAN'))

const lengthPenalty = structuredClone(validReport)
lengthPenalty.questionReviews[2].summary = '回答过短，因此评分较低。'
assert.equal(validateF1StructuredReport(lengthPenalty, input), null)

const prediction = structuredClone(validReport)
prediction.summary = '获签概率为 90%。'
assert.equal(validateF1StructuredReport(prediction, input), null)

const unclassifiedQuestion = structuredClone(validReport)
unclassifiedQuestion.questionReviews[0].summary = '回答直接提供了学校名称。'
assert.equal(validateF1StructuredReport(unclassifiedQuestion, input), null, 'every question must state its evidentiary effect')
assert.equal(validateServerReport(unclassifiedQuestion, input), null)

const mismatchedQuestionCalibration = structuredClone(validReport)
mismatchedQuestionCalibration.questionReviews[0].score = 60
assert.equal(validateF1StructuredReport(mismatchedQuestionCalibration, input), null, 'supporting evidence cannot use the insufficient-evidence score band')

const missingDirectionPrefix = structuredClone(validReport)
missingDirectionPrefix.questionReviews[0].preparationDirection = '核对学校名称。'
assert.equal(validateServerReport(missingDirectionPrefix, input), null, 'next inquiry must be explicit')

const inconsistentDimensionCalibration = structuredClone(validReport)
inconsistentDimensionCalibration.dimensions[0].status = 'stable'
inconsistentDimensionCalibration.dimensions[0].score = 60
assert.equal(validateServerReport(inconsistentDimensionCalibration, input), null, 'stable dimensions require supporting evidence calibration')

const overstatedReadiness = structuredClone(validReport)
overstatedReadiness.overallScore = 88
overstatedReadiness.readiness = '准备较充分'
assert.equal(validateF1StructuredReport(overstatedReadiness, input), null, 'an unestablished core factor must cap readiness')

const materialConcern = structuredClone(validReport)
materialConcern.dimensions[0].status = 'priority'
materialConcern.dimensions[0].score = 35
materialConcern.overallScore = 55
materialConcern.readiness = '建议重点准备'
const materialConcernIssues: string[] = []
assert.ok(validateServerReport(materialConcern, input, {
  onIssue: (issue: string) => { materialConcernIssues.push(issue) },
  allowMaterializedEvidence: true,
}), `a concrete concern may use the priority band when overall readiness is calibrated: ${materialConcernIssues.join(',')}`)

const accusatoryReport = structuredClone(validReport)
accusatoryReport.dimensions[0].reasoning = '申请人在撒谎。'
assert.equal(validateF1StructuredReport(accusatoryReport, input), null, 'the report must not turn a conflict into an accusation')
const accusationIssues: string[] = []
assert.equal(validateServerReport(accusatoryReport, input, {
  allowMaterializedEvidence: true,
  onIssue: (issue: string) => { accusationIssues.push(issue) },
}), null)
assert.ok(accusationIssues.includes('FORBIDDEN_ACCUSATION'), 'the repair model needs a specific forbidden-language category')

const demeanorReport = structuredClone(validReport)
demeanorReport.questionReviews[0].improvements = ['眼神回避说明回答不可信。']
assert.equal(validateServerReport(demeanorReport, input), null, 'unavailable demeanor must not be treated as evidence')

const messages = buildF1ReportMessages(input)
assert.match(messages[0].content, /Never reward length/)
assert.match(messages[0].content, /A direct yes\/no can fully answer/)
assert.match(messages[0].content, /predict approval\/refusal/)
assert.match(messages[0].content, /answerEvidence must be the exact original answer text/)
assert.match(messages[0].content, /actions must be a JSON array/)
assert.match(messages[0].content, /must contain its own numeric score/)
assert.match(messages[0].content, /silently self-check/)
assert.match(messages[0].content, /questionReviews contains exactly 4 items/)
assert.match(messages[0].content, /still return that dimension/)
assert.match(messages[0].content, /report draft is invalid, never that the applicant's answer is invalid/)
assert.match(messages[0].content, /Officer reasoning path for every question review/)
assert.match(messages[0].content, /Absence of evidence is not negative evidence/)
assert.match(messages[0].content, /支持资格=/)
assert.match(messages[0].content, /any core needs_evidence dimension requires overallScore<=74/)
assert.match(messages[0].content, /Never label the applicant dishonest/)
assert.match(messages[1].content, /"evidenceCatalog"/)
assert.match(messages[1].content, /"answer:f1_01"/)

const serverMessages = buildServerReportMessages(input)
assert.match(serverMessages[0].content, /silently self-check/)
const compactMessages = buildF1AnalysisMessages(input)
assert.match(compactMessages[0].content, /application code.+will generate scores/i)
assert.match(compactMessages[0].content, /structured JSON evidence-analysis object/i)
assert.match(compactMessages[0].content, /do not shorten substantive analysis to conserve tokens/i)
assert.match(compactMessages[0].content, /strengths must be non-empty/)
assert.match(compactMessages[0].content, /Missing information is not negative evidence/)
assert.match(compactMessages[0].content, /My parents.+fully answers who the sponsor is/)
assert.match(compactMessages[0].content, /Merely naming a school and major is not enough/)
assert.match(compactMessages[0].content, /Sponsor identity or a budget figure alone is not enough/)
assert.match(compactMessages[0].content, /major core dimensions unestablished is itself unestablished/)
assert.match(compactMessages[1].content, /"evidenceCatalog"/)
const compactRepairMessages = buildF1AnalysisMessages(input, {
  issues: ['ANALYSIS_DIMENSION_EVIDENCE:financial_capacity'],
  draft: validAnalysisPacket,
})
assert.equal(compactRepairMessages.length, 4)
assert.equal(compactRepairMessages[2].role, 'assistant')
assert.match(compactRepairMessages[3].content, /failed validation/)
assert.match(compactRepairMessages[3].content, /ANALYSIS_DIMENSION_EVIDENCE:financial_capacity/)
const retryMessages = buildServerReportMessages(input, 'DIMENSION_EVIDENCE_UNGROUNDED:application_consistency')
assert.equal(retryMessages.length, 3)
assert.match(retryMessages[2].content, /strict machine validator/)
assert.match(retryMessages[2].content, /DIMENSION_EVIDENCE_UNGROUNDED:application_consistency/)

const repairMessages = buildServerReportMessages(input, {
  issues: ['DIMENSION_EVIDENCE_MISSING:application_consistency', 'QUESTION_REVIEW_EVIDENCE:f1_01'],
  draft: validReport,
})
assert.equal(repairMessages.length, 4)
assert.equal(repairMessages[2].role, 'assistant')
assert.match(repairMessages[3].content, /Preserve every section and dimension not implicated/)
assert.match(repairMessages[3].content, /FORBIDDEN_ACCUSATION means remove every fraud/)
assert.match(repairMessages[3].content, /DIMENSION_EVIDENCE_MISSING:application_consistency/)
assert.match(repairMessages[3].content, /QUESTION_REVIEW_EVIDENCE:f1_01/)

const fallbackReport = buildDeterministicF1FallbackReport(input)
assert.ok(validateServerReport(fallbackReport, input, { allowMaterializedEvidence: true }))
assert.equal(fallbackReport.dimensions.length, 6)
assert.equal(fallbackReport.questionReviews.length, input.answers.length)
assert.ok(fallbackReport.dimensions.every(item => item.evidence.length >= 1))
assert.deepEqual(fallbackReport.questionReviews.map(item => item.answerEvidence), input.answers.map(item => item.answer))
assert.ok(fallbackReport.questionReviews.every(item => item.summary.startsWith('尚未建立：')))
assert.ok(fallbackReport.questionReviews.every(item => item.preparationDirection.startsWith('下一步核查：')))

let boundedAttempts = 0
const generatedFallback = await generateF1Report({
  apiKey: 'test-only',
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-v4-pro',
  input,
  requestJson: async (_endpoint: string, options: any) => {
    boundedAttempts += 1
    const body = JSON.parse(options.body)
    assert.equal(body.thinking.type, 'enabled')
    assert.equal(body.reasoning_effort, 'high')
    assert.equal(body.max_tokens, 8_000)
    assert.equal('timeoutMs' in options, false, 'report requests must not have a generation deadline')
    if (boundedAttempts === 2) {
      assert.equal(body.messages.length, 4)
      assert.match(body.messages.at(-1).content, /structured evidence analysis failed validation/)
    }
    return {
      ok: true,
      status: 200,
      payload: { choices: [{ message: { content: JSON.stringify({ schemaVersion: 2 }) } }] },
    }
  },
})
assert.equal(boundedAttempts, 2, 'an invalid analysis packet gets one bounded model-repair attempt before evidence fallback')
assert.ok(validateServerReport(generatedFallback, input, { allowMaterializedEvidence: true }))
assert.equal(generatedFallback.analysisMode, 'evidence_only')
assert.equal(generatedFallback.questionReviews.length, input.answers.length)
assert.equal(reportTierForAnswerCount(4), 'more_answers')
assert.equal(reportTierForAnswerCount(5), 'basic')
assert.equal(reportTierForAnswerCount(6), 'basic')
assert.equal(reportTierForAnswerCount(7), 'strong')
assert.equal(reportTierForAnswerCount(9), 'strong')
assert.equal(reportTierForAnswerCount(10), 'full')

let portableModelAttempts = 0
const portableModelReport = await generateF1Report({
  apiKey: '',
  endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
  model: 'local-openai-compatible-model',
  input,
  supportsJsonMode: false,
  supportsReasoningOptions: false,
  requestJson: async (_endpoint: string, options: any) => {
    portableModelAttempts += 1
    const body = JSON.parse(options.body)
    assert.equal('Authorization' in options.headers, false)
    assert.equal('response_format' in body, false)
    assert.equal('thinking' in body, false)
    assert.equal('reasoning_effort' in body, false)
    assert.equal(body.model, 'local-openai-compatible-model')
    return {
      ok: true,
      status: 200,
      payload: { choices: [{ message: { content: JSON.stringify(validAnalysisPacket) } }] },
    }
  },
})
assert.equal(portableModelAttempts, 1, 'a valid model-neutral report must not need a repair call')
assert.equal(portableModelReport.analysisMode, 'model')

let guidedRepairAttempts = 0
const guidedRepairReport = await generateF1Report({
  apiKey: 'test-only',
  endpoint: 'https://provider.example/v1/chat/completions',
  model: 'portable-report-model',
  input,
  requestJson: async (_endpoint: string, options: any) => {
    guidedRepairAttempts += 1
    const body = JSON.parse(options.body)
    if (guidedRepairAttempts === 1) {
      return {
        ok: true,
        status: 200,
        payload: { choices: [{ message: { content: JSON.stringify({ schemaVersion: 2 }) } }] },
      }
    }
    assert.equal(body.messages.length, 4)
    assert.match(body.messages.at(-1).content, /ANALYSIS_IDENTITY/)
    return {
      ok: true,
      status: 200,
      payload: { choices: [{ message: { content: JSON.stringify(validAnalysisPacket) } }] },
    }
  },
})
assert.equal(guidedRepairAttempts, 2, 'an invalid first draft must receive one validation-guided repair turn')
assert.equal(guidedRepairReport.analysisMode, 'model')

const fullInput = {
  ...input,
  answers: Array.from({ length: 10 }, (_, index) => ({
    ...input.answers[index % input.answers.length],
    index: index + 1,
    questionId: `f1_${String(index + 1).padStart(2, '0')}`,
    question: `Question ${index + 1}?`,
    answer: `Answer ${index + 1}.`,
  })),
}
let fullAttempts = 0
const generatedFullFallback = await generateF1Report({
  apiKey: 'test-only',
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-v4-pro',
  input: fullInput,
  requestJson: async (_endpoint: string, options: any) => {
    fullAttempts += 1
    const body = JSON.parse(options.body)
    assert.equal(body.thinking.type, 'enabled')
    assert.equal(body.reasoning_effort, 'high')
    assert.equal(body.max_tokens, 24_000)
    assert.equal('timeoutMs' in options, false)
    return {
      ok: true,
      status: 200,
      payload: { choices: [{ message: { content: JSON.stringify({ schemaVersion: 2 }) } }] },
    }
  },
})
assert.equal(fullAttempts, 2, 'an invalid full-interview packet gets one repair attempt before fallback')
assert.equal(generatedFullFallback.analysisMode, 'evidence_only')

let strongAttempts = 0
await generateF1Report({
  apiKey: 'test-only',
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-v4-pro',
  input: { ...fullInput, answers: fullInput.answers.slice(0, 7) },
  requestJson: async (_endpoint: string, options: any) => {
    strongAttempts += 1
    const body = JSON.parse(options.body)
    assert.equal(body.thinking.type, 'enabled')
    assert.equal(body.reasoning_effort, 'high')
    assert.equal(body.max_tokens, 16_000)
    assert.equal('timeoutMs' in options, false)
    return {
      ok: true,
      status: 200,
      payload: { choices: [{ message: { content: JSON.stringify({ schemaVersion: 2 }) } }] },
    }
  },
})
assert.equal(strongAttempts, 2)

let applicationCompositionAttempts = 0
const applicationComposed = await generateF1Report({
  apiKey: 'test-only',
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-v4-pro',
  input,
  requestJson: async () => {
    applicationCompositionAttempts += 1
    return {
      ok: true,
      status: 200,
      payload: { choices: [{ message: { content: JSON.stringify(validAnalysisPacket) } }] },
    }
  },
})
assert.equal(applicationCompositionAttempts, 1)
assert.equal(applicationComposed.analysisMode, 'model')
assert.ok(applicationComposed.strengths.length >= 1, 'application code must add report sections the model never generated')
assert.equal(applicationComposed.actionPlan.length, 3)

const forbiddenWordsInAnswerInput = {
  ...input,
  answers: input.answers.map(answer => answer.questionId === 'f1_01'
    ? { ...answer, answer: 'I think I will be approved.' }
    : answer),
}
const quotedForbiddenFallback = buildDeterministicF1FallbackReport(forbiddenWordsInAnswerInput)
assert.ok(validateServerReport(quotedForbiddenFallback, forbiddenWordsInAnswerInput, {
  allowMaterializedEvidence: true,
  analysisMode: 'evidence_only',
}), 'forbidden prediction words in the applicant original quote must not invalidate the report')

let authFailureAttempts = 0
await assert.rejects(() => generateF1Report({
  apiKey: 'invalid-test-key',
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-v4-pro',
  input,
  requestJson: async () => {
    authFailureAttempts += 1
    return { ok: false, status: 401, payload: {} }
  },
}), (error: any) => error?.code === 'REPORT_MODEL_SERVICE_ERROR')
assert.equal(authFailureAttempts, 1, 'authentication failure must remain observable and must not be disguised as a completed analysis')

console.log('f1-report-contract=passed')
