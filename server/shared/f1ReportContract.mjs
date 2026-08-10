// Provider-neutral F-1 report prompt, privacy filter, and validation contract.
import {
  F1_OFFICIAL_CRITERIA,
  F1_OFFICIAL_CRITERIA_VERSION,
  F1_OFFICIAL_RULE_IDS,
} from './f1OfficialCriteria.mjs'

const DIMENSION_LABELS = {
  application_consistency: '申请信息一致性',
  study_authenticity: '学习目的真实性',
  academic_plan: '学术与学习计划',
  financial_capacity: '资金能力',
  departure_intent: '完成学业后的离美意图',
  overall_credibility: '整体可信度与风险一致性',
}
export const F1_REPORT_DIMENSION_IDS = Object.keys(DIMENSION_LABELS)

const DIMENSION_DEFAULT_RULE_IDS = {
  application_consistency: ['DOS_ACADEMIC_PREPARATION', 'FAM_MISREPRESENTATION_EVIDENCE_STANDARD'],
  study_authenticity: ['FAM_STUDENT_VISA_QUALIFICATIONS', 'FAM_EDUCATION_HOME_COUNTRY_CALIBRATION'],
  academic_plan: ['DOS_ACADEMIC_PREPARATION'],
  financial_capacity: ['DOS_FINANCIAL_CAPACITY', 'FAM_ADEQUATE_FINANCIAL_RESOURCES'],
  departure_intent: ['DOS_DEPARTURE_INTENT', 'FAM_RESIDENCE_ABROAD', 'FAM_PRESENT_INTENT_CALIBRATION'],
  overall_credibility: ['DOS_INDIVIDUAL_ASSESSMENT', 'FAM_MISREPRESENTATION_EVIDENCE_STANDARD'],
}

const QUESTION_EFFECT_PREFIXES = ['支持资格：', '中性信息：', '尚未建立：', '实质疑点：']
const NEXT_INQUIRY_PREFIX = '下一步核查：'
const CORE_QUALIFICATION_DIMENSIONS = [
  'study_authenticity',
  'academic_plan',
  'financial_capacity',
  'departure_intent',
]

function hasCalibratedQuestionEffect(summary, score, verdict) {
  const prefix = QUESTION_EFFECT_PREFIXES.find(candidate => summary.startsWith(candidate))
  if (prefix === '支持资格：') return verdict === 'complete' && score >= 85
  if (prefix === '中性信息：') return verdict === 'complete' && score >= 65 && score <= 84
  if (prefix === '尚未建立：') return ['partial', 'needs_preparation'].includes(verdict) && score >= 40 && score <= 64
  if (prefix === '实质疑点：') return verdict === 'needs_preparation' && score <= 39
  return false
}

function hasCalibratedDimensionStatus(status, score) {
  if (status === 'stable') return score >= 75
  if (status === 'needs_evidence') return score >= 40 && score <= 74
  return score <= 59
}

function hasCalibratedOverallReadiness(dimensions, overallScore, readiness) {
  const anyPriority = dimensions.some(dimension => dimension.status === 'priority')
  if (anyPriority) return readiness === '建议重点准备' && overallScore <= 59

  const coreDimensions = CORE_QUALIFICATION_DIMENSIONS
    .map(id => dimensions.find(dimension => dimension.id === id))
    .filter(Boolean)
  const coreNeedsEvidence = coreDimensions.some(dimension => dimension.status === 'needs_evidence')
  if (coreNeedsEvidence && (readiness === '准备较充分' || overallScore > 74)) return false
  if (readiness === '准备较充分') return overallScore >= 75 && coreDimensions.every(dimension => dimension.status === 'stable')
  return true
}

const IDENTIFIER_PATTERNS = [
  [/\bN\d{9}\b/gi, '[REDACTED_SEVIS_ID]'],
  [/\bAA\d{8}\b/gi, '[REDACTED_DS160_ID]'],
  [/\b[A-Z]{1,3}\d{7,10}\b/gi, '[REDACTED_PASSPORT]'],
  [/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]'],
  [/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '[REDACTED_PHONE]'],
  [/\b\d{15,19}\b/g, '[REDACTED_ACCOUNT]'],
]

