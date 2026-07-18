import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })

const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-flash'
const baseUrl = new URL(process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com')

if (!apiKey) throw new Error('DeepSeek API key is not configured')
if (baseUrl.protocol !== 'https:' || baseUrl.hostname !== 'api.deepseek.com') {
  throw new Error('DeepSeek endpoint is not allowed')
}

baseUrl.pathname = baseUrl.pathname.replace(/\/$/, '')
if (!baseUrl.pathname.endsWith('/chat/completions')) {
  baseUrl.pathname = `${baseUrl.pathname}/chat/completions`.replace(/\/+/g, '/')
}

const startedAt = Date.now()
const response = await fetch(baseUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Return only this JSON object: {"ok":true}' }],
    response_format: { type: 'json_object' },
    max_tokens: 32,
    stream: false,
  }),
  signal: AbortSignal.timeout(30_000),
})

const payload = await response.json().catch(() => null)
if (!response.ok) throw new Error(`DeepSeek connectivity request failed with status ${response.status}`)
const content = payload?.choices?.[0]?.message?.content
if (typeof content !== 'string' || !content.includes('"ok"')) {
  throw new Error('DeepSeek connectivity response was invalid')
}

console.log(`deepseek-connectivity=passed model=${model} elapsedMs=${Date.now() - startedAt}`)
