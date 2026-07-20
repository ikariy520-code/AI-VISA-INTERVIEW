import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const scanTargets = ['src', 'local', 'server', 'vite.config.ts']
const files = []

function collect(path) {
  const absolute = join(root, path)
  if (!existsSync(absolute)) return
  if (statSync(absolute).isFile()) {
    files.push(absolute)
    return
  }
  for (const entry of readdirSync(absolute)) collect(join(path, entry))
}

for (const target of scanTargets) collect(target)

const globallyForbidden = [
  ['ARK_API_KEY', 'legacy Ark text credential'],
  ['ARK_TEXT_MODEL', 'legacy Ark text model'],
  ['ark.cn-beijing.volces.com/api/v3/chat/completions', 'legacy Ark text endpoint'],
  ['/api/feedback-report', 'legacy feedback route'],
  ['api.openai.com', 'OpenAI API'],
  ['volc.bigasr', 'standalone ASR resource'],
  ['seed-tts-2.0', 'standalone TTS resource'],
]

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  for (const [token, label] of globallyForbidden) {
    assert.equal(content.includes(token), false, `${label} found in ${relative(root, file)}`)
  }
  assert.equal(/sk-[a-zA-Z0-9_-]{16,}/.test(content), false, `API key-like secret found in ${relative(root, file)}`)
}

// DeepSeek credentials and provider URLs stay in the server-only report handler.
// The browser and Vite bridge call the same-origin /api/ai-report route.
const providerFiles = files
  .map(file => ({ file, content: readFileSync(file, 'utf8') }))
  .filter(item => item.content.includes('api.deepseek.com') || item.content.includes('/chat/completions'))
assert.deepEqual(
  providerFiles.map(item => relative(root, item.file).replaceAll('\\', '/')).sort(),
  ['server/reportApi.mjs'],
  'DeepSeek provider access must remain in the shared server-side report handler',
)

assert.equal(existsSync(join(root, 'server/reportApi.mjs')), true, 'production DeepSeek report route is missing')
assert.equal(existsSync(join(root, 'local/deepseekReportBridge.ts')), true, 'local DeepSeek report bridge is missing')
assert.equal(existsSync(join(root, 'server/deepseekFeedback.mjs')), false, 'legacy DeepSeek report implementation must be removed')
assert.equal(existsSync(join(root, 'local/doubaoTextBridge.ts')), false, 'legacy Ark report bridge must be removed')

const reportHandler = readFileSync(join(root, 'server/reportApi.mjs'), 'utf8')
assert.ok(reportHandler.includes('validateF1StructuredReport'), 'strict F-1 report validation is missing')
assert.ok(reportHandler.includes("? 'evidence-only' : 'deepseek'"), 'model and evidence-only report modes must remain distinguishable')
assert.ok(reportHandler.includes('MAX_OUTPUT_TOKENS_PER_ATTEMPT'), 'DeepSeek V4 Pro report output cap is missing')
assert.equal(reportHandler.includes('createTokenBudget'), false, 'DeepSeek report token budget must remain disabled')
assert.equal(reportHandler.includes('MAX_REQUESTS_PER_WINDOW'), false, 'DeepSeek report rate limit must remain disabled')
assert.equal(reportHandler.includes('MAX_ACTIVE_REQUESTS'), false, 'DeepSeek report concurrency limit must remain disabled')
assert.equal(reportHandler.includes('AbortSignal.timeout'), false, 'DeepSeek report must not have a fixed application timeout')
assert.ok(reportHandler.includes('REPORT_ALREADY_IN_PROGRESS'), 'duplicate in-flight report protection is missing')
assert.ok(reportHandler.includes('CLIENT_DISCONNECTED'), 'client disconnect cancellation is missing')
assert.ok(reportHandler.includes('cached: true'), 'completed report reuse is missing')
assert.ok(reportHandler.includes('buildF1ReportMessages(input, repairContext)'), 'validation-guided report repair is missing')
assert.ok(reportHandler.includes('validationIssues'), 'sanitized report validation diagnostics are missing')
assert.ok(reportHandler.includes('repairF1ReportEvidence'), 'grounded evidence repair is missing')
assert.ok(reportHandler.includes('buildDeterministicF1FallbackReport'), 'bounded evidence-only fallback is missing')
assert.ok(reportHandler.includes("analysisMode: 'evidence_only'"), 'evidence-only fallback marker is missing')
assert.ok(reportHandler.includes('if (!fallbackEligible) throw'), 'provider/network failures must not be disguised as completed analysis')

