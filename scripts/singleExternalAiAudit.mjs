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
  ['/api/ai-report', 'legacy AI report route'],
  ['ARK_API_KEY', 'Ark text API credential'],
  ['ARK_TEXT_MODEL', 'Ark text model'],
  ['/chat/completions', 'standalone text generation API'],
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

assert.equal(existsSync(join(root, 'server/reportApi.mjs')), false)
assert.equal(existsSync(join(root, 'local/doubaoTextBridge.ts')), false)

const realtimeFiles = files
  .map(file => ({ file, content: readFileSync(file, 'utf8') }))
  .filter(item => item.content.includes('openspeech.bytedance.com/api/v3/realtime/dialogue'))
assert.ok(realtimeFiles.length >= 2, 'Realtime end-to-end voice endpoint is missing')

console.log('single-external-ai-audit=passed')
