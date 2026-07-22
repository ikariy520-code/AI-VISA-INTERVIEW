import {
  DOUBAO_EVENT,
  createAudioEventFrame,
  createJsonEventFrame,
  parseServerFrame,
  protocolPayloadText,
  type DoubaoServerFrame,
} from './doubaoRealtimeProtocol'

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'closed'

export interface DoubaoRealtimeEvent {
  type: string
  [key: string]: unknown
}

export interface DoubaoRealtimeClientOptions {
  instructions: string
  openingLine: string
  attemptId: string
  voice: string
  /** Speak only application-approved questions; discard model-authored dialogue. */
  controlledQuestions?: boolean
  validateControlledText?: (text: string) => boolean
  onEvent: (event: DoubaoRealtimeEvent) => void
  onConnectionState: (state: RealtimeConnectionState) => void
  onError: (message: string) => void
  onInputLevel?: (level: number) => void
}

const INPUT_SAMPLE_RATE = 16_000
const OUTPUT_SAMPLE_RATE = 24_000
const INPUT_CHUNK_SAMPLES = 320 // 20 ms at 16 kHz
const CONNECT_TIMEOUT_MS = 15_000
const SESSION_TIMEOUT_MS = 20_000
const GREETING_TIMEOUT_MS = 20_000
// A slightly longer server-VAD window prevents normal thinking pauses from
// being treated as the end of an answer while keeping the exchange responsive.
const END_OF_TURN_SILENCE_MS = 1_800

function createSessionId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function downsampleToPcm16(input: Float32Array, inputRate: number) {
  const ratio = inputRate / INPUT_SAMPLE_RATE
  const outputLength = Math.max(1, Math.floor(input.length / ratio))
  const output = new Int16Array(outputLength)

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((index + 1) * ratio)))
    let sum = 0
    for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor]
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)))
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }

  return output
}

function pcm16ToLittleEndianBytes(samples: Int16Array) {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(index * 2, samples[index], true)
  }
  return bytes
}

function extractMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return '麦克风权限被拒绝，请在浏览器地址栏允许本网站使用麦克风。'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return '没有检测到可用麦克风，请检查系统输入设备。'
  }
  return error instanceof Error ? error.message : String(error)
}

class MicrophoneCapture {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private pendingSamples = new Int16Array(0)
  private muted = false

  async start(
    onChunk: (chunk: Uint8Array) => void,
    onLevel?: (level: number) => void,
  ) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持实时麦克风采集，请使用最新版 Chrome 或 Edge。')
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    this.context = new AudioContext()
    await this.context.resume()
    this.source = this.context.createMediaStreamSource(this.stream)
    this.processor = this.context.createScriptProcessor(2048, 1, 1)
    this.silentGain = this.context.createGain()
    this.silentGain.gain.value = 0

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      let peak = 0
      for (let index = 0; index < input.length; index += 1) {
        peak = Math.max(peak, Math.abs(input[index]))
      }
      onLevel?.(this.muted ? 0 : Math.min(1, peak * 1.6))

      const samples = downsampleToPcm16(input, this.context?.sampleRate ?? INPUT_SAMPLE_RATE)
      if (this.muted) samples.fill(0)
      this.appendSamples(samples, onChunk)
    }

    this.source.connect(this.processor)
    this.processor.connect(this.silentGain)
    this.silentGain.connect(this.context.destination)
  }

  setMuted(value: boolean) {
    this.muted = value
  }

  private appendSamples(samples: Int16Array, onChunk: (chunk: Uint8Array) => void) {
    const combined = new Int16Array(this.pendingSamples.length + samples.length)
    combined.set(this.pendingSamples)
    combined.set(samples, this.pendingSamples.length)

    let offset = 0
    while (combined.length - offset >= INPUT_CHUNK_SAMPLES) {
      const chunk = combined.slice(offset, offset + INPUT_CHUNK_SAMPLES)
      onChunk(pcm16ToLittleEndianBytes(chunk))
      offset += INPUT_CHUNK_SAMPLES
    }
    this.pendingSamples = combined.slice(offset)
  }

  async stop() {
    if (this.processor) {
      this.processor.onaudioprocess = null
      this.processor.disconnect()
    }
    this.source?.disconnect()
    this.silentGain?.disconnect()
    this.stream?.getTracks().forEach(track => track.stop())
    await this.context?.close().catch(() => undefined)
    this.stream = null
    this.context = null
    this.source = null
    this.processor = null
    this.silentGain = null
    this.pendingSamples = new Int16Array(0)
  }
}

