import type { OfficerEmotion, OfficerTurn, UserContext } from '../types'
import {
  F1_MANDATORY_QUESTION_IDS,
  F1_QUESTION_CATALOG,
  getF1Question,
  type F1FollowUpRule,
  type F1QuestionDefinition,
  type F1QuestionId,
} from '../data/f1QuestionCatalog'

export interface F1InterviewFlowOptions {
  /** Injectable seed keeps smoke tests deterministic. Production defaults to a fresh session seed. */
  seed?: number
  targetMainQuestions?: number
}

interface AnswerSignals {
  wordCount: number
  affirmative: boolean
  negative: boolean
  uncertain: boolean
  lower: string
}

interface ActiveTurn {
  kind: 'opening' | 'main' | 'follow-up'
  text: string
  questionId?: F1QuestionId
  followUpId?: string
}

const OPENING_TEXT = 'Good morning. May I see your passport and I-20, please?'
const CLOSING_TEXT = 'Thank you. That concludes the interview. Your responses will now be reviewed for coaching feedback.'
const MIN_TARGET = 11
const MAX_TARGET = 13

const STAGE_EMOTION: Record<string, OfficerEmotion> = {
  BASIC_INFO: 'friendly',
  SCHOOL_AND_MAJOR: 'neutral',
  ACADEMIC_PLAN: 'curious',
  CURRENT_STATUS: 'neutral',
  FUNDING_CHECK: 'stern',
  FAMILY_AND_TIES: 'neutral',
  FUTURE_PLAN: 'thoughtful',
  TRAVEL_HISTORY: 'curious',
  SECURITY_AND_DS160: 'stern',
}

function createRandom(seed: number) {
  let value = seed || 0x6d2b79f5
  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let result = Math.imul(value ^ (value >>> 15), 1 | value)
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function classifyAnswer(answer: string): AnswerSignals {
  const normalized = answer.trim()
  const lower = normalized.toLowerCase()
  const wordCount = normalized.split(/\s+/).filter(Boolean).length
  const affirmative = /^(yes|yeah|yep|i have|i did|i do|i am|i would)\b/.test(lower)
  const negative = /^(no|nope|never|i have not|i haven't|i did not|i didn't|i do not|i don't|i would not|i wouldn't)\b/.test(lower)
  const uncertain = [
    'not sure', "don't know", 'do not know', 'maybe', 'probably', 'i guess',
    'not certain', "can't remember", 'cannot remember', 'it depends',
  ].some(phrase => lower.includes(phrase))
  return { wordCount, affirmative, negative, uncertain, lower }
}

function followUpMatches(rule: F1FollowUpRule, signals: AnswerSignals): boolean {
  if (rule.when === 'affirmative') return signals.affirmative
  if (rule.when === 'negative') return signals.negative
  if (rule.when === 'uncertain') return signals.uncertain
  if (rule.when === 'short') return signals.wordCount > 0 && signals.wordCount < 5
  return Boolean(rule.keywords?.some(keyword => signals.lower.includes(keyword.toLowerCase())))
}

export function buildF1QuestionPlan(
  context: UserContext,
  options: F1InterviewFlowOptions = {},
): F1QuestionId[] {
  const seed = options.seed ?? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff))
  const random = createRandom(seed)
  const target = Math.min(MAX_TARGET, Math.max(MIN_TARGET, options.targetMainQuestions ?? 12))
  const plan: F1QuestionId[] = ['f1_01', 'f1_04']
  const add = (id: F1QuestionId) => {
    if (!plan.includes(id)) plan.push(id)
  }

  add(shuffled<F1QuestionId>(['f1_02', 'f1_03'], random)[0])
  add(shuffled<F1QuestionId>(['f1_05', 'f1_06', 'f1_07'], random)[0])
  add(shuffled<F1QuestionId>(['f1_08', 'f1_09', 'f1_10'], random)[0])
  add('f1_11')
  add('f1_12')

  const adaptive: F1QuestionId[] = []
  if (context.hasUsRelatives) adaptive.push('f1_16')
  if (context.previousVisa || context.previousVisaDenied) adaptive.push('f1_17')
  if (context.usRelativeType) adaptive.push('f1_18')
  if (context.fundingSource === 'parents' || context.fundingSource === 'combined') adaptive.push('f1_14')
  else adaptive.push('f1_13')
  adaptive.push('f1_15', 'f1_18', 'f1_17', 'f1_13', 'f1_14')

  const reservedTail = [...F1_MANDATORY_QUESTION_IDS, 'f1_22'] as F1QuestionId[]
  for (const id of adaptive) {
    if (plan.length >= target - reservedTail.length) break
    add(id)
  }

  for (const id of reservedTail) add(id)
  return plan.slice(0, target - reservedTail.length).concat(reservedTail)
}

