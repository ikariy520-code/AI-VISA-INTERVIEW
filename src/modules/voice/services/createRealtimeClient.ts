import { DoubaoRealtimeClient } from './doubaoRealtime'
import { GeminiRealtimeClient } from './geminiRealtime'
import { OpenAIRealtimeClient } from './openaiRealtime'
import type {
  RealtimeVoiceClient,
  RealtimeVoiceClientOptions,
  RealtimeVoiceProviderId,
} from './realtimeProvider'

export function createRealtimeClient(
  provider: RealtimeVoiceProviderId,
  options: RealtimeVoiceClientOptions,
): RealtimeVoiceClient {
  if (provider === 'gemini') return new GeminiRealtimeClient(options)
  if (provider === 'openai') return new OpenAIRealtimeClient(options)
  return new DoubaoRealtimeClient(options)
}
