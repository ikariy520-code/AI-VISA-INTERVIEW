import assert from 'node:assert/strict'
import { F1_MANDATORY_QUESTION_IDS, F1_QUESTION_CATALOG } from '../src/modules/practice/data/f1QuestionCatalog'
import { createInterviewFlow } from '../src/modules/practice/services/interviewFlow'
import type { ChatMessage, UserContext } from '../src/modules/practice/types'
import { normalizeInterviewSession } from '../src/modules/feedback/normalizeSession'
import { extractQAPairs } from '../src/modules/shared/store/analysisEngine'
import {
  classifyF1DialogueActLocally,
  parseDoubaoAssessment,
  sanitizeF1DecisionRequest,
  type F1AnswerAssessment,
} from '../src/shared/doubaoDecision'

const context: UserContext = {
  visaType: 'F1',
  purpose: 'Example University',
  destination: '',
  duration: '2 years',
  previousVisa: false,
  occupation: 'student',
  notes: '',
  major: 'Computer Science',
  currentStatus: 'student',
  fundingSource: 'parents',
  hasUsRelatives: false,
  previousVisaDenied: false,
  postGraduationPlan: 'return-work',
  homeTies: ['career', 'family-responsibility'],
}

assert.equal(F1_QUESTION_CATALOG.length, 22, 'The product catalog must contain exactly 22 F1 questions')
assert.equal(new Set(F1_QUESTION_CATALOG.map(question => question.id)).size, 22, 'F1 question IDs must be unique')
assert.deepEqual(F1_QUESTION_CATALOG.map(question => question.number), Array.from({ length: 22 }, (_, index) => index + 1))

const validAssessmentJson = JSON.stringify({
  dialogueAct: 'partial_answer',
  relevance: 3,
  specificity: 2,
  clarity: 4,
  isUncertain: true,
  isContradictory: false,
  contradictsQuestionIds: [],
  needsFollowUp: true,
  allowedFollowUpId: 'f1_01_clarify',
  riskSignals: ['uncertain'],
  decisionReason: 'uncertain',
  recommendedNextQuestionId: null,
})
assert.ok(parseDoubaoAssessment(validAssessmentJson, ['f1_01_clarify']), 'A valid Doubao decision must parse')
assert.equal(parseDoubaoAssessment(validAssessmentJson, ['another_follow_up']), null, 'An unapproved follow-up ID must be rejected')

const sanitizedDecision = sanitizeF1DecisionRequest({
  questionId: 'f1_01',
  questionText: 'Which school will you study at?',
  answer: 'My email is person@example.com and my passport number is E12345678.',
  allowedFollowUps: [],
  candidateNextQuestions: [{ id: 'f1_04', text: 'What is your major?', stage: 'BASIC_INFO', topic: 'major' }],
  recentTurns: [],
  safeContext: { visaType: 'F1', major: 'Computer Science', passportNumber: 'E12345678' },
})
assert.ok(sanitizedDecision)
assert.ok(sanitizedDecision?.answer.includes('[redacted email]'), 'Email addresses must be redacted before the provider call')
assert.ok(sanitizedDecision?.answer.includes('[redacted identifier]'), 'Document identifiers must be redacted before the provider call')
assert.equal('passportNumber' in (sanitizedDecision?.safeContext ?? {}), false, 'Unapproved context fields must be removed')
assert.deepEqual(sanitizedDecision?.candidateNextQuestions.map(item => item.id), ['f1_04'])

assert.equal(classifyF1DialogueActLocally('Sorry, pardon?'), 'repeat_request')
assert.equal(classifyF1DialogueActLocally("I couldn't hear that."), 'did_not_hear')
assert.equal(classifyF1DialogueActLocally('[NO_SPEECH]'), 'silence')
assert.equal(classifyF1DialogueActLocally('(No speech detected)'), 'silence')

const reportMessages: ChatMessage[] = [
  { id: 'o1', role: 'officer', text: 'Which school will you study at?', timestamp: '00:01' },
  { id: 'u1', role: 'user', text: 'Sorry, pardon?', timestamp: '00:03' },
  { id: 'o2', role: 'officer', text: 'Which school will you study at?', timestamp: '00:04' },
  { id: 'u2', role: 'user', text: 'I will study at Example University.', timestamp: '00:07' },
  { id: 'o3', role: 'officer', text: 'Why did you choose this school?', timestamp: '00:09' },
  { id: 'u3', role: 'user', text: '(No speech detected)', timestamp: '00:13' },
  { id: 'o4', role: 'officer', text: 'Why did you choose this school?', timestamp: '00:14' },
  { id: 'u4', role: 'user', text: 'Its program fits my academic plan.', timestamp: '00:19' },
]
const reportPairs = extractQAPairs(reportMessages)
assert.deepEqual(
  reportPairs.map(pair => pair.answer),
  ['I will study at Example University.', 'Its program fits my academic plan.'],
  'Repeat requests and silence must not be scored as substantive answers in the final report',
)

