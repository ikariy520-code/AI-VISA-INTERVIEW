import type { UserContext } from '../types.ts'
import {
  F1_MANDATORY_QUESTION_IDS,
  F1_QUESTION_CATALOG,
  getF1Question,
  type F1QuestionDefinition,
  type F1QuestionId,
} from '../data/f1QuestionCatalog.ts'
import {
  F1_INTERVIEW_CLOSING_LINE,
  F1_INTERVIEW_HARD_LIMIT_SECONDS,
  F1_INTERVIEW_MAX_MAIN_QUESTIONS,
} from '../data/f1InterviewStandard.ts'

export type F1ControllerAction =
  | { type: 'ASK'; questionId: F1QuestionId; text: string; reason: string }
  | { type: 'REPEAT_CURRENT'; questionId: F1QuestionId; text: string; reason: 'repeat-request' | 'unclear-answer' }
  | { type: 'CLOSE'; text: string; reason: 'complete' | 'question-limit' | 'time-limit' }

export interface F1AnswerRecord {
  questionId: F1QuestionId
  transcript: string
  quality: 'valid' | 'unclear' | 'repeat-request'
}

export interface F1InterviewState {
  currentQuestionId: F1QuestionId
  askedQuestionIds: F1QuestionId[]
  answers: F1AnswerRecord[]
  repeatedQuestionIds: F1QuestionId[]
  targetQuestionCount: number
  maxQuestionCount: number
  startedAt: number
}

export interface F1ControllerOptions {
  now?: number
  maxQuestionCount?: number
}

const CLOSE_TEXT = F1_INTERVIEW_CLOSING_LINE
const DEFAULT_MAX_QUESTIONS = F1_INTERVIEW_MAX_MAIN_QUESTIONS
const MIN_TARGET_QUESTIONS = 8

const coreCoverageGroups: readonly (readonly F1QuestionId[])[] = [
  ['f1_01'],
  ['f1_03', 'f1_06'],
  ['f1_04', 'f1_05'],
  ['f1_11'],
  ['f1_12', 'f1_13', 'f1_14'],
  ['f1_19'],
  ['f1_20'],
  ['f1_21'],
]

const topicContinuations: Partial<Record<F1QuestionId, readonly F1QuestionId[]>> = {
  f1_01: ['f1_03', 'f1_04', 'f1_06'],
  f1_02: ['f1_03'],
  f1_03: ['f1_06', 'f1_04'],
  f1_04: ['f1_05', 'f1_06'],
  f1_05: ['f1_06', 'f1_11'],
  f1_06: ['f1_07', 'f1_11'],
  f1_07: ['f1_11'],
  f1_08: ['f1_05', 'f1_11'],
  f1_11: ['f1_12', 'f1_13'],
  f1_12: ['f1_13', 'f1_14'],
  f1_13: ['f1_14'],
  f1_14: ['f1_15'],
  f1_16: ['f1_18'],
  f1_17: ['f1_21'],
  f1_19: ['f1_20'],
  f1_20: ['f1_21'],
  f1_21: ['f1_22'],
}

export function createF1InterviewState(
  context: UserContext,
  options: F1ControllerOptions = {},
): F1InterviewState {
  const maxQuestionCount = clamp(options.maxQuestionCount ?? DEFAULT_MAX_QUESTIONS, MIN_TARGET_QUESTIONS, 12)
  return {
    currentQuestionId: 'f1_01',
    askedQuestionIds: ['f1_01'],
    answers: [],
    repeatedQuestionIds: [],
    targetQuestionCount: calculateTargetQuestionCount(context, maxQuestionCount),
    maxQuestionCount,
    startedAt: options.now ?? Date.now(),
  }
}

/**
 * Pure, local interview controller. It can only return a catalog question,
 * repeat the current catalog question, or close the interview.
 */
