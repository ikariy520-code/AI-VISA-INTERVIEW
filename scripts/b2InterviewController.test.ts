import assert from 'node:assert/strict'
import {
  advanceB2Interview,
  createB2InterviewState,
  isApprovedB2OfficerText,
} from '../src/modules/practice/services/b2InterviewController.ts'
import { getB2Question } from '../src/modules/practice/data/b2QuestionCatalog.ts'
import { B2_INTERVIEW_CLOSING_LINE, B2_INTERVIEW_HARD_LIMIT_SECONDS } from '../src/modules/practice/data/b2InterviewStandard.ts'
import type { UserContext } from '../src/modules/practice/types.ts'

const context: UserContext = {
  visaType: 'B2', purpose: '旅游', destination: '洛杉矶、旧金山', duration: '8–14 天', previousVisa: false,
  occupation: '在职', notes: '', b2Purpose: 'tourism', travelMonth: '2026-10', b2CurrentStatus: 'employed',
  travelFunding: 'self', tripStyle: 'independent', travelCompanion: 'spouse', homeTies: ['career'],
  travelBudget: '3k-6k', tripPlanSummary: '洛杉矶三天，旧金山四天', leaveArrangement: '十天年假',
  previousVisaAnswer: 'no',
}

const initial = createB2InterviewState(context, 1_000)
assert.equal(initial.currentQuestionId, 'b2_01')
assert.equal(initial.targetQuestionCount, 6)

const repeated = advanceB2Interview(initial, '不好意思，我没听清，请重复一遍', context, 2_000)
assert.equal(repeated.action.type, 'REPEAT_CURRENT')
assert.equal(repeated.action.text, getB2Question('b2_01').text)

let state = initial
const seenTopics = new Set<string>()
for (let index = 0; index < 12; index += 1) {
  seenTopics.add(getB2Question(state.currentQuestionId).topic)
  const result = advanceB2Interview(state, '这是我根据真实情况做出的清楚回答。', context, 3_000 + index)
  assert.ok(isApprovedB2OfficerText(result.action.text))
  state = result.state
  if (result.action.type === 'CLOSE') break
}
assert.ok(state.askedQuestionIds.length <= 9)
for (const topic of ['purpose', 'itinerary', 'funding', 'current_status', 'departure']) assert.ok(seenTopics.has(topic))

const timedOut = advanceB2Interview(
  initial,
  '这是有效回答。',
  context,
  1_000 + B2_INTERVIEW_HARD_LIMIT_SECONDS * 1_000,
)
assert.equal(timedOut.action.type, 'CLOSE')
assert.equal(timedOut.action.text, B2_INTERVIEW_CLOSING_LINE)

const visitContext: UserContext = {
  ...context,
  b2Purpose: 'family-visit',
  purpose: '探亲',
  usContactRelation: 'sibling',
  contactProvidesStay: true,
  travelFunding: 'shared',
  previousVisaAnswer: 'yes',
  previousVisa: true,
  previousVisaDenied: true,
}
let visitState = createB2InterviewState(visitContext, 1_000)
for (let index = 0; index < 12; index += 1) {
  const result = advanceB2Interview(visitState, '这是根据本人真实情况回答的完整信息。', visitContext, 2_000 + index)
  visitState = result.state
  if (result.action.type === 'CLOSE') break
}
assert.ok(visitState.askedQuestionIds.some(id => ['b2_12', 'b2_13', 'b2_23', 'b2_24'].includes(id)))
assert.ok(visitState.askedQuestionIds.length <= 9)

console.log('b2-controller-tests=passed')
