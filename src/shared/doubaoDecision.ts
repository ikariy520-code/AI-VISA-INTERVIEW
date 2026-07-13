export type DecisionReason =
  | 'sufficient'
  | 'too_vague'
  | 'uncertain'
  | 'inconsistent'
  | 'needs_detail'
  | 'off_topic'

export type DecisionRiskSignal =
  | 'off_topic'
  | 'too_vague'
  | 'uncertain'
  | 'possible_inconsistency'
  | 'funding_concern'
  | 'immigrant_intent_concern'
  | 'timeline_mismatch'
  | 'background_mismatch'

export interface F1AnswerAssessment {
  relevance: number
  specificity: number
  clarity: number
  isUncertain: boolean
  isContradictory: boolean
  contradictsQuestionIds: string[]
  needsFollowUp: boolean
  allowedFollowUpId: string | null
  riskSignals: DecisionRiskSignal[]
  decisionReason: DecisionReason
}

export interface F1DecisionRequest {
  questionId: string
  questionText: string
  answer: string
  allowedFollowUps: Array<{ id: string; text: string }>
  recentTurns: Array<{ role: 'officer' | 'user'; text: string }>
  safeContext: Record<string, unknown>
}

const REASONS = new Set<DecisionReason>([
  'sufficient', 'too_vague', 'uncertain', 'inconsistent', 'needs_detail', 'off_topic',
])
const RISK_SIGNALS = new Set<DecisionRiskSignal>([
  'off_topic', 'too_vague', 'uncertain', 'possible_inconsistency',
  'funding_concern', 'immigrant_intent_concern', 'timeline_mismatch', 'background_mismatch',
])
const SAFE_CONTEXT_KEYS = new Set([
  'visaType', 'schoolNameOrAlias', 'degreeLevel', 'major', 'enrollmentMonth',
  'programDuration', 'currentStatus', 'schoolReason', 'majorReason', 'fundingSource',
  'annualBudgetRange', 'hasUsRelatives', 'usRelativeType', 'hasPreviousVisa',
  'hasPreviousVisaDenial', 'hasStudyOrWorkGap', 'postGraduationPlan', 'homeTies',
])

function redactPotentialIdentifiers(value: string): string {
  return value
    .replace(/\b(passport|sevis|ds-?160|confirmation)\s*(?:number|no\.?|id|code)?\s*(?:is\s*)?[:#-]?\s*[a-z0-9-]{5,}\b/gi, '$1 [redacted identifier]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted email]')
    .replace(/\+?\d[\d\s()\-]{6,}\d/g, '[redacted number]')
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return redactPotentialIdentifiers(value.trim()).slice(0, 240)
  if (depth >= 2) return undefined
  if (Array.isArray(value)) {
    return value.slice(0, 8).map(item => sanitizeJsonValue(item, depth + 1)).filter(item => item !== undefined)
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 24)
      .map(([key, item]) => [key.slice(0, 60), sanitizeJsonValue(item, depth + 1)] as const)
      .filter(([, item]) => item !== undefined)
    return Object.fromEntries(entries)
  }
  return undefined
}

export function sanitizeF1DecisionRequest(input: unknown): F1DecisionRequest | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const questionId = String(raw.questionId ?? '').trim()
  const questionText = redactPotentialIdentifiers(String(raw.questionText ?? '').trim()).slice(0, 500)
  const answer = redactPotentialIdentifiers(String(raw.answer ?? '').trim()).slice(0, 2_000)
  if (!/^f1_\d{2}$/.test(questionId) || !questionText || !answer) return null

  const allowedFollowUps = Array.isArray(raw.allowedFollowUps)
    ? raw.allowedFollowUps.slice(0, 4).flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const followUp = item as Record<string, unknown>
      const id = String(followUp.id ?? '').trim().slice(0, 80)
      const text = redactPotentialIdentifiers(String(followUp.text ?? '').trim()).slice(0, 500)
      return /^[a-z0-9_]+$/i.test(id) && text ? [{ id, text }] : []
    })
    : []

  const recentTurns = Array.isArray(raw.recentTurns)
    ? raw.recentTurns.slice(-8).flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const turn = item as Record<string, unknown>
      const role: 'officer' | 'user' | null = turn.role === 'officer'
        ? 'officer'
        : turn.role === 'user'
          ? 'user'
          : null
      const text = redactPotentialIdentifiers(String(turn.text ?? '').trim()).slice(0, 600)
      return role && text ? [{ role, text }] : []
    })
    : []

  const rawSafeContext = raw.safeContext && typeof raw.safeContext === 'object'
    ? raw.safeContext as Record<string, unknown>
    : {}
  const safeContext = Object.fromEntries(
    Object.entries(rawSafeContext)
      .filter(([key]) => SAFE_CONTEXT_KEYS.has(key))
      .map(([key, value]) => [key, sanitizeJsonValue(value)])
      .filter(([, value]) => value !== undefined),
  )
  return { questionId, questionText, answer, allowedFollowUps, recentTurns, safeContext }
}

