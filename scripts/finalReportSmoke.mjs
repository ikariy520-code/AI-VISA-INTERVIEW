import dotenv from 'dotenv'
import {
  buildF1ReportMessages,
  getModelMessageContent,
  repairF1ReportEvidence,
  sanitizeReportRequest,
  validateF1StructuredReport,
} from '../server/shared/f1ReportContract.mjs'

dotenv.config({ path: '.env.local', quiet: true })

const provider = process.env.REPORT_PROVIDER?.trim() || 'deepseek'
const apiKey = (process.env.REPORT_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim()
const model = (process.env.REPORT_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro').trim()
const endpoint = new URL((process.env.REPORT_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').trim())
const supportsJsonMode = process.env.REPORT_SUPPORTS_JSON_MODE !== 'false'
const supportsReasoningOptions = process.env.REPORT_SUPPORTS_REASONING_OPTIONS
  ? process.env.REPORT_SUPPORTS_REASONING_OPTIONS !== 'false'
  : provider === 'deepseek'

const anonymousLoopback = endpoint.protocol === 'http:' && ['127.0.0.1', '::1', 'localhost'].includes(endpoint.hostname)
if (!apiKey && !anonymousLoopback) throw new Error('Report model API key is not configured')
if (endpoint.protocol !== 'https:' && !anonymousLoopback) {
  throw new Error('Report model endpoint must use HTTPS or loopback HTTP')
}
endpoint.pathname = endpoint.pathname.replace(/\/$/, '')
if (!endpoint.pathname.endsWith('/chat/completions')) {
  endpoint.pathname = `${endpoint.pathname}/chat/completions`.replace(/\/+/g, '/')
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

let parsed
let report
let lastError
let repairContext = ''
let validationIssues = []
let attempts = 0
for (attempts = 1; attempts <= 2; attempts += 1) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: buildF1ReportMessages(input, repairContext),
        ...(supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...(supportsReasoningOptions ? {
          thinking: { type: 'enabled' },
          reasoning_effort: 'high',
        } : {}),
        max_tokens: 32_000,
        stream: false,
      }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`Report model request failed with status ${response.status}`)
    const content = getModelMessageContent(payload)
    if (!content) throw new Error('Report model returned no final-report content')
    const originalDraft = JSON.parse(content)
    parsed = originalDraft
    validationIssues = []
    report = validateF1StructuredReport(parsed, input, {
      onIssue: issue => { validationIssues.push(issue) },
    })
    if (report) break
    const repairEvents = []
    const evidenceRepairedDraft = repairF1ReportEvidence(parsed, input, {
      onRepair: event => { repairEvents.push(event) },
    })
    if (repairEvents.length > 0) {
      const repairedIssues = []
      report = validateF1StructuredReport(evidenceRepairedDraft, input, {
        onIssue: issue => { repairedIssues.push(issue) },
        allowMaterializedEvidence: true,
      })
      if (report) break
      parsed = evidenceRepairedDraft
      validationIssues = repairedIssues
    }
    validationIssues = validationIssues.length > 0 ? [...new Set(validationIssues)] : ['UNKNOWN_VALIDATION_FAILURE']
    repairContext = { issues: validationIssues, draft: parsed }
    lastError = new Error(`Report model output did not pass the evidence contract: ${validationIssues.join(',')}`)
  } catch (error) {
    lastError = error
    if (error instanceof SyntaxError) repairContext = { issues: ['INVALID_JSON'], draft: null }
  }
}

if (!report) {
  console.error(`final-report-validation-issues=${validationIssues.join(',') || 'unknown'}`)
  throw lastError || new Error('Report model output did not pass the evidence contract')
}

const directSupportQuestionIds = new Set(['f1_01', 'f1_04', 'f1_11', 'f1_12', 'f1_13'])
for (const review of report.questionReviews) {
  if (!directSupportQuestionIds.has(review.questionId)) continue
  if (review.verdict !== 'complete' || review.score < 85 || !review.summary.startsWith('支持资格：')) {
    throw new Error(`Direct factual answer was not recognized as supporting evidence: ${review.questionId}`)
  }
}
if (!report.questionReviews.every(review => review.preparationDirection.startsWith('下一步核查：'))) {
  throw new Error('One or more question reviews did not state the next officer inquiry')
}

console.log(`model-neutral-final-report-smoke=passed provider=${provider} model=${model} attempts=${attempts} dimensions=${report.dimensions.length} questions=${report.questionReviews.length}`)
