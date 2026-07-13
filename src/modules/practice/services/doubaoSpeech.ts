const ASR_PATH = '/api/speech/asr'
const TTS_PATH = '/api/speech/tts'
const TARGET_SAMPLE_RATE = 16_000

interface DoubaoAsrCallbacks {
  onReady?: () => void
  onPartial?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (message: string) => void
  onStopped?: () => void
}

function websocketUrl(path: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

function resample(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === TARGET_SAMPLE_RATE) return input
  const ratio = sourceRate / TARGET_SAMPLE_RATE
  const outputLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(outputLength)
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, input.length - 1)
    const weight = position - left
    output[index] = input[left] * (1 - weight) + input[right] * weight
  }
  return output
}

function floatToPcm16(input: Float32Array): ArrayBuffer {
  const output = new ArrayBuffer(input.length * 2)
  const view = new DataView(output)
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return output
}

export function isDoubaoAsrSupported() {
  return typeof window !== 'undefined'
    && typeof WebSocket !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && Boolean(window.AudioContext || (window as any).webkitAudioContext)
}

export class DoubaoAsrSession {
  private socket: WebSocket | null = null
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private latestTranscript = ''
  private cancelled = false
  private stopping = false
  private finished = false

  constructor(private readonly callbacks: DoubaoAsrCallbacks) {}

  async start(): Promise<void> {
    if (!isDoubaoAsrSupported()) throw new Error('This browser cannot record audio for cloud speech recognition.')
    this.cancelled = false
    this.stopping = false
    this.finished = false
    this.latestTranscript = ''
    await this.connect()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
      this.audioContext = new AudioContextCtor()
      await this.audioContext.resume()
      this.source = this.audioContext.createMediaStreamSource(this.stream)
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)
      this.silentGain = this.audioContext.createGain()
      this.silentGain.gain.value = 0
      this.processor.onaudioprocess = (event) => {
        if (this.stopping || this.socket?.readyState !== WebSocket.OPEN) return
        const channel = event.inputBuffer.getChannelData(0)
        const pcm = floatToPcm16(resample(channel, event.inputBuffer.sampleRate))
        this.socket.send(pcm)
      }
      this.source.connect(this.processor)
      this.processor.connect(this.silentGain)
      this.silentGain.connect(this.audioContext.destination)
      this.callbacks.onReady?.()
    } catch (error) {
      this.cancel()
      throw error
    }
  }

  stop() {
    if (this.stopping || this.finished) return
    this.stopping = true
    this.stopCapture()
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'stop' }))
    } else {
      this.finish()
    }
  }

  cancel() {
    this.cancelled = true
    this.stopping = true
    this.stopCapture()
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'cancel' }))
    }
    this.socket?.close(1000, 'cancelled')
    this.finish()
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(websocketUrl(ASR_PATH))
      socket.binaryType = 'arraybuffer'
      this.socket = socket
      const timeout = window.setTimeout(() => {
        reject(new Error('Cloud speech recognition timed out while connecting.'))
        socket.close()
      }, 12_000)

      socket.onopen = () => socket.send(JSON.stringify({ type: 'start' }))
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return
        let message: { type?: string; text?: string; final?: boolean; code?: string }
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }
        if (message.type === 'ready') {
          window.clearTimeout(timeout)
          resolve()
        } else if (message.type === 'transcript' && message.text) {
          this.latestTranscript = message.text.replace(/\s+/g, ' ').trim()
          this.callbacks.onPartial?.(this.latestTranscript)
        } else if (message.type === 'ended') {
          this.finish()
        } else if (message.type === 'error') {
          window.clearTimeout(timeout)
          const friendly = message.code === 'DOUBAO_SPEECH_NOT_CONFIGURED'
            ? 'Cloud speech recognition is not configured.'
            : 'Cloud speech recognition is temporarily unavailable.'
          this.callbacks.onError?.(friendly)
          reject(new Error(friendly))
        }
      }
      socket.onerror = () => {
        window.clearTimeout(timeout)
        const message = 'Unable to connect to cloud speech recognition.'
        this.callbacks.onError?.(message)
        reject(new Error(message))
      }
      socket.onclose = () => {
        window.clearTimeout(timeout)
        if (!this.stopping && !this.cancelled) {
          this.cancelled = true
          this.callbacks.onError?.('The cloud speech recognition connection ended unexpectedly.')
        }
        this.finish()
      }
    })
  }

  private stopCapture() {
    if (this.processor) this.processor.onaudioprocess = null
    try { this.source?.disconnect() } catch {}
    try { this.processor?.disconnect() } catch {}
    try { this.silentGain?.disconnect() } catch {}
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    void this.audioContext?.close().catch(() => undefined)
    this.source = null
    this.processor = null
    this.silentGain = null
    this.stream = null
    this.audioContext = null
  }

  private finish() {
    if (this.finished) return
    this.finished = true
    this.stopCapture()
    if (!this.cancelled && this.latestTranscript) this.callbacks.onFinal?.(this.latestTranscript)
    this.callbacks.onStopped?.()
  }
}

let activeAudio: HTMLAudioElement | null = null
let activeAudioUrl = ''

export function stopDoubaoSpeech() {
  activeAudio?.pause()
  activeAudio = null
  if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl)
  activeAudioUrl = ''
}

export async function playDoubaoSpeech(text: string): Promise<void> {
  stopDoubaoSpeech()
  const response = await fetch(TTS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(35_000),
  })
  if (!response.ok) throw new Error(`Doubao TTS request failed (${response.status}).`)
  const blob = await response.blob()
  if (!blob.size) throw new Error('Doubao TTS returned empty audio.')
  activeAudioUrl = URL.createObjectURL(blob)
  const audio = new Audio(activeAudioUrl)
  activeAudio = audio
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      stopDoubaoSpeech()
      resolve()
    }
    audio.onerror = () => {
      stopDoubaoSpeech()
      reject(new Error('The generated speech could not be played.'))
    }
    audio.play().catch((error) => {
      stopDoubaoSpeech()
      reject(error)
    })
  })
}
