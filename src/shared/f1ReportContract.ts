// Provider-neutral F-1 report types, privacy filter, and validation contract.
import {
  F1_OFFICIAL_CRITERIA,
  F1_OFFICIAL_CRITERIA_VERSION,
  F1_OFFICIAL_RULE_IDS,
  type F1OfficialRuleId,
} from '../modules/practice/data/f1OfficialCriteria.ts'

export type F1ReportDimensionId =
  | 'application_consistency'
  | 'study_authenticity'
  | 'academic_plan'
  | 'financial_capacity'
  | 'departure_intent'
  | 'overall_credibility'

export interface InterviewReportAnswer {
  index: number
  questionId: string
  question: string
  answer: string
  timestamp: string
}

export interface InterviewReportRequest {
  visaType: 'F1'
  criteriaVersion: string
  safeContext: Record<string, unknown>
  answers: InterviewReportAnswer[]
}

export interface F1ReportEvidence {
  source: 'profile' | 'answer'
  reference: string
  quote: string
}

export interface F1ReportDimension {
  id: F1ReportDimensionId
  label: string
  score: number
  status: 'stable' | 'needs_evidence' | 'priority'
  summary: string
  evidence: F1ReportEvidence[]
  officialRuleIds: F1OfficialRuleId[]
  reasoning: string
  actions: string[]
}

export interface F1ReportQuestionReview {
  index: number
  questionId: string
  score: number
  verdict: 'complete' | 'partial' | 'needs_preparation'
  summary: string
  answerEvidence: string
  strengths: string[]
  improvements: string[]
  preparationDirection: string
}

export interface F1ReportInsight {
  title: string
  detail: string
  evidenceRefs: string[]
  officialRuleIds: F1OfficialRuleId[]
}

export interface F1ReportPracticeStep {
  label: string
  title: string
  detail: string
}

export interface F1StructuredReport {
  schemaVersion: 2
  reportType: 'practice_readiness'
  analysisMode: 'model' | 'evidence_only'
  criteriaVersion: string
  overallScore: number
  readiness: '准备较充分' | '仍需补充' | '建议重点准备'
  headline: string
  summary: string
  dimensions: F1ReportDimension[]
  strengths: F1ReportInsight[]
  priorities: F1ReportInsight[]
  questionReviews: F1ReportQuestionReview[]
  actionPlan: F1ReportPracticeStep[]
  disclaimer: string
}

const DIMENSION_LABELS: Record<F1ReportDimensionId, string> = {
  application_consistency: '申请信息一致性',
  study_authenticity: '学习目的真实性',
  academic_plan: '学术与学习计划',
  financial_capacity: '资金能力',
  departure_intent: '完成学业后的离美意图',
  overall_credibility: '整体可信度与风险一致性',
}

export const F1_REPORT_DIMENSION_IDS = Object.keys(DIMENSION_LABELS) as F1ReportDimensionId[]

const DIMENSION_DEFAULT_RULE_IDS: Record<F1ReportDimensionId, readonly F1OfficialRuleId[]> = {
  application_consistency: ['DOS_ACADEMIC_PREPARATION', 'FAM_MISREPRESENTATION_EVIDENCE_STANDARD'],
  study_authenticity: ['FAM_STUDENT_VISA_QUALIFICATIONS', 'FAM_EDUCATION_HOME_COUNTRY_CALIBRATION'],
  academic_plan: ['DOS_ACADEMIC_PREPARATION'],
  financial_capacity: ['DOS_FINANCIAL_CAPACITY', 'FAM_ADEQUATE_FINANCIAL_RESOURCES'],
  departure_intent: ['DOS_DEPARTURE_INTENT', 'FAM_RESIDENCE_ABROAD', 'FAM_PRESENT_INTENT_CALIBRATION'],
  overall_credibility: ['DOS_INDIVIDUAL_ASSESSMENT', 'FAM_MISREPRESENTATION_EVIDENCE_STANDARD'],
}

