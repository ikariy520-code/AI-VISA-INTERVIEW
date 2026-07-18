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
  ['/api/ai-report', 'legacy AI report route'],
  ['ARK_API_KEY', 'Ark text API credential'],
  ['ARK_TEXT_MODEL', 'Ark text model'],
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

// DeepSeek may only be called by the production server. The browser receives a
// same-origin endpoint and can never see the provider URL or credential.
const clientFiles = files.filter(file => {
  const name = relative(root, file).replaceAll('\\', '/')
  return name.startsWith('src/') || name.startsWith('local/') || name === 'vite.config.ts'
})
for (const file of clientFiles) {
  const content = readFileSync(file, 'utf8')
  assert.equal(content.includes('api.deepseek.com'), false, `DeepSeek provider URL leaked into ${relative(root, file)}`)
  assert.equal(content.includes('/chat/completions'), false, `Provider endpoint leaked into ${relative(root, file)}`)
}

const feedbackServer = join(root, 'server/deepseekFeedback.mjs')
assert.equal(existsSync(feedbackServer), true, 'DeepSeek feedback server module is missing')
const feedbackServerContent = readFileSync(feedbackServer, 'utf8')
assert.equal(feedbackServerContent.includes('/chat/completions'), true, 'DeepSeek feedback endpoint is missing')
assert.equal(feedbackServerContent.includes('response_format'), true, 'Structured JSON mode is missing')
assert.equal(feedbackServerContent.includes("source: 'deepseek'"), true, 'DeepSeek report source marker is missing')

assert.equal(existsSync(join(root, 'server/reportApi.mjs')), false)
assert.equal(existsSync(join(root, 'local/doubaoTextBridge.ts')), false)

const realtimeFiles = files
  .map(file => ({ file, content: readFileSync(file, 'utf8') }))
  .filter(item => item.content.includes('openspeech.bytedance.com/api/v3/realtime/dialogue'))
assert.ok(realtimeFiles.length >= 2, 'Realtime end-to-end voice endpoint is missing')

console.log('ai-boundary-audit=passed')
