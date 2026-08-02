import type { UserContext } from '../types.ts'
import type { OfficerType } from '../../voice/types.ts'
import {
  F1_MANDATORY_QUESTION_IDS,
  F1_QUESTION_CATALOG,
  getF1Question,
  type F1QuestionDefinition,
  type F1FollowUpRule,
  type F1QuestionId,
} from '../data/f1QuestionCatalog.ts'
import {
  F1_INTERVIEW_CLOSING_LINE,
  F1_INTERVIEW_HARD_LIMIT_SECONDS,
  F1_INTERVIEW_MAX_MAIN_QUESTIONS,
} from '../data/f1InterviewStandard.ts'
import { resolveInterviewModePolicy } from './interviewModePolicy.ts'

export type F1ControllerAction =
  | { type: 'ASK'; questionId: F1QuestionId; text: string; reason: string }
  | {
      type: 'ASK_FOLLOW_UP'
      questionId: F1QuestionId
      followUpId: string
      text: string
      reason: F1FollowUpRule['when']
      reviewFactor: F1FollowUpRule['reviewFactor']
      officialRuleIds: F1FollowUpRule['officialRuleIds']
    }
  | { type: 'REPEAT_CURRENT'; questionId: F1QuestionId; followUpId?: string; text: string; reason: 'repeat-request' | 'unclear-answer' }
  | { type: 'CLOSE'; text: string; reason: 'complete' | 'question-limit' | 'time-limit' }

export interface F1AnswerRecord {
  questionId: F1QuestionId
  transcript: string
  quality: 'valid' | 'unclear' | 'repeat-request'
  turnKind: 'main' | 'follow-up'
  followUpId?: string
}

export interface F1InterviewState {
  currentQuestionId: F1QuestionId
  askedQuestionIds: F1QuestionId[]
  answers: F1AnswerRecord[]
  repeatedQuestionIds: F1QuestionId[]
  repeatedTurnIds: string[]
  activeFollowUpId?: string
  askedFollowUpIds: string[]
  followUpCounts: Partial<Record<F1QuestionId, number>>
  totalFollowUpCount: number
  targetQuestionCount: number
  maxQuestionCount: number
  startedAt: number
}

export interface F1ControllerOptions {
  now?: number
  maxQuestionCount?: number
  officerType?: OfficerType
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
    repeatedTurnIds: [],
    askedFollowUpIds: [],
    followUpCounts: {},
    totalFollowUpCount: 0,
    targetQuestionCount: calculateTargetQuestionCount(context, maxQuestionCount),
    maxQuestionCount,
    startedAt: options.now ?? Date.now(),
  }
}

/**
 * Pure, local interview controller. It can only return an exact catalog main
 * question, an exact follow-up bound to that question, repeat the active turn,
 * or close the interview. No model-authored officer text enters this path.
 */