const QUESTION_EFFECT_PREFIXES = ['支持资格：', '中性信息：', '尚未建立：', '实质疑点：'] as const
const NEXT_INQUIRY_PREFIX = '下一步核查：'
const CORE_QUALIFICATION_DIMENSIONS: readonly F1ReportDimensionId[] = [
  'study_authenticity',
  'academic_plan',
  'financial_capacity',
  'departure_intent',
]

function hasCalibratedQuestionEffect(
  summary: string,
  score: number,
  verdict: F1ReportQuestionReview['verdict'],
) {
  const prefix = QUESTION_EFFECT_PREFIXES.find(candidate => summary.startsWith(candidate))
  if (prefix === '支持资格：') return verdict === 'complete' && score >= 85
  if (prefix === '中性信息：') return verdict === 'complete' && score >= 65 && score <= 84
  if (prefix === '尚未建立：') return (verdict === 'partial' || verdict === 'needs_preparation') && score >= 40 && score <= 64
  if (prefix === '实质疑点：') return verdict === 'needs_preparation' && score <= 39
  return false
}

function hasCalibratedDimensionStatus(status: F1ReportDimension['status'], score: number) {
  if (status === 'stable') return score >= 75
  if (status === 'needs_evidence') return score >= 40 && score <= 74
  return score <= 59
}

function hasCalibratedOverallReadiness(
  dimensions: F1ReportDimension[],
  overallScore: number,
  readiness: F1StructuredReport['readiness'],
) {
  const anyPriority = dimensions.some(dimension => dimension.status === 'priority')
  if (anyPriority) return readiness === '建议重点准备' && overallScore <= 59

  const coreDimensions = CORE_QUALIFICATION_DIMENSIONS
    .map(id => dimensions.find(dimension => dimension.id === id))
    .filter((dimension): dimension is F1ReportDimension => Boolean(dimension))
  const coreNeedsEvidence = coreDimensions.some(dimension => dimension.status === 'needs_evidence')
  if (coreNeedsEvidence && (readiness === '准备较充分' || overallScore > 74)) return false
  if (readiness === '准备较充分') return overallScore >= 75 && coreDimensions.every(dimension => dimension.status === 'stable')
  return true
}

const IDENTIFIER_PATTERNS: Array<[RegExp, string]> = [
  [/\bN\d{9}\b/gi, '[REDACTED_SEVIS_ID]'],
  [/\bAA\d{8}\b/gi, '[REDACTED_DS160_ID]'],
  [/\b[A-Z]{1,3}\d{7,10}\b/gi, '[REDACTED_PASSPORT]'],
  [/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]'],
  [/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '[REDACTED_PHONE]'],
  [/\b\d{15,19}\b/g, '[REDACTED_ACCOUNT]'],
]

export function redactPotentialIdentifiers(value: string) {
  return IDENTIFIER_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
  return Array.isArray(value)
    ? value.map(item => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : []
}

function cleanScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : null
}

export function sanitizeReportRequest(value: unknown): InterviewReportRequest | null {
  if (!isRecord(value) || value.visaType !== 'F1' || !Array.isArray(value.answers)) return null
  const rawContext = isRecord(value.safeContext) ? value.safeContext : {}
  const serializedContext = redactPotentialIdentifiers(JSON.stringify(rawContext))
  if (serializedContext.length > 12_000) return null

  const answers = value.answers
    .slice(0, 22)
    .map((item, offset): InterviewReportAnswer | null => {
      if (!isRecord(item)) return null
      const index = Number(item.index)
      const questionId = cleanText(item.questionId, 20)
      const question = redactPotentialIdentifiers(cleanText(item.question, 1_000))
      const answer = redactPotentialIdentifiers(cleanText(item.answer, 4_000))
      const timestamp = cleanText(item.timestamp, 20) || '00:00'
      if (index !== offset + 1 || !/^f1_(0[1-9]|1\d|2[0-2])$/.test(questionId) || !question || !answer) return null
      return { index, questionId, question, answer, timestamp }
    })
    .filter((item): item is InterviewReportAnswer => item !== null)

  if (answers.length === 0 || answers.length !== value.answers.slice(0, 22).length) return null
  return {
    visaType: 'F1',
    criteriaVersion: F1_OFFICIAL_CRITERIA_VERSION,
    safeContext: JSON.parse(serializedContext) as Record<string, unknown>,
    answers,
  }
}