export function advanceF1Interview(
  state: F1InterviewState,
  transcript: string,
  context: UserContext,
  options: F1ControllerOptions = {},
): { state: F1InterviewState; action: F1ControllerAction } {
  const now = options.now ?? Date.now()
  if (now - state.startedAt >= F1_INTERVIEW_HARD_LIMIT_SECONDS * 1000) {
    return { state, action: { type: 'CLOSE', text: CLOSE_TEXT, reason: 'time-limit' } }
  }

  const quality = classifyAnswer(transcript, getF1Question(state.currentQuestionId))
  const answers = [...state.answers, { questionId: state.currentQuestionId, transcript: transcript.trim(), quality }]

  if (quality === 'repeat-request') {
    return {
      state: { ...state, answers },
      action: {
        type: 'REPEAT_CURRENT',
        questionId: state.currentQuestionId,
        text: getF1Question(state.currentQuestionId).text,
        reason: 'repeat-request',
      },
    }
  }

  if (quality === 'unclear' && !state.repeatedQuestionIds.includes(state.currentQuestionId)) {
    return {
      state: {
        ...state,
        answers,
        repeatedQuestionIds: [...state.repeatedQuestionIds, state.currentQuestionId],
      },
      action: {
        type: 'REPEAT_CURRENT',
        questionId: state.currentQuestionId,
        text: getF1Question(state.currentQuestionId).text,
        reason: 'unclear-answer',
      },
    }
  }

  const shouldExtend = quality === 'unclear'
    || hasMaterialAnswerSignal(state.currentQuestionId, transcript)
  const completedState = {
    ...state,
    answers,
    targetQuestionCount: shouldExtend
      ? Math.min(state.maxQuestionCount, state.targetQuestionCount + 1)
      : state.targetQuestionCount,
  }
  const requiredRemaining = F1_MANDATORY_QUESTION_IDS.filter(id => !completedState.askedQuestionIds.includes(id))
  const hasCoreCoverage = coreCoverageGroups.every(group => group.some(id => completedState.askedQuestionIds.includes(id)))
  const reachedTarget = completedState.askedQuestionIds.length >= completedState.targetQuestionCount

  if (hasCoreCoverage && requiredRemaining.length === 0 && reachedTarget) {
    return { state: completedState, action: { type: 'CLOSE', text: CLOSE_TEXT, reason: 'complete' } }
  }

  if (completedState.askedQuestionIds.length >= completedState.maxQuestionCount) {
    return { state: completedState, action: { type: 'CLOSE', text: CLOSE_TEXT, reason: 'question-limit' } }
  }

  const nextQuestionId = selectNextQuestion(completedState, context, transcript)
  if (!nextQuestionId) {
    return { state: completedState, action: { type: 'CLOSE', text: CLOSE_TEXT, reason: 'complete' } }
  }

  const nextState: F1InterviewState = {
    ...completedState,
    currentQuestionId: nextQuestionId,
    askedQuestionIds: [...completedState.askedQuestionIds, nextQuestionId],
  }
  return {
    state: nextState,
    action: {
      type: 'ASK',
      questionId: nextQuestionId,
      text: getF1Question(nextQuestionId).text,
      reason: explainSelection(nextQuestionId, requiredRemaining),
    },
  }
}

export function isApprovedF1OfficerText(text: string) {
  const normalized = normalizeText(text)
  if (normalized === normalizeText(CLOSE_TEXT)) return true
  return F1_QUESTION_CATALOG.some(question => normalized === normalizeText(question.text))
    || normalized === normalizeText(`Good morning. Passport and I-20, please. ${getF1Question('f1_01').text}`)
}

export function approvedF1QuestionIds(messages: readonly { role: string; text: string }[]) {
  return messages
    .filter(message => message.role === 'officer')
    .flatMap(message => {
      const normalized = normalizeText(message.text)
      const match = F1_QUESTION_CATALOG.find(question => normalized.includes(normalizeText(question.text)))
      return match ? [match.id] : []
    })
}

function selectNextQuestion(state: F1InterviewState, context: UserContext, transcript: string) {
  const unused = F1_QUESTION_CATALOG.filter(question => !state.askedQuestionIds.includes(question.id))
  const remainingSlots = state.maxQuestionCount - state.askedQuestionIds.length
  const mandatory = F1_MANDATORY_QUESTION_IDS.filter(id => !state.askedQuestionIds.includes(id))

  // Mandatory questions are scheduled early enough that the cap can never skip them.
  if (mandatory.length >= remainingSlots) return mandatory[0]

  const uncoveredCore = coreCoverageGroups
    .filter(group => !group.some(id => state.askedQuestionIds.includes(id)))
    .flatMap(group => group)

  const continuation = topicContinuations[state.currentQuestionId] ?? []
  const scored = unused.map(question => ({
    id: question.id,
    score:
      (uncoveredCore.includes(question.id) ? 100 : 0)
      + (continuation.includes(question.id) ? 34 : 0)
      + backgroundRelevance(question.id, context)
      + answerSignalRelevance(question.id, transcript)
      + (question.selection === 'mandatory' ? 24 : 0)
      - question.number / 100,
  }))
  scored.sort((left, right) => right.score - left.score)
  return scored[0]?.id
}

