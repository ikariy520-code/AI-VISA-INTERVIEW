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

const forbidden = [
  ['api.deepseek.com', 'DeepSeek API'],
  ['api.openai.com', 'OpenAI API'],
  ['volc.bigasr', 'standalone ASR resource'],
  ['seed-tts-2.0', 'standalone TTS resource'],
]

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  for (const [token, label] of forbidden) {
    assert.equal(
      content.includes(token),
      false,
      `${label} found in ${relative(root, file)}`,
    )
  }
}

assert.equal(existsSync(join(root, 'server/reportApi.mjs')), true, 'production final-report route is missing')
assert.equal(existsSync(join(root, 'local/doubaoTextBridge.ts')), true, 'local final-report bridge is missing')

const realtimeFiles = files
  .map(file => ({ file, content: readFileSync(file, 'utf8') }))
  .filter(item => item.content.includes('openspeech.bytedance.com/api/v3/realtime/dialogue'))
assert.ok(realtimeFiles.length >= 2, 'Realtime end-to-end voice endpoint is missing')

const arkFiles = files
  .map(file => ({ file, content: readFileSync(file, 'utf8') }))
  .filter(item => item.content.includes('ark.cn-beijing.volces.com/api/v3/chat/completions'))
assert.deepEqual(
  arkFiles.map(item => relative(root, item.file)).sort(),
  ['local\\doubaoTextBridge.ts', 'server\\reportApi.mjs'],
  'Ark text API must only be called by local and production final-report handlers',
)

const reportCallers = files
  .map(file => ({ file, content: readFileSync(file, 'utf8') }))
  .filter(item => item.content.includes('fetch(AI_REPORT_ENDPOINT'))
assert.deepEqual(reportCallers.map(item => relative(root, item.file)), ['src\\modules\\shared\\store\\analysisEngine.ts'])

const analysisEngine = readFileSync(join(root, 'src/modules/shared/store/analysisEngine.ts'), 'utf8')
assert.ok(analysisEngine.includes('overallScore: null'), 'unavailable report must not contain a synthetic score')
assert.equal(analysisEngine.includes('...analyzeInterview(record)'), false, 'unavailable F1 report must not run the local scoring engine')

console.log('doubao-two-channel-architecture-audit=passed')
