import type { UserContext } from '../types.ts'
import type { OfficerType } from '../../voice/types.ts'
import {
  B2_CORE_TOPICS,
  B2_QUESTION_CATALOG,
  getB2Question,
  type B2QuestionDefinition,
  type B2FollowUpRule,
  type B2QuestionId,
  type B2QuestionTopic,
} from '../data/b2QuestionCatalog.ts'
import {
  B2_INTERVIEW_CLOSING_LINE,
  B2_INTERVIEW_HARD_LIMIT_SECONDS,
  B2_INTERVIEW_MAX_MAIN_QUESTIONS,
  B2_INTERVIEW_OPENING_LINE,
} from '../data/b2InterviewStandard.ts'
import { resolveInterviewModePolicy } from './interviewModePolicy.ts'

export type B2ControllerAction =
  | { type: 'ASK'; questionId: B2QuestionId; text: string; reason: string }
  | { type: 'ASK_FOLLOW_UP'; questionId: B2QuestionId; followUpId: string; text: string; reason: B2FollowUpRule['when'] }
  | { type: 'REPEAT_CURRENT'; questionId: B2QuestionId; followUpId?: string; text: string; reason: 'repeat-request' | 'unclear-answer' }
  | { type: 'CLOSE'; text: string; reason: 'complete' | 'question-limit' | 'time-limit' }

export interface B2AnswerRecord {
  questionId: B2QuestionId
  transcript: string
  quality: 'valid' | 'unclear' | 'repeat-request'
  turnKind: 'main' | 'follow-up'
  followUpId?: string
}

export interface B2InterviewState {
  currentQuestionId: B2QuestionId
  askedQuestionIds: B2QuestionId[]
  answers: B2AnswerRecord[]
  repeatedQuestionIds: B2QuestionId[]
  repeatedTurnIds: string[]
  activeFollowUpId?: string
  askedFollowUpIds: string[]
  followUpCounts: Partial<Record<B2QuestionId, number>>
  totalFollowUpCount: number
  targetQuestionCount: number
  maxQuestionCount: number
  startedAt: number
}

