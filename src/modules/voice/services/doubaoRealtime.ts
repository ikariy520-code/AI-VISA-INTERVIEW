export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'closed'

export interface DoubaoRealtimeEvent {
  type: string
  [key: string]: unknown
}

export interface DoubaoRealtimeClientOptions {
  instructions: string
  voice: string
  onEvent: (event: DoubaoRealtimeEvent) => void
  onConnectionState: (state: RealtimeConnectionState) => void
  onError: (message: string) => void
  onInputLevel?: (level: number) => void
}

const INPUT_SAMPLE_RATE = 16_000
const OUTPUT_SAMPLE_RATE = 24_000
const INPUT_CHUNK_SAMPLES = 320 // 20ms at 16kHz
const CONNECT_TIMEOUT_MS = 15_000
const SESSION_TIMEOUT_MS = 20_000

function createEventId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const step = 0x8000
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step))
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
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

  async close() {
    this.stopQueued()
    await this.context?.close().catch(() => undefined)
    this.context = null
    this.nextPlayTime = 0
  }
}

export class DoubaoRealtimeClient {
  private readonly options: DoubaoRealtimeClientOptions
  private readonly capture = new MicrophoneCapture()
  private readonly player = new PcmStreamPlayer()
  private socket: WebSocket | null = null
  private manuallyClosed = false
  private connected = false
  private responseActive = false
  private cancelInFlight = false

  constructor(options: DoubaoRealtimeClientOptions) {
    this.options = options
  }

