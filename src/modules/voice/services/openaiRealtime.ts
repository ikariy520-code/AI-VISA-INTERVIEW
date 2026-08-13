import { realtimeMediaError } from './realtimeAudio'
import type { RealtimeVoiceClient, RealtimeVoiceClientOptions } from './realtimeProvider'

interface OpenAIRealtimeSession {
  token: string
  model: string
  voice: string
  endpoint: string
}

export class OpenAIRealtimeClient implements RealtimeVoiceClient {
  private peer: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private stream: MediaStream | null = null
  private audio: HTMLAudioElement | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private levelFrame: number | null = null
  private closed = false
  private muted = false
  private outputText = ''
  private outputAudioActive = false

  constructor(private readonly options: RealtimeVoiceClientOptions) {}

  async start() {
    this.closed = false
    this.options.onConnectionState('connecting')
    try {
      const session = await this.createSession()
      await this.connect(session)
      this.send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: `Begin the interview now. Say exactly: ${this.options.openingLine}` }],
        },
      })
      this.send({ type: 'response.create' })
      this.options.onConnectionState('connected')
    } catch (error) {
      this.cleanup()
      const message = realtimeMediaError(error)
      this.options.onError(message)
      this.options.onConnectionState('closed')
      throw error
    }
  }

  setMuted(value: boolean) {
    this.muted = value
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value })
    if (value) this.options.onInputLevel?.(0)
  }

  cancelResponse() { this.send({ type: 'response.cancel' }) }

  blockCurrentModelResponse() {
    this.send({ type: 'response.cancel' })
    this.send({ type: 'output_audio_buffer.clear' })
  }

  async end() {
    this.closed = true
    this.cleanup()
    this.options.onConnectionState('closed')
    this.options.onEvent({ type: 'session.closed' })
  }

  destroy() {
    this.closed = true
    this.cleanup()
  }

  private async createSession(): Promise<OpenAIRealtimeSession> {
    const response = await fetch('/api/realtime/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        attemptId: this.options.attemptId,
        instructions: this.options.instructions,
        speakingStyle: this.options.speakingStyle,
        voice: this.options.voice,
        endOfTurnSilenceMs: this.options.endOfTurnSilenceMs,
      }),
    })
    const payload = await response.json().catch(() => null) as Partial<OpenAIRealtimeSession> & { message?: string } | null
    if (!response.ok || !payload?.token || !payload.endpoint || !payload.model) {
      throw new Error(payload?.message || '无法创建 OpenAI Realtime 会话。')
    }
    return payload as OpenAIRealtimeSession
  }

  private async connect(session: OpenAIRealtimeSession) {
    const peer = new RTCPeerConnection()
    this.peer = peer
    const audio = document.createElement('audio')
    audio.autoplay = true
    this.audio = audio
    peer.ontrack = event => {
      audio.srcObject = event.streams[0]
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.stream.getTracks().forEach(track => peer.addTrack(track, this.stream!))
    this.startLevelMeter(this.stream)
    const channel = peer.createDataChannel('oai-events')
    this.channel = channel
    channel.onmessage = event => this.handleEvent(JSON.parse(String(event.data)) as Record<string, unknown>)

    const ready = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('OpenAI Realtime 数据通道连接超时。')), 15_000)
      channel.onopen = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      channel.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('OpenAI Realtime 数据通道连接失败。'))
      }
    })

    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    const response = await fetch(session.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    })
    const answerSdp = await response.text()
    if (!response.ok) throw new Error(`OpenAI Realtime 拒绝连接（HTTP ${response.status}）。`)
    await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    await ready
  }

  private handleEvent(event: Record<string, unknown>) {
    const type = String(event.type || '')
    if (type === 'input_audio_buffer.speech_started') {
      this.options.onEvent({ type: 'conversation.item.input_audio_transcription.started' })
      return
    }
    if (type === 'conversation.item.input_audio_transcription.delta') {
      this.options.onEvent({ type: 'conversation.item.input_audio_transcription.delta', delta: event.delta })
      return
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      this.options.onEvent({ type: 'conversation.item.input_audio_transcription.completed', text: event.transcript })
      return
    }
    if (type === 'response.output_audio.delta' && !this.outputAudioActive) {
      this.outputAudioActive = true
      this.options.onEvent({ type: 'response.output_audio.started' })
      return
    }
    if (type === 'response.output_audio_transcript.delta' || type === 'response.output_text.delta') {
      const delta = typeof event.delta === 'string' ? event.delta : ''
      if (delta) {
        if (!this.outputAudioActive) {
          this.outputAudioActive = true
          this.options.onEvent({ type: 'response.output_audio.started' })
        }
        this.outputText += delta
        this.options.onEvent({ type: 'response.output_text.delta', delta })
      }
      return
    }
    if (type === 'response.output_audio_transcript.done' || type === 'response.output_text.done') {
      const text = typeof event.transcript === 'string'
        ? event.transcript
        : typeof event.text === 'string' ? event.text : this.outputText
      this.options.onEvent({ type: 'response.output_text.done', text })
      this.outputText = ''
      return
    }
    if (type === 'response.output_audio.done') {
      this.outputAudioActive = false
      this.options.onEvent({ type: 'response.output_audio.done' })
      return
    }
    if (type === 'response.done') {
      this.options.onEvent({ type: 'response.done' })
      return
    }
    if (type === 'response.cancelled' || type === 'response.canceled') {
      this.outputAudioActive = false
      this.options.onEvent({ type: 'response.canceled' })
      return
    }
    if (type === 'error') {
      const error = event.error as { message?: unknown; code?: unknown } | undefined
      this.options.onEvent({
        type: 'error',
        code: error?.code,
        message: typeof error?.message === 'string' ? error.message : 'OpenAI Realtime 会话发生错误。',
      })
    }
  }

  private startLevelMeter(stream: MediaStream) {
    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)
    const samples = new Uint8Array(this.analyser.fftSize)
    const tick = () => {
      if (!this.analyser || this.closed) return
      this.analyser.getByteTimeDomainData(samples)
      let peak = 0
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128)
      this.options.onInputLevel?.(this.muted ? 0 : Math.min(1, peak * 2))
      this.levelFrame = window.requestAnimationFrame(tick)
    }
    tick()
  }

  private send(event: unknown) {
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(event))
  }

  private cleanup() {
    if (this.levelFrame !== null) window.cancelAnimationFrame(this.levelFrame)
    this.levelFrame = null
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.channel?.close()
    this.channel = null
    this.peer?.close()
    this.peer = null
    this.audio?.pause()
    if (this.audio) this.audio.srcObject = null
    this.audio = null
    void this.audioContext?.close().catch(() => undefined)
    this.audioContext = null
    this.analyser = null
  }
}