export function buildDoubaoDecisionMessages(input: F1DecisionRequest) {
  const allowedIds = input.allowedFollowUps.map(item => item.id)
  const outputExample = {
    relevance: 1,
    specificity: 1,
    clarity: 1,
    isUncertain: false,
    isContradictory: false,
    contradictsQuestionIds: [],
    needsFollowUp: false,
    allowedFollowUpId: null,
    riskSignals: [],
    decisionReason: 'sufficient',
  }

  return [
    {
      role: 'system',
      content: `You evaluate one answer in an F1 visa interview practice product. Return one JSON object and nothing else.

Rules:
- Evaluate relevance, specificity and clarity from 1 to 5.
- Compare only with the supplied non-identifying background and recent turns.
- Never decide whether the applicant is truthful, eligible, approved, refused, or seeking asylum.
- A Yes answer to harm, mistreatment, return fear, Africa travel, or safety questions is not inherently wrong and must not be penalized merely for its content.
- Recommend a follow-up only when it materially clarifies this answer.
- allowedFollowUpId must be null or one of the exact allowed IDs supplied by the application.
- Do not output names, addresses, document numbers, inferred identity, or free-form personal facts.
- riskSignals may only contain: off_topic, too_vague, uncertain, possible_inconsistency, funding_concern, immigrant_intent_concern, timeline_mismatch, background_mismatch.
- decisionReason must be one of: sufficient, too_vague, uncertain, inconsistent, needs_detail, off_topic.

Required JSON shape:
${JSON.stringify(outputExample)}`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        currentQuestion: { id: input.questionId, text: input.questionText },
        applicantAnswer: input.answer,
        allowedFollowUps: input.allowedFollowUps,
        allowedFollowUpIds: allowedIds,
        approvedNonIdentifyingBackground: input.safeContext,
        recentInterviewTurns: input.recentTurns,
      }),
    },
  ]
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim()
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(withoutFence)
}

function integerScore(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null
}

export function parseDoubaoAssessment(
  content: string,
  allowedFollowUpIds: readonly string[],
): F1AnswerAssessment | null {
  let value: unknown
  try {
    value = parseJsonContent(content)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const relevance = integerScore(raw.relevance)
  const specificity = integerScore(raw.specificity)
  const clarity = integerScore(raw.clarity)
  if (relevance === null || specificity === null || clarity === null) return null
  if (typeof raw.isUncertain !== 'boolean' || typeof raw.isContradictory !== 'boolean' || typeof raw.needsFollowUp !== 'boolean') return null
  if (!Array.isArray(raw.contradictsQuestionIds) || !Array.isArray(raw.riskSignals)) return null
  if (typeof raw.decisionReason !== 'string' || !REASONS.has(raw.decisionReason as DecisionReason)) return null

  const allowedFollowUpId = raw.allowedFollowUpId === null
    ? null
    : typeof raw.allowedFollowUpId === 'string' && allowedFollowUpIds.includes(raw.allowedFollowUpId)
      ? raw.allowedFollowUpId
      : undefined
  if (allowedFollowUpId === undefined) return null
  if (raw.needsFollowUp && !allowedFollowUpId) return null
  if (!raw.needsFollowUp && allowedFollowUpId) return null

  const contradictsQuestionIds = raw.contradictsQuestionIds
    .filter((item): item is string => typeof item === 'string' && /^f1_\d{2}$/.test(item))
    .slice(0, 4)
  const riskSignals = raw.riskSignals
    .filter((item): item is DecisionRiskSignal => typeof item === 'string' && RISK_SIGNALS.has(item as DecisionRiskSignal))
    .slice(0, 6)

  return {
    relevance,
    specificity,
    clarity,
    isUncertain: raw.isUncertain,
    isContradictory: raw.isContradictory,
    contradictsQuestionIds,
    needsFollowUp: raw.needsFollowUp,
    allowedFollowUpId,
    riskSignals,
    decisionReason: raw.decisionReason as DecisionReason,
  }
}

export function getArkMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return null
  const first = choices[0] as { message?: { content?: unknown } } | undefined
  return typeof first?.message?.content === 'string' ? first.message.content : null
}
