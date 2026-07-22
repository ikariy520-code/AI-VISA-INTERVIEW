import {
  B2_OFFICIAL_CRITERIA,
  B2_OFFICIAL_CRITERIA_VERSION,
  B2_OFFICIAL_RULE_IDS,
} from './b2OfficialCriteria.mjs'

const DIMENSION_IDS = ['application_consistency', 'visit_purpose', 'itinerary_duration', 'funding_coherence', 'temporary_visit_plan', 'overall_credibility']
const DIMENSION_LABELS = {
  application_consistency: 'DS-160 摘要与回答一致性',
  visit_purpose: '访问目的清晰度',
  itinerary_duration: '行程与停留时间合理性',
  funding_coherence: '费用与资金安排一致性',
  temporary_visit_plan: '临时访问与结束后安排',
  overall_credibility: '整体信息完整性与可信度',
}
const DEFAULT_RULES = {
  application_consistency: ['DOS_DS160_ACCURACY'],
  visit_purpose: ['FAM_B2_LEGITIMATE_PURPOSE'],
  itinerary_duration: ['FAM_B2_LIMITED_DURATION', 'FAM_B2_REALISTIC_PLAN'],
  funding_coherence: ['FAM_B2_EXPENSES'],
  temporary_visit_plan: ['FAM_B2_RESIDENCE_ABROAD', 'FAM_B2_REALISTIC_PLAN'],
  overall_credibility: ['DOS_DS160_ACCURACY', 'FAM_B2_REALISTIC_PLAN'],
}
const IDENTIFIERS = [
  [/\bAA\d{8}\b/gi, '[REDACTED_DS160_ID]'],
  [/\b[A-Z]{1,3}\d{7,10}\b/gi, '[REDACTED_PASSPORT]'],
  [/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]'],
  [/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '[REDACTED_PHONE]'],
  [/\b\d{15,19}\b/g, '[REDACTED_ACCOUNT]'],
]

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const cleanArray = (value, count, length) => Array.isArray(value) ? value.map(item => cleanText(item, length)).filter(Boolean).slice(0, count) : []
const redact = value => IDENTIFIERS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)

export function sanitizeB2ReportRequest(value) {
  if (!isRecord(value) || value.visaType !== 'B2' || !Array.isArray(value.answers)) return null
  const context = isRecord(value.safeContext) ? value.safeContext : {}
  const serialized = redact(JSON.stringify(context))
  if (serialized.length > 12_000) return null
  const raw = value.answers.slice(0, 12)
  const answers = raw.map((item, offset) => {
    if (!isRecord(item)) return null
    const answer = {
      index: Number(item.index),
      questionId: cleanText(item.questionId, 20),
      question: redact(cleanText(item.question, 1_000)),
      answer: redact(cleanText(item.answer, 4_000)),
      timestamp: cleanText(item.timestamp, 20) || '00:00',
    }
    if (answer.index !== offset + 1 || !/^b2_(0[1-9]|1\d|2[0-4])$/.test(answer.questionId) || !answer.question || !answer.answer) return null
    return answer
  }).filter(Boolean)
  if (!answers.length || answers.length !== raw.length) return null
  return { visaType: 'B2', criteriaVersion: B2_OFFICIAL_CRITERIA_VERSION, safeContext: JSON.parse(serialized), answers }
}

function grounded(item, input) {
  if (!isRecord(item)) return false
  const quote = cleanText(item.quote, 500)
  if (!quote) return false
  if (item.source === 'profile') return item.reference === 'profile' && JSON.stringify(input.safeContext).includes(quote)
  if (item.source === 'answer') return Boolean(input.answers.find(answer => answer.questionId === item.reference)?.answer.includes(quote))
  return false
}