export function redactPotentialIdentifiers(value) {
  return IDENTIFIER_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function cleanStringArray(value, maxItems, maxLength) {
  return Array.isArray(value) ? value.map(item => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems) : []
}

function cleanScore(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null
}

export function sanitizeReportRequest(value) {
  if (!isRecord(value) || value.visaType !== 'F1' || !Array.isArray(value.answers)) return null
  const rawContext = isRecord(value.safeContext) ? value.safeContext : {}
  const serializedContext = redactPotentialIdentifiers(JSON.stringify(rawContext))
  if (serializedContext.length > 12_000) return null
  const rawAnswers = value.answers.slice(0, 22)
  const answers = rawAnswers.map((item, offset) => {
    if (!isRecord(item)) return null
    const index = Number(item.index)
    const questionId = cleanText(item.questionId, 20)
    const question = redactPotentialIdentifiers(cleanText(item.question, 1_000))
    const answer = redactPotentialIdentifiers(cleanText(item.answer, 4_000))
    const timestamp = cleanText(item.timestamp, 20) || '00:00'
    if (index !== offset + 1 || !/^f1_(0[1-9]|1\d|2[0-2])$/.test(questionId) || !question || !answer) return null
    return { index, questionId, question, answer, timestamp }
  }).filter(Boolean)
  if (answers.length === 0 || answers.length !== rawAnswers.length) return null
  return {
    visaType: 'F1',
    criteriaVersion: F1_OFFICIAL_CRITERIA_VERSION,
    safeContext: JSON.parse(serializedContext),
    answers,
  }
}

function buildProfileEvidenceCatalog(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((item, index) => buildProfileEvidenceCatalog(item, `${path}[${index}]`))
  if (isRecord(value)) return Object.entries(value).flatMap(([key, item]) => buildProfileEvidenceCatalog(item, path ? `${path}.${key}` : key))
  if (!path || value === null || value === undefined) return []
  const quote = String(value).slice(0, 500)
  return quote.trim().length >= 2 ? [{ id: `profile:${path}`, source: 'profile', reference: 'profile', quote }] : []
}

export function buildF1EvidenceCatalog(input) {
  return [
    ...buildProfileEvidenceCatalog(input.safeContext),
    ...input.answers.map(answer => ({
      id: `answer:${answer.questionId}`,
      source: 'answer',
      reference: answer.questionId,
      quote: answer.answer,
    })),
  ]
}

function hasForbiddenClaim(value) {
  if (!isRecord(value)) return false
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
  return /(获签概率|过签率|有利于过签|不利于过签|一定(?:会)?通过|一定(?:会)?拒签|will be approved|will be refused|approval probability|回答过短|回答太短|字数太少|高级词汇|word count|too short|欺诈|撒谎|说谎|造假|虚假陈述|眼神|肢体语言|nervousness indicates|demeanor proves)/i.test(JSON.stringify(generatedEvaluation))
}

function cleanFeedbackArray(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim().slice(0, 500)] : []
  return cleanStringArray(value, 3, 500)
}

function cleanActionArray(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim().slice(0, 500)] : []
  return cleanStringArray(value, 4, 500)
}

