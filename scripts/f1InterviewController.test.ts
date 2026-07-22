import assert from 'node:assert/strict'
import {
  advanceF1Interview,
  approvedF1QuestionIds,
  createF1InterviewState,
  isApprovedF1OfficerText,
  type F1InterviewState,
} from '../src/modules/practice/services/f1InterviewController.ts'
import { F1_MANDATORY_QUESTION_IDS, F1_QUESTION_CATALOG } from '../src/modules/practice/data/f1QuestionCatalog.ts'
import { F1_INTERVIEW_CLOSING_LINE } from '../src/modules/practice/data/f1InterviewStandard.ts'
import type { UserContext } from '../src/modules/practice/types.ts'
import { createJsonEventFrame, DOUBAO_EVENT } from '../src/modules/voice/services/doubaoRealtimeProtocol.ts'

const baseContext: UserContext = {
  visaType: 'F1',
  purpose: 'Example University',
  destination: '',
  duration: '2 years',
  previousVisa: false,
  occupation: 'student',
  notes: '',
  major: 'Computer Science',
  degreeLevel: 'master',
  currentStatus: 'student',
  schoolReason: 'The curriculum matches my academic plan.',
  majorReason: 'It builds on my undergraduate study.',
  fundingSource: 'parents',
  budgetRange: '50k-80k',
  postGraduationPlan: 'return-work',
  homeTies: ['career', 'family-responsibility'],
}

assert.equal(F1_QUESTION_CATALOG.length, 22)
assert.equal(new Set(F1_QUESTION_CATALOG.map(question => question.text)).size, 22)
assert.equal(isApprovedF1OfficerText('That is fascinating. Tell me about your internship.'), false)
assert.equal(isApprovedF1OfficerText(`${F1_QUESTION_CATALOG[0].text} Please explain more.`), false)
assert.equal(isApprovedF1OfficerText(`${F1_INTERVIEW_CLOSING_LINE} Good luck.`), false)

function validAnswer(questionId: string) {
  if (['f1_16', 'f1_17', 'f1_19', 'f1_20', 'f1_21', 'f1_22'].includes(questionId)) return 'No.'
  return 'I have a clear and specific answer that is consistent with my application.'
}

function runToClose(context: UserContext) {
  let state = createF1InterviewState(context, { now: 1_000 })
  const officerMessages = [{ role: 'officer', text: `Good morning. Passport and I-20, please. ${F1_QUESTION_CATALOG[0].text}` }]
  for (let turn = 0; turn < 20; turn += 1) {
    const result = advanceF1Interview(state, validAnswer(state.currentQuestionId), context, { now: 2_000 + turn })
    state = result.state
    officerMessages.push({ role: 'officer', text: result.action.text })
    assert.equal(isApprovedF1OfficerText(result.action.text), true)
    if (result.action.type === 'CLOSE') return { state, officerMessages }
  }
  throw new Error('Controller did not close within 20 turns')
}

{
  const { state, officerMessages } = runToClose(baseContext)
  assert.equal(state.askedQuestionIds[0], 'f1_01')
  assert.equal(new Set(state.askedQuestionIds).size, state.askedQuestionIds.length)
  assert.ok(state.askedQuestionIds.length >= 8)
  assert.ok(state.askedQuestionIds.length <= state.maxQuestionCount)
  for (const id of F1_MANDATORY_QUESTION_IDS) assert.ok(state.askedQuestionIds.includes(id))
  assert.deepEqual(approvedF1QuestionIds(officerMessages), state.askedQuestionIds)
}

{
  const state = createF1InterviewState(baseContext, { now: 1_000 })
  const repeated = advanceF1Interview(state, 'Sorry, pardon?', baseContext, { now: 2_000 })
  assert.equal(repeated.action.type, 'REPEAT_CURRENT')
  assert.equal(repeated.action.questionId, 'f1_01')
  assert.deepEqual(repeated.state.askedQuestionIds, ['f1_01'])
  assert.equal(isApprovedF1OfficerText(repeated.action.text), true)
}

{
  const initial = createF1InterviewState(baseContext, { now: 1_000 })
  const futurePlanState: F1InterviewState = {
    ...initial,
    currentQuestionId: 'f1_11',
    askedQuestionIds: ['f1_01', 'f1_03', 'f1_04', 'f1_11'],
  }
  const concern = advanceF1Interview(
    futurePlanState,
    'I am not sure. I may stay in the United States.',
    baseContext,
    { now: 2_000 },
  )
  assert.equal(concern.state.targetQuestionCount, initial.targetQuestionCount + 1)
}

{
  const initial = createF1InterviewState(baseContext, { now: 1_000 })
  const relativesState: F1InterviewState = {
    ...initial,
    currentQuestionId: 'f1_16',
    askedQuestionIds: ['f1_01', 'f1_03', 'f1_04', 'f1_11', 'f1_12', 'f1_16'],
  }
  const incompleteYes = advanceF1Interview(relativesState, 'Yes.', baseContext, { now: 2_000 })
  assert.equal(incompleteYes.action.type, 'REPEAT_CURRENT')
  assert.equal(incompleteYes.action.questionId, 'f1_16')
}

