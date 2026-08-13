import {
  RealtimeMicrophoneCapture,
  RealtimePcmPlayer,
  base64ToBytes,
  bytesToBase64,
  realtimeMediaError,
} from './realtimeAudio'
import type { RealtimeVoiceClient, RealtimeVoiceClientOptions } from './realtimeProvider'

const CONNECT_TIMEOUT_MS = 15_000

interface GeminiSession {
  token: string
  model: string
  voice: string
  endpoint: string
  silenceDurationMs: number
}

export class GeminiRealtimeClient implements RealtimeVoiceClient {
  private readonly capture = new RealtimeMicrophoneCapture()
  private readonly player = new RealtimePcmPlayer()
  private socket: WebSocket | null = null
  private closed = false
  private muted = false
  private outputText = ''
  private inputText = ''

  constructor(private readonly options: RealtimeVoiceClientOptions) {}

  async start() {
    this.closed = false
    this.options.onConnectionState('connecting')
    try {
      await this.player.prepare()
      const session = await this.createSession()
      await this.openSocket(session)
      await this.capture.start(chunk => this.sendAudio(chunk), this.options.onInputLevel)
      this.send({ realtimeInput: { text: this.options.openingLine } })
      this.options.onConnectionState('connected')
    } catch (error) {
      await this.cleanup()
      const message = realtimeMediaError(error)
      this.options.onError(message)
      this.options.onConnectionState('closed')
      throw error
    }
  }

  setMuted(value: boolean) {
    this.muted = value
    this.capture.setMuted(value)
    if (value) this.send({ realtimeInput: { audioStreamEnd: true } })
  }

  cancelResponse() { this.player.stopQueued() }

  blockCurrentModelResponse() {
    this.player.stopQueued()
    this.send({ realtimeInput: { activityStart: {} } })
  }

  async end() {
    this.closed = true
    await this.cleanup()
    this.options.onConnectionState('closed')
    this.options.onEvent({ type: 'session.closed' })
  }

  destroy() {
    this.closed = true
    void this.cleanup()
  }

  private async createSession(): Promise<GeminiSession> {
    const response = await fetch('/api/realtime/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'gemini',
        attemptId: this.options.attemptId,
        instructions: this.options.instructions,
        speakingStyle: this.options.speakingStyle,
        voice: this.options.voice,
        endOfTurnSilenceMs: this.options.endOfTurnSilenceMs,
      }),
    })
    const payload = await response.json().catch(() => null) as Partial<GeminiSession> & { message?: string } | null
    if (!response.ok || !payload?.token || !payload.endpoint || !payload.model) {
      throw new Error(payload?.message || '无法创建 Gemini Live 会话。')
    }
    return payload as GeminiSession
  }

  private async openSocket(session: GeminiSession) {
    const url = new URL(session.endpoint)
    url.searchParams.set('access_token', session.token)
    const socket = new WebSocket(url)
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = window.setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('Gemini Live 连接超时。'))
      }, CONNECT_TIMEOUT_MS)
      socket.onopen = () => {
        this.send({
          setup: {
            model: `models/${session.model}`,
            responseModalities: ['AUDIO'],
            systemInstruction: {
              parts: [{ text: [this.options.instructions, this.options.speakingStyle].filter(Boolean).join('\n\n') }],
            },
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: session.voice } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                prefixPaddingMs: 300,
                silenceDurationMs: session.silenceDurationMs,
              },
            },
            contextWindowCompression: { slidingWindow: {} },
          },
        })
      }
      socket.onmessage = event => {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>
        if ('setupComplete' in message && !settled) {
          settled = true
          window.clearTimeout(timeout)
          resolve()
        }
        this.handleMessage(message)
      }
      socket.onerror = () => {
        if (!settled) {
          settled = true
          window.clearTimeout(timeout)
          reject(new Error('Gemini Live WebSocket 连接失败。'))
        }
      }
      socket.onclose = event => {
        if (!settled) {
          settled = true
          window.clearTimeout(timeout)
          reject(new Error(`Gemini Live 连接被拒绝（${event.code}）。`))
        }
        if (!this.closed) {
          this.options.onError(event.reason || 'Gemini Live 会话意外关闭。')
          this.options.onConnectionState('closed')
        }
      }
    })
  }

  private sendAudio(chunk: Uint8Array) {
    if (this.muted) return
    this.send({
      realtimeInput: {
        audio: { data: bytesToBase64(chunk), mimeType: 'audio/pcm;rate=16000' },
      },
    })
  }

  private handleMessage(message: Record<string, unknown>) {
    const content = message.serverContent as Record<string, unknown> | undefined
    if (!content) return
    if (content.interrupted) {
      this.player.stopQueued()
      this.options.onEvent({ type: 'response.canceled' })
    }
    const input = content.inputTranscription as { text?: unknown } | undefined
    if (typeof input?.text === 'string' && input.text) {
      if (!this.inputText) this.options.onEvent({ type: 'conversation.item.input_audio_transcription.started' })
      this.inputText += input.text
      this.options.onEvent({ type: 'conversation.item.input_audio_transcription.result', text: this.inputText })
    }
    const output = content.outputTranscription as { text?: unknown } | undefined
    if (typeof output?.text === 'string' && output.text) {
      this.outputText += output.text
      this.options.onEvent({ type: 'response.output_text.delta', delta: output.text })
    }
    const modelTurn = content.modelTurn as { parts?: Array<Record<string, unknown>> } | undefined
    for (const part of modelTurn?.parts ?? []) {
      const inlineData = part.inlineData as { data?: unknown } | undefined
      if (typeof inlineData?.data === 'string') {
        this.options.onEvent({ type: 'response.output_audio.started' })
        void this.player.enqueue(base64ToBytes(inlineData.data))
      }
    }
    if (content.turnComplete) {
      if (this.inputText) {
        this.options.onEvent({ type: 'conversation.item.input_audio_transcription.completed', text: this.inputText })
        this.inputText = ''
      }
      if (this.outputText) {
        this.options.onEvent({ type: 'response.output_text.done', text: this.outputText })
        this.outputText = ''
      }
      void this.player.waitUntilIdle().then(() => {
        this.options.onEvent({ type: 'response.output_audio.done' })
        this.options.onEvent({ type: 'response.done' })
      })
    }
  }

  private send(payload: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload))
  }

  private async cleanup() {
    await this.capture.stop()
    await this.player.close()
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      this.socket.close(1000, 'interview ended')
    }
    this.socket = null
  }
}