function buildProfileEvidenceCatalog(value: unknown, path = ''): Array<{ id: string; source: 'profile'; reference: 'profile'; quote: string }> {
  if (Array.isArray(value)) return value.flatMap((item, index) => buildProfileEvidenceCatalog(item, `${path}[${index}]`))
  if (isRecord(value)) return Object.entries(value).flatMap(([key, item]) => buildProfileEvidenceCatalog(item, path ? `${path}.${key}` : key))
  if (!path || value === null || value === undefined) return []
  const quote = String(value).slice(0, 500)
  return quote.trim().length >= 2 ? [{ id: `profile:${path}`, source: 'profile', reference: 'profile', quote }] : []
}

export function buildF1EvidenceCatalog(input: InterviewReportRequest) {
  return [
    ...buildProfileEvidenceCatalog(input.safeContext),
    ...input.answers.map(answer => ({
      id: `answer:${answer.questionId}`,
      source: 'answer' as const,
      reference: answer.questionId,
      quote: answer.answer,
    })),
  ]
}

function forbiddenClaimIssue(value: unknown) {
  if (!isRecord(value)) return ''
  const generatedEvaluation = {
    readiness: value.readiness,
    headline: value.headline,
    summary: value.summary,
    dimensions: Array.isArray(value.dimensions) ? value.dimensions.map(item => isRecord(item) ? {
      status: item.status,
      summary: item.summary,
      reasoning: item.reasoning,
      actions: item.actions,
    } : item) : value.dimensions,
    strengths: value.strengths,
    priorities: value.priorities,
    questionReviews: Array.isArray(value.questionReviews) ? value.questionReviews.map(item => isRecord(item) ? {
      verdict: item.verdict,
      summary: item.summary,
      strengths: item.strengths,
      improvements: item.improvements,
      preparationDirection: item.preparationDirection,
    } : item) : value.questionReviews,
    actionPlan: value.actionPlan,
    disclaimer: value.disclaimer,
  }
  const serialized = JSON.stringify(generatedEvaluation)
  if (/(获签概率|过签率|一定(?:会)?通过|一定(?:会)?拒签|will be approved|will be refused|approval probability)/i.test(serialized)) return 'FORBIDDEN_OUTCOME_PREDICTION'
  if (/(有利于过签|不利于过签)/i.test(serialized)) return 'FORBIDDEN_PASS_FRAMING'
  if (/(回答过短|回答太短|字数太少|高级词汇|word count|too short)/i.test(serialized)) return 'FORBIDDEN_STYLE_SCORING'
  if (/(欺诈|撒谎|说谎|造假|虚假陈述)/i.test(serialized)) return 'FORBIDDEN_ACCUSATION'
  if (/(眼神|肢体语言|nervousness indicates|demeanor proves)/i.test(serialized)) return 'FORBIDDEN_DEMEANOR_INFERENCE'
  return ''
}

function cleanFeedbackArray(value: unknown) {
  if (typeof value === 'string') return value.trim() ? [value.trim().slice(0, 500)] : []
  return cleanStringArray(value, 3, 500)
}

function cleanActionArray(value: unknown) {
  if (typeof value === 'string') return value.trim() ? [value.trim().slice(0, 500)] : []
  return cleanStringArray(value, 4, 500)
}

