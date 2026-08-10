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
  'default report provider access must remain in the shared server-side report handler',
)

assert.equal(existsSync(join(root, 'server/reportApi.mjs')), true, 'production model-neutral report route is missing')
assert.equal(existsSync(join(root, 'local/deepseekReportBridge.ts')), true, 'local DeepSeek report bridge is missing')
assert.equal(existsSync(join(root, 'server/deepseekFeedback.mjs')), false, 'legacy DeepSeek report implementation must be removed')
assert.equal(existsSync(join(root, 'local/doubaoTextBridge.ts')), false, 'legacy Ark report bridge must be removed')

const reportHandler = readFileSync(join(root, 'server/reportApi.mjs'), 'utf8')
assert.ok(reportHandler.includes('validateF1StructuredReport'), 'strict F-1 report validation is missing')
assert.ok(reportHandler.includes("? 'evidence-only' : provider"), 'model and evidence-only report modes must remain distinguishable')
assert.ok(reportHandler.includes('BASIC_OUTPUT_TOKENS') && reportHandler.includes('STRONG_OUTPUT_TOKENS') && reportHandler.includes('FULL_OUTPUT_TOKENS'), 'tiered report output caps are missing')
assert.equal(reportHandler.includes('createTokenBudget'), false, 'report token budget must remain disabled')
assert.equal(reportHandler.includes('MAX_REQUESTS_PER_WINDOW'), false, 'report rate limit must remain disabled')
assert.equal(reportHandler.includes('MAX_ACTIVE_REQUESTS'), false, 'report concurrency limit must remain disabled')
assert.equal(reportHandler.includes('ATTEMPT_TIMEOUT_MS'), false, 'report generation deadlines must remain disabled')
assert.equal(reportHandler.includes('request.setTimeout'), false, 'upstream report requests must not be cut off by time')
assert.ok(reportHandler.includes('activeReports'), 'duplicate in-flight reports must share one generation task')
assert.ok(reportHandler.includes('CLIENT_DISCONNECTED'), 'client disconnect cancellation is missing')
assert.equal(reportHandler.includes('reportCache'), false, 'completed reports must not remain cached on the server')
assert.equal(reportHandler.includes('REPORT_CACHE'), false, 'server-side completed report cache settings must remain disabled')
assert.equal(reportHandler.includes('cached: true'), false, 'the report API must not return retained completed reports')
assert.ok(reportHandler.includes('repairInvalidReportSections'), 'local structural report repair is missing')
assert.ok(reportHandler.includes('validationIssues'), 'sanitized report validation diagnostics are missing')
assert.ok(reportHandler.includes('repairF1ReportEvidence'), 'grounded evidence repair is missing')
assert.ok(reportHandler.includes('MAX_F1_REPORT_ATTEMPTS = 2'), 'bounded model repair attempt is missing')
assert.ok(reportHandler.includes('buildF1ReportMessages(input, repairContext)'), 'validation-guided model repair is missing')
assert.ok(reportHandler.includes('supportsJsonMode') && reportHandler.includes('supportsReasoningOptions'), 'OpenAI-compatible capability switches are missing')
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
assert.ok(reportContract.includes('predict approval/refusal'), 'visa prediction guardrail is missing')
assert.ok(reportContract.includes('strict machine validator'), 'validation repair instruction is missing')
assert.ok(reportContract.includes('evidenceCatalog'), 'exact evidence reference catalog is missing')
assert.ok(reportContract.includes('still return that dimension'), 'missing-information report guidance is missing')
assert.ok(reportContract.includes('Officer reasoning path for every question review'), 'officer-style reasoning path is missing')
assert.ok(reportContract.includes('Absence of evidence is not negative evidence'), 'missing-versus-adverse evidence boundary is missing')
assert.ok(reportContract.includes('FAM_MISREPRESENTATION_EVIDENCE_STANDARD'), 'misrepresentation evidence boundary is missing')

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

const f1OfficerPolicy = readFileSync(join(root, 'src/modules/practice/services/f1OfficerPolicy.ts'), 'utf8')
assert.equal(/Doubao|豆包|DeepSeek|openspeech\.bytedance/i.test(f1OfficerPolicy), false, 'the F-1 officer policy must remain provider-neutral')
assert.ok(f1OfficerPolicy.includes('REFERENCE QUESTION BANK (NON-BINDING)'), 'the F-1 reference bank must not become a hard whitelist')
assert.ok(f1OfficerPolicy.includes('You may author or paraphrase any natural'), 'model-authored F-1 questions are not enabled')
const realtimeInterviewPrompt = readFileSync(join(root, 'src/modules/practice/services/realtimeInterviewPrompt.ts'), 'utf8')
assert.ok(realtimeInterviewPrompt.includes('buildF1OfficerPolicy({'), 'the realtime provider adapter must inject the shared F-1 officer policy')

