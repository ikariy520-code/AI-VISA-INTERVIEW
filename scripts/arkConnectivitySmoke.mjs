import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })

const apiKey = process.env.ARK_API_KEY?.trim()
const model = process.env.ARK_TEXT_MODEL?.trim()
const endpoint = new URL(process.env.ARK_API_BASE?.trim() || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions')
if (!apiKey || !model) throw new Error('Ark API Key or text model is not configured')
if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'ark.cn-beijing.volces.com') throw new Error('Ark endpoint is not allowed')

const startedAt = Date.now()
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Return only this JSON object: {"ok":true}' }],
    temperature: 0,
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' },
    max_tokens: 30,
  }),
  signal: AbortSignal.timeout(30_000),
})
const payload = await response.json().catch(() => null)
if (!response.ok) throw new Error(`Ark connectivity request failed with status ${response.status}`)
const content = payload?.choices?.[0]?.message?.content
if (typeof content !== 'string' || !content.includes('"ok"')) throw new Error('Ark connectivity response was invalid')
console.log(`ark-connectivity=passed model=${model} elapsedMs=${Date.now() - startedAt}`)