class PcmStreamPlayer {
  private context: AudioContext | null = null
  private nextPlayTime = 0
  private sources = new Set<AudioBufferSourceNode>()

  async prepare() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE })
    }
    if (this.context.state === 'suspended') await this.context.resume()
  }

  async enqueue(bytes: Uint8Array) {
    if (bytes.length < 2) return
    await this.prepare()
    if (!this.context) return

    const sampleCount = Math.floor(bytes.length / 2)
    const buffer = this.context.createBuffer(1, sampleCount, OUTPUT_SAMPLE_RATE)
    const channel = buffer.getChannelData(0)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let index = 0; index < sampleCount; index += 1) {
      channel[index] = view.getInt16(index * 2, true) / 32768
    }

    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.context.destination)
    source.onended = () => this.sources.delete(source)
    this.sources.add(source)

    const startAt = Math.max(this.nextPlayTime, this.context.currentTime + 0.015)
    source.start(startAt)
    this.nextPlayTime = startAt + buffer.duration
  }

  stopQueued() {
    for (const source of this.sources) {
      try { source.stop() } catch {}
    }
    this.sources.clear()
    this.nextPlayTime = this.context?.currentTime ?? 0
  }

  async waitUntilIdle() {
    if (!this.context) return
    const remainingMs = Math.max(0, (this.nextPlayTime - this.context.currentTime) * 1000)
    if (remainingMs > 0) {
      await new Promise<void>(resolve => window.setTimeout(resolve, remainingMs + 20))
    }
  }

  async close() {
    this.stopQueued()
    await this.context?.close().catch(() => undefined)
    this.context = null
    this.nextPlayTime = 0
  }
}

interface EventWaiter {
  resolve: (frame: DoubaoServerFrame) => void
  reject: (error: Error) => void
  timeout: number
}

export class DoubaoRealtimeClient {
  private readonly options: DoubaoRealtimeClientOptions
  private readonly capture = new MicrophoneCapture()
  private readonly player = new PcmStreamPlayer()
  private readonly waiters = new Map<number, Set<EventWaiter>>()
  private socket: WebSocket | null = null
  private sessionId = ''
  private manuallyClosed = false
  private connected = false
  private responseActive = false
  private audioForwardingEnabled = false
  private messageQueue = Promise.resolve()
  private lastUserTranscript = ''
  private userTranscriptFinalized = false
  private controlledSpeechActive = false
  private controlledTurnPending = false
  private controlledTurnQueue = Promise.resolve()
  private userMuted = false

  constructor(options: DoubaoRealtimeClientOptions) {
    this.options = options
  }

