import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createRealtimeSessionHandler } from '../server/realtimeSessionApi.mjs'

function request(body) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body))])
  stream.url = '/api/realtime/session'
  stream.method = 'POST'
  stream.headers = {}
  return stream
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(body) { this.payload = body ? JSON.parse(body) : null },
  }
}

const commonBody = {
  instructions: 'Conduct a focused F-1 visa interview.',
  speakingStyle: 'Use concise, natural spoken English.',
  endOfTurnSilenceMs: 2_000,
}

const calls = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init, body: JSON.parse(String(init.body)) })
  if (String(url).includes('googleapis.com')) {
    return new Response(JSON.stringify({ name: 'gemini-ephemeral-token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ value: 'openai-ephemeral-token', expires_at: 123456 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

try {
  const gemini = createRealtimeSessionHandler({
    provider: 'gemini',
    geminiApiKey: 'long-lived-gemini-key',
    geminiModel: 'gemini-3.1-flash-live-preview',
    geminiVoice: 'Kore',
  })
  const geminiResponse = response()
  assert.equal(await gemini(request({ ...commonBody, provider: 'gemini', voice: 'untrusted-override' }), geminiResponse), true)
  assert.equal(geminiResponse.statusCode, 200)
  assert.equal(geminiResponse.payload.provider, 'gemini')
  assert.equal(geminiResponse.payload.token, 'gemini-ephemeral-token')
  assert.equal(geminiResponse.payload.voice, 'Kore')
  assert.equal(JSON.stringify(geminiResponse.payload).includes('long-lived-gemini-key'), false)
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'long-lived-gemini-key')
  assert.equal(calls[0].body.uses, 1)
  assert.equal(calls[0].body.liveConnectConstraints.model, 'models/gemini-3.1-flash-live-preview')

  const openai = createRealtimeSessionHandler({
    provider: 'openai',
    openaiApiKey: 'long-lived-openai-key',
    openaiModel: 'gpt-realtime-2.1',
    openaiVoice: 'marin',
  })
  const openaiResponse = response()
  assert.equal(await openai(request({ ...commonBody, provider: 'openai', voice: 'alloy' }), openaiResponse), true)
  assert.equal(openaiResponse.statusCode, 200)
  assert.equal(openaiResponse.payload.provider, 'openai')
  assert.equal(openaiResponse.payload.token, 'openai-ephemeral-token')
  assert.equal(openaiResponse.payload.voice, 'marin')
  assert.equal(JSON.stringify(openaiResponse.payload).includes('long-lived-openai-key'), false)
  assert.equal(calls[1].init.headers.Authorization, 'Bearer long-lived-openai-key')
  assert.equal(calls[1].body.session.type, 'realtime')
  assert.equal(calls[1].body.session.audio.input.turn_detection.type, 'semantic_vad')
  assert.equal(calls[1].body.session.audio.input.turn_detection.eagerness, 'low')
  assert.match(calls[1].body.session.instructions, /focused F-1 visa interview/)

  const mismatchResponse = response()
  assert.equal(await openai(request({ ...commonBody, provider: 'gemini' }), mismatchResponse), true)
  assert.equal(mismatchResponse.statusCode, 409)
  assert.equal(mismatchResponse.payload.error, 'VOICE_PROVIDER_MISMATCH')

  const doubao = createRealtimeSessionHandler({
    provider: 'doubao',
    doubaoAppId: 'app-id',
    doubaoAccessKey: 'access-key',
  })
  assert.equal(doubao.configured, true)
  const doubaoResponse = response()
  assert.equal(await doubao(request({ ...commonBody, provider: 'doubao' }), doubaoResponse), true)
  assert.equal(doubaoResponse.statusCode, 400)
  assert.equal(doubaoResponse.payload.error, 'SESSION_NOT_REQUIRED')
  assert.equal(calls.length, 2)
} finally {
  globalThis.fetch = originalFetch
}

console.log('Realtime provider session contract tests passed.')