function calculateTargetQuestionCount(context: UserContext, max: number) {
  let target = MIN_TARGET_QUESTIONS
  const sparseFields = [context.purpose, context.major, context.schoolReason, context.majorReason, context.duration]
    .filter(value => !value?.trim()).length
  if (sparseFields >= 2) target += 1
  if (context.hasStudyGap || context.previousVisaDenied || context.hasUsRelatives) target += 1
  if (context.fundingSource === 'relatives' || context.fundingSource === 'other') target += 1
  return Math.min(max, target)
}

function backgroundRelevance(id: F1QuestionId, context: UserContext) {
  switch (id) {
    case 'f1_03': return context.schoolReason ? 28 : 18
    case 'f1_04': return context.major ? 24 : 18
    case 'f1_05': return context.majorReason ? 28 : 20
    case 'f1_07': return context.duration ? 22 : 12
    case 'f1_08': return context.hasStudyGap || context.currentStatus === 'gap' ? 42 : 8
    case 'f1_11': return 32
    case 'f1_12': return context.fundingSource ? 32 : 22
    case 'f1_13': return context.budgetRange ? 28 : 18
    case 'f1_14': return ['parents', 'relatives', 'combined'].includes(context.fundingSource || '') ? 36 : 8
    case 'f1_16': return context.hasUsRelatives ? 48 : 6
    case 'f1_17': return context.previousVisa ? 32 : 8
    case 'f1_18': return context.hasUsRelatives ? 24 : 4
    case 'f1_22': return 12
    default: return 0
  }
}

function answerSignalRelevance(id: F1QuestionId, transcript: string) {
  const text = normalizeText(transcript)
  if (id === 'f1_14' && /parent|father|mother|family|sponsor/.test(text)) return 18
  if (id === 'f1_13' && /money|tuition|cost|budget|dollar/.test(text)) return 18
  if (id === 'f1_16' && /relative|uncle|aunt|cousin|brother|sister/.test(text)) return 20
  if (id === 'f1_17' && /travel|visited|trip|visa/.test(text)) return 16
  if (id === 'f1_11' && /future|graduate|career|return|china/.test(text)) return 16
  return 0
}

function hasMaterialAnswerSignal(questionId: F1QuestionId, transcript: string) {
  const text = normalizeText(transcript)
  if (questionId === 'f1_11' && /\b(stay|remain|not return|no plan|undecided|not sure)\b/.test(text)) return true
  if (questionId === 'f1_12' && /\b(friend|company|uncle|aunt|relative)\b/.test(text)) return true
  if (['f1_19', 'f1_20', 'f1_21'].includes(questionId) && /^(yes|yeah|i have|i do)\b/.test(text)) return true
  return false
}

function classifyAnswer(transcript: string, question: F1QuestionDefinition): F1AnswerRecord['quality'] {
  const text = normalizeText(transcript)
  if (!text) return 'unclear'
  if (isRepeatRequest(text)) return 'repeat-request'
  if (/^(i do not know|i don't know|not sure|no idea|what|huh|sorry)$/i.test(text)) return 'unclear'
  const words = text.split(' ').filter(Boolean)
  if (question.id === 'f1_16' && /^(yes|yeah|i do|i have)\b/.test(text) && words.length < 6) return 'unclear'
  if (question.answerShape !== 'yes-no' && words.length < 3) return 'unclear'
  return 'valid'
}

function isRepeatRequest(text: string) {
  return /\b(pardon|repeat|say (that|it) again|could you repeat|did not hear|didn't hear|cannot hear|can't hear|sorry,? what)\b/i.test(text)
    || /^(sorry|pardon|excuse me)[?!. ]*$/i.test(text)
}

function explainSelection(id: F1QuestionId, requiredRemaining: readonly F1QuestionId[]) {
  if (requiredRemaining.includes(id)) return 'mandatory-coverage'
  if (coreCoverageGroups.some(group => group.includes(id))) return 'core-evidence'
  return 'background-or-answer-signal'
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}
