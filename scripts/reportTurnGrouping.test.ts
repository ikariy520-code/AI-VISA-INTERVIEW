import assert from 'node:assert/strict'
import type { ChatMessage, InterviewRecord, UserContext } from '../src/modules/practice/types.ts'
import { F1_QUESTION_CATALOG } from '../src/modules/practice/data/f1QuestionCatalog.ts'
import { B2_QUESTION_CATALOG } from '../src/modules/practice/data/b2QuestionCatalog.ts'
import {
  buildB2ReportRequest,
  buildF1ReportRequest,
} from '../src/modules/shared/store/analysisEngine.ts'

const baseContext: UserContext = {
  visaType: 'F1',
  purpose: 'Example University',
  destination: 'California',
  duration: 'two years',
  previousVisa: false,
  occupation: 'student',
  notes: '',
}

function officer(text: string, index: number): ChatMessage {
  return { id: `o-${index}`, role: 'officer', text, timestamp: `00:${String(index).padStart(2, '0')}` }
}

function user(text: string, index: number): ChatMessage {
  return { id: `u-${index}`, role: 'user', text, timestamp: `00:${String(index).padStart(2, '0')}` }
}

const fundingQuestion = F1_QUESTION_CATALOG.find(question => question.id === 'f1_12')!
const fundingFollowUp = fundingQuestion.followUps![0]
const f1Record: InterviewRecord = {
  id: 'f1-grouping',
  date: '2026-08-01',
  time: '12:00',
  duration: '01:00',
  visaType: 'F1',
  userContext: baseContext,
  messages: [
    officer(fundingQuestion.text, 1),
    user('My aunt will pay for my studies.', 2),
    officer(fundingFollowUp.text, 3),
    user('She is my mother\'s sister.', 4),
  ],
}

const f1Request = buildF1ReportRequest(f1Record)
assert.ok(f1Request)
assert.equal(f1Request.answers.length, 2)
assert.equal(f1Request.answers[0].questionId, 'f1_01')
assert.equal(f1Request.answers[1].questionId, 'f1_02')
assert.match(f1Request.answers[0].answer, /My aunt will pay/)
assert.match(f1Request.answers[1].question, /Who exactly is your sponsor/)
assert.match(f1Request.answers[1].answer, /mother's sister/)

const nativeFollowUpRecord: InterviewRecord = {
  ...f1Record,
  id: 'f1-native-follow-up-grouping',
  messages: [
    officer(fundingQuestion.text, 1),
    user('My aunt will pay for my studies.', 2),
    officer('Why has your aunt agreed to cover these costs?', 3),
    user('She has supported my education for several years.', 4),
  ],
}
const nativeFollowUpRequest = buildF1ReportRequest(nativeFollowUpRecord)
assert.ok(nativeFollowUpRequest)
assert.equal(nativeFollowUpRequest.answers.length, 2)
assert.equal(nativeFollowUpRequest.answers[1].questionId, 'f1_02')
assert.match(nativeFollowUpRequest.answers[1].question, /Why has your aunt agreed/)
assert.match(nativeFollowUpRequest.answers[1].answer, /supported my education/)

const fullyDynamicF1Record: InterviewRecord = {
  ...f1Record,
  id: 'f1-fully-dynamic-question',
  messages: [
    officer('How does this program build on the research you did last year?', 1),
    user('It extends my undergraduate work in computer vision.', 2),
  ],
}
const fullyDynamicF1Request = buildF1ReportRequest(fullyDynamicF1Record)
assert.ok(fullyDynamicF1Request)
assert.equal(fullyDynamicF1Request.answers[0].questionId, 'f1_01')
assert.match(fullyDynamicF1Request.answers[0].question, /research you did last year/)

const b2Messages: ChatMessage[] = []
let messageIndex = 1
for (const question of B2_QUESTION_CATALOG.slice(0, 9)) {
  b2Messages.push(officer(question.text, messageIndex++))
  b2Messages.push(user(`第${question.number}题的真实回答。`, messageIndex++))
  if (question.followUps?.length && ['b2_01', 'b2_02', 'b2_03', 'b2_06', 'b2_07'].includes(question.id)) {
    b2Messages.push(officer(question.followUps[0].text, messageIndex++))
    b2Messages.push(user(`第${question.number}题的补充回答。`, messageIndex++))
  }
}

const b2Record: InterviewRecord = {
  ...f1Record,
  id: 'b2-grouping',
  visaType: 'B2',
  userContext: { ...baseContext, visaType: 'B2' },
  messages: b2Messages,
}
const b2Request = buildB2ReportRequest(b2Record)
assert.ok(b2Request)
assert.equal(b2Request.answers.length, 9, 'five follow-ups must not consume the B2 12-answer report cap')
assert.equal(new Set(b2Request.answers.map(answer => answer.questionId)).size, 9)
assert.equal(b2Request.answers.filter(answer => answer.question.includes('追问：')).length, 5)
assert.equal(b2Request.answers.filter(answer => answer.answer.includes('补充回答')).length, 5)

// The native end-to-end B-2 model asks follow-ups of its own that are not in
// the catalog. They must group under the preceding main question instead of
// failing the whole report.
const b2FundingQuestion = B2_QUESTION_CATALOG.find(question => question.id === 'b2_06')!
const b2NativeFollowUpRecord: InterviewRecord = {
  ...f1Record,
  id: 'b2-native-follow-up-grouping',
  visaType: 'B2',
  userContext: { ...baseContext, visaType: 'B2' },
  messages: [
    officer(b2FundingQuestion.text, 1),
    user('这次旅行的费用由我的父母承担。', 2),
    officer('您的父母在哪个城市工作？', 3),
    user('他们在上海工作。', 4),
  ],
}
const b2NativeFollowUpRequest = buildB2ReportRequest(b2NativeFollowUpRecord)
assert.ok(b2NativeFollowUpRequest)
assert.equal(b2NativeFollowUpRequest.answers.length, 1)
assert.equal(b2NativeFollowUpRequest.answers[0].questionId, 'b2_06')
assert.match(b2NativeFollowUpRequest.answers[0].question, /追问：/)
assert.match(b2NativeFollowUpRequest.answers[0].answer, /父母承担/)
assert.match(b2NativeFollowUpRequest.answers[0].answer, /上海工作/)

console.log('report-turn-grouping=passed')