  async start() {
    if (this.socket) throw new Error('实时面签已经启动。')
    this.manuallyClosed = false
    this.connected = false
    this.responseActive = false
    this.audioForwardingEnabled = false
    this.messageQueue = Promise.resolve()
    this.controlledSpeechActive = false
    this.controlledTurnPending = false
    this.controlledTurnQueue = Promise.resolve()
    this.userMuted = false
    this.sessionId = createSessionId()
    this.options.onConnectionState('connecting')

    try {
      await this.player.prepare()

      const health = await fetch('/api/realtime-health', { cache: 'no-store' })
      if (!health.ok) {
        const payload = await health.json().catch(() => null) as { message?: unknown } | null
        throw new Error(typeof payload?.message === 'string'
          ? payload.message
          : '实时语音服务凭证尚未配置完成。')
      }

      await this.openSocket()

      const connectionStarted = this.waitForProviderEvent(
        DOUBAO_EVENT.CONNECTION_STARTED,
        SESSION_TIMEOUT_MS,
        '实时语音连接初始化超时。',
      )
      this.sendFrame(createJsonEventFrame(DOUBAO_EVENT.START_CONNECTION))
      await connectionStarted

      const sessionStarted = this.waitForProviderEvent(
        DOUBAO_EVENT.SESSION_STARTED,
        SESSION_TIMEOUT_MS,
        '实时语音会话初始化超时。',
      )
      this.sendFrame(createJsonEventFrame(
        DOUBAO_EVENT.START_SESSION,
        this.createStartSessionPayload(),
        this.sessionId,
      ))
      await sessionStarted

      // Ask for microphone access before the greeting, but do not upload anything yet.
      // This follows the official SayHello flow and guarantees that the officer speaks first.
      await this.capture.start(
        chunk => this.sendAudio(chunk),
        level => this.options.onInputLevel?.(level),
      )

      this.controlledSpeechActive = Boolean(this.options.controlledQuestions)
      this.options.onEvent({ type: 'controlled.speech.started', text: this.options.openingLine })
      const greetingEnded = this.waitForProviderEvent(
        DOUBAO_EVENT.TTS_ENDED,
        GREETING_TIMEOUT_MS,
        '面签官开场问候生成超时。',
      )
      this.sendFrame(createJsonEventFrame(
        DOUBAO_EVENT.SAY_HELLO,
        { content: this.options.openingLine },
        this.sessionId,
      ))
      await greetingEnded
      await this.player.waitUntilIdle()
      this.controlledSpeechActive = false
      this.options.onEvent({ type: 'controlled.speech.done', text: this.options.openingLine })

      this.connected = true
      this.audioForwardingEnabled = true
      this.options.onConnectionState('connected')
    } catch (error) {
      await this.cleanup()
      const message = extractMessage(error)
      this.options.onError(message)
      this.options.onConnectionState('closed')
      throw error
    }
  }

  setMuted(value: boolean) {
    this.userMuted = value
    this.capture.setMuted(value)
  }

