export type RealtimeVoiceProviderId = 'doubao' | 'gemini' | 'openai'

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'closed'

export interface RealtimeVoiceEvent {
  type: string
  [key: string]: unknown
}

export interface RealtimeVoiceClientOptions {
  instructions: string
  openingLine: string
  attemptId: string
  voice: string
  speakingStyle?: string
  endOfTurnSilenceMs?: number
  speechRate?: number
  controlledQuestions?: boolean
  validateControlledText?: (text: string) => boolean
  onEvent: (event: RealtimeVoiceEvent) => void
  onConnectionState: (state: RealtimeConnectionState) => void
  onError: (message: string) => void
  onInputLevel?: (level: number) => void
}

export interface RealtimeVoiceClient {
  start(): Promise<void>
  setMuted(value: boolean): void
  cancelResponse(): void
  blockCurrentModelResponse(): void
  end(): Promise<void>
  destroy(): void
}

export interface RealtimeProviderHealth {
  ok: boolean
  provider: RealtimeVoiceProviderId
  name?: string
  code?: string
  message?: string
}

export async function getRealtimeProviderHealth(signal?: AbortSignal): Promise<RealtimeProviderHealth> {
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = window.setTimeout(() => {
    controller.abort(new DOMException('实时语音服务检查超时。', 'TimeoutError'))
  }, 8_000)

  try {
    const response = await fetch('/api/realtime-health', { cache: 'no-store', signal: controller.signal })
    const payload = await response.json().catch(() => null) as Partial<RealtimeProviderHealth> | null
    if (!response.ok || !payload?.ok || !isRealtimeVoiceProviderId(payload.provider)) {
      throw new Error(typeof payload?.message === 'string'
        ? payload.message
        : '实时语音模型尚未正确配置。')
    }
    return payload as RealtimeProviderHealth
  } catch (error) {
    if (!signal?.aborted && controller.signal.aborted) {
      throw new Error('连接本地服务超时，请确认应用服务已启动，或检查防火墙设置。')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

export function isRealtimeVoiceProviderId(value: unknown): value is RealtimeVoiceProviderId {
  return value === 'doubao' || value === 'gemini' || value === 'openai'
}

export function realtimeEventText(event: RealtimeVoiceEvent) {
  for (const key of ['text', 'delta', 'transcript', 'content']) {
    const value = event[key]
    if (typeof value === 'string') return value
  }
  return ''
}