export function createInterviewFlow(
  userContext: UserContext,
  options: F1InterviewFlowOptions = {},
) {
  const plan = buildF1QuestionPlan(userContext, options)
  const askedMainQuestionIds: F1QuestionId[] = []
  const askedFollowUpIds: string[] = []
  const answers: Array<{ questionId?: F1QuestionId; followUpId?: string; answer: string }> = []
  const riskFlags: string[] = []
  let planIndex = 0
  let activeTurn: ActiveTurn | null = null
  let pendingFollowUp: { question: F1QuestionDefinition; rule: F1FollowUpRule } | null = null
  let ended = false

  function evaluateActiveAnswer(answer: string) {
    if (!activeTurn || !answer.trim()) return
    answers.push({ questionId: activeTurn.questionId, followUpId: activeTurn.followUpId, answer: answer.trim() })
    if (activeTurn.kind !== 'main' || !activeTurn.questionId) return

    const question = getF1Question(activeTurn.questionId)
    const signals = classifyAnswer(answer)
    if (signals.uncertain) riskFlags.push(`uncertain:${question.id}`)
    if (question.answerShape === 'open' && signals.wordCount > 0 && signals.wordCount < 3) {
      riskFlags.push(`short:${question.id}`)
    }
    const matchedRule = question.followUps.find(rule => followUpMatches(rule, signals))
    if (matchedRule) pendingFollowUp = { question, rule: matchedRule }
  }

  function nextTurn(lastUserAnswer?: string): OfficerTurn {
    if (ended) return { text: CLOSING_TEXT, emotion: 'reassuring', isClosing: true }
    if (lastUserAnswer !== undefined) evaluateActiveAnswer(lastUserAnswer)

    if (!activeTurn) {
      activeTurn = { kind: 'opening', text: OPENING_TEXT }
      return { text: OPENING_TEXT, emotion: 'friendly', isDocumentRequest: true }
    }

    if (pendingFollowUp) {
      const { question, rule } = pendingFollowUp
      pendingFollowUp = null
      askedFollowUpIds.push(rule.id)
      activeTurn = { kind: 'follow-up', text: rule.text, questionId: question.id, followUpId: rule.id }
      return {
        text: rule.text,
        emotion: question.sensitive ? 'neutral' : 'stern',
        isDocumentRequest: false,
      }
    }

    const nextId = plan[planIndex]
    if (!nextId) {
      ended = true
      activeTurn = null
      return { text: CLOSING_TEXT, emotion: 'reassuring', isClosing: true }
    }

    planIndex += 1
    const question = getF1Question(nextId)
    askedMainQuestionIds.push(nextId)
    activeTurn = { kind: 'main', text: question.text, questionId: question.id }
    return {
      text: question.text,
      emotion: STAGE_EMOTION[question.stage] ?? 'neutral',
      isDocumentRequest: false,
    }
  }

  return {
    nextTurn,
    /** Compatibility hook. Prefer passing the answer directly to nextTurn(). */
    evaluateAnswer: (answer: string) => evaluateActiveAnswer(answer),
    getState: () => ({
      plan: [...plan],
      planIndex,
      askedMainQuestionIds: [...askedMainQuestionIds],
      askedFollowUpIds: [...askedFollowUpIds],
      answers: [...answers],
      riskFlags: [...riskFlags],
      activeTurn: activeTurn ? { ...activeTurn } : null,
      ended,
    }),
    isEnded: () => ended,
  }
}

export { F1_QUESTION_CATALOG }