export function validateB2StructuredReport(value, input, options = {}) {
  const issue = code => { options.onIssue?.(code); return null }
  if (!isRecord(value) || value.schemaVersion !== 2 || value.reportType !== 'b2_practice_readiness') return issue('REPORT_IDENTITY')
  if (value.criteriaVersion !== input.criteriaVersion) return issue('CRITERIA_VERSION')
  if (/过签率|获签概率|保证.{0,8}(?:获签|过签)|一定.{0,8}(?:获签|拒签)|will be (?:approved|refused)|approval (?:chance|probability)/i.test(JSON.stringify(value))) return issue('FORBIDDEN_CLAIM')
  const mode = options.analysisMode === 'evidence_only' || value.analysisMode === 'evidence_only' ? 'evidence_only' : value.analysisMode === 'model' ? 'model' : null
  const score = Number(value.overallScore)
  if (!mode || !Number.isFinite(score) || score < 0 || score > 100) return issue('OVERALL_SCORE')
  if (!['准备较充分', '仍需补充', '建议重点准备'].includes(value.readiness)) return issue('READINESS')
  if (!Array.isArray(value.dimensions) || value.dimensions.length !== DIMENSION_IDS.length) return issue('DIMENSION_COUNT')
  const dimensions = value.dimensions.map(item => {
    if (!isRecord(item) || !DIMENSION_IDS.includes(item.id)) return null
    const itemScore = Number(item.score)
    const evidence = Array.isArray(item.evidence) ? item.evidence.slice(0, 6) : []
    const ruleIds = Array.isArray(item.officialRuleIds) ? item.officialRuleIds.filter(id => B2_OFFICIAL_RULE_IDS.has(id)).slice(0, 6) : []
    if (!Number.isFinite(itemScore) || itemScore < 0 || itemScore > 100 || !['stable', 'needs_evidence', 'priority'].includes(item.status)
      || !evidence.length || !evidence.every(evidenceItem => grounded(evidenceItem, input)) || !ruleIds.length) return null
    return { id: item.id, label: cleanText(item.label, 80), score: Math.round(itemScore), status: item.status, summary: cleanText(item.summary, 700), evidence, officialRuleIds: ruleIds, reasoning: cleanText(item.reasoning, 1_000), actions: cleanArray(item.actions, 5, 500) }
  })
  if (dimensions.some(item => !item) || new Set(dimensions.map(item => item.id)).size !== DIMENSION_IDS.length) return issue('DIMENSION_SET')
  if (!Array.isArray(value.questionReviews) || value.questionReviews.length !== input.answers.length) return issue('QUESTION_REVIEW_COUNT')
  const questionReviews = value.questionReviews.map((item, offset) => {
    const answer = input.answers[offset]
    if (!isRecord(item) || Number(item.index) !== answer.index || item.questionId !== answer.questionId) return null
    const itemScore = Number(item.score)
    const answerEvidence = cleanText(item.answerEvidence, 500)
    if (!Number.isFinite(itemScore) || itemScore < 0 || itemScore > 100 || !answer.answer.includes(answerEvidence)
      || !['complete', 'partial', 'needs_preparation'].includes(item.verdict)) return null
    return { index: answer.index, questionId: answer.questionId, score: Math.round(itemScore), verdict: item.verdict, summary: cleanText(item.summary, 700), answerEvidence, strengths: cleanArray(item.strengths, 4, 400), improvements: cleanArray(item.improvements, 4, 400), preparationDirection: cleanText(item.preparationDirection, 700) }
  })
  if (questionReviews.some(item => !item)) return issue('QUESTION_REVIEW_SET')
  const insights = items => Array.isArray(items) ? items.slice(0, 4).flatMap(item => {
    if (!isRecord(item)) return []
    const evidenceRefs = cleanArray(item.evidenceRefs, 6, 50).filter(ref => ref.startsWith('profile:') || input.answers.some(answer => ref === `answer:${answer.questionId}`))
    const officialRuleIds = Array.isArray(item.officialRuleIds) ? item.officialRuleIds.filter(id => B2_OFFICIAL_RULE_IDS.has(id)).slice(0, 6) : []
    const title = cleanText(item.title, 100); const detail = cleanText(item.detail, 700)
    return title && detail && evidenceRefs.length ? [{ title, detail, evidenceRefs, officialRuleIds }] : []
  }) : []
  const actionPlan = Array.isArray(value.actionPlan) ? value.actionPlan.slice(0, 5).flatMap(item => isRecord(item) ? [{ label: cleanText(item.label, 40), title: cleanText(item.title, 100), detail: cleanText(item.detail, 700) }] : []) : []
  if (!cleanText(value.headline, 300) || !cleanText(value.summary, 1_500) || !actionPlan.length) return issue('REPORT_CONTENT')
  return {
    schemaVersion: 2, reportType: 'b2_practice_readiness', analysisMode: mode, criteriaVersion: input.criteriaVersion,
    overallScore: Math.round(score), readiness: value.readiness, headline: cleanText(value.headline, 300), summary: cleanText(value.summary, 1_500),
    dimensions, strengths: insights(value.strengths), priorities: insights(value.priorities), questionReviews, actionPlan,
    disclaimer: cleanText(value.disclaimer, 700) || '本报告仅用于模拟面签准备，不预测签证结果，也不替代美国政府决定或专业法律意见。',
  }
}

