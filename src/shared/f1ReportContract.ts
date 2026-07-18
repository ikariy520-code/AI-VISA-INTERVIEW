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
  application_consistency: ['DOS_ACADEMIC_PREPARATION'],
  study_authenticity: ['FAM_EDUCATION_HOME_COUNTRY_CALIBRATION'],
  academic_plan: ['DOS_ACADEMIC_PREPARATION'],
  financial_capacity: ['DOS_FINANCIAL_CAPACITY'],
  departure_intent: ['DOS_DEPARTURE_INTENT', 'FAM_RESIDENCE_ABROAD', 'FAM_PRESENT_INTENT_CALIBRATION'],
  overall_credibility: ['FAM_PRESENT_INTENT_CALIBRATION'],
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

function includesExactEvidence(corpus: string, quote: string) {
  const normalizedCorpus = corpus.toLowerCase().replace(/\s+/g, ' ')
  const normalizedQuote = quote.toLowerCase().replace(/\s+/g, ' ')
  return normalizedQuote.length >= 2 && normalizedCorpus.includes(normalizedQuote)
}

function includesGroundedProfileEvidence(corpus: string, quote: string) {
  if (includesExactEvidence(corpus, quote)) return true
  const facts = quote.split(/[,，]/).map(item => item.trim()).filter(Boolean)
  return facts.length > 1 && facts.every(fact => includesExactEvidence(corpus, fact))
}

function buildProfileEvidenceCorpus(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => buildProfileEvidenceCorpus(item, `${path}[${index}]`))
  if (isRecord(value)) return Object.entries(value).flatMap(([key, item]) => buildProfileEvidenceCorpus(item, path ? `${path}.${key}` : key))
  if (!path || value === null || value === undefined) return []
  const leaf = path.split('.').slice(-1)[0]
  return [`${path}: ${String(value)}`, `${leaf}: ${String(value)}`, String(value)]
}

function isValidEvidenceReference(source: F1ReportEvidence['source'], reference: string, input: InterviewReportRequest) {
  return source === 'profile'
    ? reference === 'profile'
    : input.answers.some(answer => answer.questionId === reference)
}

function hasForbiddenClaim(value: unknown) {
  const text = JSON.stringify(value)
  return /(获签概率|过签率|一定(?:会)?通过|一定(?:会)?拒签|will be approved|will be refused|approval probability|回答过短|回答太短|字数太少|高级词汇|word count|too short)/i.test(text)
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
  const source = value.source === 'profile' ? 'profile' : value.source === 'answer' ? 'answer' : null
  const reference = cleanText(value.reference, 80)
  const quote = cleanText(value.quote, 500)
  if (!source || !reference || !quote || !isValidEvidenceReference(source, reference, input)) return null
  const corpus = source === 'profile'
    ? [JSON.stringify(input.safeContext), ...buildProfileEvidenceCorpus(input.safeContext)].join('\n')
    : input.answers.find(answer => answer.questionId === reference)?.answer ?? ''
  const grounded = source === 'profile'
    ? includesGroundedProfileEvidence(corpus, quote)
    : includesExactEvidence(corpus, quote)
  return grounded ? { source, reference, quote } : null
}

function normalizeQuestionAnswerEvidence(value: unknown, sourceAnswer: InterviewReportAnswer): string | null {
  const directQuote = cleanText(value, 500)
  if (directQuote && includesExactEvidence(sourceAnswer.answer, directQuote)) return directQuote
  if (!isRecord(value) || value.source !== 'answer' || value.reference !== sourceAnswer.questionId) return null
  const nestedQuote = cleanText(value.quote, 500)
  return nestedQuote && includesExactEvidence(sourceAnswer.answer, nestedQuote) ? nestedQuote : null
}