{
  const firstSession = createJsonEventFrame(DOUBAO_EVENT.SAY_HELLO, { content: 'Question one' }, 'session-one')
  const nextSession = createJsonEventFrame(DOUBAO_EVENT.SAY_HELLO, { content: 'Question two' }, 'session-two')
  const viewOne = new DataView(firstSession.buffer, firstSession.byteOffset, firstSession.byteLength)
  const viewTwo = new DataView(nextSession.buffer, nextSession.byteOffset, nextSession.byteLength)
  assert.equal(viewOne.getUint32(4, false), DOUBAO_EVENT.SAY_HELLO)
  assert.equal(viewTwo.getUint32(4, false), DOUBAO_EVENT.SAY_HELLO)
  assert.notDeepEqual(firstSession, nextSession)
}

{
  let state: F1InterviewState = createF1InterviewState(baseContext, { now: 1_000 })
  const unclear = advanceF1Interview(state, 'I do not know', baseContext, { now: 2_000 })
  assert.equal(unclear.action.type, 'REPEAT_CURRENT')
  state = unclear.state
  const secondUnclear = advanceF1Interview(state, 'I do not know', baseContext, { now: 3_000 })
  assert.equal(secondUnclear.action.type, 'ASK')
  assert.notEqual(secondUnclear.action.questionId, 'f1_01')
}

{
  const complexContext: UserContext = {
    ...baseContext,
    hasStudyGap: true,
    previousVisaDenied: true,
    hasUsRelatives: true,
    fundingSource: 'relatives',
  }
  const simple = createF1InterviewState(baseContext)
  const complex = createF1InterviewState(complexContext)
  assert.ok(complex.targetQuestionCount > simple.targetQuestionCount)
  const { state } = runToClose(complexContext)
  assert.equal(state.askedQuestionIds.length, complex.targetQuestionCount)
  assert.ok(state.askedQuestionIds.includes('f1_16'))
}

{
  const state = createF1InterviewState(baseContext, { now: 1_000 })
  const timedOut = advanceF1Interview(state, 'A valid complete answer.', baseContext, { now: 601_001 })
  assert.equal(timedOut.action.type, 'CLOSE')
  assert.equal(timedOut.action.reason, 'time-limit')
}

// Broad deterministic scenario audit. This exercises different form density,
// risk flags, repeat requests, unclear answers, and affirmative sensitive
// answers while checking the invariants on every single action.
for (let scenario = 0; scenario < 600; scenario += 1) {
  const context: UserContext = {
    ...baseContext,
    schoolReason: scenario % 2 === 0 ? baseContext.schoolReason : '',
    majorReason: scenario % 3 === 0 ? baseContext.majorReason : '',
    duration: scenario % 5 === 0 ? '' : baseContext.duration,
    hasStudyGap: scenario % 7 === 0,
    previousVisaDenied: scenario % 11 === 0,
    hasUsRelatives: scenario % 13 === 0,
    fundingSource: scenario % 17 === 0 ? 'relatives' : 'parents',
  }
  let state = createF1InterviewState(context, { now: 1_000 })
  let closed = false

  for (let turn = 0; turn < 40; turn += 1) {
    const previousAsked = state.askedQuestionIds
    const previousCurrent = state.currentQuestionId
    const pattern = (scenario * 31 + turn * 17) % 53
    const answer = pattern === 0
      ? 'Pardon, could you repeat that?'
      : pattern === 1
        ? 'I do not know'
        : state.currentQuestionId === 'f1_11' && scenario % 5 === 0
          ? 'I am not sure and may stay in the United States.'
          : ['f1_19', 'f1_20', 'f1_21'].includes(state.currentQuestionId) && scenario % 7 === 0
            ? 'Yes.'
            : validAnswer(state.currentQuestionId)

    const result = advanceF1Interview(state, answer, context, { now: 2_000 + turn })
    assert.equal(isApprovedF1OfficerText(result.action.text), true)

    if (result.action.type === 'REPEAT_CURRENT') {
      assert.deepEqual(result.state.askedQuestionIds, previousAsked)
      assert.equal(result.state.currentQuestionId, previousCurrent)
    } else if (result.action.type === 'ASK') {
      assert.equal(result.state.askedQuestionIds.length, previousAsked.length + 1)
      assert.equal(new Set(result.state.askedQuestionIds).size, result.state.askedQuestionIds.length)
      assert.ok(F1_QUESTION_CATALOG.some(question => question.id === result.action.questionId))
    } else {
      assert.equal(result.action.text, F1_INTERVIEW_CLOSING_LINE)
      assert.ok(result.state.askedQuestionIds.length <= result.state.maxQuestionCount)
      assert.ok(result.state.askedQuestionIds.length < F1_QUESTION_CATALOG.length)
      for (const id of F1_MANDATORY_QUESTION_IDS) assert.ok(result.state.askedQuestionIds.includes(id))
      closed = true
      break
    }
    state = result.state
  }
  assert.equal(closed, true, `scenario ${scenario} did not close`)
}

console.log('f1-controller-tests=passed')
