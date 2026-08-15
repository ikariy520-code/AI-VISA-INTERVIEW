import assert from 'node:assert/strict'
import {
  emptyGeminiEventState,
  emptyOpenAIEventState,
  mapGeminiServerMessage,
  mapOpenAIRealtimeEvent,
} from '../src/modules/voice/services/realtimeProviderEvents.ts'

let geminiState = emptyGeminiEventState()
const geminiEvents: Array<Record<string, unknown>> = []
const geminiAudio: string[] = []
const replayGemini = (message: Record<string, unknown>) => {
  const mapped = mapGeminiServerMessage(message, geminiState)
  geminiState = mapped.state
  geminiEvents.push(...mapped.events)
  geminiAudio.push(...mapped.audioBase64)
  return mapped
}

replayGemini({ serverContent: { inputTranscription: { text: 'My ' } } })
replayGemini({ serverContent: { inputTranscription: { text: 'parents.' } } })
replayGemini({
  serverContent: {
    outputTranscription: { text: 'What do they do?' },
    modelTurn: { parts: [{ inlineData: { data: 'AQI=' } }, { inlineData: { data: 'AwQ=' } }] },
  },
})
const geminiComplete = replayGemini({ serverContent: { turnComplete: true } })

assert.deepEqual(geminiAudio, ['AQI=', 'AwQ='])
assert.equal(geminiEvents.filter(event => event.type === 'response.output_audio.started').length, 1)
assert.deepEqual(
  geminiEvents.find(event => event.type === 'conversation.item.input_audio_transcription.completed'),
  { type: 'conversation.item.input_audio_transcription.completed', text: 'My parents.' },
)
assert.deepEqual(
  geminiEvents.find(event => event.type === 'response.output_text.done'),
  { type: 'response.output_text.done', text: 'What do they do?' },
)
assert.equal(geminiComplete.turnComplete, true)
assert.deepEqual(geminiState, emptyGeminiEventState())

replayGemini({ serverContent: { outputTranscription: { text: 'Canceled answer' } } })
const geminiInterrupted = replayGemini({ serverContent: { interrupted: true } })
assert.equal(geminiInterrupted.stopAudio, true)
assert.deepEqual(geminiInterrupted.events, [{ type: 'response.canceled' }])
assert.equal(geminiState.outputText, '')

let openAIState = emptyOpenAIEventState()
const openAIEvents: Array<Record<string, unknown>> = []
const replayOpenAI = (event: Record<string, unknown>) => {
  const mapped = mapOpenAIRealtimeEvent(event, openAIState)
  openAIState = mapped.state
  openAIEvents.push(...mapped.events)
  return mapped
}

replayOpenAI({ type: 'input_audio_buffer.speech_started' })
replayOpenAI({ type: 'conversation.item.input_audio_transcription.delta', delta: 'My parents.' })
replayOpenAI({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'My parents.' })
replayOpenAI({ type: 'response.output_audio.delta', delta: 'base64-audio' })
replayOpenAI({ type: 'response.output_audio_transcript.delta', delta: 'What do ' })
replayOpenAI({ type: 'response.output_audio_transcript.delta', delta: 'they do?' })
replayOpenAI({ type: 'response.output_audio_transcript.done' })
replayOpenAI({ type: 'response.output_audio.done' })
replayOpenAI({ type: 'response.done' })

assert.equal(openAIEvents.filter(event => event.type === 'response.output_audio.started').length, 1)
assert.deepEqual(
  openAIEvents.find(event => event.type === 'response.output_text.done'),
  { type: 'response.output_text.done', text: 'What do they do?' },
)
assert.equal(openAIEvents.at(-2)?.type, 'response.output_audio.done')
assert.equal(openAIEvents.at(-1)?.type, 'response.done')
assert.deepEqual(openAIState, emptyOpenAIEventState())

replayOpenAI({ type: 'response.output_text.delta', delta: 'Canceled answer' })
const openAICanceled = replayOpenAI({ type: 'response.cancelled' })
assert.deepEqual(openAICanceled.events, [{ type: 'response.canceled' }])
assert.deepEqual(openAIState, emptyOpenAIEventState())

const openAIError = replayOpenAI({ type: 'error', error: { code: 'invalid_request', message: 'Rejected' } })
assert.deepEqual(openAIError.events, [{ type: 'error', code: 'invalid_request', message: 'Rejected' }])

console.log('Realtime provider event replay tests passed without API keys.')