export function validateF1StructuredReport(value: unknown, input: InterviewReportRequest): F1StructuredReport | null {
  if (!isRecord(value) || value.schemaVersion !== 2 || value.reportType !== 'practice_readiness') return null
  if (value.criteriaVersion !== input.criteriaVersion || hasForbiddenClaim(value)) return null
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
    const rawEvidence = Array.isArray(item.evidence) ? item.evidence.slice(0, 5) : []
    const evidence = rawEvidence.map(entry => normalizeEvidence(entry, input)).filter((entry): entry is F1ReportEvidence => entry !== null)
    const rawOfficialRuleIds = cleanStringArray(item.officialRuleIds, 6, 80)
    const officialRuleIds = rawOfficialRuleIds.length === 0
      ? [...DIMENSION_DEFAULT_RULE_IDS[id]]
      : rawOfficialRuleIds.filter((ruleId): ruleId is F1OfficialRuleId => F1_OFFICIAL_RULE_IDS.includes(ruleId as F1OfficialRuleId))
    const actions = cleanActionArray(item.actions)
    const summary = cleanText(item.summary, 1_000)
    const reasoning = cleanText(item.reasoning, 1_500)
    if (score === null || !status || evidence.length === 0 || evidence.length !== rawEvidence.length || officialRuleIds.length === 0 || (rawOfficialRuleIds.length > 0 && officialRuleIds.length !== rawOfficialRuleIds.length) || actions.length === 0 || !summary || !reasoning) return null
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
  const questionReviews = value.questionReviews.map(item => {
    if (!isRecord(item)) return null
    const index = Number(item.index)
    const sourceAnswer = input.answers[index - 1]
    const score = cleanScore(item.score)
    const verdict = item.verdict === 'complete' || item.verdict === 'partial' || item.verdict === 'needs_preparation' ? item.verdict : null
    const answerEvidence = sourceAnswer ? normalizeQuestionAnswerEvidence(item.answerEvidence, sourceAnswer) : null
    const summary = cleanText(item.summary, 800)
    const preparationDirection = cleanText(item.preparationDirection, 1_000)
    if (!sourceAnswer || item.questionId !== sourceAnswer.questionId || score === null || !verdict || !summary || !preparationDirection || !answerEvidence) return null
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
  const strengths = Array.isArray(value.strengths) ? value.strengths.map(normalizeInsight).filter((item): item is F1ReportInsight => item !== null).slice(0, 4) : []
  const priorities = Array.isArray(value.priorities) ? value.priorities.map(normalizeInsight).filter((item): item is F1ReportInsight => item !== null).slice(0, 4) : []
  if (strengths.length === 0 || priorities.length === 0) return null

  const actionPlan = Array.isArray(value.actionPlan)
    ? value.actionPlan.map((item, index) => isRecord(item) ? {
      label: cleanText(item.label, 30) || `STEP ${index + 1}`,
      title: cleanText(item.title, 150),
      detail: cleanText(item.detail, 800),
    } : null).filter((item): item is F1ReportPracticeStep => Boolean(item?.label && item.title && item.detail)).slice(0, 3)
    : []
  if (actionPlan.length !== 3) return null

  const headline = cleanText(value.headline, 300)
  const summary = cleanText(value.summary, 1_500)
  if (!headline || !summary) return null

  return {
    schemaVersion: 2,
    reportType: 'practice_readiness',
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

export function buildF1ReportMessages(input: InterviewReportRequest) {
  return [
    {
      role: 'system',
      content: `You are an evidence-bound reviewer of an F-1 visa practice interview. Return one valid JSON object only.

Purpose: assess practice readiness, not visa eligibility and never approval/refusal probability. A concise, conversational answer can earn a high score when it directly and clearly resolves the question. Never reward length, advanced vocabulary, formal wording, accent, or grammar. Never punish an answer merely for being short. Identify missing material facts, contradictions, or failure to answer instead.

Evidence rules:
1. Use only safeContext and answers supplied by the user. Never invent a school, course, amount, job, family fact, plan, document fact, or contradiction.
2. Every dimension requires at least one exact evidence quote copied from safeContext or an answer and at least one officialRuleId from the provided official criteria. For profile evidence use reference="profile"; for answer evidence use its exact questionId such as "f1_01". Strength and priority evidenceRefs use the same values.
3. If evidence is missing, label it as an evidence gap. Absence is not proof of a negative fact.
4. For young students, do not demand property, employment, or a rigid long-term career plan. Assess present intent to depart after study.
5. A direct yes/no can fully answer a yes/no question. Do not demand extra detail unless the answer creates a material inconsistency or the question itself is compound.
6. preparationDirection gives a fact-gathering and reasoning framework; it must not fabricate a polished answer for the applicant to memorize.
7. Score each review only against the exact question asked. Never lower Q4 because Q5 was not answered, Q12 because Q14 was not answered, or because another unasked catalog question could add detail. Unasked information is not an answer defect.
Examples: Q1 answered with the matching school name is complete; Q4 answered "Data Science." is complete and the reason belongs to Q5; Q12 answered "My parents." is complete and parents' jobs belong to Q14; Q13 answered with a matching annual amount is complete. These direct answers should normally score 90-100 when consistent.

Required dimensions, exactly once each: ${JSON.stringify(DIMENSION_LABELS)}
Allowed official criteria: ${JSON.stringify(F1_OFFICIAL_CRITERIA)}

Required JSON fields:
schemaVersion=2; reportType="practice_readiness"; criteriaVersion="${F1_OFFICIAL_CRITERIA_VERSION}"; overallScore=0..100; readiness="准备较充分"|"仍需补充"|"建议重点准备"; headline; summary; dimensions; strengths; priorities; questionReviews; actionPlan (exactly 3); disclaimer.

Each dimension: {id,label,score,status:"stable"|"needs_evidence"|"priority",summary,evidence:[{source:"profile"|"answer",reference,quote}],officialRuleIds,reasoning,actions}.
Each question review: {index,questionId,score,verdict:"complete"|"partial"|"needs_preparation",summary,answerEvidence,strengths,improvements,preparationDirection}.
Each strength/priority: {title,detail,evidenceRefs,officialRuleIds}.
Each action-plan item: {label:"STEP 1"|"STEP 2"|"STEP 3",title,detail}. strengths and improvements in question reviews must be JSON arrays, even when empty.
For profile evidence, quote one exact value or one or more exact "field: value" pairs separated by commas. Never paraphrase a profile quote.
For every question review, answerEvidence must be the exact original answer text as a JSON string, never an evidence object.
For every dimension, actions must be a JSON array containing one or two strings, never a single string.
Every dimension must contain its own numeric score from 0 to 100. Never omit a dimension score, even when its status is stable.

Be concise: dimension summary <= 60 Chinese characters, reasoning <= 100, one or two actions; exactly 1-3 strengths and 1-3 priorities; question summary <= 50, at most one strength and one improvement, preparationDirection <= 80; each action-plan detail <= 80. Use one exact quote per dimension unless a second quote is necessary to prove a contradiction.

Evaluate the whole chain: profile and I-20-like summary consistency; genuine study purpose; prior background -> academic need -> school/major -> study plan -> post-study use; stated cost -> sponsor -> income/funds -> ability to cover costs; present departure intent; and cross-answer credibility. Explain conclusions in concise Chinese.`,
    },
    { role: 'user', content: JSON.stringify(input) },
  ]
}

export function getModelMessageContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null
  const first = payload.choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return null
  return typeof first.message.content === 'string' ? first.message.content : null
}