function normalizeEvidence(value: unknown, input: InterviewReportRequest): F1ReportEvidence | null {
  if (!isRecord(value)) return null
  const catalog = buildF1EvidenceCatalog(input)
  const evidenceId = typeof value.evidenceId === 'string' && value.evidenceId.length <= 200 ? value.evidenceId : ''
  if (evidenceId) {
    const catalogEntry = catalog.find(entry => entry.id === evidenceId)
    return catalogEntry
      ? { source: catalogEntry.source, reference: catalogEntry.reference, quote: catalogEntry.quote }
      : null
  }
  const source = value.source === 'profile' ? 'profile' : value.source === 'answer' ? 'answer' : null
  const reference = typeof value.reference === 'string' && value.reference.length <= 80 ? value.reference : ''
  const quote = typeof value.quote === 'string' && value.quote.length <= 4_000 ? value.quote : ''
  if (!source || !reference || !quote) return null
  const catalogEntry = catalog.find(entry => (
    entry.source === source
    && entry.reference === reference
    && entry.quote === quote
  ))
  return catalogEntry ? { source, reference, quote } : null
}

function normalizeQuestionAnswerEvidence(value: unknown, sourceAnswer: InterviewReportAnswer): string | null {
  return typeof value === 'string' && value === sourceAnswer.answer ? sourceAnswer.answer : null
}

