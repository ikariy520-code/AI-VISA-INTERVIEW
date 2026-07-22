import type { UserContext } from '../types.ts'
import {
  B2_CORE_TOPICS,
  B2_QUESTION_CATALOG,
  getB2Question,
  type B2QuestionDefinition,
  type B2QuestionId,
  type B2QuestionTopic,
} from '../data/b2QuestionCatalog.ts'
import {
  B2_INTERVIEW_CLOSING_LINE,
  B2_INTERVIEW_HARD_LIMIT_SECONDS,
  B2_INTERVIEW_MAX_MAIN_QUESTIONS,
  B2_INTERVIEW_OPENING_LINE,
} from '../data/b2InterviewStandard.ts'

export type B2ControllerAction =
  | { type: 'ASK'; questionId: B2QuestionId; text: string; reason: string }
  | { type: 'REPEAT_CURRENT'; questionId: B2QuestionId; text: string; reason: 'repeat-request' | 'unclear-answer' }
  | { type: 'CLOSE'; text: string; reason: 'complete' | 'question-limit' | 'time-limit' }

export interface B2AnswerRecord {
  questionId: B2QuestionId
  transcript: string
  quality: 'valid' | 'unclear' | 'repeat-request'
}

export interface B2InterviewState {
  currentQuestionId: B2QuestionId
  askedQuestionIds: B2QuestionId[]
  answers: B2AnswerRecord[]
  repeatedQuestionIds: B2QuestionId[]
  targetQuestionCount: number
  maxQuestionCount: number
  startedAt: number
}

const MIN_TARGET_QUESTIONS = 6

const continuations: Partial<Record<B2QuestionId, readonly B2QuestionId[]>> = {
  b2_01: ['b2_02', 'b2_03', 'b2_19'],
  b2_02: ['b2_03', 'b2_10'],
  b2_03: ['b2_04', 'b2_05', 'b2_20'],
  b2_05: ['b2_12'],
  b2_06: ['b2_07', 'b2_21'],
  b2_08: ['b2_09', 'b2_10', 'b2_11'],
  b2_10: ['b2_11', 'b2_22'],
  b2_12: ['b2_13', 'b2_14', 'b2_23'],
  b2_13: ['b2_14', 'b2_23', 'b2_24'],
  b2_15: ['b2_16', 'b2_17', 'b2_18'],
  b2_16: ['b2_17', 'b2_18'],
}

export function createB2InterviewState(context: UserContext, now = Date.now()): B2InterviewState {
  return {
    currentQuestionId: 'b2_01',
    askedQuestionIds: ['b2_01'],
    answers: [],
    repeatedQuestionIds: [],
    targetQuestionCount: calculateTargetQuestionCount(context),
    maxQuestionCount: B2_INTERVIEW_MAX_MAIN_QUESTIONS,
    startedAt: now,
  }
}

export function advanceB2Interview(
  state: B2InterviewState,
  transcript: string,
  context: UserContext,
  now = Date.now(),
): { state: B2InterviewState; action: B2ControllerAction } {
  if (now - state.startedAt >= B2_INTERVIEW_HARD_LIMIT_SECONDS * 1000) {
    return { state, action: { type: 'CLOSE', text: B2_INTERVIEW_CLOSING_LINE, reason: 'time-limit' } }
  }

  const quality = classifyAnswer(transcript, getB2Question(state.currentQuestionId))
  const answers = [...state.answers, { questionId: state.currentQuestionId, transcript: transcript.trim(), quality }]

  if (quality === 'repeat-request') {
    return {
      state: { ...state, answers },
      action: {
        type: 'REPEAT_CURRENT',
        questionId: state.currentQuestionId,
        text: getB2Question(state.currentQuestionId).text,
        reason: 'repeat-request',
      },
    }
  }

  if (quality === 'unclear' && !state.repeatedQuestionIds.includes(state.currentQuestionId)) {
    return {
      state: { ...state, answers, repeatedQuestionIds: [...state.repeatedQuestionIds, state.currentQuestionId] },
      action: {
        type: 'REPEAT_CURRENT',
        questionId: state.currentQuestionId,
        text: getB2Question(state.currentQuestionId).text,
        reason: 'unclear-answer',
      },
    }
  }

  const completedState = { ...state, answers }
  const coveredTopics = new Set(completedState.askedQuestionIds.map(id => getB2Question(id).topic))
  const hasCoreCoverage = B2_CORE_TOPICS.every(topic => coveredTopics.has(topic))
  const reachedTarget = completedState.askedQuestionIds.length >= completedState.targetQuestionCount

  if (hasCoreCoverage && reachedTarget) {
    return { state: completedState, action: { type: 'CLOSE', text: B2_INTERVIEW_CLOSING_LINE, reason: 'complete' } }
  }
  if (completedState.askedQuestionIds.length >= completedState.maxQuestionCount) {
    return { state: completedState, action: { type: 'CLOSE', text: B2_INTERVIEW_CLOSING_LINE, reason: 'question-limit' } }
  }

  const nextQuestionId = selectNextQuestion(completedState, context, transcript, coveredTopics)
  if (!nextQuestionId) {
    return { state: completedState, action: { type: 'CLOSE', text: B2_INTERVIEW_CLOSING_LINE, reason: 'complete' } }
  }
  return {
    state: {
      ...completedState,
      currentQuestionId: nextQuestionId,
      askedQuestionIds: [...completedState.askedQuestionIds, nextQuestionId],
    },
    action: {
      type: 'ASK',
      questionId: nextQuestionId,
      text: getB2Question(nextQuestionId).text,
      reason: coveredTopics.has(getB2Question(nextQuestionId).topic) ? 'background-or-answer-signal' : 'core-topic-coverage',
    },
  }
}