export function buildB2ReportMessages(input, repairContext = '') {
  const schema = {
    schemaVersion: 2, reportType: 'b2_practice_readiness', analysisMode: 'model', criteriaVersion: input.criteriaVersion,
    overallScore: 0, readiness: '仍需补充', headline: '', summary: '',
    dimensions: DIMENSION_IDS.map(id => ({ id, label: DIMENSION_LABELS[id], score: 0, status: 'needs_evidence', summary: '', evidence: [{ source: 'answer', reference: 'b2_01', quote: '必须逐字来自对应回答' }], officialRuleIds: DEFAULT_RULES[id], reasoning: '', actions: [] })),
    strengths: [], priorities: [],
    questionReviews: input.answers.map(answer => ({ index: answer.index, questionId: answer.questionId, score: 0, verdict: 'partial', summary: '', answerEvidence: '必须逐字来自本题回答', strengths: [], improvements: [], preparationDirection: '' })),
    actionPlan: [{ label: '下一步', title: '', detail: '' }],
    disclaimer: '本报告仅用于模拟面签准备，不预测签证结果，也不替代美国政府决定或专业法律意见。',
  }
  const system = `你是B-2旅游签证模拟面签的证据约束分析器。只能依据提供的脱敏资料、实际问答和官方规则。不得预测获签、拒签或通过率；不得建议隐瞒、修改或编造事实；不得因回答简短、口语化、词汇简单而扣分；不得把房产或某一种家庭关系当作必要条件。每项重要判断必须引用资料或回答中的原文，并关联适用的官方规则。信息缺失只能标记为需要补充，不能推断不利事实。只输出符合给定结构的JSON。`
  const user = JSON.stringify({ task: '生成中文B-2模拟面签准备报告', outputSchema: schema, officialCriteria: B2_OFFICIAL_CRITERIA, input })
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }]
  if (repairContext) messages.push({ role: 'user', content: `上一次输出未通过校验。请完整重做JSON，并修复这些问题：${JSON.stringify(repairContext)}` })
  return messages
}

export function buildDeterministicB2FallbackReport(input) {
  const first = input.answers[0]
  const evidence = first
    ? [{ source: 'answer', reference: first.questionId, quote: first.answer }]
    : [{ source: 'profile', reference: 'profile', quote: Object.values(input.safeContext).find(value => typeof value === 'string' && value.length > 1) || 'B2' }]
  return {
    schemaVersion: 2, reportType: 'b2_practice_readiness', analysisMode: 'evidence_only', criteriaVersion: input.criteriaVersion,
    overallScore: 0, readiness: '仍需补充', headline: '本次问答已完成基础证据整理。', summary: '模型报告未通过证据校验，因此只保留真实问答和核对方向，不生成推测性分数。',
    dimensions: DIMENSION_IDS.map(id => ({ id, label: DIMENSION_LABELS[id], score: 0, status: 'needs_evidence', summary: '请根据本次真实资料和回答继续核对。', evidence, officialRuleIds: DEFAULT_RULES[id], reasoning: '当前仅保留可验证证据，不作推测性判断。', actions: ['核对相关DS-160摘要与实际回答是否一致。'] })),
    strengths: [], priorities: [],
    questionReviews: input.answers.map(answer => ({ index: answer.index, questionId: answer.questionId, score: 0, verdict: 'partial', summary: '本题已保留真实回答，暂不生成推测性评价。', answerEvidence: answer.answer, strengths: [], improvements: [], preparationDirection: '核对回答与DS-160摘要是否一致，并准备说明真实情况。' })),
    actionPlan: [{ label: '核对', title: '检查资料和回答一致性', detail: '逐项核对本次回答与DS-160摘要，只修正错误或遗漏，不改变真实事实。' }],
    disclaimer: '本报告仅用于模拟面签准备，不预测签证结果，也不替代美国政府决定或专业法律意见。',
  }
}