const normalizedMalformedReport = normalizeInterviewSession({
  id: 'malformed-report',
  title: 'F1 report',
  overallScore: 'not-a-number',
  transcript: [{
    id: 'q1',
    question: 'Which school will you study at?',
    answer: 'Example University.',
    feedback: {
      verdict: 'unexpected-verdict',
      voice: {
        metrics: { fillers: { invalid: true }, wordsPerMinute: 'fast' },
        emotion: { primary: 'unknown', description: { invalid: true } },
      },
      content: {
        dimensions: [{ label: '逻辑', score: '7', comment: { invalid: true } }],
        summary: { invalid: true },
        suggestions: ['保持回答直接', { invalid: true }],
      },
    },
  }],
})
assert.ok(normalizedMalformedReport, 'Malformed provider data must still produce a renderable report')
assert.equal(normalizedMalformedReport?.overallScore, 3)
assert.equal(normalizedMalformedReport?.transcript[0].feedback.verdict, 'neutral')
assert.deepEqual(normalizedMalformedReport?.transcript[0].feedback.voice.metrics.fillers, [])
assert.equal(normalizedMalformedReport?.transcript[0].feedback.content.dimensions[0].score, 5)
assert.equal(typeof normalizedMalformedReport?.transcript[0].feedback.content.summary, 'string')

const repeatFlow = createInterviewFlow(context, { seed: 2, targetMainQuestions: 11 })
repeatFlow.nextTurn()
repeatFlow.nextTurn('Here are the simulated documents.')
const repeatedQuestion = repeatFlow.nextTurn('Sorry, pardon?')
assert.ok(repeatedQuestion.text.includes('Which school will you study at?'), 'A repeat request must keep the current question active')
assert.equal(repeatFlow.getState().askedMainQuestionIds.length, 1, 'A repeat request must not consume another main question')
assert.equal(repeatFlow.getState().answers.length, 1, 'A repeat request must not be recorded as a substantive answer')

const silenceFlow = createInterviewFlow(context, { seed: 2, targetMainQuestions: 11 })
silenceFlow.nextTurn()
silenceFlow.nextTurn('Here are the simulated documents.')
const silenceRepair = silenceFlow.nextTurn('[NO_SPEECH]')
assert.ok(silenceRepair.text.includes("I didn't hear an answer"), 'Silence must produce a natural retry')
assert.ok(silenceRepair.text.includes('Which school will you study at?'), 'Silence must repeat the active question')

const dynamicFlow = createInterviewFlow(context, { seed: 2, targetMainQuestions: 11 })
dynamicFlow.nextTurn()
dynamicFlow.nextTurn('Here are the simulated documents.')
const dynamicAssessment = parseDoubaoAssessment(JSON.stringify({
  dialogueAct: 'valid_answer',
  relevance: 5,
  specificity: 4,
  clarity: 5,
  isUncertain: false,
  isContradictory: false,
  contradictsQuestionIds: [],
  needsFollowUp: false,
  allowedFollowUpId: null,
  riskSignals: [],
  decisionReason: 'sufficient',
  recommendedNextQuestionId: 'f1_11',
}), ['f1_01_clarify'], ['f1_11']) as F1AnswerAssessment
assert.ok(dynamicAssessment)
assert.equal(
  parseDoubaoAssessment(JSON.stringify(dynamicAssessment), ['f1_01_clarify'], ['f1_04']),
  null,
  'A next-question recommendation outside the application candidate set must be rejected',
)
const modelSelectedQuestion = dynamicFlow.nextTurn('I will study at Example University.', dynamicAssessment)
assert.equal(modelSelectedQuestion.text, 'What is your future plan? What will you do after graduation?', 'A validated model recommendation must select the next main question')

