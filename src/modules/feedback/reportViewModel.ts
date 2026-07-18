import type { InterviewSession, QAPair } from './types'
import { F1_OFFICIAL_CRITERIA } from '../practice/data/f1OfficialCriteria'

export type ReportSource = 'sample' | 'deepseek' | 'doubao' | 'hybrid' | 'local' | 'unavailable'

export interface ReportDimension {
  id: string
  label: string
  score: number
  status: '稳固' | '需补充' | '优先改进'
  summary: string
  evidence: string
  officialSources?: Array<{ title: string; url: string }>
}

export interface ReportInsight {
  title: string
  detail: string
}

export interface QuestionReview {
  id: string
  question: string
  answer: string
  score: number | null
  verdict: '回答有效' | '基本回答' | '需要重答' | '待分析'
  summary: string
  didWell: string[]
  improve: string[]
  betterAnswer: string
}

export interface PracticeStep {
  label: string
  title: string
  detail: string
}

export interface FeedbackReport {
  id: string
  source: ReportSource
  title: string
  subtitle: string
  date: string
  time: string
  duration: string
  questionCount: number
  profile: string
  evaluationLabel: string
  dimensionIntro: string
  overallScore: number | null
  readiness: string
  headline: string
  summary: string
  dimensions: ReportDimension[]
  strengths: ReportInsight[]
  priorities: ReportInsight[]
  questionReviews: QuestionReview[]
  actionPlan: PracticeStep[]
  policyVersion?: string
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizedText(value: unknown, fallback = '', maxLength = 2_000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || fallback : fallback
}

function normalizedScore(value: unknown, fallback = 50) {
  const score = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : fallback
}

function normalizedStrings(value: unknown, maxItems: number) {
  return Array.isArray(value)
    ? value.map(item => normalizedText(item, '', 1_000)).filter(Boolean).slice(0, maxItems)
    : []
}

export function normalizeFeedbackReport(value: unknown): FeedbackReport | null {
  if (!isRecord(value)) return null
  const rawDimensions = Array.isArray(value.dimensions) ? value.dimensions : []
  const rawReviews = Array.isArray(value.questionReviews) ? value.questionReviews : []
  if (rawDimensions.length !== 6 || rawReviews.length === 0) return null

  const dimensions = rawDimensions.map(item => {
    if (!isRecord(item)) return null
    const score = normalizedScore(item.score)
    return {
      id: normalizedText(item.id, '', 60),
      label: normalizedText(item.label, '', 60),
      score,
      status: (['稳固', '需补充', '优先改进'].includes(String(item.status))
        ? item.status
        : score >= 80 ? '稳固' : score >= 65 ? '需补充' : '优先改进') as ReportDimension['status'],
      summary: normalizedText(item.summary, '本次对话证据不足。', 1_000),
      evidence: normalizedText(item.evidence, '本次对话证据不足', 1_200),
    }
  }).filter((item): item is ReportDimension => item !== null && Boolean(item.id && item.label))
  if (dimensions.length !== 6) return null

  const normalizeInsights = (raw: unknown, fallbackTitle: string): ReportInsight[] => (
    Array.isArray(raw) ? raw : []
  ).map(item => {
    if (!isRecord(item)) return null
    return {
      title: normalizedText(item.title, fallbackTitle, 120),
      detail: normalizedText(item.detail, '本次对话证据不足。', 800),
    }
  }).filter((item): item is ReportInsight => item !== null).slice(0, 3)

  const questionReviews = rawReviews.map<QuestionReview | null>((item, index) => {
    if (!isRecord(item)) return null
    const score = normalizedScore(item.score, 55)
    const verdict = ['回答有效', '基本回答', '需要重答'].includes(String(item.verdict))
      ? item.verdict as QuestionReview['verdict']
      : score >= 80 ? '回答有效' : score >= 60 ? '基本回答' : '需要重答'
    return {
      id: normalizedText(item.id, `q${index + 1}`, 100),
      question: normalizedText(item.question, '', 4_000),
      answer: normalizedText(item.answer, '', 8_000),
      score,
      verdict,
      summary: normalizedText(item.summary, '本次回答需要进一步具体化。', 1_000),
      didWell: normalizedStrings(item.didWell, 3),
      improve: normalizedStrings(item.improve, 4),
      betterAnswer: normalizedText(item.betterAnswer, '请使用你的真实信息重新组织回答。', 2_000),
    }
  }).filter((item): item is QuestionReview => item !== null && Boolean(item.question && item.answer))
  if (questionReviews.length === 0) return null

  const rawPlan = Array.isArray(value.actionPlan) ? value.actionPlan : []
  const actionPlan = rawPlan.map((item, index) => {
    if (!isRecord(item)) return null
    return {
      label: normalizedText(item.label, `第 ${index + 1} 步`, 40),
      title: normalizedText(item.title, '继续练习', 160),
      detail: normalizedText(item.detail, '使用真实信息完成下一轮重答。', 800),
    }
  }).filter((item): item is PracticeStep => item !== null).slice(0, 3)
  if (actionPlan.length !== 3) return null

  const source = ['deepseek', 'doubao', 'hybrid', 'local', 'sample', 'unavailable'].includes(String(value.source))
    ? value.source as ReportSource
    : 'deepseek'

  return {
    id: normalizedText(value.id, `report-${Date.now()}`, 120),
    source,
    title: normalizedText(value.title, '美国签证模拟面签', 200),
    subtitle: normalizedText(value.subtitle, 'AI 模拟面签表现报告', 120),
    date: normalizedText(value.date, '本次练习', 40),
    time: normalizedText(value.time, '', 40),
    duration: normalizedText(value.duration, '00:00', 20),
    questionCount: Math.max(0, Math.round(Number(value.questionCount) || questionReviews.length)),
    profile: normalizedText(value.profile, '基于本次面签对话', 100),
    evaluationLabel: normalizedText(value.evaluationLabel, 'Interview evaluation', 100),
    dimensionIntro: normalizedText(value.dimensionIntro, '依据本次回答进行综合评估。', 500),
    overallScore: normalizedScore(value.overallScore),
    readiness: normalizedText(value.readiness, '需要补强', 60),
    headline: normalizedText(value.headline, '本次反馈已经生成。', 500),
    summary: normalizedText(value.summary, '本报告不预测真实签证结果。', 1_500),
    dimensions,
    strengths: normalizeInsights(value.strengths, '相对稳定项'),
    priorities: normalizeInsights(value.priorities, '优先改进项'),
    questionReviews,
    actionPlan,
    policyVersion: normalizedText(value.policyVersion, '', 80) || undefined,
  }
}

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

const average = (values: number[], fallback = 3) => (
  values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : fallback
)

const dimensionStatus = (score: number): ReportDimension['status'] => {
  if (score >= 80) return '稳固'
  if (score >= 65) return '需补充'
  return '优先改进'
}

const officialRuleMap = new Map(F1_OFFICIAL_CRITERIA.map(rule => [rule.id, rule]))

function buildStructuredFeedbackReport(session: InterviewSession): FeedbackReport | null {
  const report = session.structuredReport
  if (!report) return null
  return {
    id: session.id,
    source: 'deepseek',
    title: session.title,
    subtitle: '模拟面签证据报告',
    date: session.date,
    time: session.time,
    duration: session.duration,
    questionCount: session.transcript.length,
    profile: `DeepSeek 约束分析 · 官方依据 ${report.criteriaVersion}`,
    evaluationLabel: 'F-1 evidence review',
    dimensionIntro: '根据脱敏背景、实际回答和当前版本的美国国务院公开依据检查准备情况。',
    overallScore: report.overallScore,
    readiness: report.readiness,
    headline: report.headline,
    summary: report.summary,
    dimensions: report.dimensions.map(dimension => ({
      id: dimension.id,
      label: dimension.label,
      score: dimension.score,
      status: dimension.status === 'stable' ? '稳固' : dimension.status === 'needs_evidence' ? '需补充' : '优先改进',
      summary: dimension.summary,
      evidence: [
        ...dimension.evidence.map(item => `依据：${item.quote}`),
        ...dimension.officialRuleIds.map(id => officialRuleMap.get(id)?.title).filter(Boolean).map(title => `官方依据：${title}`),
        `判断：${dimension.reasoning}`,
      ].join(' '),
      officialSources: dimension.officialRuleIds
        .map(id => officialRuleMap.get(id))
        .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
        .map(rule => ({ title: rule.title, url: rule.url })),
    })),
    strengths: report.strengths.map(item => ({ title: item.title, detail: item.detail })),
    priorities: report.priorities.map(item => ({ title: item.title, detail: item.detail })),
    questionReviews: report.questionReviews.map(review => {
      const qa = session.transcript[review.index - 1]
      return {
        id: qa?.id ?? `q${review.index}`,
        question: qa?.question ?? review.questionId,
        answer: qa?.answer ?? review.answerEvidence,
        score: review.score,
        verdict: review.verdict === 'complete' ? '回答有效' : review.verdict === 'partial' ? '基本回答' : '需要重答',
        summary: review.summary,
        didWell: review.strengths.length > 0 ? review.strengths : ['本题已经留下可供复盘的真实回答。'],
        improve: review.improvements.length > 0 ? review.improvements : ['根据报告指出的证据缺口继续准备真实信息。'],
        betterAnswer: review.preparationDirection,
      } satisfies QuestionReview
    }),
    actionPlan: report.actionPlan,
  }
}

function buildUnavailableFeedbackReport(session: InterviewSession): FeedbackReport {
  return {
    id: session.id,
    source: 'unavailable',
    title: session.title,
    subtitle: '本次面签问答记录',
    date: session.date,
    time: session.time,
    duration: session.duration,
    questionCount: session.transcript.length,
    profile: 'DeepSeek 综合分析暂不可用',
    evaluationLabel: 'Transcript only',
    dimensionIntro: '为避免产生没有依据的判断，本页不显示本地推测性评分。',
    overallScore: null,
    readiness: '等待重新分析',
    headline: '本次问答已经保留，但综合分析暂时没有完成。',
    summary: '你仍可查看本次问题和回答；请稍后重新练习，或在服务恢复后重新生成报告。',
    dimensions: [],
    strengths: [],
    priorities: [],
    questionReviews: session.transcript.map(qa => ({
      id: qa.id,
      question: qa.question,
      answer: qa.answer,
      score: null,
      verdict: '待分析',
      summary: 'DeepSeek 综合分析暂不可用，本题暂不生成评价。',
      didWell: [],
      improve: [],
      betterAnswer: '请保留自己的真实回答；当前没有生成参考方向。',
    })),
    actionPlan: [],
  }
}

function answerScore(qa: QAPair) {
  return clampScore(average(qa.feedback.content.dimensions.map(item => item.score)) * 20)
}

function collectScores(session: InterviewSession, labels: string[]) {
  return session.transcript.flatMap(qa => qa.feedback.content.dimensions
    .filter(item => labels.some(label => item.label.includes(label)))
    .map(item => item.score))
}

function makeLiveDimension(
  session: InterviewSession,
  id: string,
  label: string,
  sourceLabels: string[],
  fallbackScore: number,
  summary: string,
  evidence: string,
): ReportDimension {
  const values = collectScores(session, sourceLabels)
  const score = clampScore(average(values, fallbackScore / 20) * 20)
  return { id, label, score, status: dimensionStatus(score), summary, evidence }
}

function buildLiveQuestionReview(qa: QAPair): QuestionReview {
  const score = answerScore(qa)
  const strongComments = qa.feedback.content.dimensions
    .filter(item => item.score >= 4)
    .map(item => item.comment)
    .filter(Boolean)
  const weakComments = qa.feedback.content.dimensions
    .filter(item => item.score <= 3)
    .map(item => item.comment)
    .filter(Boolean)
  const improvements = [...weakComments, ...qa.feedback.content.suggestions].filter(Boolean).slice(0, 3)

  return {
    id: qa.id,
    question: qa.question,
    answer: qa.answer,
    score,
    verdict: qa.feedback.verdict === 'favorable'
      ? '回答有效'
      : qa.feedback.verdict === 'unfavorable' ? '需要重答' : '基本回答',
    summary: qa.feedback.content.summary,
    didWell: strongComments.length > 0 ? strongComments.slice(0, 2) : ['已经对面签官的问题作出直接回应。'],
    improve: improvements.length > 0
      ? improvements
      : ['保留当前直接回答的方式，再补充一个与申请目标有关的具体事实。'],
    betterAnswer: '请只使用你的真实信息，按“先给直接结论—补充两个可核验细节—说明与申请目标的关系”重新组织为 20–30 秒的回答。',
  }
}

export function buildFeedbackReport(session: InterviewSession): FeedbackReport {
  if (session.analysisSource === 'unavailable') return buildUnavailableFeedbackReport(session)
  const structured = buildStructuredFeedbackReport(session)
  if (structured) return structured
  const overallScore = clampScore((session.overallScore ?? 3) * 20)
  const isF1 = /\bF[\s-]?1\b/i.test(session.title)
  const dimensions = isF1
    ? [
        makeLiveDimension(session, 'eligibility', '身份资格', ['逻辑', '具体'], overallScore, '检查学校、项目、I-20 与 SEVIS 信息是否清楚一致。', '当前版本根据逐题回答的清晰度与具体性生成初步结果。'),
        makeLiveDimension(session, 'authenticity', '学习真实性', ['逻辑', '说服'], overallScore, '判断为什么读、为什么现在读、为什么选择该项目是否可信。', '重点查看学习动机是否具体，回答之间是否相互支持。'),
        makeLiveDimension(session, 'academic', '学术匹配', ['逻辑', '具体'], overallScore, '检查既往背景、课程选择与未来学习计划能否连成一条线。', '重点查看背景与项目之间是否给出了具体联系。'),
        makeLiveDimension(session, 'funding', '资金能力', ['具体'], overallScore, '核对资助人、收入来源与费用覆盖是否说得具体。', '资金结论需要金额、来源和持续性共同支撑。'),
        makeLiveDimension(session, 'ties', '回国计划', ['约束'], overallScore, '判断毕业后的职业路径与非移民意图是否明确合理。', '重点查看回国后的岗位、行业与个人资源是否具体。'),
        makeLiveDimension(session, 'risk', '风险与一致性', ['逻辑', '说服'], overallScore, '检查前后矛盾、过度强调 OPT、移民倾向及信息失真风险。', '当前仅依据本次转写内容做一致性提醒，不等同于真实签证结论。'),
      ]
    : [
        makeLiveDimension(session, 'purpose', '出行目的', ['逻辑', '具体'], overallScore, '检查访问目的是否直接、可信且与申请类型一致。', '重点查看行程目的有没有清楚的事实支撑。'),
        makeLiveDimension(session, 'plan', '行程计划', ['具体'], overallScore, '检查时间、地点、同行人和安排是否说得具体。', '行程回答需要与表格和材料保持一致。'),
        makeLiveDimension(session, 'funding', '资金能力', ['具体', '说服'], overallScore, '核对费用由谁承担以及收入、存款能否覆盖行程。', '避免只用“足够”描述资金，优先给出真实来源。'),
        makeLiveDimension(session, 'ties', '回国约束', ['约束'], overallScore, '检查工作、家庭、学业或资产等回国约束是否清楚。', '重点查看回国时间与现有责任是否形成合理闭环。'),
        makeLiveDimension(session, 'consistency', '信息一致性', ['逻辑'], overallScore, '检查各轮回答是否前后一致并与申请材料相符。', '当前仅依据本次转写内容提示潜在矛盾。'),
        makeLiveDimension(session, 'delivery', '表达效率', ['逻辑', '说服'], overallScore, '检查回答是否直接、简洁并包含必要细节。', '真实面签中应先回答问题，再补充最有用的事实。'),
      ]

  const sorted = [...dimensions].sort((a, b) => b.score - a.score)
  const top = sorted.slice(0, 2)
  const bottom = sorted.slice(-2).reverse()

  return {
    id: session.id,
    source: session.analysisSource ?? 'local',
    title: session.title,
    subtitle: '模拟面签表现报告',
    date: session.date,
    time: session.time,
    duration: session.duration,
    questionCount: session.transcript.length,
    profile: '基于本次面签对话',
    evaluationLabel: isF1 ? 'F-1 evaluation' : 'Interview evaluation',
    dimensionIntro: isF1
      ? '依据本次回答检查身份、学习、学术、资金、回国计划与风险一致性。'
      : '依据本次回答检查出行目的、计划、资金、回国约束、信息一致性与表达效率。',
    overallScore,
    readiness: overallScore >= 80 ? '整体稳定' : overallScore >= 65 ? '接近就绪' : '需要补强',
    headline: overallScore >= 80
      ? '主要信息已经能够稳定表达，下一步是压缩回答并保持一致。'
      : overallScore >= 65
        ? '核心问题能够回应，但部分关键信息还不够具体。'
        : '当前回答存在明显薄弱项，建议先完成重点问题的重答训练。',
    summary: '报告只评估本次模拟中的表达与信息一致性，用于确定下一轮练习重点，不预测真实签证结果。',
    dimensions,
    strengths: top.map(item => ({ title: item.label, detail: `${item.summary} 本次初步得分 ${item.score}。` })),
    priorities: bottom.map(item => ({ title: item.label, detail: `${item.evidence} 下一轮应优先补齐。` })),
    questionReviews: session.transcript.map(buildLiveQuestionReview),
    actionPlan: [
      { label: '第 1 步', title: `先补齐「${bottom[0]?.label ?? '薄弱项'}」证据`, detail: '把真实的名称、时间、金额、课程或职业路径写成要点，避免临场编造。' },
      { label: '第 2 步', title: '重答低分问题', detail: '先直接回答当前问题；只有问题本身需要时，再补充最相关的真实事实。' },
      { label: '第 3 步', title: '做一次一致性复核', detail: '对照 DS-160、I-20 和资金材料，确保学校、专业、费用与毕业计划前后一致。' },
    ],
  }
}

export const sampleFeedbackReport: FeedbackReport = {
  id: 'sample-f1-report',
  source: 'sample',
  title: 'F-1 学生签证',
  subtitle: '模拟面签反馈样例',
  date: '样例报告',
  time: '仅用于预览',
  duration: '06:42',
  questionCount: 8,
  profile: '标准型面签官 · 中等难度',
  evaluationLabel: 'F-1 evaluation',
  dimensionIntro: '依据本次回答检查身份、学习、学术、资金、回国计划与风险一致性。',
  overallScore: 72,
  readiness: '接近就绪',
  headline: '学习动机基本清楚，但资金来源和毕业后的回国路径还不够具体。',
  summary: '你能直接回答多数问题，也能说明专业方向。当前练习重点是核对完整资金链，并让毕业后的职业路径与学习计划相互支持。',
  dimensions: [
    { id: 'eligibility', label: '身份资格', score: 86, status: '稳固', summary: '能够说清学校、项目和开学时间。', evidence: '学校与项目名称前后一致，I-20 信息表达清楚。' },
    { id: 'authenticity', label: '学习真实性', score: 78, status: '需补充', summary: '学习目的合理，但“为什么现在读”还比较笼统。', evidence: '提到了数据分析方向，但没有说明当前能力缺口。' },
    { id: 'academic', label: '学术匹配', score: 74, status: '需补充', summary: '本科背景与申请项目有联系。', evidence: '提到了统计课程，尚未连接到未来课程与研究兴趣。' },
    { id: 'funding', label: '资金能力', score: 58, status: '优先改进', summary: '能够说出资助人，但费用覆盖证据不足。', evidence: '没有说明资助人的稳定收入、可用存款与 I-20 年费用。' },
    { id: 'ties', label: '回国计划', score: 62, status: '优先改进', summary: '表达了回国意愿，但职业路径不够具体。', evidence: '只说“回国找工作”，没有目标行业、岗位和理由。' },
    { id: 'risk', label: '风险与一致性', score: 76, status: '需补充', summary: '没有明显前后矛盾，但个别回答过度发散。', evidence: '谈到实习时偏向美国就业，需要把重点拉回学习与回国发展。' },
  ],
  strengths: [
    { title: '核心申请信息准确', detail: '学校、专业和开学时间能够快速回答，没有出现前后矛盾。' },
    { title: '表达自然直接', detail: '多数回答先回应当前问题，没有使用无关铺垫。' },
  ],
  priorities: [
    { title: '资金覆盖尚未完整核验', detail: '资助人问题已经回答；下一轮应单独练习费用、收入和可用资金等对应问题。' },
    { title: '回国计划仍像通用答案', detail: '补充目标城市、行业、岗位，以及该项目如何帮助你回国后的职业路径。' },
  ],
  questionReviews: [
    {
      id: 'sample-q1',
      question: 'Why did you choose this university?',
      answer: 'Because it has a very good data science program and I like the location.',
      score: 67,
      verdict: '基本回答',
      summary: '回答了选择，但“good program”过于通用，不能体现你做过具体比较。',
      didWell: ['直接回应了问题，没有绕开学校选择。'],
      improve: ['说出 1–2 门与你目标相关的课程或项目特色。', '解释这些资源如何补足你现阶段的能力缺口。'],
      betterAnswer: 'I chose this university because its applied data science program combines statistical modeling with industry projects. The capstone course is especially relevant to my goal of working in risk analytics after I return to China.',
    },
    {
      id: 'sample-q2',
      question: 'Who will pay for your education?',
      answer: 'My parents will support my education.',
      score: 98,
      verdict: '回答有效',
      summary: '直接、完整地回答了当前问题，资助人身份清楚。',
      didWell: ['资助人身份明确，并且没有混入其他问题的答案。'],
      improve: [],
      betterAnswer: '本题保持当前回答即可。父母职业与收入、总费用和资金证明应在对应问题被问到时，依据真实材料回答。',
    },
    {
      id: 'sample-q3',
      question: 'What will you do after graduation?',
      answer: 'I will come back to China and find a good job in data science.',
      score: 61,
      verdict: '需要重答',
      summary: '表达了回国意愿，但职业计划仍然泛化，缺少可执行路径。',
      didWell: ['明确表达了毕业后回国。'],
      improve: ['补充目标城市、行业和岗位。', '解释国内机会或个人资源为什么使回国路径更合理。'],
      betterAnswer: 'After graduation, I plan to return to Beijing and apply for risk analytics roles in financial technology companies. My previous internship and local professional network are both in this field, and the program will strengthen the modeling skills these roles require.',
    },
  ],
  actionPlan: [
    { label: '今天', title: '补齐资金数字', detail: '把 I-20 年费用、家庭年收入和可用存款写在一张卡片上，确保数字真实且相互匹配。' },
    { label: '下一轮', title: '重练 3 个低分问题', detail: '学校选择、资金来源、毕业计划各录音 3 次；每次只保留最具体的两个事实。' },
    { label: '面签前', title: '核对材料一致性', detail: '逐项对照 DS-160、I-20 与资金证明，确保名称、日期、金额和计划没有冲突。' },
  ],
}
