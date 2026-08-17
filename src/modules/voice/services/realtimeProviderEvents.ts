import type { RealtimeVoiceEvent } from './realtimeProvider'

export interface GeminiEventState {
  inputText: string
  outputText: string
  outputAudioActive: boolean
}

export interface OpenAIEventState {
  outputText: string
  outputAudioActive: boolean
}

export const emptyGeminiEventState = (): GeminiEventState => ({
  inputText: '',
  outputText: '',
  outputAudioActive: false,
})

export const emptyOpenAIEventState = (): OpenAIEventState => ({
  outputText: '',
  outputAudioActive: false,
})

export function mapGeminiServerMessage(
  message: Record<string, unknown>,
  previous: GeminiEventState,
) {
  const events: RealtimeVoiceEvent[] = []
  const audioBase64: string[] = []
  const state = { ...previous }
  const content = message.serverContent as Record<string, unknown> | undefined
  if (!content) return { state, events, audioBase64, stopAudio: false, turnComplete: false }

  const stopAudio = Boolean(content.interrupted)
  if (stopAudio) {
    state.outputText = ''
    state.outputAudioActive = false
    events.push({ type: 'response.canceled' })
  }

  const input = content.inputTranscription as { text?: unknown } | undefined
  if (typeof input?.text === 'string' && input.text) {
    if (!state.inputText) {
      events.push({ type: 'conversation.item.input_audio_transcription.started' })
    }
    state.inputText += input.text
    events.push({
      type: 'conversation.item.input_audio_transcription.result',
      text: state.inputText,
    })
  }

  const output = content.outputTranscription as { text?: unknown } | undefined
  if (typeof output?.text === 'string' && output.text) {
    state.outputText += output.text
    events.push({ type: 'response.output_text.delta', delta: output.text })
  }

  const modelTurn = content.modelTurn as { parts?: Array<Record<string, unknown>> } | undefined
  for (const part of modelTurn?.parts ?? []) {
    const inlineData = part.inlineData as { data?: unknown } | undefined
    if (typeof inlineData?.data !== 'string' || !inlineData.data) continue
    if (!state.outputAudioActive) {
      state.outputAudioActive = true
      events.push({ type: 'response.output_audio.started' })
    }
    audioBase64.push(inlineData.data)
  }

  const turnComplete = Boolean(content.turnComplete)
  if (turnComplete) {
    if (state.inputText) {
      events.push({
        type: 'conversation.item.input_audio_transcription.completed',
        text: state.inputText,
      })
      state.inputText = ''
    }
    if (state.outputText) {
      events.push({ type: 'response.output_text.done', text: state.outputText })
      state.outputText = ''
    }
    state.outputAudioActive = false
  }

  return { state, events, audioBase64, stopAudio, turnComplete }
}

export function mapOpenAIRealtimeEvent(
  event: Record<string, unknown>,
  previous: OpenAIEventState,
) {
  const events: RealtimeVoiceEvent[] = []
  const state = { ...previous }
  const type = String(event.type || '')

  if (type === 'input_audio_buffer.speech_started') {
    events.push({ type: 'conversation.item.input_audio_transcription.started' })
  } else if (type === 'conversation.item.input_audio_transcription.delta') {
    events.push({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: typeof event.delta === 'string' ? event.delta : '',
    })
  } else if (type === 'conversation.item.input_audio_transcription.completed') {
    events.push({
      type: 'conversation.item.input_audio_transcription.completed',
      text: typeof event.transcript === 'string' ? event.transcript : '',
    })
  } else if (type === 'response.output_audio.delta') {
    if (!state.outputAudioActive) {
      state.outputAudioActive = true
      events.push({ type: 'response.output_audio.started' })
    }
  } else if (type === 'response.output_audio_transcript.delta' || type === 'response.output_text.delta') {
    const delta = typeof event.delta === 'string' ? event.delta : ''
    if (delta) {
      if (!state.outputAudioActive) {
        state.outputAudioActive = true
        events.push({ type: 'response.output_audio.started' })
      }
      state.outputText += delta
      events.push({ type: 'response.output_text.delta', delta })
    }
  } else if (type === 'response.output_audio_transcript.done' || type === 'response.output_text.done') {
    const text = typeof event.transcript === 'string'
      ? event.transcript
      : typeof event.text === 'string' ? event.text : state.outputText
    events.push({ type: 'response.output_text.done', text })
    state.outputText = ''
  } else if (type === 'response.output_audio.done') {
    state.outputAudioActive = false
    events.push({ type: 'response.output_audio.done' })
  } else if (type === 'response.done') {
    events.push({ type: 'response.done' })
  } else if (type === 'response.cancelled' || type === 'response.canceled') {
    state.outputText = ''
    state.outputAudioActive = false
    events.push({ type: 'response.canceled' })
  } else if (type === 'error') {
    const error = event.error as { message?: unknown; code?: unknown } | undefined
    events.push({
      type: 'error',
      code: error?.code,
      message: typeof error?.message === 'string'
        ? error.message
        : 'OpenAI Realtime 会话发生错误。',
    })
  }

  return { state, events }
}