function normalizeEvidence(value, input, options = {}) {
  if (!isRecord(value)) return null
  const catalog = buildF1EvidenceCatalog(input)
  const evidenceId = typeof value.evidenceId === 'string' && value.evidenceId.length <= 200 ? value.evidenceId : ''
  if (evidenceId) {
    const catalogEntry = catalog.find(entry => entry.id === evidenceId)
    return catalogEntry
      ? { source: catalogEntry.source, reference: catalogEntry.reference, quote: catalogEntry.quote }
      : null
  }
  if (!options.allowMaterializedEvidence) return null
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

function normalizeQuestionAnswerEvidence(value, sourceAnswer) {
  return typeof value === 'string' && value === sourceAnswer.answer ? sourceAnswer.answer : null
}

export function repairF1ReportEvidence(value, input, options = {}) {
  if (!isRecord(value)) return value
  const repaired = JSON.parse(JSON.stringify(value))
  if (Array.isArray(repaired.dimensions)) {
    repaired.dimensions = repaired.dimensions.map(item => {
      if (!isRecord(item)) return item
      const rawEvidence = Array.isArray(item.evidence) ? item.evidence : []
      const validEvidence = rawEvidence
        .map(entry => normalizeEvidence(entry, input, { allowMaterializedEvidence: true }))
        .filter(Boolean)
      const safeDimensionId = F1_REPORT_DIMENSION_IDS.includes(item.id) ? item.id : 'unknown'
      if (validEvidence.length !== rawEvidence.length && typeof options.onRepair === 'function') {
        options.onRepair(`REMOVED_UNGROUNDED_EVIDENCE:${safeDimensionId}`)
      }
      if (validEvidence.length > 5 && typeof options.onRepair === 'function') {
        options.onRepair(`TRIMMED_EVIDENCE_LIMIT:${safeDimensionId}`)
      }
      return { ...item, evidence: validEvidence.slice(0, 5) }
    })
  }
  if (Array.isArray(repaired.questionReviews)) {
    repaired.questionReviews = repaired.questionReviews.map(item => {
      if (!isRecord(item)) return item
      const index = Number(item.index)
      const sourceAnswer = input.answers[index - 1]
      if (!sourceAnswer || item.questionId !== sourceAnswer.questionId) return item
      if (!normalizeQuestionAnswerEvidence(item.answerEvidence, sourceAnswer) && typeof options.onRepair === 'function') {
        options.onRepair(`RESTORED_QUESTION_EVIDENCE:${sourceAnswer.questionId}`)
      }
      return { ...item, answerEvidence: sourceAnswer.answer }
    })
  }
  return repaired
}

export function validateF1StructuredReport(value, input, options = {}) {
  const validationIssues = new Set()
  const fail = issue => {
    if (!validationIssues.has(issue)) {
      validationIssues.add(issue)
      if (typeof options.onIssue === 'function') options.onIssue(issue)
    }
    return null
  }

  if (!isRecord(value)) return fail('REPORT_NOT_OBJECT')
  if (value.schemaVersion !== 2 || value.reportType !== 'practice_readiness') fail('REPORT_IDENTITY')
  if (value.criteriaVersion !== input.criteriaVersion) fail('CRITERIA_VERSION')
  if (hasForbiddenClaim(value)) fail('FORBIDDEN_CLAIM')
  const overallScore = cleanScore(value.overallScore)
  const readiness = ['准备较充分', '仍需补充', '建议重点准备'].includes(value.readiness) ? value.readiness : null
  if (overallScore === null) fail('OVERALL_SCORE')
  if (!readiness) fail('READINESS')
  const rawDimensions = Array.isArray(value.dimensions) ? value.dimensions : []
  if (rawDimensions.length !== F1_REPORT_DIMENSION_IDS.length) fail('DIMENSION_COUNT')

  const dimensions = rawDimensions.map(item => {
    if (!isRecord(item) || !F1_REPORT_DIMENSION_IDS.includes(item.id)) return fail('DIMENSION_ID')
    const id = item.id
    const score = cleanScore(item.score)
    const status = ['stable', 'needs_evidence', 'priority'].includes(item.status) ? item.status : null
    const rawEvidence = Array.isArray(item.evidence) ? item.evidence : []
    const evidence = rawEvidence
      .map(entry => normalizeEvidence(entry, input, {
        allowMaterializedEvidence: options.allowMaterializedEvidence === true,
      }))
      .filter(Boolean)
    const rawOfficialRuleIds = cleanStringArray(item.officialRuleIds, 6, 80)
    const officialRuleIds = rawOfficialRuleIds.length === 0
      ? [...DIMENSION_DEFAULT_RULE_IDS[id]]
      : rawOfficialRuleIds.filter(ruleId => F1_OFFICIAL_RULE_IDS.has(ruleId))
    const actions = cleanActionArray(item.actions)
    const summary = cleanText(item.summary, 1_000)
    const reasoning = cleanText(item.reasoning, 1_500)
    let valid = true
    const mark = issue => { valid = false; fail(issue) }
    if (score === null) mark(`DIMENSION_SCORE:${id}`)
    if (!status) mark(`DIMENSION_STATUS:${id}`)
    if (score !== null && status && !hasCalibratedDimensionStatus(status, score)) mark(`DIMENSION_CALIBRATION:${id}`)
    if (rawEvidence.length === 0) mark(`DIMENSION_EVIDENCE_MISSING:${id}`)
    if (rawEvidence.length > 5) mark(`DIMENSION_EVIDENCE_LIMIT:${id}`)
    if (evidence.length !== rawEvidence.length) mark(`DIMENSION_EVIDENCE_UNGROUNDED:${id}`)
    if (officialRuleIds.length === 0 || (rawOfficialRuleIds.length > 0 && officialRuleIds.length !== rawOfficialRuleIds.length)) mark(`DIMENSION_RULE_ID:${id}`)
    if (actions.length === 0) mark(`DIMENSION_ACTIONS:${id}`)
    if (!summary) mark(`DIMENSION_SUMMARY:${id}`)
    if (!reasoning) mark(`DIMENSION_REASONING:${id}`)
    if (!valid) return null
    return {
      id,
      label: DIMENSION_LABELS[id],
      score,
      status,
      summary,
      evidence: evidence.slice(0, 5),
      officialRuleIds,
      reasoning,
      actions,
    }
  })
  const validDimensions = dimensions.filter(Boolean)
  if (new Set(validDimensions.map(item => item.id)).size !== F1_REPORT_DIMENSION_IDS.length) fail('DIMENSION_SET')

  const rawQuestionReviews = Array.isArray(value.questionReviews) ? value.questionReviews : []
  if (rawQuestionReviews.length !== input.answers.length) fail('QUESTION_REVIEW_COUNT')
  const questionReviews = rawQuestionReviews.map((item, position) => {
    if (!isRecord(item)) return fail('QUESTION_REVIEW_SHAPE')
    const index = Number(item.index)
    const sourceAnswer = input.answers[position]
    const score = cleanScore(item.score)
    const verdict = ['complete', 'partial', 'needs_preparation'].includes(item.verdict) ? item.verdict : null
    const answerEvidence = sourceAnswer ? normalizeQuestionAnswerEvidence(item.answerEvidence, sourceAnswer) : null
    const summary = cleanText(item.summary, 800)
    const preparationDirection = cleanText(item.preparationDirection, 1_000)
    const safeQuestionId = sourceAnswer?.questionId || 'unknown'
    let valid = true
    const mark = issue => { valid = false; fail(issue) }
    if (!sourceAnswer || index !== position + 1 || item.questionId !== sourceAnswer.questionId) mark(`QUESTION_REVIEW_ORDER:${index || 'unknown'}`)
    if (score === null) mark(`QUESTION_REVIEW_SCORE:${safeQuestionId}`)
    if (!verdict) mark(`QUESTION_REVIEW_VERDICT:${safeQuestionId}`)
    if (!summary) mark(`QUESTION_REVIEW_SUMMARY:${safeQuestionId}`)
    if (score !== null && verdict && summary && !hasCalibratedQuestionEffect(summary, score, verdict)) mark(`QUESTION_REVIEW_CALIBRATION:${safeQuestionId}`)
    if (!preparationDirection) mark(`QUESTION_REVIEW_DIRECTION:${safeQuestionId}`)
    if (preparationDirection && !preparationDirection.startsWith(NEXT_INQUIRY_PREFIX)) mark(`QUESTION_REVIEW_DIRECTION_PREFIX:${safeQuestionId}`)
    if (!answerEvidence) mark(`QUESTION_REVIEW_EVIDENCE:${safeQuestionId}`)
    if (!valid || !sourceAnswer) return null
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
  const validQuestionReviews = questionReviews.filter(Boolean)
  if (validDimensions.length === F1_REPORT_DIMENSION_IDS.length && overallScore !== null && readiness && !hasCalibratedOverallReadiness(validDimensions, overallScore, readiness)) fail('OVERALL_CALIBRATION')

  const normalizeInsight = item => {
    if (!isRecord(item)) return null
    const rawOfficialRuleIds = cleanStringArray(item.officialRuleIds, 6, 80)
    const officialRuleIds = rawOfficialRuleIds.filter(id => F1_OFFICIAL_RULE_IDS.has(id))
    const evidenceRefs = cleanStringArray(item.evidenceRefs, 6, 80)
    const title = cleanText(item.title, 120)
    const detail = cleanText(item.detail, 1_000)
    const allowedEvidenceRefs = new Set(['profile', ...input.answers.map(answer => answer.questionId)])
    return title && detail && evidenceRefs.length > 0 && evidenceRefs.every(ref => allowedEvidenceRefs.has(ref)) && officialRuleIds.length > 0 && officialRuleIds.length === rawOfficialRuleIds.length ? { title, detail, evidenceRefs, officialRuleIds } : null
  }
  const rawStrengths = Array.isArray(value.strengths) ? value.strengths : []
  const rawPriorities = Array.isArray(value.priorities) ? value.priorities : []
  const strengths = rawStrengths.map(normalizeInsight).filter(Boolean)
  const priorities = rawPriorities.map(normalizeInsight).filter(Boolean)
  if (rawStrengths.length < 1 || rawStrengths.length > 3 || strengths.length !== rawStrengths.length) fail('STRENGTHS')
  if (rawPriorities.length < 1 || rawPriorities.length > 3 || priorities.length !== rawPriorities.length) fail('PRIORITIES')
  const rawActionPlan = Array.isArray(value.actionPlan) ? value.actionPlan : []
  const actionPlan = rawActionPlan.map((item, index) => isRecord(item) ? {
    label: cleanText(item.label, 30) || `STEP ${index + 1}`, title: cleanText(item.title, 150), detail: cleanText(item.detail, 800),
  } : null).filter(item => item?.label && item.title && item.detail)
  if (rawActionPlan.length !== 3 || actionPlan.length !== 3) fail('ACTION_PLAN')

  const headline = cleanText(value.headline, 300)
  const summary = cleanText(value.summary, 1_500)
  if (!headline) fail('HEADLINE')
  if (!summary) fail('SUMMARY')

  if (validationIssues.size > 0) return null

  return {
    schemaVersion: 2,
    reportType: 'practice_readiness',
    analysisMode: options.analysisMode === 'evidence_only' ? 'evidence_only' : 'model',
    criteriaVersion: input.criteriaVersion,
    overallScore,
    readiness,
    headline,
    summary,
    dimensions: validDimensions,
    strengths,
    priorities,
    questionReviews: validQuestionReviews,
    actionPlan,
    disclaimer: '本报告仅用于模拟面签准备，不预测真实签证结果，也不构成法律意见。',
  }
}

const FALLBACK_DIMENSION_GUIDANCE = {
  application_consistency: {
    preferredQuestionIds: ['f1_01', 'f1_04', 'f1_17'],
    gap: '现有信息不足以逐项核对申请表、I-20 与口头回答是否完全一致。',
    action: '对照申请表和 I-20 核对学校、专业、经历与时间线。',
  },
  study_authenticity: {
    preferredQuestionIds: ['f1_03', 'f1_05', 'f1_06'],
    gap: '本次交流未形成足够信息来完整判断学习目的与选校动机。',
    action: '补充基于真实经历的选校、选专业原因及具体学习目标。',
  },
  academic_plan: {
    preferredQuestionIds: ['f1_04', 'f1_05', 'f1_06', 'f1_07', 'f1_08'],
    gap: '现有信息不足以串联既往背景、课程计划与毕业后的实际用途。',
    action: '按“既往背景—学习需求—课程计划—毕业后用途”补齐事实链。',
  },
  financial_capacity: {
    preferredQuestionIds: ['f1_12', 'f1_13', 'f1_14', 'f1_15'],
    gap: '本次交流未充分覆盖总费用、资助来源、收入或资金证明之间的对应关系。',
    action: '核对总费用、资助人、收入与可用资金，并只陈述真实数字。',
  },
  departure_intent: {
    preferredQuestionIds: ['f1_11', 'f1_15', 'f1_16'],
    gap: '现有信息不足以具体说明完成学业后的当前离美意图与发展路径。',
    action: '说明当前真实的毕业后计划及其与学习项目的联系。',
  },
  overall_credibility: {
    preferredQuestionIds: ['f1_01', 'f1_11', 'f1_12', 'f1_17'],
    gap: '现有信息可用于复盘，但不足以完成全部回答之间的交叉一致性判断。',
    action: '逐题核对人物、时间、金额和原因，修正前后不一致之处。',
  },
}

export function buildDeterministicF1FallbackReport(input) {
  const catalog = buildF1EvidenceCatalog(input)
  const answerEvidence = catalog.filter(item => item.source === 'answer')
  const firstEvidence = answerEvidence[0] || catalog[0]
  const materialize = item => ({ source: item.source, reference: item.reference, quote: item.quote })
  const selectEvidence = preferredQuestionIds => (
    preferredQuestionIds
      .map(questionId => answerEvidence.find(item => item.reference === questionId))
      .find(Boolean)
    || firstEvidence
  )
  const dimensions = F1_REPORT_DIMENSION_IDS.map(id => {
    const guidance = FALLBACK_DIMENSION_GUIDANCE[id]
    const evidence = selectEvidence(guidance.preferredQuestionIds)
    return {
      id,
      label: DIMENSION_LABELS[id],
      score: 50,
      status: 'needs_evidence',
      summary: guidance.gap,
      evidence: [materialize(evidence)],
      officialRuleIds: [...DIMENSION_DEFAULT_RULE_IDS[id]],
      reasoning: `仅依据本次原始回答保留可核验事实；${guidance.gap}`,
      actions: [guidance.action],
    }
  })
  const primaryReference = firstEvidence.source === 'answer' ? firstEvidence.reference : 'profile'
  return {
    schemaVersion: 2,
    reportType: 'practice_readiness',
    analysisMode: 'evidence_only',
    criteriaVersion: input.criteriaVersion,
    overallScore: 50,
    readiness: '仍需补充',
    headline: '本次问答已完整保留，请围绕关键事实继续补充和核对。',
    summary: '以下反馈仅依据本次模拟面签中的背景与原始回答生成；无法可靠判断的部分已明确标注信息缺口。',
    dimensions,
    strengths: [{
      title: '已形成可复盘的原始回答',
      detail: `本轮保留了 ${input.answers.length} 条有效回答，可逐题核对事实和表达。`,
      evidenceRefs: [primaryReference],
      officialRuleIds: ['FAM_PRESENT_INTENT_CALIBRATION'],
    }],
    priorities: [{
      title: '补齐关键事实链并核对一致性',
      detail: '优先核对学校与专业、学习计划、费用与资助、毕业后计划之间是否前后一致。',
      evidenceRefs: [primaryReference],
      officialRuleIds: ['DOS_ACADEMIC_PREPARATION', 'DOS_FINANCIAL_CAPACITY', 'DOS_DEPARTURE_INTENT'],
    }],
    questionReviews: input.answers.map(answer => ({
      index: answer.index,
      questionId: answer.questionId,
      score: 50,
      verdict: 'needs_preparation',
      summary: '尚未建立：当前仅保留原始回答，证据模式无法确认其是否完整回应本题。',
      answerEvidence: answer.answer,
      strengths: ['回答内容已完整保留，可据此继续复盘。'],
      improvements: ['核对是否直接回答问题，并补充问题所需的真实人物、时间、金额或原因。'],
      preparationDirection: '下一步核查：确认本题对应的签证要件，再核对回答中的真实人物、时间、金额或原因。',
    })),
    actionPlan: [
      { label: 'STEP 1', title: '逐题核对事实', detail: '把每个回答与申请表、I-20 和真实经历逐项核对。' },
      { label: 'STEP 2', title: '补齐关键链路', detail: '补充学习目的、资金来源和毕业后计划中尚未说明的事实。' },
      { label: 'STEP 3', title: '再次模拟验证', detail: '用简洁口语重新回答，并检查前后信息是否一致。' },
    ],
    disclaimer: '本报告仅用于模拟面签准备，不预测真实签证结果，也不构成法律意见。',
  }
}

export function buildF1ReportMessages(input, repairContext = '') {
  const evidenceCatalog = buildF1EvidenceCatalog(input)
  const messages = [
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
        issues: Array.isArray(repairContext?.issues) ? repairContext.issues.filter(Boolean) : [],
        draft: isRecord(repairContext?.draft) ? repairContext.draft : null,
      }
  if (repair.issues.length > 0) {
    if (repair.draft) messages.push({ role: 'assistant', content: JSON.stringify(repair.draft) })
    messages.push({
      role: 'user',
      content: `The preceding report draft was rejected by the strict machine validator. This is a defect in the report draft, not a defect in the applicant's answers. Fix every listed issue and return the entire corrected JSON object; do not merely explain the errors. Validation issues: ${JSON.stringify(repair.issues)}. Preserve every section and dimension not implicated by those issues; repair only the invalid or missing parts. Use only exact evidenceId values from evidenceCatalog, keep all six unique dimensions, keep every question review in input order, use only allowed officialRuleIds, include 1-3 strengths and priorities, and include exactly three action-plan items. Enforce the four question-effect prefixes with their score/verdict bands, begin every preparationDirection with “下一步核查：”, and keep dimension and overall calibration consistent. If information is insufficient, use “尚未建立：” or needs_evidence rather than creating a negative finding. Do not change a score merely because the previous draft failed validation.`,
    })
  }
  return messages
}

export function getModelMessageContent(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null
  const first = payload.choices[0]
  return isRecord(first) && isRecord(first.message) && typeof first.message.content === 'string' ? first.message.content : null
}