export function validateF1StructuredReport(value: unknown, input: InterviewReportRequest): F1StructuredReport | null {
  if (!isRecord(value) || value.schemaVersion !== 2 || value.reportType !== 'practice_readiness') return null
  if (value.criteriaVersion !== input.criteriaVersion || forbiddenClaimIssue(value)) return null
  const overallScore = cleanScore(value.overallScore)
  const readiness = value.readiness === '准备较充分' || value.readiness === '仍需补充' || value.readiness === '建议重点准备'
    ? value.readiness
    : null
  if (overallScore === null || !readiness) return null

  if (!Array.isArray(value.dimensions) || value.dimensions.length !== F1_REPORT_DIMENSION_IDS.length) return null
  const dimensions = value.dimensions.map(item => {
    if (!isRecord(item) || !F1_REPORT_DIMENSION_IDS.includes(item.id as F1ReportDimensionId)) return null
    const id = item.id as F1ReportDimensionId
    const score = cleanScore(item.score)
    const status = item.status === 'stable' || item.status === 'needs_evidence' || item.status === 'priority' ? item.status : null
    const rawEvidence = Array.isArray(item.evidence) ? item.evidence : []
    const evidence = rawEvidence.map(entry => normalizeEvidence(entry, input)).filter((entry): entry is F1ReportEvidence => entry !== null)
    const rawOfficialRuleIds = cleanStringArray(item.officialRuleIds, 6, 80)
    const officialRuleIds = rawOfficialRuleIds.length === 0
      ? [...DIMENSION_DEFAULT_RULE_IDS[id]]
      : rawOfficialRuleIds.filter((ruleId): ruleId is F1OfficialRuleId => F1_OFFICIAL_RULE_IDS.includes(ruleId as F1OfficialRuleId))
    const actions = cleanActionArray(item.actions)
    const summary = cleanText(item.summary, 1_000)
    const reasoning = cleanText(item.reasoning, 1_500)
    if (score === null || !status || !hasCalibratedDimensionStatus(status, score) || rawEvidence.length === 0 || rawEvidence.length > 5 || evidence.length !== rawEvidence.length || officialRuleIds.length === 0 || (rawOfficialRuleIds.length > 0 && officialRuleIds.length !== rawOfficialRuleIds.length) || actions.length === 0 || !summary || !reasoning) return null
    return {
      id,
      label: DIMENSION_LABELS[id],
      score,
      status,
      summary,
      evidence,
      officialRuleIds,
      reasoning,
      actions,
    }
  })
  if (dimensions.some(item => item === null) || new Set(dimensions.map(item => item?.id)).size !== F1_REPORT_DIMENSION_IDS.length) return null

  if (!Array.isArray(value.questionReviews) || value.questionReviews.length !== input.answers.length) return null
  const questionReviews = value.questionReviews.map((item, position) => {
    if (!isRecord(item)) return null
    const index = Number(item.index)
    const sourceAnswer = input.answers[position]
    const score = cleanScore(item.score)
    const verdict = item.verdict === 'complete' || item.verdict === 'partial' || item.verdict === 'needs_preparation' ? item.verdict : null
    const answerEvidence = sourceAnswer ? normalizeQuestionAnswerEvidence(item.answerEvidence, sourceAnswer) : null
    const summary = cleanText(item.summary, 800)
    const preparationDirection = cleanText(item.preparationDirection, 1_000)
    if (!sourceAnswer || index !== position + 1 || item.questionId !== sourceAnswer.questionId || score === null || !verdict || !summary || !hasCalibratedQuestionEffect(summary, score, verdict) || !preparationDirection.startsWith(NEXT_INQUIRY_PREFIX) || !answerEvidence) return null
    return {
      index,
      questionId: sourceAnswer.questionId,
      score,
      verdict,
      summary,
      answerEvidence,
      strengths: cleanFeedbackArray(item.strengths),
      improvements: cleanFeedbackArray(item.improvements),
      preparationDirection,
    }
  })
  if (questionReviews.some(item => item === null)) return null

  const calibratedDimensions = dimensions.filter((item): item is F1ReportDimension => item !== null)
  if (!hasCalibratedOverallReadiness(calibratedDimensions, overallScore, readiness)) return null

  const normalizeInsight = (item: unknown): F1ReportInsight | null => {
    if (!isRecord(item)) return null
    const rawOfficialRuleIds = cleanStringArray(item.officialRuleIds, 6, 80)
    const officialRuleIds = rawOfficialRuleIds
      .filter((id): id is F1OfficialRuleId => F1_OFFICIAL_RULE_IDS.includes(id as F1OfficialRuleId))
    const evidenceRefs = cleanStringArray(item.evidenceRefs, 6, 80)
    const title = cleanText(item.title, 120)
    const detail = cleanText(item.detail, 1_000)
    const allowedEvidenceRefs = new Set(['profile', ...input.answers.map(answer => answer.questionId)])
    return title && detail && evidenceRefs.length > 0 && evidenceRefs.every(ref => allowedEvidenceRefs.has(ref)) && officialRuleIds.length > 0 && officialRuleIds.length === rawOfficialRuleIds.length
      ? { title, detail, evidenceRefs, officialRuleIds }
      : null
  }
  const rawStrengths = Array.isArray(value.strengths) ? value.strengths : []
  const rawPriorities = Array.isArray(value.priorities) ? value.priorities : []
  const strengths = rawStrengths.map(normalizeInsight).filter((item): item is F1ReportInsight => item !== null)
  const priorities = rawPriorities.map(normalizeInsight).filter((item): item is F1ReportInsight => item !== null)
  if (rawStrengths.length < 1 || rawStrengths.length > 3 || strengths.length !== rawStrengths.length) return null
  if (rawPriorities.length < 1 || rawPriorities.length > 3 || priorities.length !== rawPriorities.length) return null

  const rawActionPlan = Array.isArray(value.actionPlan) ? value.actionPlan : []
  const actionPlan = rawActionPlan
    .map((item, index) => isRecord(item) ? {
      label: cleanText(item.label, 30) || `STEP ${index + 1}`,
      title: cleanText(item.title, 150),
      detail: cleanText(item.detail, 800),
    } : null).filter((item): item is F1ReportPracticeStep => Boolean(item?.label && item.title && item.detail))
  if (rawActionPlan.length !== 3 || actionPlan.length !== 3) return null

  const headline = cleanText(value.headline, 300)
  const summary = cleanText(value.summary, 1_500)
  if (!headline || !summary) return null

  return {
    schemaVersion: 2,
    reportType: 'practice_readiness',
    analysisMode: value.analysisMode === 'evidence_only' ? 'evidence_only' : 'model',
    criteriaVersion: input.criteriaVersion,
    overallScore,
    readiness,
    headline,
    summary,
    dimensions: dimensions as F1ReportDimension[],
    strengths,
    priorities,
    questionReviews: questionReviews as F1ReportQuestionReview[],
    actionPlan,
    disclaimer: '本报告仅用于模拟面签准备，不预测真实签证结果，也不构成法律意见。',
  }
}