  /**
   * Rotate the provider session, then read one exact approved question. A
   * response generated by the previous session is therefore never playable.
   */
  speakControlled(text: string) {
    if (!this.options.controlledQuestions) {
      return Promise.reject(new Error('Controlled speech is not enabled for this interview.'))
    }
    const approvedText = text.trim()
    if (!approvedText) return Promise.reject(new Error('Controlled speech text is empty.'))
    if (this.options.validateControlledText && !this.options.validateControlledText(approvedText)) {
      return Promise.reject(new Error('Controlled speech blocked unapproved text.'))
    }
    if (this.controlledTurnPending) {
      return Promise.reject(new Error('The current officer question is still being played.'))
    }

    this.controlledTurnPending = true
    const turn = this.controlledTurnQueue.then(async () => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.sessionId) {
        throw new Error('Realtime voice session is not connected.')
      }
      this.audioForwardingEnabled = false
      this.capture.setMuted(true)
      this.player.stopQueued()
      await this.rotateControlledSession()
      await this.speakInCurrentSession(approvedText)
      this.capture.setMuted(this.userMuted)
      this.audioForwardingEnabled = true
    })
    this.controlledTurnQueue = turn
      .finally(() => { this.controlledTurnPending = false })
      .catch(() => undefined)
    return turn
  }

  cancelResponse() {
    if (!this.responseActive) return
    this.player.stopQueued()
    this.responseActive = false
  }

  async end() {
    this.manuallyClosed = true
    this.connected = false
    this.audioForwardingEnabled = false
    await this.capture.stop()
    this.player.stopQueued()

    if (this.socket?.readyState === WebSocket.OPEN && this.sessionId) {
      const sessionFinished = this.waitForProviderEvent(
        DOUBAO_EVENT.SESSION_FINISHED,
        3_000,
        '结束会话确认超时。',
      )
      this.sendFrame(createJsonEventFrame(DOUBAO_EVENT.FINISH_SESSION, {}, this.sessionId))
      await sessionFinished.catch(() => undefined)

      const connectionFinished = this.waitForProviderEvent(
        DOUBAO_EVENT.CONNECTION_FINISHED,
        2_000,
        '结束连接确认超时。',
      )
      this.sendFrame(createJsonEventFrame(DOUBAO_EVENT.FINISH_CONNECTION))
      await connectionFinished.catch(() => undefined)
      this.socket.close(1000, 'interview ended')
    }

    await this.cleanup()
    this.options.onConnectionState('closed')
    this.options.onEvent({ type: 'session.closed' })
  }

  destroy() {
    this.manuallyClosed = true
    this.connected = false
    this.audioForwardingEnabled = false
    void this.capture.stop()
    void this.player.close()
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        if (this.sessionId) {
          this.socket.send(createJsonEventFrame(DOUBAO_EVENT.FINISH_SESSION, {}, this.sessionId))
        }
        this.socket.send(createJsonEventFrame(DOUBAO_EVENT.FINISH_CONNECTION))
      } catch {}
      this.socket.close(1000, 'page closed')
    } else {
      this.socket?.close()
    }
    this.rejectAllWaiters(new Error('实时语音连接已关闭。'))
    this.socket = null
  }

  private createStartSessionPayload(): Record<string, unknown> {
    return {
      asr: {
        extra: {
          end_smooth_window_ms: END_OF_TURN_SILENCE_MS,
          enable_custom_vad: true,
        },
      },
      tts: {
        speaker: this.options.voice,
        audio_config: {
          channel: 1,
          format: 'pcm_s16le',
          sample_rate: OUTPUT_SAMPLE_RATE,
        },
        extra: {},
      },
      dialog: {
        bot_name: 'U.S. Visa Officer',
        system_role: this.options.instructions,
        speaking_style:
          'Speak in natural conversational American English, like a real officer at a visa window. Use everyday wording and common contractions where the system role allows them. Stay professional, concise, and realistic; avoid slang, jokes, excessive filler, and bureaucratic or written-sounding delivery. Ask one question at a time and wait for the applicant to answer.',
        extra: {
          strict_audit: true,
          input_mod: 'keep_alive',
          enable_music: false,
          enable_loudness_norm: true,
          model: '1.2.1.1',
        },
      },
    }
  }

  private async rotateControlledSession() {
    const oldSessionId = this.sessionId
    const sessionFinished = this.waitForProviderEvent(
      DOUBAO_EVENT.SESSION_FINISHED,
      4_000,
      'Timed out while closing the previous controlled voice turn.',
    )
    this.sendFrame(createJsonEventFrame(DOUBAO_EVENT.FINISH_SESSION, {}, oldSessionId))
    await sessionFinished

    this.sessionId = createSessionId()
    this.lastUserTranscript = ''
    this.userTranscriptFinalized = false
    const sessionStarted = this.waitForProviderEvent(
      DOUBAO_EVENT.SESSION_STARTED,
      SESSION_TIMEOUT_MS,
      'Timed out while opening the next controlled voice turn.',
    )
    this.sendFrame(createJsonEventFrame(
      DOUBAO_EVENT.START_SESSION,
      this.createStartSessionPayload(),
      this.sessionId,
    ))
    await sessionStarted
  }

  private async speakInCurrentSession(text: string) {
    this.controlledSpeechActive = true
    this.options.onEvent({ type: 'controlled.speech.started', text })
    const ended = this.waitForProviderEvent(
      DOUBAO_EVENT.TTS_ENDED,
      GREETING_TIMEOUT_MS,
      'Controlled officer speech generation timed out.',
    )
    this.sendFrame(createJsonEventFrame(
      DOUBAO_EVENT.SAY_HELLO,
      { content: text },
      this.sessionId,
    ))
    await ended
    await this.player.waitUntilIdle()
    this.controlledSpeechActive = false
    this.options.onEvent({ type: 'controlled.speech.done', text })
  }

  private async openSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const query = new URLSearchParams({ attempt: this.options.attemptId })
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime-voice?${query}`)
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = window.setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('连接实时语音服务超时。'))
      }, CONNECT_TIMEOUT_MS)

      socket.onmessage = (message) => {
        if (typeof message.data === 'string') {
          let event: DoubaoRealtimeEvent
          try {
            event = JSON.parse(message.data) as DoubaoRealtimeEvent
          } catch {
            return
          }

          if (event.type === 'local.connected' && !settled) {
            settled = true
            window.clearTimeout(timeout)
            resolve()
            return
          }
          if (event.type === 'local.error') {
            const error = new Error(String(event.message || '实时语音连接失败。'))
            this.rejectAllWaiters(error)
            if (!settled) {
              settled = true
              window.clearTimeout(timeout)
              reject(error)
            } else {
              this.options.onError(error.message)
            }
          }
          return
        }

        if (message.data instanceof ArrayBuffer) {
          this.messageQueue = this.messageQueue
            .then(() => this.handleBinaryMessage(message.data as ArrayBuffer))
            .catch(error => this.handleProtocolError(error))
        }
      }

      socket.onerror = () => {
        const error = new Error('无法建立实时语音连接。')
        this.rejectAllWaiters(error)
        if (!settled) {
          settled = true
          window.clearTimeout(timeout)
          reject(error)
        }
      }

      socket.onclose = () => {
        window.clearTimeout(timeout)
        const error = new Error('实时语音连接已断开。')
        this.rejectAllWaiters(error)
        if (!settled) {
          settled = true
          reject(error)
        }
        if (!this.manuallyClosed) {
          this.connected = false
          this.options.onConnectionState('closed')
          this.options.onError('实时语音连接已断开，请重新开始。')
        }
      }
    })
  }

  private async handleBinaryMessage(buffer: ArrayBuffer) {
    const frame = await parseServerFrame(buffer)
    if (frame.event !== undefined) this.resolveWaiters(frame.event, frame)

    if (
      frame.errorCode !== undefined
      || frame.event === DOUBAO_EVENT.CONNECTION_FAILED
      || frame.event === DOUBAO_EVENT.SESSION_FAILED
      || frame.event === DOUBAO_EVENT.DIALOG_ERROR
    ) {
      const message = this.frameErrorMessage(frame)
      const error = new Error(message)
      this.rejectAllWaiters(error)
      this.options.onError(message)
      this.options.onEvent({ type: 'error', message, code: frame.errorCode })
      return
    }

    switch (frame.event) {
      case DOUBAO_EVENT.SESSION_STARTED:
        this.options.onEvent({ type: 'session.created' })
        break

      case DOUBAO_EVENT.TTS_SENTENCE_START:
        this.responseActive = true
        if (!this.options.controlledQuestions || this.controlledSpeechActive) {
          this.options.onEvent({ type: 'response.output_audio.started', ...frame.json })
        }
        break

      case DOUBAO_EVENT.TTS_RESPONSE:
        this.responseActive = true
        if (!this.options.controlledQuestions || this.controlledSpeechActive) {
          await this.player.enqueue(frame.payload)
          this.options.onEvent({ type: 'response.output_audio.delta' })
        }
        break

      case DOUBAO_EVENT.TTS_ENDED:
        this.responseActive = false
        if (!this.options.controlledQuestions || this.controlledSpeechActive) {
          this.options.onEvent({ type: 'response.output_audio.done' })
          this.options.onEvent({ type: 'response.done' })
        }
        break

      case DOUBAO_EVENT.ASR_INFO:
        this.cancelResponse()
        this.lastUserTranscript = ''
        this.userTranscriptFinalized = false
        this.options.onEvent({ type: 'conversation.item.input_audio_transcription.started' })
        break

      case DOUBAO_EVENT.ASR_RESPONSE:
        this.handleAsrResponse(frame)
        break

      case DOUBAO_EVENT.ASR_ENDED:
        if (this.lastUserTranscript && !this.userTranscriptFinalized) {
          this.options.onEvent({
            type: 'conversation.item.input_audio_transcription.completed',
            transcript: this.lastUserTranscript,
          })
        }
        this.userTranscriptFinalized = true
        this.lastUserTranscript = ''
        break

      case DOUBAO_EVENT.CHAT_RESPONSE: {
        if (this.options.controlledQuestions) break
        const content = typeof frame.json?.content === 'string' ? frame.json.content : ''
        if (content) this.options.onEvent({ type: 'response.output_text.delta', delta: content })
        break
      }

      case DOUBAO_EVENT.CHAT_ENDED:
        if (!this.options.controlledQuestions) {
          this.options.onEvent({ type: 'response.output_text.done' })
        }
        break

      case DOUBAO_EVENT.SESSION_FINISHED:
        this.options.onEvent({ type: 'session.closed' })
        break

      case DOUBAO_EVENT.USAGE_RESPONSE:
        // The provider automatically reports repeated context/system-prompt
        // portions as cached_text_tokens / cached_audio_tokens each round.
        this.options.onEvent({ type: 'usage.updated', usage: frame.json?.usage ?? frame.json })
        break

      default:
        break
    }
  }

  private handleAsrResponse(frame: DoubaoServerFrame) {
    const results = Array.isArray(frame.json?.results) ? frame.json.results : []
    const validResults = results.filter(
      (result): result is Record<string, unknown> => Boolean(result && typeof result === 'object'),
    )
    const text = validResults
      .map(result => typeof result.text === 'string' ? result.text : '')
      .join('')
    if (!text) return

    this.lastUserTranscript = text
    const isInterim = validResults.some(result => result.is_interim === true)
    if (this.options.controlledQuestions) {
      // A controlled turn advances exactly once, on ASR_ENDED. Providers may
      // send more than one non-interim ASR_RESPONSE for the same utterance.
      this.userTranscriptFinalized = false
      this.options.onEvent({
        type: 'conversation.item.input_audio_transcription.result',
        transcript: text,
      })
      return
    }
    this.userTranscriptFinalized = !isInterim
    this.options.onEvent({
      type: isInterim
        ? 'conversation.item.input_audio_transcription.result'
        : 'conversation.item.input_audio_transcription.completed',
      transcript: text,
    })
  }

  private sendAudio(chunk: Uint8Array) {
    if (!this.connected || !this.audioForwardingEnabled) return
    if (this.socket?.readyState !== WebSocket.OPEN || !this.sessionId) return
    this.sendFrame(createAudioEventFrame(this.sessionId, chunk))
  }

  private sendFrame(frame: Uint8Array) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('实时语音连接尚未就绪。')
    }
    this.socket.send(frame)
  }

  private waitForProviderEvent(event: number, timeoutMs: number, timeoutMessage: string) {
    return new Promise<DoubaoServerFrame>((resolve, reject) => {
      const waiter: EventWaiter = {
        resolve,
        reject,
        timeout: window.setTimeout(() => {
          this.waiters.get(event)?.delete(waiter)
          reject(new Error(timeoutMessage))
        }, timeoutMs),
      }
      const eventWaiters = this.waiters.get(event) ?? new Set<EventWaiter>()
      eventWaiters.add(waiter)
      this.waiters.set(event, eventWaiters)
    })
  }

  private resolveWaiters(event: number, frame: DoubaoServerFrame) {
    const eventWaiters = this.waiters.get(event)
    if (!eventWaiters) return
    this.waiters.delete(event)
    for (const waiter of eventWaiters) {
      window.clearTimeout(waiter.timeout)
      waiter.resolve(frame)
    }
  }

  private rejectAllWaiters(error: Error) {
    for (const eventWaiters of this.waiters.values()) {
      for (const waiter of eventWaiters) {
        window.clearTimeout(waiter.timeout)
        waiter.reject(error)
      }
    }
    this.waiters.clear()
  }

  private frameErrorMessage(frame: DoubaoServerFrame) {
    const raw = frame.json?.error || frame.json?.message || protocolPayloadText(frame)
    return publicServiceMessage(raw || `实时语音服务返回错误 ${frame.errorCode ?? ''}`)
  }

  private handleProtocolError(error: unknown) {
    const message = publicServiceMessage(extractMessage(error))
    this.rejectAllWaiters(new Error(message))
    this.options.onError(message)
    this.options.onEvent({ type: 'error', message })
  }

  private async cleanup() {
    this.connected = false
    this.responseActive = false
    this.audioForwardingEnabled = false
    this.rejectAllWaiters(new Error('实时语音连接已关闭。'))
    await this.capture.stop()
    await this.player.close()
    if (this.socket) {
      this.socket.onmessage = null
      this.socket.onerror = null
      this.socket.onclose = null
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close()
      }
    }
    this.socket = null
  }
}

export function realtimeEventText(event: DoubaoRealtimeEvent) {
  for (const key of ['text', 'delta', 'transcript', 'content']) {
    const value = event[key]
    if (typeof value === 'string') return value
  }
  return ''
}

function publicServiceMessage(value: unknown) {
  return String(value).replace(/豆包|doubao|bytedance|volcengine|openspeech/gi, '实时语音服务')
}
