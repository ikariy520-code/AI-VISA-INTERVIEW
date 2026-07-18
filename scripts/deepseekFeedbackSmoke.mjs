import assert from 'node:assert/strict'
import { generateDeepSeekFeedback } from '../server/deepseekFeedback.mjs'

const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim()
assert.ok(apiKey, 'DEEPSEEK_API_KEY is required')

const model = String(process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash').trim()
const report = await generateDeepSeekFeedback({
  apiKey,
  model,
  baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
}, {
  id: 'live-smoke-test',
  date: '2026-07-18',
  time: 'test',
  duration: '01:30',
  visaType: 'F1',
  officerType: 'standard',
  userContext: {
    visaType: 'F1',
    purpose: 'Example University',
    major: 'Data Science',
    schoolReason: 'The applied capstone fits my academic plan.',
    fundingSource: 'parents',
    postGraduationPlan: 'return-work',
  },
  transcript: [
    { role: 'officer', text: 'Why did you choose this university?', timestamp: '00:05' },
    { role: 'user', text: 'I chose it because the applied capstone fits my plan to work in risk analytics after I return to China.', timestamp: '00:20' },
    { role: 'officer', text: 'Who will pay for your education?', timestamp: '00:30' },
    { role: 'user', text: 'My parents will pay for it.', timestamp: '00:36' },
  ],
})

assert.equal(report.source, 'deepseek')
assert.equal(report.dimensions.length, 6)
assert.equal(report.questionReviews.length, 2)
assert.equal(report.actionPlan.length, 3)
assert.ok(report.overallScore >= 0 && report.overallScore <= 100)

console.log(`deepseek-feedback-smoke=passed model=${model} score=${report.overallScore} dimensions=${report.dimensions.length} reviews=${report.questionReviews.length}`)