export interface B2ControllerOptions {
  now?: number
  officerType?: OfficerType
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

export function createB2InterviewState(
  context: UserContext,
  options: number | B2ControllerOptions = {},
): B2InterviewState {
  const { now } = resolveOptions(options)
  return {
    currentQuestionId: 'b2_01',
    askedQuestionIds: ['b2_01'],
    answers: [],
    repeatedQuestionIds: [],
    repeatedTurnIds: [],
    askedFollowUpIds: [],
    followUpCounts: {},
    totalFollowUpCount: 0,
    targetQuestionCount: calculateTargetQuestionCount(context),
    maxQuestionCount: B2_INTERVIEW_MAX_MAIN_QUESTIONS,
    startedAt: now ?? Date.now(),
  }
}

export function advanceB2Interview(
  state: B2InterviewState,
  transcript: string,
  context: UserContext,
  options: number | B2ControllerOptions = {},
): { state: B2InterviewState; action: B2ControllerAction } {
  const { now = Date.now(), officerType = 'standard' } = resolveOptions(options)
  const currentState = normalizeState(state)
  if (now - currentState.startedAt >= B2_INTERVIEW_HARD_LIMIT_SECONDS * 1000) {
    return { state: currentState, action: { type: 'CLOSE', text: B2_INTERVIEW_CLOSING_LINE, reason: 'time-limit' } }
  }

  const question = getB2Question(currentState.currentQuestionId)
  const activeFollowUp = findFollowUp(question, currentState.activeFollowUpId)
  const quality = activeFollowUp ? classifyFollowUpAnswer(transcript) : classifyAnswer(transcript, question)
  const turnKind = activeFollowUp ? 'follow-up' : 'main'
  const answers: B2AnswerRecord[] = [...currentState.answers, {
    questionId: currentState.currentQuestionId,
    transcript: transcript.trim(),
    quality,
    turnKind,
    ...(activeFollowUp ? { followUpId: activeFollowUp.id } : {}),
  }]
  const turnId = activeFollowUp ? `follow-up:${activeFollowUp.id}` : `main:${currentState.currentQuestionId}`
  const activeText = activeFollowUp?.text ?? question.text

  if (quality === 'repeat-request') {
    return {
      state: { ...currentState, answers },
      action: {
        type: 'REPEAT_CURRENT',
        questionId: currentState.currentQuestionId,
        ...(activeFollowUp ? { followUpId: activeFollowUp.id } : {}),
        text: activeText,
        reason: 'repeat-request',
      },
    }
  }

  if (quality === 'unclear' && !currentState.repeatedTurnIds.includes(turnId)) {
    return {
      state: {
        ...currentState,
        answers,
        repeatedQuestionIds: activeFollowUp
          ? currentState.repeatedQuestionIds
          : unique([...currentState.repeatedQuestionIds, currentState.currentQuestionId]),
        repeatedTurnIds: [...currentState.repeatedTurnIds, turnId],
      },
      action: {
        type: 'REPEAT_CURRENT',
        questionId: currentState.currentQuestionId,
        ...(activeFollowUp ? { followUpId: activeFollowUp.id } : {}),
        text: activeText,
        reason: 'unclear-answer',
      },
    }
  }

  const completedState = { ...currentState, answers, activeFollowUpId: undefined }

  if (!activeFollowUp) {
    const policy = resolveInterviewModePolicy(officerType)
    const followUp = selectFollowUp(question, transcript, quality, completedState, policy)
    if (followUp) {
      const followUpCount = completedState.followUpCounts[question.id] ?? 0
      const nextState: B2InterviewState = {
        ...completedState,
        activeFollowUpId: followUp.id,
        askedFollowUpIds: [...completedState.askedFollowUpIds, followUp.id],
        followUpCounts: { ...completedState.followUpCounts, [question.id]: followUpCount + 1 },
        totalFollowUpCount: completedState.totalFollowUpCount + 1,
      }
      return {
        state: nextState,
        action: {
          type: 'ASK_FOLLOW_UP',
          questionId: question.id,
          followUpId: followUp.id,
          text: followUp.text,
          reason: followUp.when,
        },
      }
    }
  }

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
  const exact = exactOfficerText(text)
  return exact === exactOfficerText(B2_INTERVIEW_CLOSING_LINE)
    || exact === exactOfficerText(B2_INTERVIEW_OPENING_LINE)
    || B2_QUESTION_CATALOG.some(question =>
      exact === exactOfficerText(question.text)
      || question.followUps?.some(followUp => exact === exactOfficerText(followUp.text)),
    )
}

function normalizeState(state: B2InterviewState): B2InterviewState {
  const question = getB2Question(state.currentQuestionId)
  const activeFollowUpId = findFollowUp(question, state.activeFollowUpId)?.id
  const askedFollowUpIds = unique(state.askedFollowUpIds ?? [])
  return {
    ...state,
    repeatedTurnIds: state.repeatedTurnIds ?? (state.repeatedQuestionIds ?? []).map(id => `main:${id}`),
    activeFollowUpId,
    askedFollowUpIds,
    followUpCounts: state.followUpCounts ?? countFollowUpsByQuestion(askedFollowUpIds),
    totalFollowUpCount: state.totalFollowUpCount ?? askedFollowUpIds.length,
  }
}

function countFollowUpsByQuestion(ids: readonly string[]) {
  const counts: Partial<Record<B2QuestionId, number>> = {}
  for (const question of B2_QUESTION_CATALOG) {
    const count = question.followUps?.filter(followUp => ids.includes(followUp.id)).length ?? 0
    if (count) counts[question.id] = count
  }
  return counts
}

function findFollowUp(question: B2QuestionDefinition, followUpId?: string) {
  return followUpId ? question.followUps?.find(followUp => followUp.id === followUpId) : undefined
}

function selectFollowUp(
  question: B2QuestionDefinition,
  transcript: string,
  quality: B2AnswerRecord['quality'],
  state: B2InterviewState,
  policy: ReturnType<typeof resolveInterviewModePolicy>,
) {
  if (state.totalFollowUpCount >= policy.maxFollowUps) return undefined
  if ((state.followUpCounts[question.id] ?? 0) >= policy.maxFollowUpsPerQuestion) return undefined
  return question.followUps?.find(followUp =>
    !state.askedFollowUpIds.includes(followUp.id)
    && matchesFollowUp(followUp, transcript, quality, policy.shortAnswerCharacterThreshold),
  )
}

function matchesFollowUp(
  followUp: B2FollowUpRule,
  transcript: string,
  quality: B2AnswerRecord['quality'],
  shortAnswerThreshold: number,
) {
  const text = normalizeText(transcript)
  switch (followUp.when) {
    case 'affirmative': return /^(是|是的|有|我有|去过|我(?:以前)?去过|以前去过|yes|yeah|i do|i have|i did)/.test(text)
    case 'negative': return /^(不|没有|没去过|从未|no|never|i do not|i don t)/.test(text)
    case 'uncertain':
      if (followUp.id === 'b2_07_budget' && hasConcreteMoneyAmount(transcript)) return false
      if (followUp.id === 'b2_01_specific_purpose' && hasConcreteVisitPurpose(text)) return false
      return quality === 'unclear' || /(不确定|不清楚|还没想好|大概|可能|应该|随便|看看|有点事|notsure|maybe|about)/.test(text)
    case 'short': return quality === 'valid' && meaningfulLength(transcript) < shortAnswerThreshold
    case 'keyword': return followUp.keywords?.some(keyword => containsUnnegatedKeyword(text, keyword)) ?? false
    default: return false
  }
}

export function identifyB2Question(questionText: string) {
  return identifyB2InterviewTurn(questionText)?.question
}

export function identifyB2InterviewTurn(questionText: string) {
  const exact = exactOfficerText(questionText)
  for (const question of B2_QUESTION_CATALOG) {
    const followUp = question.followUps?.find(candidate => exact === exactOfficerText(candidate.text))
    if (followUp) return { question, followUp }
  }
  const normalized = normalizeText(questionText)
  const question = B2_QUESTION_CATALOG.find(candidate => normalized.includes(normalizeText(candidate.text)))
  return question ? { question, followUp: undefined } : undefined
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
  if (isPromptInjection(text)) return 'unclear'
  if (/^(不知道|不清楚|没想好|什么|啊|嗯|sorry|what|huh|notsure|idontknow)$/.test(text)) return 'unclear'
  if (question.answerShape === 'open' && text.length < 2) return 'unclear'
  return 'valid'
}

function classifyFollowUpAnswer(transcript: string): B2AnswerRecord['quality'] {
  const text = normalizeText(transcript)
  if (!text) return 'unclear'
  if (isRepeatRequest(text)) return 'repeat-request'
  if (isPromptInjection(text)) return 'unclear'
  if (/^(不知道|不清楚|没想好|什么|啊|嗯|sorry|what|huh|notsure|idontknow)$/.test(text)) return 'unclear'
  return 'valid'
}

function isRepeatRequest(text: string) {
  return /没听清|没听见|再说一遍|重复一遍|请重复|您说什么|pardon|repeat|saythatagain|didnthear|couldnthear/.test(text)
}

function isPromptInjection(text: string) {
  return /忽略.{0,12}(规则|指令|提示)|别问签证|换个话题|聊点别的|问我.{0,8}(电影|游戏|体育)/.test(text)
    || /(ignore|forget|disregard).{0,24}(instruction|instructions|rule|rules|prompt)/.test(text)
    || /(askmeabout|changethe(subject|topic)|letschat|stoptheinterview)/.test(text)
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[，。！？、,.!?;；:'"“”‘’()（）\s_-]+/g, '').trim()
}

function exactOfficerText(value: string) {
  return value.trim()
}

function meaningfulLength(value: string) {
  const hanCharacters = value.match(/[\p{Script=Han}]/gu)?.length ?? 0
  const latinWords = value
    .replace(/[\p{Script=Han}]/gu, ' ')
    .toLowerCase()
    .match(/[a-z0-9]+/g)?.length ?? 0
  return hanCharacters + latinWords
}

function containsUnnegatedKeyword(text: string, keyword: string) {
  const target = normalizeText(keyword)
  if (!target) return false

  let offset = 0
  while (offset < text.length) {
    const index = text.indexOf(target, offset)
    if (index < 0) return false
    const prefix = text.slice(Math.max(0, index - 8), index)
    if (!/(?:不是(?:由)?|并非(?:由)?|不由|不用|不靠|没有|非)$/.test(prefix)) return true
    offset = index + target.length
  }
  return false
}

function hasConcreteMoneyAmount(value: string) {
  const text = normalizeText(value)
  return /(?:\d+(?:万|千|百)?|[零〇一二两三四五六七八九十百千万亿]+)(?:元|人民币|美元|美金)/.test(text)
}

function hasConcreteVisitPurpose(text: string) {
  return /旅游|观光|探亲|访友|商务|开会|会议|参展|就医|医疗|短期访问|tourism|visitfamily|visitfriends|business|conference|medical/.test(text)
}

function resolveOptions(options: number | B2ControllerOptions): B2ControllerOptions {
  return typeof options === 'number' ? { now: options } : options
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)]
}
