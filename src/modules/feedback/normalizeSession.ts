import type {
  AnswerFeedback,
  ContentDimension,
  InterviewSession,
  QAPair,
  VoiceEmotion,
} from './types'
import type { F1StructuredReport } from '../../shared/f1ReportContract'

type UnknownRecord = Record<string, unknown>

const VERDICTS = new Set<AnswerFeedback['verdict']>(['favorable', 'neutral', 'unfavorable'])
const EMOTIONS = new Set<VoiceEmotion['primary']>(['calm', 'nervous', 'confident', 'hesitant', 'tense', 'natural'])
const SOURCES = new Set<NonNullable<InterviewSession['analysisSource']>>(['deepseek', 'doubao', 'hybrid', 'local', 'unavailable'])

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeText(value: unknown, fallback = '', maxLength = 4_000): string {
  if (typeof value === 'string') return value.trim().slice(0, maxLength) || fallback
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).slice(0, maxLength)
  return fallback
}

function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

function safeStringArray(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => safeText(item, '', 500))
    .filter(Boolean)
    .slice(0, maxItems)
}

function normalizeDimension(value: unknown, index: number): ContentDimension {
  const record = isRecord(value) ? value : {}
  const fallbackLabels = ['逻辑', '具体性', '说服力', '约束力']
  return {
    label: safeText(record.label, fallbackLabels[index] ?? `维度 ${index + 1}`, 40),
    score: Math.round(safeNumber(record.score, 3, 1, 5)),
    comment: safeText(record.comment, '本项暂无详细点评。', 1_000),
  }
}

function normalizeFeedback(value: unknown): AnswerFeedback {
  const feedback = isRecord(value) ? value : {}
  const voice = isRecord(feedback.voice) ? feedback.voice : {}
  const metrics = isRecord(voice.metrics) ? voice.metrics : {}
  const emotion = isRecord(voice.emotion) ? voice.emotion : {}
  const content = isRecord(feedback.content) ? feedback.content : {}
  const rawDimensions = Array.isArray(content.dimensions) ? content.dimensions.slice(0, 8) : []
  const dimensions = rawDimensions.length > 0
    ? rawDimensions.map(normalizeDimension)
    : ['逻辑', '具体性', '说服力', '约束力'].map((label, index) => normalizeDimension({ label }, index))
  const rawVerdict = safeText(feedback.verdict)
  const rawEmotion = safeText(emotion.primary)

  return {
    verdict: VERDICTS.has(rawVerdict as AnswerFeedback['verdict'])
      ? rawVerdict as AnswerFeedback['verdict']
      : 'neutral',
    voice: {
      metrics: {
        wordsPerMinute: Math.round(safeNumber(metrics.wordsPerMinute, 100, 0, 300)),
        longestPause: safeNumber(metrics.longestPause, 0, 0, 120),
        fillerCount: Math.round(safeNumber(metrics.fillerCount, 0, 0, 100)),
        fillers: safeStringArray(metrics.fillers, 20),
        volumeStability: Math.round(safeNumber(metrics.volumeStability, 3, 1, 5)),
        paceStability: Math.round(safeNumber(metrics.paceStability, 3, 1, 5)),
      },
      emotion: {
        primary: EMOTIONS.has(rawEmotion as VoiceEmotion['primary'])
          ? rawEmotion as VoiceEmotion['primary']
          : 'natural',
        stability: Math.round(safeNumber(emotion.stability, 3, 1, 5)),
        description: safeText(emotion.description, '仅根据本次回答文本估计表达状态。', 1_000),
      },
      audioUrl: typeof voice.audioUrl === 'string' ? voice.audioUrl : null,
      duration: safeNumber(voice.duration, 0, 0, 3_600),
    },
    content: {
      dimensions,
      summary: safeText(content.summary, '本题已完成分析，请结合各维度点评继续练习。', 1_500),
      suggestions: safeStringArray(content.suggestions, 6),
    },
  }
}

function normalizeQAPair(value: unknown, index: number): QAPair | null {
  if (!isRecord(value)) return null
  const question = safeText(value.question, '', 6_000)
  const answer = safeText(value.answer, '', 12_000)
  if (!question && !answer) return null

  return {
    id: safeText(value.id, `q${index + 1}`, 100),
    question: question || '未记录面签官问题',
    answer: answer || '未记录回答',
    timestamp: safeText(value.timestamp, '00:00', 20),
    feedback: normalizeFeedback(value.feedback),
  }
}

/** Ensure provider or navigation data can never crash the report renderer. */
export function normalizeInterviewSession(value: unknown): InterviewSession | null {
  if (!isRecord(value)) return null
  const transcript = (Array.isArray(value.transcript) ? value.transcript : [])
    .map(normalizeQAPair)
    .filter((item): item is QAPair => item !== null)
  const rawSource = safeText(value.analysisSource)
  const analysisSource = SOURCES.has(rawSource as NonNullable<InterviewSession['analysisSource']>)
    ? rawSource as NonNullable<InterviewSession['analysisSource']>
    : 'local'

  return {
    id: safeText(value.id, `report-${Date.now()}`, 120),
    date: safeText(value.date, '本次练习', 40),
    time: safeText(value.time, '', 40),
    duration: safeText(value.duration, '00:00', 40),
    title: safeText(value.title, '美国签证面签练习', 300),
    overallScore: value.overallScore === null ? null : safeNumber(value.overallScore, 3, 1, 5),
    transcript,
    analysisSource,
    aiScoredAnswers: Math.round(safeNumber(value.aiScoredAnswers, 0, 0, transcript.length)),
    totalScoredAnswers: Math.round(safeNumber(value.totalScoredAnswers, transcript.length, 0, transcript.length)),
    structuredReport: isRecord(value.structuredReport)
      && value.structuredReport.schemaVersion === 2
      && Array.isArray(value.structuredReport.dimensions)
      && Array.isArray(value.structuredReport.questionReviews)
      ? value.structuredReport as unknown as F1StructuredReport
      : undefined,
  }
}
