// ========================================
// 面签分析引擎
//
// 将 InterviewRecord（原始对话）转换为 InterviewSession（带分析的反馈数据）
//
// 当前为规则引擎 mock 模式：
//   · 语音分析 — 基于文本特征模拟（语速/停顿/填充词/情绪）
//   · 内容分析 — 基于关键词和结构的启发式评分
//   · 后续接入真实 AI 后替换 analyzeVoice / analyzeContent
//
// 桥接关系：
//   practice/types.ts:InterviewRecord → 本文件 → feedback/types.ts:InterviewSession
// ========================================

import type { InterviewRecord, ChatMessage } from '../../practice/types'
import type {
  InterviewSession, QAPair,
  VoiceAnalysis, VoiceMetrics, VoiceEmotion,
  ContentAnalysis, ContentDimension,
  AnswerFeedback,
} from '../../feedback/types'
import { F1_QUESTION_CATALOG } from '../../practice/data/f1QuestionCatalog'
import { buildSafeInterviewContext } from '../../practice/services/realtimeInterviewPrompt'
import {
  sanitizeReportRequest,
  validateF1StructuredReport,
  type InterviewReportAnswer,
} from '../../../shared/f1ReportContract'

function classifyDialogueAct(answer: string) {
  const normalized = answer.trim().toLowerCase().replace(/[.!?]+$/g, '').trim()
  if (!normalized || normalized === '[no_speech]' || /^\(?no speech detected\)?$/.test(normalized)) return 'silence'
  if (/\b(i (?:could not|couldn't|did not|didn't) (?:hear|catch)(?: you| that)?|i can't hear you|i cannot hear you)\b/.test(normalized)) return 'did_not_hear'
  if (/^(sorry[, ]*)?(pardon(?: me)?|what|sorry what|say that again|come again)$/.test(normalized)
    || /\b(could|can|would|will) you (?:please )?(?:repeat|say (?:it|that) again)\b/.test(normalized)
    || /\bplease repeat(?: the question)?\b/.test(normalized)) return 'repeat_request'
  return 'valid_answer'
}

// ---- 填充词检测 ----

const FILLER_REGEX = /\b(um+|uh+|er+|hmm+|like|you know|i mean|actually|basically|literally|sort of|kind of|i guess|maybe|just|so)\b/gi

/** 检测文本中的填充词 */
function detectFillers(text: string): string[] {
  const matches = text.match(FILLER_REGEX)
  return matches ? [...new Set(matches.map(m => m.toLowerCase()))] : []
}

function countFillers(text: string): number {
  const matches = text.match(FILLER_REGEX)
  return matches ? matches.length : 0
}

// ---- 约束力关键词 ----

const TIES_KEYWORDS = [
  'family', 'parent', 'mother', 'father', 'wife', 'husband', 'child', 'daughter', 'son',
  'married', 'spouse', 'brother', 'sister',
  'job', 'work', 'company', 'business', 'career', 'employed', 'salary', 'income',
  'house', 'apartment', 'property', 'own', 'mortgage', 'rent',
  'china', 'return', 'back', 'home', 'shanghai', 'beijing', 'shenzhen', 'guangzhou',
  'contract', 'position', 'promotion',
]

/** 统计约束力关键词命中数 */
function countTiesKeywords(text: string): number {
  const lower = text.toLowerCase()
  return TIES_KEYWORDS.filter(kw => lower.includes(kw)).length
}

// ---- 具体性检测 ----

/** 检测文本中的具体信息密度 */
function countSpecifics(text: string): number {
  let score = 0
  // 数字
  score += (text.match(/\d+/g) ?? []).length
  // 专有名词（连续大写开头的词，排除句首）
  const words = text.split(/\s+/)
  for (let i = 1; i < words.length; i++) {
    if (/^[A-Z][a-z]+$/.test(words[i])) score += 2
  }
  // 日期/时间
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|year|month|week|day)\b/i.test(text)) score += 2
  // 地点
  if (/\b(in|at|from|to)\s+(?:the\s+)?[A-Z][a-z]+\b/.test(text)) score += 1
  return score
}