export function isApprovedB2OfficerText(text: string) {
  const normalized = normalizeText(text)
  return normalized === normalizeText(B2_INTERVIEW_CLOSING_LINE)
    || normalized === normalizeText(B2_INTERVIEW_OPENING_LINE)
    || B2_QUESTION_CATALOG.some(question => normalized === normalizeText(question.text))
}

export function identifyB2Question(questionText: string) {
  const normalized = normalizeText(questionText)
  return B2_QUESTION_CATALOG.find(question => normalized.includes(normalizeText(question.text)))
}

function selectNextQuestion(
  state: B2InterviewState,
  context: UserContext,
  transcript: string,
  coveredTopics: ReadonlySet<B2QuestionTopic>,
) {
  const unused = B2_QUESTION_CATALOG.filter(question =>
    !state.askedQuestionIds.includes(question.id) && isApplicable(question, context),
  )
  const continuation = continuations[state.currentQuestionId] ?? []
  const scored = unused.map(question => ({
    id: question.id,
    score:
      (!coveredTopics.has(question.topic) && B2_CORE_TOPICS.includes(question.topic) ? 100 : 0)
      + (continuation.includes(question.id) ? 30 : 0)
      + backgroundRelevance(question.id, context)
      + answerRelevance(question.id, transcript)
      - question.number / 100,
  }))
  scored.sort((left, right) => right.score - left.score)
  return scored[0]?.id
}

function isApplicable(question: B2QuestionDefinition, context: UserContext) {
  switch (question.conditional) {
    case 'tourism': return context.b2Purpose === 'tourism'
    case 'contact': return context.b2Purpose === 'family-visit' || context.b2Purpose === 'friend-visit'
    case 'previous-us-visa': return context.previousVisaAnswer === 'yes'
    case 'denial': return Boolean(context.previousVisaDenied)
    case 'overstay': return Boolean(context.hadOverstay || context.previousVisaAnswer === 'yes')
    case 'third-party-funding': return context.travelFunding !== 'self'
    default: return true
  }
}

function calculateTargetQuestionCount(context: UserContext) {
  let target = MIN_TARGET_QUESTIONS
  if (context.b2Purpose === 'family-visit' || context.b2Purpose === 'friend-visit') target += 1
  if (context.travelFunding && context.travelFunding !== 'self') target += 1
  if (context.previousVisaDenied || context.hadOverstay || context.previousVisaAnswer === 'yes') target += 1
  return Math.min(B2_INTERVIEW_MAX_MAIN_QUESTIONS, target)
}

function backgroundRelevance(id: B2QuestionId, context: UserContext) {
  switch (id) {
    case 'b2_02': return 32
    case 'b2_03': return context.destination ? 30 : 22
    case 'b2_06': return 32
    case 'b2_07': return context.travelBudget ? 24 : 18
    case 'b2_08': return 32
    case 'b2_10': return context.b2CurrentStatus === 'employed' || context.b2CurrentStatus === 'student' ? 28 : 8
    case 'b2_11': return 34
    case 'b2_12': return context.b2Purpose === 'family-visit' || context.b2Purpose === 'friend-visit' ? 44 : 10
    case 'b2_13': return context.usContactRelation ? 36 : 22
    case 'b2_15': return context.travelHistoryRegions?.length ? 22 : 10
    case 'b2_16': return context.previousVisaAnswer === 'yes' ? 42 : 0
    case 'b2_17': return context.previousVisaDenied ? 48 : 0
    case 'b2_18': return context.hadOverstay ? 52 : 8
    case 'b2_21': return context.travelFunding !== 'self' ? 34 : 0
    case 'b2_22': return context.homeTies?.length ? 30 : 18
    default: return 0
  }
}

function answerRelevance(id: B2QuestionId, transcript: string) {
  const text = normalizeText(transcript)
  if (id === 'b2_07' && /费用|预算|花费|钱|美元|人民币|budget|cost/.test(text)) return 18
  if (id === 'b2_12' && /亲属|亲戚|朋友|家人|relative|friend|family/.test(text)) return 22
  if (id === 'b2_14' && /住宿|酒店|住在|hotel|stay/.test(text)) return 16
  if (id === 'b2_22' && /回来|工作|学习|家人|孩子|公司|return|work|family/.test(text)) return 18
  return 0
}

function classifyAnswer(transcript: string, question: B2QuestionDefinition): B2AnswerRecord['quality'] {
  const text = normalizeText(transcript)
  if (!text) return 'unclear'
  if (isRepeatRequest(text)) return 'repeat-request'
  if (/^(不知道|不清楚|没想好|什么|啊|嗯|sorry|what|huh|not sure|i don t know)$/.test(text)) return 'unclear'
  if (question.answerShape === 'open' && text.length < 2) return 'unclear'
  return 'valid'
}

function isRepeatRequest(text: string) {
  return /没听清|没听见|再说一遍|重复一遍|请重复|您说什么|pardon|repeat|say that again|didn t hear|couldn t hear/.test(text)
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[，。！？、,.!?;；:'"“”‘’()（）\s_-]+/g, '').trim()
}
