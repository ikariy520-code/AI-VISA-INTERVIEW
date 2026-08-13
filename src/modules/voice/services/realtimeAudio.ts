const DEFAULT_INPUT_SAMPLE_RATE = 16_000
const DEFAULT_OUTPUT_SAMPLE_RATE = 24_000

function downsampleToPcm16(input: Float32Array, inputRate: number, outputRate: number) {
  const ratio = inputRate / outputRate
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
  for (let index = 0; index < samples.length; index += 1) view.setInt16(index * 2, samples[index], true)
  return bytes
}

export function realtimeMediaError(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return '麦克风权限被拒绝，请在 Windows 和应用设置中允许使用麦克风。'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return '没有检测到可用麦克风，请检查 Windows 输入设备。'
  }
  return error instanceof Error ? error.message : String(error)
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const step = 0x8000
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step))
  }
  return btoa(binary)
}

export function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export class RealtimeMicrophoneCapture {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private pendingSamples = new Int16Array(0)
  private muted = false

  constructor(
    private readonly sampleRate = DEFAULT_INPUT_SAMPLE_RATE,
    private readonly chunkMs = 20,
  ) {}

  async start(onChunk: (chunk: Uint8Array) => void, onLevel?: (level: number) => void) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前设备不支持实时麦克风采集。')
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.context = new AudioContext()
    await this.context.resume()
    this.source = this.context.createMediaStreamSource(this.stream)
    this.processor = this.context.createScriptProcessor(2048, 1, 1)
    this.silentGain = this.context.createGain()
    this.silentGain.gain.value = 0
    this.processor.onaudioprocess = event => {
      const input = event.inputBuffer.getChannelData(0)
      let peak = 0
      for (let index = 0; index < input.length; index += 1) peak = Math.max(peak, Math.abs(input[index]))
      onLevel?.(this.muted ? 0 : Math.min(1, peak * 1.6))
      const samples = downsampleToPcm16(input, this.context?.sampleRate ?? this.sampleRate, this.sampleRate)
      if (this.muted) return
      this.appendSamples(samples, onChunk)
    }
    this.source.connect(this.processor)
    this.processor.connect(this.silentGain)
    this.silentGain.connect(this.context.destination)
  }

  setMuted(value: boolean) { this.muted = value }

  private appendSamples(samples: Int16Array, onChunk: (chunk: Uint8Array) => void) {
    const chunkSamples = Math.round(this.sampleRate * this.chunkMs / 1000)
    const combined = new Int16Array(this.pendingSamples.length + samples.length)
    combined.set(this.pendingSamples)
    combined.set(samples, this.pendingSamples.length)
    let offset = 0
    while (combined.length - offset >= chunkSamples) {
      onChunk(pcm16ToLittleEndianBytes(combined.slice(offset, offset + chunkSamples)))
      offset += chunkSamples
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

export class RealtimePcmPlayer {
  private context: AudioContext | null = null
  private nextPlayTime = 0
  private sources = new Set<AudioBufferSourceNode>()

  constructor(private readonly sampleRate = DEFAULT_OUTPUT_SAMPLE_RATE) {}

  async prepare() {
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext({ sampleRate: this.sampleRate })
    if (this.context.state === 'suspended') await this.context.resume()
  }

  async enqueue(bytes: Uint8Array) {
    if (bytes.length < 2) return
    await this.prepare()
    if (!this.context) return
    const sampleCount = Math.floor(bytes.length / 2)
    const buffer = this.context.createBuffer(1, sampleCount, this.sampleRate)
    const channel = buffer.getChannelData(0)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let index = 0; index < sampleCount; index += 1) channel[index] = view.getInt16(index * 2, true) / 32768
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
    if (remainingMs > 0) await new Promise<void>(resolve => window.setTimeout(resolve, remainingMs + 20))
  }

  async close() {
    this.stopQueued()
    await this.context?.close().catch(() => undefined)
    this.context = null
    this.nextPlayTime = 0
  }
}