/** 检测不自信的语言 */
function hasUnconfidentLanguage(text: string): boolean {
  return /\b(sorry|i'?m (not sure|nervous|not certain)|i don'?t know|i'?m not|maybe|probably|i think|i guess|kind of|sort of)\b/i.test(text)
}

// ---- 语音分析 ----

function analyzeVoice(answer: string): VoiceAnalysis {
  const wordCount = answer.split(/\s+/).filter(w => w.length > 0).length
  const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const avgWordsPerSentence = sentences.length > 0 ? wordCount / sentences.length : wordCount
  const fillers = detectFillers(answer)
  const fillerCount = fillers.length

  // 基于文本特征计算自信度 0-100
  let confidence = 50

  // 句子长度（过短 = 不自信）
  if (avgWordsPerSentence >= 15) confidence += 10
  else if (avgWordsPerSentence >= 10) confidence += 5
  else if (avgWordsPerSentence < 5) confidence -= 15
  else if (avgWordsPerSentence < 8) confidence -= 5

  // 填充词惩罚
  confidence -= fillerCount * 7

  // 不自信语言惩罚
  if (hasUnconfidentLanguage(answer)) confidence -= 18

  // 具体信息加分
  confidence += Math.min(countSpecifics(answer) * 3, 20)

  // 答案过短（< 10 词）
  if (wordCount < 10) confidence -= 15

  // 答案长度适中（30-80 词最佳区间）
  if (wordCount >= 30 && wordCount <= 80) confidence += 5

  // clamp
  confidence = Math.max(5, Math.min(98, confidence))

  // 从自信度推导语音指标
  const wpm = Math.round(65 + confidence * 0.9) // 65 ~ 153
  const longestPause = +(Math.max(0.2, 5.5 - confidence * 0.055)).toFixed(1) // 0.2 ~ 5.2
  const volumeStability = Math.max(1, Math.min(5, Math.round(1 + confidence * 0.04)))
  const paceStability = Math.max(1, Math.min(5, Math.round(1 + confidence * 0.04)))

  // 情绪判断
  let primary: VoiceEmotion['primary']
  let stability: number
  let description: string

  if (confidence >= 72) {
    primary = 'confident'
    stability = Math.min(5, Math.round(3 + confidence * 0.02))
    description = '语速稳定有力，语句连贯，关键词发音清晰。整体语音状态自信从容，是面签的理想表现。'
  } else if (confidence >= 50) {
    primary = 'natural'
    stability = Math.min(5, Math.round(2 + confidence * 0.03))
    description = '语速自然，节奏平稳，无明显紧张迹象。语音状态属于正常交流水平。'
  } else if (confidence >= 28) {
    primary = 'hesitant'
    stability = Math.max(1, Math.min(3, Math.round(1 + confidence * 0.04)))
    description = `语速偏慢，出现${fillerCount > 0 ? `${fillerCount} 个填充词` : '明显停顿'}。音量有波动，整体表现出一定的犹豫感——签证官可能注意到不自信的信号。`
  } else if (confidence >= 15) {
    primary = 'nervous'
    stability = Math.max(1, Math.min(2, Math.round(0.5 + confidence * 0.03)))
    description = `语速明显下降，填充词密集（${fillers.join('、') || '多次停顿'}），音量忽大忽小。紧张感非常明显——这是签证官最关注的负面信号之一。`
  } else {
    primary = 'tense'
    stability = 1
    description = `语音严重崩溃——语速极慢，长停顿，填充词泛滥。${fillerCount > 3 ? '填充词个数达到 ' + fillerCount + ' 个，' : ''}如果不改善语音状态，即使内容再好也无法有效传达。`
  }

  const metrics: VoiceMetrics = {
    wordsPerMinute: wpm,
    longestPause,
    fillerCount,
    fillers,
    volumeStability,
    paceStability,
  }

  const emotion: VoiceEmotion = {
    primary,
    stability,
    description,
  }

  // 估算录音时长（秒） ≈ 词数 / WPM * 60
  const duration = +(wordCount / Math.max(wpm, 1) * 60).toFixed(1)

  return {
    metrics,
    emotion,
    audioUrl: null, // 后续接真实录音
    duration,
  }
}

// ---- 内容分析 ----

function analyzeContent(answer: string, _question: string): ContentAnalysis {
  const wordCount = answer.split(/\s+/).filter(w => w.length > 0).length
  const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const specificsCount = countSpecifics(answer)
  const tiesCount = countTiesKeywords(answer)
  const hasUnconfident = hasUnconfidentLanguage(answer)
  const fillerCount = countFillers(answer)

  // --- 逻辑评分 (1-5) ---
  let logicScore: number
  let logicComment: string

  if (sentences.length >= 3 && wordCount >= 25 && !hasUnconfident) {
    logicScore = 5
    logicComment = '信息结构完整，句子间有清晰的递进关系。论证链条连贯，逻辑自洽。'
  } else if (sentences.length >= 2 && wordCount >= 15) {
    logicScore = 4
    logicComment = '整体结构合理，有一定信息组织。可进一步加强因果链条。'
  } else if (sentences.length >= 2 && wordCount >= 10) {
    logicScore = 3
    logicComment = '基本表达了核心信息，但组织稍显松散。建议在回答前先快速构建 1-2 个要点。'
  } else if (wordCount >= 5) {
    logicScore = 2
    logicComment = '信息碎片化，缺乏完整的逻辑结构。面试官难以拼出完整画像。'
  } else {
    logicScore = 1
    logicComment = '回答过于简短，几乎没有任何逻辑展开。这是面签中最危险的情况之一。'
  }

  // --- 具体性评分 (1-5) ---
  let specificityScore: number
  let specificityComment: string

  if (specificsCount >= 6) {
    specificityScore = 5
    specificityComment = '包含丰富的具体信息——数字、地名、专有名词俱全。细节充分增强可信度。'
  } else if (specificsCount >= 3) {
    specificityScore = 4
    specificityComment = '有具体信息支撑，回答不空洞。可再补充 1-2 个具体细节。'
  } else if (specificsCount >= 1) {
    specificityScore = 3
    specificityComment = '有少量具体信息，但整体偏笼统。面签官可能追问更多细节。'
  } else if (wordCount >= 10) {
    specificityScore = 2
    specificityComment = '缺少具体信息，回答停留在泛泛层面。建议加入数字、地名、时间等具体元素。'
  } else {
    specificityScore = 1
    specificityComment = '没有任何具体信息。模糊的回答是面签中最容易被拒的因素之一。'
  }

  // --- 说服力评分 (1-5) ---
  let persuasionScore: number
  let persuasionComment: string

  if (!hasUnconfident && wordCount >= 20 && specificsCount >= 3) {
    persuasionScore = 5
    persuasionComment = '语气自信，信息具体，整体非常有说服力。这就是面签的理想回答范式。'
  } else if (!hasUnconfident && wordCount >= 15) {
    persuasionScore = 4
    persuasionComment = '表达自信，内容可信。注意避免任何可能被解读为犹豫的信号。'
  } else if (hasUnconfident && specificsCount >= 3) {
    persuasionScore = 3
    persuasionComment = '内容本身有说服力，但表达方式带有不确定性。建议去掉"I think"、"maybe"等弱化词。'
  } else if (hasUnconfident) {
    persuasionScore = 2
    persuasionComment = '语气暴露了不自信，削弱了内容的可信度。在面签中，表达方式和内容同等重要。'
  } else {
    persuasionScore = 1
    persuasionComment = '回答方式本身就让人怀疑真实性。必须提升表达的自信度。'
  }

  if (fillerCount >= 4 && persuasionScore > 2) {
    persuasionScore = Math.max(2, persuasionScore - 2)
    persuasionComment += ` ${fillerCount} 个填充词进一步削弱了说服力。`
  }

  // --- 约束力评分 (1-5) ---
  let tiesScore: number
  let tiesComment: string

  if (tiesCount >= 5) {
    tiesScore = 5
    tiesComment = '完美展示了国内约束力——家庭、工作、资产等多维度的回国动机清晰有力。'
  } else if (tiesCount >= 3) {
    tiesScore = 4
    tiesComment = '展示了较强的国内约束力。可以再补充一个维度的约束力信息。'
  } else if (tiesCount >= 1) {
    tiesScore = 3
    tiesComment = '有提到国内的约束力因素，但不够充分。面签官可能认为约束力不足。'
  } else if (wordCount >= 10) {
    tiesScore = 2
    tiesComment = '未提及任何国内约束力。这是面签中最大的风险——建议在每个相关回答中自然嵌入回国动机。'
  } else {
    tiesScore = 1
    tiesComment = '回答过短，完全未展示约束力。约束力是面签通过的核心要素，必须在回答中主动展示。'
  }

  // --- 综合 ---
  const avgScore = (logicScore + specificityScore + persuasionScore + tiesScore) / 4
  let summary: string
  let suggestions: string[] = []

  if (avgScore >= 4.0) {
    summary = '各方面表现优秀。语音和内容都达到了面签的理想标准，这是值得保持的基准水平。'
    suggestions = ['保持当前状态', '准备好相关证明文件以应对追问']
  } else if (avgScore >= 3.0) {
    summary = '整体表现可以，但部分维度有提升空间。重点加强弱项即可显著提高通过率。'
    if (logicScore <= 3) suggestions.push('练习前先快速列出回答要点（1-2个核心信息）')
    if (specificityScore <= 3) suggestions.push('回答中刻意加入具体数字、地点、时间等细节信息')
    if (persuasionScore <= 3) suggestions.push('去掉"I think"、"maybe"等弱化词，用肯定句表达')
    if (tiesScore <= 3) suggestions.push('每个回答中尽量自然提及一个国内约束力因素（家庭/工作/房产）')
  } else {
    summary = '这道题的回答有较大改进空间。建议重点练习此类问题，语音和内容都需要系统性提升。'
    suggestions = [
      '这是需要重点练习的薄弱环节',
      '准备 3-4 句标准回答模板，练到脱口而出',
      '录音回听自己的回答，感受语音中的不自信并针对性改进',
    ]
  }

  const dimensions: ContentDimension[] = [
    { label: '逻辑', score: logicScore, comment: logicComment },
    { label: '具体性', score: specificityScore, comment: specificityComment },
    { label: '说服力', score: persuasionScore, comment: persuasionComment },
    { label: '约束力', score: tiesScore, comment: tiesComment },
  ]

  return { dimensions, summary, suggestions }
}

// ---- 综合判决 ----

function getVerdict(voice: VoiceAnalysis, content: ContentAnalysis): AnswerFeedback['verdict'] {
  const avgContent = content.dimensions.reduce((s, d) => s + d.score, 0) / content.dimensions.length
  const confidence = voice.metrics.wordsPerMinute >= 100 && voice.emotion.stability >= 3

  if (avgContent >= 4.0 && confidence) return 'favorable'
  if (avgContent >= 2.8) return 'neutral'
  return 'unfavorable'
}

// ---- QA 提取 ----

/** 从对话消息中提取问答对 */
export function extractQAPairs(messages: ChatMessage[]): Array<{
  id: string; question: string; answer: string; timestamp: string
}> {
  const pairs: Array<{ id: string; question: string; answer: string; timestamp: string }> = []
  let pairIndex = 0
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].role === 'officer' && messages[i + 1].role === 'user') {
      const dialogueAct = classifyDialogueAct(messages[i + 1].text)
      if (dialogueAct === 'repeat_request' || dialogueAct === 'did_not_hear' || dialogueAct === 'silence') continue
      pairIndex++
      pairs.push({
        id: `q${pairIndex}`,
        question: messages[i].text,
        answer: messages[i + 1].text,
        timestamp: messages[i + 1].timestamp,
      })
    }
  }
  return pairs
}