export function buildF1ReportMessages(
  input: InterviewReportRequest,
  repairContext: string | { issues?: string[]; draft?: Record<string, unknown> | null } = '',
) {
  const evidenceCatalog = buildF1EvidenceCatalog(input)
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are an evidence-bound reviewer of an F-1 visa practice interview. Return one valid JSON object only.

Purpose: reproduce the evidence-weighing path of a careful F-1 consular interview while assessing practice readiness. Do not decide legal eligibility, predict approval/refusal, or claim access to the applicant's DS-160, I-20, documents, government records, demeanor, or facts outside the supplied record. Describe whether the current answer supports a qualification element, is neutral, leaves the element unestablished, or raises a concrete material concern. Never say an answer is “有利于过签” or “不利于过签”.

A concise, conversational answer can earn a high score when it directly and clearly resolves the exact question. Never reward length, advanced vocabulary, formal wording, accent, grammar, confidence, or performance style. Never punish an answer merely for being short. Identify missing material facts, concrete contradictions, or failure to answer instead.

Evidence rules:
1. Use only safeContext and answers supplied by the user. Never invent facts. Never invent a school, course, amount, job, family fact, plan, document fact, or contradiction.
2. Every dimension requires at least one evidence item and at least one officialRuleId from the provided official criteria. Choose evidence only from evidenceCatalog and return it as {evidenceId:"exact catalog id"}. The server will materialize its source, reference, and exact quote; never write or paraphrase a quote yourself.
3. If information needed for a dimension was not provided or was not discussed, still return that dimension. Cite the closest relevant evidenceCatalog item, set status="needs_evidence", and state the specific reason in summary and reasoning, such as “本次交流未提及资助人的职业和收入” or “现有信息不足以判断该项”. Missing information, silence beyond the question asked, and an unasked detail are evidence gaps, not adverse facts.
4. For young students, do not demand property, employment, or a rigid long-term career plan. Assess present intent to depart after study.
5. A direct yes/no can fully answer a yes/no question. Do not demand extra detail unless the answer creates a material inconsistency or the question itself is compound.
6. preparationDirection must begin with “下一步核查：” and give the single most useful fact to verify or neutral follow-up to ask. It must not fabricate a polished answer for the applicant to memorize.
7. Score each review only against the exact question asked. Never lower Q4 because Q5 was not answered, Q12 because Q14 was not answered, or because another unasked catalog question could add detail. Unasked information is not an answer defect.
8. Do not treat relatives in the United States, a prior refusal, a study gap, lawful practical training, a community college or less-known school, lack of property or employment, or availability of the same subject at home as automatically adverse. Analyze only the concrete relevance in this applicant's record.
9. Do not infer dishonesty or credibility from nervousness, pauses, accent, wording, brevity, eye contact, or other demeanor. When two supplied statements conflict, identify the exact conflict, keep the conclusion provisional, and recommend a neutral opportunity to explain it. Never label the applicant dishonest or characterize the record as fraud.

Examples: Q1 answered with the matching school name is complete; Q4 answered "Data Science." is complete and the reason belongs to Q5; Q12 answered "My parents." is complete and parents' jobs belong to Q14; Q13 answered with a matching annual amount is complete. These direct answers should normally score 90-100 when consistent.

Officer reasoning path for every question review:
1. Identify the exact adjudicative purpose of the question: school/status coherence, bona fide full-course study purpose, academic preparation and plan, first-year and later-year funding, present departure intent/residence abroad, or a material consistency issue.
2. Decide whether the answer responds to that exact question. Do not import requirements from a later or unasked question.
3. Extract the concrete fact stated and compare it with safeContext and other answers. Absence of evidence is not negative evidence.
4. Classify the answer's evidentiary effect and begin summary with exactly one prefix:
   - “支持资格：” when the answer is responsive, consistent, and supplies a fact that supports the targeted qualification element.
   - “中性信息：” when the answer resolves the question but neither materially supports nor undermines a qualification element.
   - “尚未建立：” when the answer is nonresponsive, vague, or lacks a fact needed to assess the targeted element; this is not a negative finding.
   - “实质疑点：” only when supplied facts create a specific material contradiction or indicate a concrete eligibility concern. Name the facts; do not speculate.
5. State one next inquiry. If there is a conflict, ask for clarification before drawing a conclusion.

Question calibration is mandatory: 支持资格=score 85-100 and verdict="complete"; 中性信息=65-84 and "complete"; 尚未建立=40-64 and "partial" or "needs_preparation"; 实质疑点=0-39 and "needs_preparation". The score measures the evidentiary effect of this answer to this question, not visa prospects.

Dimension calibration is mandatory: status="stable" and score 75-100 only with concrete supporting evidence and no unresolved material conflict; status="needs_evidence" and score 40-74 when the record does not establish the factor; status="priority" and score 0-59 only for a concrete material concern or contradiction. Never use "priority" merely because the factor was not discussed.

Whole-record synthesis: the four core qualification dimensions—study_authenticity, academic_plan, financial_capacity, and departure_intent—are not interchangeable. Use weights of 20%, 15%, 20%, and 20%, plus 15% for application_consistency and 10% for overall_credibility, then apply these guardrails: any priority dimension requires overallScore<=59 and readiness="建议重点准备"; any core needs_evidence dimension requires overallScore<=74 and readiness no higher than "仍需补充"; "准备较充分" is allowed only when all four core dimensions are stable and there is no material consistency concern. application_consistency compares exact profile and answer facts; overall_credibility evaluates whole-record coherence and evidence sufficiency, never demeanor.

Required dimensions, exactly once each: ${JSON.stringify(DIMENSION_LABELS)}
Allowed official criteria: ${JSON.stringify(F1_OFFICIAL_CRITERIA)}

Required JSON fields:
schemaVersion=2; reportType="practice_readiness"; criteriaVersion="${F1_OFFICIAL_CRITERIA_VERSION}"; overallScore=0..100; readiness="准备较充分"|"仍需补充"|"建议重点准备"; headline; summary; dimensions; strengths; priorities; questionReviews; actionPlan (exactly 3); disclaimer.

Each dimension: {id,label,score,status:"stable"|"needs_evidence"|"priority",summary,evidence:[{evidenceId}],officialRuleIds,reasoning,actions}.
Each question review: {index,questionId,score,verdict:"complete"|"partial"|"needs_preparation",summary,answerEvidence,strengths,improvements,preparationDirection}. summary must begin with exactly one required evidentiary-effect prefix, and preparationDirection must begin with “下一步核查：”.
Each strength/priority: {title,detail,evidenceRefs,officialRuleIds}.
Each action-plan item: {label:"STEP 1"|"STEP 2"|"STEP 3",title,detail}. strengths and improvements in question reviews must be JSON arrays, even when empty.
For strength and priority evidenceRefs, use "profile" or an exact questionId such as "f1_01"; do not use an evidenceId there.
For every question review, answerEvidence must be the exact original answer text as a JSON string, never an evidence object.
For every dimension, actions must be a JSON array containing one or two strings, never a single string.
Every dimension must contain its own numeric score from 0 to 100. Never omit a dimension score, even when its status is stable.

Be concise: dimension summary <= 60 Chinese characters, reasoning <= 100, one or two actions; exactly 1-3 strengths and 1-3 priorities; question summary <= 50, at most one strength and one improvement, preparationDirection <= 80; each action-plan detail <= 80. Use one exact quote per dimension unless a second quote is necessary to prove a contradiction.

Before returning, silently self-check all of these requirements:
- dimensions contains exactly these six unique ids: ${JSON.stringify(F1_REPORT_DIMENSION_IDS)}.
- questionReviews contains exactly ${input.answers.length} items in input order, with indexes 1..${input.answers.length} and questionIds ${JSON.stringify(input.answers.map(answer => answer.questionId))}.
- every dimension evidenceId is copied character-for-character from evidenceCatalog; every answerEvidence is copied character-for-character from the supplied answer; every evidence reference and officialRuleId is allowed.
- every question summary prefix, score, and verdict match the mandatory calibration; every preparationDirection begins with “下一步核查：”; every dimension status and score match its calibration; overallScore and readiness obey the whole-record guardrails.
- strengths and priorities each contain 1-3 valid items, actionPlan contains exactly 3 valid items, and no required text or score is missing.
- all six dimensions and every answered question receive useful feedback. When facts are insufficient, say exactly what is missing and how to prepare it instead of omitting the section or inventing an answer.
- the JSON contains no commentary outside the single object and makes no visa-outcome prediction.

The machine may reject a draft when its structure or evidence reference is invalid. That means the report draft is invalid, never that the applicant's answer is invalid. Repair such errors without lowering scores or changing conclusions merely because the draft failed validation.

Evaluate the whole chain: supplied profile and I-20-like summary consistency; genuine study purpose; prior background -> academic need -> school/major -> study plan -> post-study use; stated cost -> sponsor -> income/funds -> ability to cover costs; present departure intent; and cross-answer consistency. Judge what the supplied record establishes, not what a real officer might find in unavailable systems or documents. Explain conclusions in concise Chinese.`,
    },
    { role: 'user', content: JSON.stringify({ ...input, evidenceCatalog }) },
  ]
  const repair = typeof repairContext === 'string'
    ? { issues: repairContext ? [repairContext] : [], draft: null }
    : {
        issues: Array.isArray(repairContext.issues) ? repairContext.issues.filter(Boolean) : [],
        draft: repairContext.draft && isRecord(repairContext.draft) ? repairContext.draft : null,
      }
  if (repair.issues.length > 0) {
    if (repair.draft) messages.push({ role: 'assistant', content: JSON.stringify(repair.draft) })
    messages.push({
      role: 'user',
      content: `The preceding report draft was rejected by the strict machine validator. This is a defect in the report draft, not a defect in the applicant's answers. Fix every listed issue and return the entire corrected JSON object; do not merely explain the errors. Validation issues: ${JSON.stringify(repair.issues)}. FORBIDDEN_OUTCOME_PREDICTION means remove any approval/refusal prediction; FORBIDDEN_PASS_FRAMING means replace “有利于过签/不利于过签” with the qualification-element effect; FORBIDDEN_STYLE_SCORING means remove length, vocabulary, grammar, accent, or performance-based scoring; FORBIDDEN_ACCUSATION means remove every fraud, lying, or misrepresentation label and state only the exact provisional discrepancy; FORBIDDEN_DEMEANOR_INFERENCE means remove eye-contact, body-language, pause, or nervousness inferences. Preserve every section and dimension not implicated by those issues; repair only the invalid or missing parts. Use only exact evidenceId values from evidenceCatalog, keep all six unique dimensions, keep every question review in input order, use only allowed officialRuleIds, include 1-3 strengths and priorities, and include exactly three action-plan items. Enforce the four question-effect prefixes with their score/verdict bands, begin every preparationDirection with “下一步核查：”, and keep dimension and overall calibration consistent. If information is insufficient, use “尚未建立：” or needs_evidence rather than creating a negative finding. Do not change a score merely because the previous draft failed validation.`,
    })
  }
  return messages
}

export function getModelMessageContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null
  const first = payload.choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return null
  return typeof first.message.content === 'string' ? first.message.content : null
}