const offTopicFlow = createInterviewFlow(context, { seed: 2, targetMainQuestions: 11 })
offTopicFlow.nextTurn()
offTopicFlow.nextTurn('Here are the simulated documents.')
const offTopicAssessment = parseDoubaoAssessment(JSON.stringify({
  dialogueAct: 'off_topic',
  relevance: 1,
  specificity: 2,
  clarity: 4,
  isUncertain: false,
  isContradictory: false,
  contradictsQuestionIds: [],
  needsFollowUp: false,
  allowedFollowUpId: null,
  riskSignals: ['off_topic'],
  decisionReason: 'off_topic',
  recommendedNextQuestionId: null,
}), ['f1_01_clarify'], ['f1_04']) as F1AnswerAssessment
const offTopicRepair = offTopicFlow.nextTurn('I like basketball.', offTopicAssessment)
assert.ok(offTopicRepair.text.includes('Please answer the question directly.'), 'An off-topic answer must not advance the interview')
assert.equal(offTopicFlow.getState().askedMainQuestionIds.length, 1)

const modelDirectedFlow = createInterviewFlow(context, { seed: 2, targetMainQuestions: 11 })
modelDirectedFlow.nextTurn()
const firstMainQuestion = modelDirectedFlow.nextTurn('Here are the simulated documents.')
assert.equal(firstMainQuestion.text, 'Which school will you study at?')
const modelAssessment = parseDoubaoAssessment(validAssessmentJson, ['f1_01_clarify']) as F1AnswerAssessment
const directedFollowUp = modelDirectedFlow.nextTurn('I am not completely sure.', modelAssessment)
assert.equal(directedFollowUp.text, 'What is the full name of the school?', 'The state machine must honor a validated Doubao follow-up')

for (let seed = 1; seed <= 20; seed += 1) {
  const flow = createInterviewFlow(context, { seed, targetMainQuestions: 11 })
  let turn = flow.nextTurn()
  let guard = 0
  while (!turn.isClosing && guard < 40) {
    const answer = turn.text.includes('harm or mistreatment') ? 'No, I have not.' : 'No. This is my truthful answer for the simulation.'
    turn = flow.nextTurn(answer)
    guard += 1
  }
  assert.ok(turn.isClosing, `Seed ${seed} did not finish`)
  const state = flow.getState()
  assert.equal(state.askedMainQuestionIds.length, 11, `Seed ${seed} asked an unexpected number of main questions`)
  for (const mandatoryId of F1_MANDATORY_QUESTION_IDS) {
    assert.ok(state.askedMainQuestionIds.includes(mandatoryId), `Seed ${seed} skipped ${mandatoryId}`)
  }
  assert.ok(state.askedMainQuestionIds.includes('f1_22'), `Seed ${seed} skipped retained question f1_22`)
}

const adaptiveFlow = createInterviewFlow({
  ...context,
  hasUsRelatives: true,
  usRelativeType: 'aunt',
  previousVisa: true,
  previousVisaDenied: true,
}, { seed: 3, targetMainQuestions: 13 })
const adaptivePlan = adaptiveFlow.getState().plan
assert.ok(adaptivePlan.includes('f1_16'), 'A declared U.S. relative must activate the relative question')
assert.ok(adaptivePlan.includes('f1_17'), 'Previous U.S. visa history must activate the travel/visa question')

const sensitiveFlow = createInterviewFlow(context, { seed: 7, targetMainQuestions: 11 })
let sensitiveTurn = sensitiveFlow.nextTurn()
let sawPrivacyFollowUp = false
let sawAfricaFollowUp = false
for (let guard = 0; guard < 40 && !sensitiveTurn.isClosing; guard += 1) {
  const answer = sensitiveTurn.text === 'Have you ever experienced harm or mistreatment in China?'
    ? 'Yes, I have.'
    : sensitiveTurn.text === 'Have you ever traveled to Africa?'
      ? 'Yes, I did.'
      : 'No. This is my truthful answer for the simulation.'
  sensitiveTurn = sensitiveFlow.nextTurn(answer)
  if (sensitiveTurn.text.includes('without sharing names, addresses')) sawPrivacyFollowUp = true
  if (sensitiveTurn.text.includes('Which African country')) sawAfricaFollowUp = true
}
assert.ok(sawPrivacyFollowUp, 'Affirmative Q19 answer must trigger a privacy-preserving follow-up')
assert.ok(sawAfricaFollowUp, 'Affirmative Q21 answer must trigger the Africa detail follow-up')

console.log('F1 flow smoke test passed: 22 questions, mandatory routing, and sensitive follow-ups verified.')