// ---- 主入口 ----

/**
 * 将原始面签记录转换为带分析结果的反馈数据
 *
 * @param record — 第二阶段产出的原始对话记录
 * @returns 可直接被反馈模块渲染的 InterviewSession
 */
export function analyzeInterview(record: InterviewRecord): InterviewSession {
  const rawPairs = extractQAPairs(record.messages)

  const transcript: QAPair[] = rawPairs.map(({ id, question, answer, timestamp }) => {
    const voice = analyzeVoice(answer)
    const content = analyzeContent(answer, question)
    const verdict = getVerdict(voice, content)

    const feedback: AnswerFeedback = { verdict, voice, content }
    return { id, question, answer, timestamp, feedback }
  })

  // 综合评分：所有维度分数的平均
  let totalScore = 0
  let dimensionCount = 0
  for (const qa of transcript) {
    for (const dim of qa.feedback.content.dimensions) {
      totalScore += dim.score
      dimensionCount++
    }
  }
  const overallScore = dimensionCount > 0
    ? +(totalScore / dimensionCount).toFixed(1)
    : 3.0

  // 标题生成
  const visaLabel: Record<string, string> = {
    B2: 'B2 旅游签证', B1: 'B1 商务签证', F1: 'F1 学术签证',
    H1B: 'H1B 工作签证', L1: 'L1 跨国经理',
  }
  const title = `${visaLabel[record.visaType] ?? record.visaType} · ${record.userContext.purpose || '面签练习'}`

  return {
    id: record.id,
    date: record.date,
    time: record.time,
    duration: record.duration,
    title,
    overallScore,
    transcript,
    analysisSource: 'local',
    aiScoredAnswers: 0,
    totalScoredAnswers: transcript.length,
  }
}