  async start() {
    if (this.socket) throw new Error('实时面签已经启动。')
    this.manuallyClosed = false
    this.responseActive = false
    this.cancelInFlight = false
    this.options.onConnectionState('connecting')

    try {
      // Unlock audio synchronously from the user's click before the first network await.
      // Browsers may otherwise leave AudioContext.resume() pending indefinitely.
      await this.player.prepare()

      const health = await fetch('/api/realtime-health', { cache: 'no-store' })
      if (!health.ok) {
        const payload = await health.json().catch(() => null) as { message?: unknown } | null
        throw new Error(typeof payload?.message === 'string'
          ? payload.message
          : '实时语音服务的 API Key 尚未在本地配置完成。')
      }

      await this.openSocket()
      this.sendSessionCreate()
      await this.waitForSessionCreated()
      await this.capture.start(
        chunk => this.sendAudio(chunk),
        level => this.options.onInputLevel?.(level),
      )

      this.connected = true
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
    this.capture.setMuted(value)
  }

  cancelResponse() {
    if (!this.connected || !this.responseActive) return
    this.player.stopQueued()
    this.responseActive = false
    this.cancelInFlight = true
    try {
      this.send({ type: 'response.cancel', event_id: createEventId() })
    } catch {
      // A simultaneous upstream close can race with interruption.
    }
  }

  async end() {
    this.manuallyClosed = true
    this.connected = false
    await this.capture.stop()
    this.player.stopQueued()

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'session.close', event_id: createEventId() })
      await new Promise(resolve => window.setTimeout(resolve, 250))
      this.socket.close(1000, 'interview ended')
    }
    await this.cleanup()
    this.options.onConnectionState('closed')
  }

  destroy() {
    this.manuallyClosed = true
    this.connected = false
    void this.capture.stop()
    void this.player.close()
    if (this.socket?.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify({ type: 'session.close' })) } catch {}
      this.socket.close(1000, 'page closed')
    } else {
      this.socket?.close()
    }
    this.socket = null
  }

  private async openSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime-voice`)
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('连接实时语音服务超时。')), CONNECT_TIMEOUT_MS)

      socket.onmessage = (message) => {
        let event: DoubaoRealtimeEvent
        try {
          event = JSON.parse(String(message.data)) as DoubaoRealtimeEvent
        } catch {
          return
        }

        if (event.type === 'local.connected') {
          window.clearTimeout(timeout)
          resolve()
          return
        }
        if (event.type === 'local.error') {
          window.clearTimeout(timeout)
          reject(new Error(String(event.message || '实时语音连接失败。')))
          return
        }
        this.handleEvent(event)
      }

      socket.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('无法建立实时语音连接。'))
      }

      socket.onclose = () => {
        window.clearTimeout(timeout)
        if (!this.manuallyClosed) {
          this.connected = false
          this.options.onConnectionState('closed')
          this.options.onError('实时语音连接已断开，请重新开始。')
        }
      }
    })
  }

  private waitForSessionCreated() {
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('实时语音会话初始化超时。'))
      }, SESSION_TIMEOUT_MS)

      const previousHandler = this.socket?.onmessage ?? null
      if (!this.socket) {
        window.clearTimeout(timeout)
        reject(new Error('实时语音连接不存在。'))
        return
      }

      this.socket.onmessage = (message) => {
        let event: DoubaoRealtimeEvent
        try {
          event = JSON.parse(String(message.data)) as DoubaoRealtimeEvent
        } catch {
          return
        }

        if (event.type === 'session.created') {
          window.clearTimeout(timeout)
          this.socket!.onmessage = previousHandler
          this.handleEvent(event)
          resolve()
          return
        }
        if (event.type === 'error' || event.type === 'local.error') {
          window.clearTimeout(timeout)
          this.socket!.onmessage = previousHandler
          reject(new Error(this.eventErrorMessage(event)))
          return
        }
        this.handleEvent(event)
      }
    })
  }

  private sendSessionCreate() {
    this.send({
      type: 'session.create',
      event_id: createEventId(),
      session: {
        model: '1.2.6.0',
        instructions: this.options.instructions,
        audio: {
          input: { format: { type: 'pcm', sample_rate: INPUT_SAMPLE_RATE } },
          output: {
            format: { type: 'pcm_s16le', sample_rate: OUTPUT_SAMPLE_RATE },
            voice: this.options.voice,
            speed: 0,
            loudness: 0,
          },
        },
        tools: [],
      },
      extension: {
        extra: { enable_proactive_speak: true },
      },
    })
  }

  private sendAudio(chunk: Uint8Array) {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return
    this.send({
      type: 'input_audio_buffer.append',
      event_id: createEventId(),
      audio: bytesToBase64(chunk),
    })
  }

  private send(event: DoubaoRealtimeEvent) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('实时语音连接尚未就绪。')
    }
    this.socket.send(JSON.stringify(event))
  }

  private handleEvent(event: DoubaoRealtimeEvent) {
    if (event.type === 'conversation.item.input_audio_transcription.started') {
      this.cancelResponse()
    }

    // A few audio/text frames can already be in flight when response.cancel is sent.
    // Ignore them until the provider confirms that the old response has ended.
    if (this.cancelInFlight && event.type.startsWith('response.output_')) return

    if (
      event.type === 'response.output_text.delta'
      || event.type === 'response.output_audio.started'
      || event.type === 'response.output_audio.delta'
    ) {
      this.responseActive = true
    }

    if (event.type === 'response.done' || event.type === 'response.canceled') {
      this.responseActive = false
      this.cancelInFlight = false
    }

    if (event.type === 'response.output_audio.delta') {
      const encoded = typeof event.delta === 'string'
        ? event.delta
        : typeof event.audio === 'string' ? event.audio : ''
      if (encoded) {
        void this.player.enqueue(base64ToBytes(encoded)).catch(error => {
          this.options.onError(`音频播放失败：${extractMessage(error)}`)
        })
      }
    }

    if (event.type === 'error') {
      this.options.onError(this.eventErrorMessage(event))
    }

    this.options.onEvent(event)
  }

  private eventErrorMessage(event: DoubaoRealtimeEvent) {
    const error = typeof event.error === 'object' && event.error
      ? event.error as Record<string, unknown>
      : null
    return publicServiceMessage(event.message || error?.message || event.error || '实时语音服务返回错误。')
  }

  private async cleanup() {
    this.connected = false
    this.responseActive = false
    this.cancelInFlight = false
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
