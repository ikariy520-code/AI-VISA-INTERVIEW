export type DecisionReason =
  | 'sufficient'
  | 'too_vague'
  | 'uncertain'
  | 'inconsistent'
  | 'needs_detail'
  | 'off_topic'

export type F1DialogueAct =
  | 'repeat_request'
  | 'did_not_hear'
  | 'silence'
  | 'off_topic'
  | 'partial_answer'
  | 'valid_answer'

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
  dialogueAct: F1DialogueAct
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
  recommendedNextQuestionId: string | null
}

export interface F1NextQuestionCandidate {
  id: string
  text: string
  stage: string
  topic: string
}

export interface F1DecisionRequest {
  questionId: string
  questionText: string
  answer: string
  allowedFollowUps: Array<{ id: string; text: string }>
  candidateNextQuestions: F1NextQuestionCandidate[]
  recentTurns: Array<{ role: 'officer' | 'user'; text: string }>
  safeContext: Record<string, unknown>
}

const REASONS = new Set<DecisionReason>([
  'sufficient', 'too_vague', 'uncertain', 'inconsistent', 'needs_detail', 'off_topic',
])
const DIALOGUE_ACTS = new Set<F1DialogueAct>([
  'repeat_request', 'did_not_hear', 'silence', 'off_topic', 'partial_answer', 'valid_answer',
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

export function redactPotentialIdentifiers(value: string): string {
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

  const candidateNextQuestions = Array.isArray(raw.candidateNextQuestions)
    ? raw.candidateNextQuestions.slice(0, 16).flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const candidate = item as Record<string, unknown>
      const id = String(candidate.id ?? '').trim()
      const text = redactPotentialIdentifiers(String(candidate.text ?? '').trim()).slice(0, 500)
      const stage = String(candidate.stage ?? '').trim().slice(0, 80)
      const topic = String(candidate.topic ?? '').trim().slice(0, 80)
      return /^f1_\d{2}$/.test(id) && text && stage && topic ? [{ id, text, stage, topic }] : []
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
  return { questionId, questionText, answer, allowedFollowUps, candidateNextQuestions, recentTurns, safeContext }
}

export function buildDoubaoDecisionMessages(input: F1DecisionRequest) {
  const allowedIds = input.allowedFollowUps.map(item => item.id)
  const candidateNextIds = input.candidateNextQuestions.map(item => item.id)
  const outputExample = {
    dialogueAct: 'valid_answer',
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
    recommendedNextQuestionId: candidateNextIds[0] ?? null,
  }

  return [
    {
      role: 'system',
      content: `You evaluate one answer in an F1 visa interview practice product. Return one JSON object and nothing else.

First classify the applicant utterance into exactly one dialogueAct:
- repeat_request: asks the officer to repeat or says pardon.
- did_not_hear: explicitly says they could not hear or catch the question.
- silence: the special [NO_SPEECH] marker or no meaningful spoken response.
- off_topic: speech is understandable but does not answer the current question.
- partial_answer: addresses the question but is materially incomplete or too vague.
- valid_answer: directly answers the question, including a concise Yes or No when appropriate.

Routing rules:
- For repeat_request, did_not_hear, silence, or off_topic: recommendedNextQuestionId must be null and needsFollowUp must be false. The application will keep the same question active.
- For partial_answer: prefer one approved follow-up when available; otherwise recommendedNextQuestionId must be null.
- For valid_answer: recommend the most logical next question from candidateNextQuestions. Use only an exact supplied ID, or null when the list is empty.
- Keep a coherent interview progression. Prefer a nearby topic unless the answer creates a material reason to switch topics.
- Never invent a question or ID. Mandatory coverage and interview length are enforced by the application.

Assessment rules:
- Evaluate relevance, specificity and clarity from 1 to 5.
- Compare only with the supplied non-identifying background and recent turns.
- Never decide whether the applicant is truthful, eligible, approved, refused, or seeking asylum.
- A Yes answer to harm, mistreatment, return fear, Africa travel, or safety questions is not inherently wrong and must not be penalized merely for its content.
- Recommend a follow-up only when it materially clarifies this answer.
- allowedFollowUpId must be null or one of the exact allowed IDs supplied by the application.
- Do not output names, addresses, document numbers, inferred identity, or free-form personal facts.
- riskSignals may only contain: off_topic, too_vague, uncertain, possible_inconsistency, funding_concern, immigrant_intent_concern, timeline_mismatch, background_mismatch.
- decisionReason must be one of: sufficient, too_vague, uncertain, inconsistent, needs_detail, off_topic.
- dialogueAct must be one of: repeat_request, did_not_hear, silence, off_topic, partial_answer, valid_answer.

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
        candidateNextQuestions: input.candidateNextQuestions,
        candidateNextQuestionIds: candidateNextIds,
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
  allowedNextQuestionIds: readonly string[] = [],
): F1AnswerAssessment | null {
  let value: unknown
  try {
    value = parseJsonContent(content)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.dialogueAct !== 'string' || !DIALOGUE_ACTS.has(raw.dialogueAct as F1DialogueAct)) return null
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

  const recommendedNextQuestionId = raw.recommendedNextQuestionId === null
    ? null
    : typeof raw.recommendedNextQuestionId === 'string' && allowedNextQuestionIds.includes(raw.recommendedNextQuestionId)
      ? raw.recommendedNextQuestionId
      : undefined
  if (recommendedNextQuestionId === undefined) return null
  const dialogueAct = raw.dialogueAct as F1DialogueAct
  const mustStayOnQuestion = ['repeat_request', 'did_not_hear', 'silence', 'off_topic'].includes(dialogueAct)
  if (mustStayOnQuestion && (raw.needsFollowUp || recommendedNextQuestionId)) return null
  if (dialogueAct === 'partial_answer' && recommendedNextQuestionId) return null

  const contradictsQuestionIds = raw.contradictsQuestionIds
    .filter((item): item is string => typeof item === 'string' && /^f1_\d{2}$/.test(item))
    .slice(0, 4)
  const riskSignals = raw.riskSignals
    .filter((item): item is DecisionRiskSignal => typeof item === 'string' && RISK_SIGNALS.has(item as DecisionRiskSignal))
    .slice(0, 6)

  return {
    dialogueAct,
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
    recommendedNextQuestionId,
  }
}

/** Fast local guard used when the provider is slow or unavailable. */
export function classifyF1DialogueActLocally(answer: string): F1DialogueAct {
  const normalized = answer.trim().toLowerCase().replace(/[.!?]+$/g, '').trim()
  if (!normalized || normalized === '[no_speech]' || /^\(?no speech detected\)?$/.test(normalized)) return 'silence'
  if (/\b(i (?:could not|couldn't|did not|didn't) (?:hear|catch)(?: you| that)?|i can't hear you|i cannot hear you)\b/.test(normalized)) {
    return 'did_not_hear'
  }
  if (/^(sorry[, ]*)?(pardon(?: me)?|what|sorry what|say that again|come again)$/.test(normalized)
    || /\b(could|can|would|will) you (?:please )?(?:repeat|say (?:it|that) again)\b/.test(normalized)
    || /\bplease repeat(?: the question)?\b/.test(normalized)) {
    return 'repeat_request'
  }
  return 'valid_answer'
}

export function getArkMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return null
  const first = choices[0] as { message?: { content?: unknown } } | undefined
  return typeof first?.message?.content === 'string' ? first.message.content : null
}