// ---- One evidence-bound DeepSeek report call after the complete F-1 interview ----

const AI_REPORT_ENDPOINT = '/api/ai-report'

function normalizeQuestionText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function identifyF1Question(questionText: string) {
  const normalized = normalizeQuestionText(questionText)
  return F1_QUESTION_CATALOG.find(question => normalized.includes(normalizeQuestionText(question.text)))
}

export function buildF1ReportRequest(record: InterviewRecord) {
  if (record.visaType !== 'F1') return null
  const answers: InterviewReportAnswer[] = extractQAPairs(record.messages).map((pair, offset) => {
    const question = identifyF1Question(pair.question)
    if (!question) throw new Error('F1_REPORT_UNKNOWN_QUESTION')
    return {
      index: offset + 1,
      questionId: question.id,
      question: question.text,
      answer: pair.answer,
      timestamp: pair.timestamp,
    }
  })
  return sanitizeReportRequest({
    visaType: 'F1',
    safeContext: buildSafeInterviewContext(record.userContext),
    answers,
  })
}

export function createUnavailableInterviewSession(record: InterviewRecord): InterviewSession {
  const visaLabel: Record<string, string> = {
    B2: 'B2 旅游签证', B1: 'B1 商务签证', F1: 'F1 学术签证',
    H1B: 'H1B 工作签证', L1: 'L1 跨国经理',
  }
  const transcript: QAPair[] = extractQAPairs(record.messages).map(pair => ({
    ...pair,
    feedback: {
      verdict: 'neutral',
      voice: {
        metrics: { wordsPerMinute: 0, longestPause: 0, fillerCount: 0, fillers: [], volumeStability: 1, paceStability: 1 },
        emotion: { primary: 'natural', stability: 1, description: '分析服务暂不可用。' },
        audioUrl: null,
        duration: 0,
      },
      content: { dimensions: [], summary: '分析服务暂不可用。', suggestions: [] },
    },
  }))
  return {
    id: record.id,
    date: record.date,
    time: record.time,
    duration: record.duration,
    title: `${visaLabel[record.visaType] ?? record.visaType} · ${record.userContext.purpose || '面签练习'}`,
    overallScore: null,
    transcript,
    analysisSource: 'unavailable',
    aiScoredAnswers: 0,
    totalScoredAnswers: 0,
  }
}

export async function analyzeInterviewWithAI(record: InterviewRecord): Promise<InterviewSession> {
  if (record.visaType !== 'F1') return analyzeInterview(record)
  const input = buildF1ReportRequest(record)
  if (!input) throw new Error('F1_REPORT_NO_VALID_ANSWERS')

  const response = await fetch(AI_REPORT_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(100_000),
  })
  if (!response.ok) throw new Error(`F1_REPORT_FAILED_${response.status}`)
  const payload = await response.json() as { report?: unknown }
  const structuredReport = validateF1StructuredReport(payload.report, input)
  if (!structuredReport) throw new Error('F1_REPORT_INVALID')

  const transcriptSession = createUnavailableInterviewSession(record)
  return {
    ...transcriptSession,
    overallScore: structuredReport.overallScore / 20,
    analysisSource: 'deepseek',
    aiScoredAnswers: input.answers.length,
    totalScoredAnswers: input.answers.length,
    structuredReport,
  }
}
