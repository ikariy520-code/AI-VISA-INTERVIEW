import assert from 'node:assert/strict'
import { F1_MANDATORY_QUESTION_IDS, F1_QUESTION_CATALOG } from '../src/modules/practice/data/f1QuestionCatalog'
import { createInterviewFlow } from '../src/modules/practice/services/interviewFlow'
import type { UserContext } from '../src/modules/practice/types'

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