const realtimeFiles = files
  .map(file => ({ file, content: readFileSync(file, 'utf8') }))
  .filter(item => item.content.includes('openspeech.bytedance.com/api/v3/realtime/dialogue'))
assert.ok(realtimeFiles.length >= 2, 'Doubao realtime end-to-end voice endpoint is missing')

const voiceInterviewRoom = readFileSync(join(root, 'src/modules/voice/components/VoiceInterviewRoom.tsx'), 'utf8')
assert.ok(voiceInterviewRoom.includes('lastCaptionToggleRef'), 'caption toggle burst protection is missing')
assert.ok(voiceInterviewRoom.includes('window.requestAnimationFrame'), 'caption scrolling must be frame-batched')
assert.equal(voiceInterviewRoom.includes('AnimatePresence mode="wait"'), false, 'caption panels must not queue exit/enter animations')
assert.equal(voiceInterviewRoom.includes("scrollIntoView({ behavior: 'smooth'"), false, 'streaming captions must not stack smooth-scroll animations')
assert.equal(voiceInterviewRoom.includes("controlledQuestions: context.visaType === 'B2'"), false, 'B2 must use native end-to-end model turns like F1')
assert.ok(voiceInterviewRoom.includes('controlledQuestions: false'), 'both realtime visas must use native end-to-end model turns')
assert.equal(voiceInterviewRoom.includes('advanceB2Interview('), false, 'B2 answers must not be replaced by local scripted turns')
assert.ok(voiceInterviewRoom.includes('findB2ModelBoundaryViolation('), 'the B2 native fail-safe boundary guard is missing')
assert.ok(voiceInterviewRoom.includes('B2_INTERVIEW_MAX_TOTAL_QUESTIONS'), 'the B2 substantive-turn cap is missing')
assert.equal(voiceInterviewRoom.includes('advanceF1Interview(f1StateRef.current'), false, 'F1 answers must not be replaced by local scripted turns')

const realtimeClient = readFileSync(join(root, 'src/modules/voice/services/doubaoRealtime.ts'), 'utf8')
const controlledSpeechStart = realtimeClient.indexOf('speakControlled(text: string)')
const controlledSpeechEnd = realtimeClient.indexOf('cancelResponse()', controlledSpeechStart)
const controlledSpeechImplementation = realtimeClient.slice(controlledSpeechStart, controlledSpeechEnd)
assert.ok(controlledSpeechStart >= 0 && controlledSpeechEnd > controlledSpeechStart, 'controlled speech implementation is missing')
assert.equal(realtimeClient.includes('rotateControlledSession'), false, 'a controlled question must not rebuild the provider Session')
assert.equal(controlledSpeechImplementation.includes('FINISH_SESSION'), false, 'a controlled turn must not finish the interview Session')
assert.equal(controlledSpeechImplementation.includes('START_SESSION'), false, 'a controlled turn must not start a new interview Session')
assert.ok(realtimeClient.includes('DOUBAO_EVENT.CHAT_TTS_TEXT'), 'the B2 controlled fallback must remain in the current Session')
assert.ok(realtimeClient.includes("ttsType(frame) === 'chat_tts_text'"), 'default model TTS must not open the controlled audio gate')
assert.ok(realtimeClient.includes("type ControlledTtsState"), 'controlled audio needs an explicit source-aware state machine')

const realtimeSmoke = readFileSync(join(root, 'scripts/realtimeVoiceSmoke.mjs'), 'utf8')
assert.ok(realtimeSmoke.includes('realtime-smoke=continuous-session-complete'), 'realtime smoke must verify multiple questions in one Session')
assert.ok(realtimeSmoke.includes('realtime-smoke=native-e2e-response-complete'), 'realtime smoke must verify a provider-authored native response')
assert.equal(realtimeSmoke.includes('DOUBAO_EVENT.CHAT_TTS_TEXT'), false, 'native F1 smoke must not inject application-authored TTS')
assert.equal(realtimeSmoke.includes('controlled-session-rotation-complete'), false, 'realtime smoke must not validate per-question Session rotation')

console.log('model-neutral-report-and-doubao-voice-architecture-audit=passed')