export function advanceF1Interview(
  state: F1InterviewState,
  transcript: string,
  context: UserContext,
  options: F1ControllerOptions = {},
): { state: F1InterviewState; action: F1ControllerAction } {
  const now = options.now ?? Date.now()
  const currentState = normalizeState(state)
  if (now - currentState.startedAt >= F1_INTERVIEW_HARD_LIMIT_SECONDS * 1000) {
    return { state: currentState, action: { type: 'CLOSE', text: CLOSE_TEXT, reason: 'time-limit' } }
  }

  const question = getF1Question(currentState.currentQuestionId)
  const activeFollowUp = findFollowUp(question, currentState.activeFollowUpId)
  const quality = activeFollowUp
    ? classifyFollowUpAnswer(transcript)
    : classifyAnswer(transcript, question)
  const turnKind = activeFollowUp ? 'follow-up' : 'main'
  const answers: F1AnswerRecord[] = [...currentState.answers, {
    questionId: currentState.currentQuestionId,
    transcript: transcript.trim(),
    quality,
    turnKind,
    ...(activeFollowUp ? { followUpId: activeFollowUp.id } : {}),
  }]
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

  const shouldExtend = !activeFollowUp && (
    quality === 'unclear' || hasMaterialAnswerSignal(currentState.currentQuestionId, transcript)
  )
  const completedState = {
    ...currentState,
    answers,
    activeFollowUpId: undefined,
    targetQuestionCount: shouldExtend
      ? Math.min(currentState.maxQuestionCount, currentState.targetQuestionCount + 1)
      : currentState.targetQuestionCount,
  }
  const policy = resolveInterviewModePolicy(options.officerType ?? 'standard')

  // A directed clarification is a real follow-up: it asks about the missing
  // fact in the applicant's answer. Prefer it to repeating a compound main
  // question, but do not turn a generic non-answer into an invented topic.
  if (quality === 'unclear' && !activeFollowUp) {
    const directedFollowUp = selectFollowUp(
      question,
      transcript,
      quality,
      completedState,
      policy,
      followUp => followUp.when === 'keyword' || followUp.when === 'affirmative',
    )
    if (directedFollowUp) return startFollowUp(completedState, question, directedFollowUp)
  }

  if (!activeFollowUp) {
    const followUp = selectFollowUp(question, transcript, quality, completedState, policy)
    if (followUp) return startFollowUp(completedState, question, followUp)
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
  const exact = exactOfficerText(text)
  if (exact === exactOfficerText(CLOSE_TEXT)) return true
  return F1_QUESTION_CATALOG.some(question =>
    exact === exactOfficerText(question.text)
    || question.followUps?.some(followUp => exact === exactOfficerText(followUp.text)),
  )
    || exact === exactOfficerText(`Good morning. Passport and I-20, please. ${getF1Question('f1_01').text}`)
}

export function identifyF1InterviewTurn(questionText: string) {
  const exact = exactOfficerText(questionText)
  for (const question of F1_QUESTION_CATALOG) {
    const followUp = question.followUps?.find(candidate => exact === exactOfficerText(candidate.text))
    if (followUp) return { question, followUp }
  }
  const normalized = normalizeText(questionText)
  const question = F1_QUESTION_CATALOG.find(candidate => normalized.includes(normalizeText(candidate.text)))
  return question ? { question, followUp: undefined } : undefined
}

function normalizeState(state: F1InterviewState): F1InterviewState {
  const question = getF1Question(state.currentQuestionId)
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
  const counts: Partial<Record<F1QuestionId, number>> = {}
  for (const question of F1_QUESTION_CATALOG) {
    const count = question.followUps?.filter(followUp => ids.includes(followUp.id)).length ?? 0
    if (count) counts[question.id] = count
  }
  return counts
}

function findFollowUp(question: F1QuestionDefinition, followUpId?: string) {
  return followUpId ? question.followUps?.find(followUp => followUp.id === followUpId) : undefined
}

function selectFollowUp(
  question: F1QuestionDefinition,
  transcript: string,
  quality: F1AnswerRecord['quality'],
  state: F1InterviewState,
  policy: ReturnType<typeof resolveInterviewModePolicy>,
  allow: (followUp: F1FollowUpRule) => boolean = () => true,
) {
  if (state.totalFollowUpCount >= policy.maxFollowUps) return undefined
  if ((state.followUpCounts[question.id] ?? 0) >= policy.maxFollowUpsPerQuestion) return undefined
  return question.followUps?.find(followUp =>
    allow(followUp)
    &&
    !state.askedFollowUpIds.includes(followUp.id)
    && matchesFollowUp(followUp, transcript, quality, policy.shortAnswerWordThreshold),
  )
}

function startFollowUp(
  state: F1InterviewState,
  question: F1QuestionDefinition,
  followUp: F1FollowUpRule,
): { state: F1InterviewState; action: Extract<F1ControllerAction, { type: 'ASK_FOLLOW_UP' }> } {
  const followUpCount = state.followUpCounts[question.id] ?? 0
  const nextState: F1InterviewState = {
    ...state,
    activeFollowUpId: followUp.id,
    askedFollowUpIds: [...state.askedFollowUpIds, followUp.id],
    followUpCounts: { ...state.followUpCounts, [question.id]: followUpCount + 1 },
    totalFollowUpCount: state.totalFollowUpCount + 1,
  }
  return {
    state: nextState,
    action: {
      type: 'ASK_FOLLOW_UP',
      questionId: question.id,
      followUpId: followUp.id,
      text: followUp.text,
      reason: followUp.when,
      reviewFactor: followUp.reviewFactor,
      officialRuleIds: followUp.officialRuleIds,
    },
  }
}

function matchesFollowUp(
  followUp: F1FollowUpRule,
  transcript: string,
  quality: F1AnswerRecord['quality'],
  shortAnswerWordThreshold: number,
) {
  const text = normalizeText(transcript)
  if (isPromptInjection(text)) return false
  switch (followUp.when) {
    case 'affirmative':
      if (hasTargetNegation(followUp.id, text)) return false
      if (!isAffirmativeAnswer(text) && !hasTargetAffirmation(followUp.id, text)) return false
      if (followUp.id === 'f1_16_relative_details' && hasCompleteRelativeDetails(text)) return false
      return true
    case 'negative': return /^(no|nope|i do not|i don t|i have not|i haven t|never)\b/.test(text)
    case 'uncertain':
      if (followUp.id === 'f1_13_annual_total' && hasConcreteMoneyAmount(transcript)) return false
      if (followUp.id === 'f1_07_i20_length' && hasConcreteDuration(transcript)) return false
      return /\b(not sure|maybe|approximately|about|i think|i guess|do not remember|don t remember)\b/.test(text)
    case 'evidence-gap': {
      if (quality !== 'valid') return false
      const hasRiskSignal = followUp.riskKeywords?.some(keyword => containsUnnegatedKeyword(text, keyword)) ?? false
      if (hasRiskSignal) return true
      const hasFactorEvidence = followUp.evidenceKeywords?.some(keyword => text.includes(normalizeText(keyword))) ?? false
      return !hasFactorEvidence && wordCount(text) < shortAnswerWordThreshold
    }
    case 'keyword':
      if (followUp.id === 'f1_12_sponsor_identity' && hasSpecificFundingSource(text)) return false
      if (followUp.id === 'f1_17_us_trip' && explicitlyDeniesUsTravel(text)) return false
      if (followUp.id === 'f1_17_us_trip' && hasCompleteUsTripDetails(text)) return false
      return followUp.keywords?.some(keyword => containsUnnegatedKeyword(text, keyword)) ?? false
    default: return false
  }
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
  if (
    questionId === 'f1_11'
    && ['stay', 'remain', 'not return', 'no plan', 'undecided', 'not sure']
      .some(keyword => containsUnnegatedKeyword(text, keyword))
  ) return true
  if (questionId === 'f1_12' && /\b(friend|company|uncle|aunt|relative)\b/.test(text)) return true
  if (['f1_19', 'f1_20', 'f1_21'].includes(questionId) && /^(yes|yeah|i have|i do)\b/.test(text)) return true
  return false
}

function classifyAnswer(transcript: string, question: F1QuestionDefinition): F1AnswerRecord['quality'] {
  const text = normalizeText(transcript)
  if (!text) return 'unclear'
  if (isRepeatRequest(text)) return 'repeat-request'
  if (isPromptInjection(text)) return 'unclear'
  if (/^(i do not know|i don t know|not sure|no idea|what|huh|sorry)$/i.test(text)) return 'unclear'
  const words = text.split(' ').filter(Boolean)
  if (hasConciseCompleteAnswer(question.id, transcript, text)) return 'valid'
  if (question.answerShape !== 'yes-no' && words.length < 3) return 'unclear'
  return 'valid'
}

function hasConciseCompleteAnswer(questionId: F1QuestionId, raw: string, text: string) {
  switch (questionId) {
    case 'f1_01':
      return wordCount(text) >= 1 && !/^(?:school|university|college|this school|that school)$/.test(text)
    case 'f1_04':
      return wordCount(text) >= 1 && !/^(?:major|program|degree)$/.test(text)
    case 'f1_07':
      return hasConcreteDuration(raw)
    case 'f1_08':
      return /\b(?:student|studying|employed|working|work|unemployed|gap|retired)\b/.test(text)
    case 'f1_09':
    case 'f1_10':
      return wordCount(text) >= 1 && !/^(?:yes|no|maybe)$/.test(text)
    case 'f1_11':
      return /\b(?:return|work|career|job|home|china|continue|graduate|business)\b/.test(text)
    case 'f1_12':
      return hasSpecificFundingSource(text)
    case 'f1_13':
      return hasConcreteMoneyAmount(raw)
    case 'f1_15':
      return /^(?:no|none|only child|i am an only child|i do not|i don t)\b/.test(text)
    case 'f1_17':
      return /^(?:no|never|i have not|i haven t)\b/.test(text)
    case 'f1_18':
      return /\b(?:professor|teacher|adviser|advisor|school|university|relative|friend|employer|company)\b/.test(text)
    default:
      return false
  }
}

function hasSpecificFundingSource(text: string) {
  return /\b(?:parents?|mother|father|myself|self|scholarship|grant|government|employer|company|uncle|aunt|relative|friend|spouse|husband|wife)\b/.test(text)
}

function classifyFollowUpAnswer(transcript: string): F1AnswerRecord['quality'] {
  const text = normalizeText(transcript)
  if (!text) return 'unclear'
  if (isRepeatRequest(text)) return 'repeat-request'
  if (isPromptInjection(text)) return 'unclear'
  if (/^(i do not know|i don t know|not sure|no idea|what|huh|sorry)$/i.test(text)) return 'unclear'
  return 'valid'
}

function isRepeatRequest(text: string) {
  return /\b(pardon|repeat|say (that|it) again|could you repeat|did not hear|didn't hear|cannot hear|can't hear|sorry,? what)\b/i.test(text)
    || /^(sorry|pardon|excuse me)[?!. ]*$/i.test(text)
}

function isPromptInjection(text: string) {
  return /\b(ignore|forget|disregard)\b.{0,24}\b(instruction|instructions|rule|rules|prompt)\b/.test(text)
    || /\b(ask me about|change the (subject|topic)|let s (chat|talk)|stop the interview)\b/.test(text)
}

function explainSelection(id: F1QuestionId, requiredRemaining: readonly F1QuestionId[]) {
  if (requiredRemaining.includes(id)) return 'mandatory-coverage'
  if (coreCoverageGroups.some(group => group.includes(id))) return 'core-evidence'
  return 'background-or-answer-signal'
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function exactOfficerText(value: string) {
  return value.trim()
}

function wordCount(value: string) {
  return value.split(' ').filter(Boolean).length
}

function containsUnnegatedKeyword(text: string, keyword: string) {
  const target = normalizeText(keyword)
  if (!target) return false
  // Some approved risk phrases are intentionally negative (for example
  // "not sure" and "not working") and must remain actionable as written.
  if (/^(not|no|never)\b/.test(target)) return text.includes(target)

  let offset = 0
  while (offset < text.length) {
    const index = text.indexOf(target, offset)
    if (index < 0) return false
    const prefix = text.slice(Math.max(0, index - 36), index).trim()
    const negated = /\b(?:not|never|no|isn t|aren t|wasn t|weren t|don t|doesn t|didn t|won t|wouldn t|cannot|can t)(?:\s+\w+)?\s*$/.test(prefix)
    if (!negated) return true
    offset = index + target.length
  }
  return false
}

function explicitlyDeniesUsTravel(text: string) {
  const destination = '(?:the\\s+)?(?:united states|usa|u s|america)'
  const deniedTrip = new RegExp(
    `\\b(?:(?:have|had|did)\\s+)?(?:never|not|haven t|hadn t|didn t)\\s+(?:ever\\s+)?(?:been|travel(?:ed|led)?|visit(?:ed)?|gone|go|went)(?:\\s+\\w+){0,4}\\s+(?:to\\s+)?${destination}\\b`,
  )
  const deniedDestination = new RegExp(`\\b(?:never|not)\\s+(?:been\\s+)?to\\s+${destination}\\b`)
  return deniedTrip.test(text) || deniedDestination.test(text)
}

function isAffirmativeAnswer(text: string) {
  if (/^(?:no|nope|never)\b/.test(text)) return false
  if (/^i (?:do|did|have|had|am|was|were) (?:not|never|no)\b/.test(text)) return false
  if (/^there (?:is|are) (?:not|no)\b|^there (?:isn t|aren t)\b/.test(text)) return false
  return /^(?:yes|yeah|yep|i do|i have|i did|there (?:is|are))\b/.test(text)
}

function hasTargetNegation(followUpId: string, text: string) {
  switch (followUpId) {
    case 'f1_16_relative_details':
      return /\b(?:do not|don t|have not|haven t|never)\s+(?:(?:have|had)\s+)?(?:any\s+)?relatives?\b/.test(text)
        || /\b(?:have|had) no relatives?\b/.test(text)
        || /\bthere (?:is|are) (?:not|no)\b.{0,24}\brelatives?\b/.test(text)
        || /\bthere (?:isn t|aren t)\b.{0,24}\brelatives?\b/.test(text)
    case 'f1_19_brief_details':
      return /\b(?:did not|didn t|have not|haven t|never)\s+(?:experience|experienced|suffer|suffered)\b/.test(text)
        || /\b(?:was|were) not (?:harmed|mistreated)\b/.test(text)
    case 'f1_20_return_concern':
      return /\b(?:do not|don t|would not|wouldn t|will not|won t)\s+(?:fear|be afraid|be concerned)\b/.test(text)
        || /\b(?:am|was) not (?:afraid|concerned)\b/.test(text)
        || /\bno fear\b/.test(text)
    case 'f1_21_trip_details':
      return /\b(?:have not|haven t|had not|hadn t|did not|didn t|never)\b.{0,32}\b(?:travel|traveled|travelled|visit|visited|go|gone|been)\b.{0,24}\bafrica\b/.test(text)
        || /\b(?:not|never) been to africa\b/.test(text)
    default:
      return false
  }
}

function hasTargetAffirmation(followUpId: string, text: string) {
  switch (followUpId) {
    case 'f1_16_relative_details':
      return /\b(?:parent|mother|father|sister|brother|sibling|aunt|uncle|cousin|grandparent|grandmother|grandfather|relative)\b/.test(text)
        && (/\b(?:united states|u s|usa|america)\b/.test(text) || US_STATE_NAMES.some(state => text.includes(state)))
    case 'f1_19_brief_details':
      return /\b(?:experienced|suffered|was harmed|was mistreated)\b/.test(text)
    case 'f1_20_return_concern':
      return /\b(?:i fear|i am afraid|i am concerned|fear returning|concerned about returning)\b/.test(text)
    case 'f1_21_trip_details':
      return /\b(?:traveled|travelled|visited|went|been)\b/.test(text)
        && (text.includes('africa') || AFRICAN_COUNTRIES.some(country => text.includes(country)))
    default:
      return false
  }
}

function hasCompleteRelativeDetails(text: string) {
  const hasRelationship = /\b(?:parent|mother|father|sister|brother|sibling|aunt|uncle|cousin|grandparent|grandmother|grandfather|relative)\b/.test(text)
  const hasLocation = /\b(?:lives?|resides?)\s+in\b/.test(text)
    || /\bstate\b/.test(text)
    || US_STATE_NAMES.some(state => text.includes(state))
  const hasOccupation = /\b(?:works?|employed|student|retired|doctor|engineer|teacher|accountant|manager|business owner)\b/.test(text)
    || /\b(?:works? as|employed as|is an?)\s+[a-z][a-z-]+\b/.test(text)
  return hasRelationship && hasLocation && hasOccupation
}

function hasCompleteUsTripDetails(text: string) {
  const hasPurpose = /\b(?:tourism|tourist|vacation|business|conference|study|studied|visit|visited|family|medical)\b/.test(text)
  const hasDeparture = /\b(?:left|departed|returned|came back)\b/.test(text)
    && /\b(?:on time|as scheduled|within (?:the )?authorized|before (?:my )?(?:visa|status|authorized stay))\b/.test(text)
  return hasPurpose && hasDeparture
}

const US_STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
  'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky',
  'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
  'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia',
] as const

const AFRICAN_COUNTRIES = [
  'algeria', 'angola', 'benin', 'botswana', 'burkina faso', 'burundi', 'cabo verde', 'cameroon',
  'central african republic', 'chad', 'comoros', 'congo', 'ivory coast', 'djibouti', 'egypt',
  'equatorial guinea', 'eritrea', 'eswatini', 'ethiopia', 'gabon', 'gambia', 'ghana', 'guinea',
  'guinea bissau', 'kenya', 'lesotho', 'liberia', 'libya', 'madagascar', 'malawi', 'mali',
  'mauritania', 'mauritius', 'morocco', 'mozambique', 'namibia', 'niger', 'nigeria', 'rwanda',
  'sao tome', 'senegal', 'seychelles', 'sierra leone', 'somalia', 'south africa', 'south sudan',
  'sudan', 'tanzania', 'togo', 'tunisia', 'uganda', 'zambia', 'zimbabwe',
] as const

function hasConcreteMoneyAmount(value: string) {
  const text = value.toLowerCase()
  return /[$¥€£]\s*\d/.test(text)
    || /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/.test(text)
    || /\b\d{4,}(?:\.\d+)?\b/.test(text)
    || /\b\d+(?:\.\d+)?\s*(?:k|thousand|million|usd|dollars?|rmb|yuan)\b/.test(text)
    || SPOKEN_MONEY_AMOUNT_REGEX.test(text)
}

const SPOKEN_NUMBER_WORD = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)'
const SPOKEN_MONEY_AMOUNT_REGEX = new RegExp(
  `\\b${SPOKEN_NUMBER_WORD}(?:[-\\s]+(?:and\\s+)?${SPOKEN_NUMBER_WORD}){0,8}\\s+(?:usd|dollars?|rmb|yuan)\\b`,
)

function hasConcreteDuration(value: string) {
  const text = normalizeText(value)
  return /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:weeks?|months?|semesters?|academic years?|years?)\b/.test(text)
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}