const deepSeekModelFiles = [
  '.env.example',
  '.env.production.example',
  'README.md',
  'vite.config.ts',
  'scripts/deepseekConnectivitySmoke.mjs',
  'scripts/finalReportSmoke.mjs',
  'server/index.mjs',
  'server/reportApi.mjs',
]
for (const file of deepSeekModelFiles) {
  const content = readFileSync(join(root, file), 'utf8')
  assert.equal(content.includes('deepseek-v4-flash'), false, `DeepSeek V4 Flash is forbidden in ${file}`)
  assert.ok(content.includes('deepseek-v4-pro'), `DeepSeek V4 Pro is missing from ${file}`)
}

const reportContract = readFileSync(join(root, 'server/shared/f1ReportContract.mjs'), 'utf8')
assert.ok(reportContract.includes('F1_OFFICIAL_CRITERIA'), 'official F-1 criteria are missing from the report contract')
assert.ok(reportContract.includes('Never invent facts'), 'evidence-only report rule is missing')
assert.ok(reportContract.includes('approval/refusal probability'), 'visa prediction guardrail is missing')
assert.ok(reportContract.includes('strict machine validator'), 'validation repair instruction is missing')
assert.ok(reportContract.includes('evidenceCatalog'), 'exact evidence reference catalog is missing')
assert.ok(reportContract.includes('still return that dimension'), 'missing-information report guidance is missing')

const providerNeutralUiFiles = [
  'src/modules/feedback/index.tsx',
  'src/modules/feedback/reportViewModel.ts',
  'src/modules/feedback/components/FeedbackReportView.tsx',
  'src/modules/practice/components/InterviewComplete.tsx',
  'src/modules/practice/components/UserContextForm.tsx',
]
for (const file of providerNeutralUiFiles) {
  const content = readFileSync(join(root, file), 'utf8')
  assert.equal(content.includes('DeepSeek'), false, `provider name exposed in user-facing analysis UI: ${file}`)
}

const reportCallers = files
  .map(file => ({ file, content: readFileSync(file, 'utf8') }))
  .filter(item => item.content.includes('fetch(AI_REPORT_ENDPOINT'))
assert.deepEqual(
  reportCallers.map(item => relative(root, item.file).replaceAll('\\', '/')),
  ['src/modules/shared/store/analysisEngine.ts'],
  'the browser must have exactly one final-report caller',
)

const analysisEngine = readFileSync(join(root, 'src/modules/shared/store/analysisEngine.ts'), 'utf8')
assert.ok(analysisEngine.includes('overallScore: null'), 'unavailable report must not contain a synthetic score')
assert.ok(analysisEngine.includes("structuredReport.analysisMode === 'evidence_only'"), 'evidence-only reports must suppress synthetic scores')
assert.equal(analysisEngine.includes('...analyzeInterview(record)'), false, 'unavailable F1 report must not run the local scoring engine')
assert.equal(analysisEngine.includes('AbortSignal.timeout'), false, 'browser report request must not have a fixed timeout')

const realtimeFiles = files
  .map(file => ({ file, content: readFileSync(file, 'utf8') }))
  .filter(item => item.content.includes('openspeech.bytedance.com/api/v3/realtime/dialogue'))
assert.ok(realtimeFiles.length >= 2, 'Doubao realtime end-to-end voice endpoint is missing')

console.log('deepseek-report-and-doubao-voice-architecture-audit=passed')
