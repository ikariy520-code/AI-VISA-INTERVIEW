import {
  B2_OFFICIAL_CRITERIA_VERSION,
  B2_OFFICIAL_RULE_IDS,
  type B2OfficialRuleId,
} from '../modules/practice/data/b2OfficialCriteria'
import { redactPotentialIdentifiers, type InterviewReportAnswer } from './f1ReportContract'

export type B2ReportDimensionId =
  | 'application_consistency'
  | 'visit_purpose'
  | 'itinerary_duration'
  | 'funding_coherence'
  | 'temporary_visit_plan'
  | 'overall_credibility'

export interface B2ReportRequest {
  visaType: 'B2'
  criteriaVersion: string
  safeContext: Record<string, unknown>
  answers: InterviewReportAnswer[]
}

export interface B2ReportEvidence {
  source: 'profile' | 'answer'
  reference: string
  quote: string
}

export interface B2ReportDimension {
  id: B2ReportDimensionId
  label: string
  score: number
  status: 'stable' | 'needs_evidence' | 'priority'
  summary: string
  evidence: B2ReportEvidence[]
  officialRuleIds: B2OfficialRuleId[]
  reasoning: string
  actions: string[]
}

export interface B2ReportQuestionReview {
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

export interface B2ReportInsight {
  title: string
  detail: string
  evidenceRefs: string[]
  officialRuleIds: B2OfficialRuleId[]
}

export interface B2StructuredReport {
  schemaVersion: 2
  reportType: 'b2_practice_readiness'
  analysisMode: 'model' | 'evidence_only'
  criteriaVersion: string
  overallScore: number
  readiness: '准备较充分' | '仍需补充' | '建议重点准备'
  headline: string
  summary: string
  dimensions: B2ReportDimension[]
  strengths: B2ReportInsight[]
  priorities: B2ReportInsight[]
  questionReviews: B2ReportQuestionReview[]
  actionPlan: Array<{ label: string; title: string; detail: string }>
  disclaimer: string
}

export const B2_REPORT_DIMENSION_IDS: readonly B2ReportDimensionId[] = [
  'application_consistency',
  'visit_purpose',
  'itinerary_duration',
  'funding_coherence',
  'temporary_visit_plan',
  'overall_credibility',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const cleanText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const cleanArray = (value: unknown, count: number, length: number) => Array.isArray(value)
  ? value.map(item => cleanText(item, length)).filter(Boolean).slice(0, count)
  : []

export function sanitizeB2ReportRequest(value: unknown): B2ReportRequest | null {
  if (!isRecord(value) || value.visaType !== 'B2' || !Array.isArray(value.answers)) return null
  const context = isRecord(value.safeContext) ? value.safeContext : {}
  const serialized = redactPotentialIdentifiers(JSON.stringify(context))
  if (serialized.length > 12_000) return null
  const sourceAnswers = value.answers.slice(0, 12)
  const answers = sourceAnswers.map((item, offset): InterviewReportAnswer | null => {
    if (!isRecord(item)) return null
    const index = Number(item.index)
    const questionId = cleanText(item.questionId, 20)
    const question = redactPotentialIdentifiers(cleanText(item.question, 1_000))
    const answer = redactPotentialIdentifiers(cleanText(item.answer, 4_000))
    const timestamp = cleanText(item.timestamp, 20) || '00:00'
    if (index !== offset + 1 || !/^b2_(0[1-9]|1\d|2[0-4])$/.test(questionId) || !question || !answer) return null
    return { index, questionId, question, answer, timestamp }
  }).filter((item): item is InterviewReportAnswer => item !== null)
  if (!answers.length || answers.length !== sourceAnswers.length) return null
  return {
    visaType: 'B2',
    criteriaVersion: B2_OFFICIAL_CRITERIA_VERSION,
    safeContext: JSON.parse(serialized),
    answers,
  }
}

function evidenceIsGrounded(item: unknown, input: B2ReportRequest) {
  if (!isRecord(item)) return false
  const source = item.source
  const reference = cleanText(item.reference, 40)
  const quote = cleanText(item.quote, 500)
  if (!quote) return false
  if (source === 'profile') return reference === 'profile' && JSON.stringify(input.safeContext).includes(quote)
  if (source === 'answer') {
    const answer = input.answers.find(candidate => candidate.questionId === reference)
    return Boolean(answer && answer.answer.includes(quote))
  }
  return false
}

function hasForbiddenClaim(report: unknown) {
  const text = JSON.stringify(report)
  return /过签率|获签概率|保证.{0,8}(?:获签|过签)|一定.{0,8}(?:获签|拒签)|will be (?:approved|refused)|approval (?:chance|probability)/i.test(text)
}

export function validateB2StructuredReport(value: unknown, input: B2ReportRequest): B2StructuredReport | null {
  if (!isRecord(value)
    || value.schemaVersion !== 2
    || value.reportType !== 'b2_practice_readiness'
    || value.criteriaVersion !== input.criteriaVersion
    || hasForbiddenClaim(value)) return null
  const mode = value.analysisMode === 'evidence_only' ? 'evidence_only' : value.analysisMode === 'model' ? 'model' : null
  const overallScore = Number(value.overallScore)
  const allowedReadiness = new Set(['准备较充分', '仍需补充', '建议重点准备'])
  if (!mode || !Number.isFinite(overallScore) || overallScore < 0 || overallScore > 100 || !allowedReadiness.has(String(value.readiness))) return null
  if (!Array.isArray(value.dimensions) || value.dimensions.length !== B2_REPORT_DIMENSION_IDS.length) return null
  const dimensions = value.dimensions.map((item): B2ReportDimension | null => {
    if (!isRecord(item) || !B2_REPORT_DIMENSION_IDS.includes(item.id as B2ReportDimensionId)) return null
    const score = Number(item.score)
    const status = item.status
    const evidence = Array.isArray(item.evidence) ? item.evidence.slice(0, 6) : []
    const ruleIds = Array.isArray(item.officialRuleIds)
      ? item.officialRuleIds.filter(id => typeof id === 'string' && B2_OFFICIAL_RULE_IDS.has(id as B2OfficialRuleId)).slice(0, 6) as B2OfficialRuleId[]
      : []
    if (!Number.isFinite(score) || score < 0 || score > 100
      || !['stable', 'needs_evidence', 'priority'].includes(String(status))
      || evidence.length === 0 || !evidence.every(evidenceItem => evidenceIsGrounded(evidenceItem, input))
      || ruleIds.length === 0) return null
    return {
      id: item.id as B2ReportDimensionId,
      label: cleanText(item.label, 80),
      score: Math.round(score),
      status: status as B2ReportDimension['status'],
      summary: cleanText(item.summary, 700),
      evidence: evidence as B2ReportEvidence[],
      officialRuleIds: ruleIds,
      reasoning: cleanText(item.reasoning, 1_000),
      actions: cleanArray(item.actions, 5, 500),
    }
  })
  if (dimensions.some(item => !item) || new Set(dimensions.map(item => item?.id)).size !== B2_REPORT_DIMENSION_IDS.length) return null
  if (!Array.isArray(value.questionReviews) || value.questionReviews.length !== input.answers.length) return null
  const questionReviews = value.questionReviews.map((item, offset): B2ReportQuestionReview | null => {
    const answer = input.answers[offset]
    if (!isRecord(item) || Number(item.index) !== answer.index || item.questionId !== answer.questionId) return null
    const score = Number(item.score)
    const evidence = cleanText(item.answerEvidence, 500)
    if (!Number.isFinite(score) || score < 0 || score > 100 || !answer.answer.includes(evidence)
      || !['complete', 'partial', 'needs_preparation'].includes(String(item.verdict))) return null
    return {
      index: answer.index,
      questionId: answer.questionId,
      score: Math.round(score),
      verdict: item.verdict as B2ReportQuestionReview['verdict'],
      summary: cleanText(item.summary, 700),
      answerEvidence: evidence,
      strengths: cleanArray(item.strengths, 4, 400),
      improvements: cleanArray(item.improvements, 4, 400),
      preparationDirection: cleanText(item.preparationDirection, 700),
    }
  })
  if (questionReviews.some(item => !item)) return null
  const cleanInsights = (items: unknown): B2ReportInsight[] => Array.isArray(items) ? items.slice(0, 4).flatMap(item => {
    if (!isRecord(item)) return []
    const refs = cleanArray(item.evidenceRefs, 6, 50).filter(ref => ref.startsWith('profile:') || input.answers.some(answer => ref === `answer:${answer.questionId}`))
    const ruleIds = Array.isArray(item.officialRuleIds)
      ? item.officialRuleIds.filter(id => typeof id === 'string' && B2_OFFICIAL_RULE_IDS.has(id as B2OfficialRuleId)).slice(0, 6) as B2OfficialRuleId[]
      : []
    const title = cleanText(item.title, 100)
    const detail = cleanText(item.detail, 700)
    return title && detail && refs.length ? [{ title, detail, evidenceRefs: refs, officialRuleIds: ruleIds }] : []
  }) : []
  const actionPlan = Array.isArray(value.actionPlan) ? value.actionPlan.slice(0, 5).flatMap(item => isRecord(item) ? [{
    label: cleanText(item.label, 40),
    title: cleanText(item.title, 100),
    detail: cleanText(item.detail, 700),
  }] : []) : []
  const headline = cleanText(value.headline, 300)
  const summary = cleanText(value.summary, 1_500)
  if (!headline || !summary || !actionPlan.length) return null
  return {
    schemaVersion: 2,
    reportType: 'b2_practice_readiness',
    analysisMode: mode,
    criteriaVersion: input.criteriaVersion,
    overallScore: Math.round(overallScore),
    readiness: value.readiness as B2StructuredReport['readiness'],
    headline,
    summary,
    dimensions: dimensions as B2ReportDimension[],
    strengths: cleanInsights(value.strengths),
    priorities: cleanInsights(value.priorities),
    questionReviews: questionReviews as B2ReportQuestionReview[],
    actionPlan,
    disclaimer: cleanText(value.disclaimer, 700) || '本报告仅用于模拟面签准备，不预测签证结果，也不替代美国政府决定或专业法律意见。',
  }
}
