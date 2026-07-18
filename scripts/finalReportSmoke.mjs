import dotenv from 'dotenv'
import {
  buildDoubaoReportMessages,
  getArkMessageContent,
  sanitizeReportRequest,
  validateF1StructuredReport,
} from '../server/shared/doubaoReport.mjs'

dotenv.config({ path: '.env.local', quiet: true })

const apiKey = process.env.ARK_API_KEY?.trim()
const model = process.env.ARK_TEXT_MODEL?.trim()
const configuredEndpoint = process.env.ARK_API_BASE?.trim()
  || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
const endpoint = new URL(configuredEndpoint)

if (!apiKey || !model) throw new Error('Ark API Key or text model is not configured')
if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'ark.cn-beijing.volces.com') {
  throw new Error('Ark endpoint is not allowed')
}

const input = sanitizeReportRequest({
  visaType: 'F1',
  safeContext: {
    school: 'Example University',
    major: 'Data Science',
    degreeLevel: 'master',
    currentStatus: 'undergraduate student',
    fundingSource: 'parents',
    annualBudget: 'USD 58,000',
    postGraduationPlan: 'return to China and work in data analytics',
  },
  answers: [
    { index: 1, questionId: 'f1_01', question: 'Which school will you study at?', answer: 'I will study at Example University.', timestamp: '00:08' },
    { index: 2, questionId: 'f1_04', question: 'What is your major?', answer: 'Data Science.', timestamp: '00:25' },
    { index: 3, questionId: 'f1_11', question: 'What will you do after graduation?', answer: 'I will return to China and work in data analytics.', timestamp: '00:46' },
    { index: 4, questionId: 'f1_12', question: 'Who will support your study?', answer: 'My parents will support my study.', timestamp: '01:02' },
    { index: 5, questionId: 'f1_13', question: 'How much money will you spend on your study?', answer: 'About 58,000 U.S. dollars per year.', timestamp: '01:20' },
    { index: 6, questionId: 'f1_19', question: 'Have you experienced harm or mistreatment in your country?', answer: 'No.', timestamp: '01:37' },
    { index: 7, questionId: 'f1_20', question: 'Do you fear harm or mistreatment in returning to your country?', answer: 'No.', timestamp: '01:50' },
    { index: 8, questionId: 'f1_21', question: 'Do you plan to go to Africa before going to the US?', answer: 'No.', timestamp: '02:03' },
  ],
})

if (!input) throw new Error('Smoke fixture is invalid')

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model,
    messages: buildDoubaoReportMessages(input),
    temperature: 0.1,
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' },
    max_tokens: 4_500,
  }),
  signal: AbortSignal.timeout(90_000),
})

const payload = await response.json().catch(() => null)
if (!response.ok) throw new Error(`Ark final-report request failed with status ${response.status}`)
const content = getArkMessageContent(payload)
if (!content) throw new Error('Ark returned no final-report content')

const parsed = JSON.parse(content)
const report = validateF1StructuredReport(parsed, input)
if (!report) {
  console.error(JSON.stringify({
    schemaVersion: parsed?.schemaVersion,
    reportType: parsed?.reportType,
    criteriaVersion: parsed?.criteriaVersion,
    overallScore: parsed?.overallScore,
    readiness: parsed?.readiness,
    headline: parsed?.headline,
    summary: parsed?.summary,
    dimensions: parsed?.dimensions?.map(item => ({
      id: item?.id,
      status: item?.status,
      summary: item?.summary,
      evidence: item?.evidence,
      officialRuleIds: item?.officialRuleIds,
      reasoning: item?.reasoning,
      actions: item?.actions,
    })),
    insights: {
      strengths: parsed?.strengths,
      priorities: parsed?.priorities,
    },
    questionReviews: parsed?.questionReviews,
    actionPlan: parsed?.actionPlan,
  }, null, 2))
  throw new Error('Ark report did not pass the evidence contract')
}

console.log(`ark-final-report-smoke=passed model=${model} dimensions=${report.dimensions.length} questions=${report.questionReviews.length}`)
