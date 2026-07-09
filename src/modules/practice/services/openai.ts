// ========================================
// OpenAI API 服务层
//
// 当前为占位实现 — 无 API key 时使用 mock 模式
// 接入步骤：
//   1. 在下方 OPENAI_API_KEY 填入你的 key
//   2. 将 USE_MOCK 改为 false
//   3. 取消注释真实 API 调用代码
//
// 面签官类型从第一部分选择 → 通过 officerType 参数注入 systemPrompt
// ========================================

import type {
  VisaType, UserContext, AIAnalysisResult,
  OpenAIConfig,
} from '../types'
import type { OfficerType } from '../../voice/types'
import { officerTypes } from '../../voice/data/officerTypes'
import { mockAnalyzeUser, mockGenerateResponse } from '../data/mockOfficer'

// ---- 配置区 — 后续填入真实 API key ----

const OPENAI_API_KEY = ''   // ← 在这里填入你的 OpenAI API Key
const USE_MOCK = true        // ← 无 key 时自动走 mock，填 key 后改为 false

const BASE_SYSTEM_PROMPT = `You are a US visa officer conducting an interview. Your core rules:
- Ask one question at a time, wait for the answer
- Evaluate: ties to home country, purpose of travel, financial ability, travel history
- The interview should feel like a real conversation, not an interrogation
- Respond in the same language the applicant uses
- Keep responses concise — 1-3 sentences per question`

// 根据面签官类型拼接不同的 system prompt
function buildSystemPrompt(officerType: OfficerType): string {
  // 自定义类型：从 sessionStorage 读取用户生成的 system prompt
  if (officerType === 'custom') {
    const custom = sessionStorage.getItem('visa_custom_system_prompt')
    if (custom) return `${BASE_SYSTEM_PROMPT}\n\n${custom}`
  }
  const config = officerTypes.find(o => o.id === officerType)
  const addition = config?.systemPromptAddition ?? officerTypes.find(o => o.id === 'standard')!.systemPromptAddition
  return `${BASE_SYSTEM_PROMPT}\n\n${addition}`
}

const defaultConfig: OpenAIConfig = {
  apiKey: OPENAI_API_KEY,
  model: 'gpt-4o',
  voice: 'alloy', // 兜底值；实际 voice 由 TTS 服务层根据 officerType 映射
  systemPrompt: buildSystemPrompt('standard'),
}

// ---- 类型：API 响应 ----

interface AIAnalysisResponse {
  analysis: AIAnalysisResult
}

interface AIChatResponse {
  message: string
  emotion: string
  followUpExpected: boolean
}

// ============================================================
// 主接口：分析用户背景 → 输出面签策略
// ============================================================

export async function analyzeUserContext(
  context: UserContext,
): Promise<AIAnalysisResult> {
  if (USE_MOCK || !OPENAI_API_KEY) {
    // Mock 模式：预设分析结果
    return mockAnalyzeUser(context)
  }

  // ---- 真实 API 调用（后续取消注释） ----
  /*
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: defaultConfig.model,
      messages: [
        { role: 'system', content: buildAnalysisPrompt() },
        { role: 'user', content: JSON.stringify(context) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data: AIAnalysisResponse = await response.json()
  return data.analysis
  */

  throw new Error('API not configured')
}

// ============================================================
// 主接口：AI 对话生成（语音对话中的文字内容）
// ============================================================

export async function generateOfficerResponse(
  context: UserContext,
  conversationHistory: Array<{ role: string; text: string }>,
  userJustSaid: string,
  officerType: OfficerType = 'standard',
): Promise<{ text: string; emotion: string; isClosing?: boolean; isDocumentRequest?: boolean }> {
  if (USE_MOCK || !OPENAI_API_KEY) {
    return mockGenerateResponse(context, conversationHistory, userJustSaid, officerType)
  }

  // ---- 真实 API 调用（后续取消注释） ----
  /*
  const messages = [
    { role: 'system', content: buildConversationPrompt(context) },
    ...conversationHistory.map(m => ({
      role: m.role === 'officer' ? 'assistant' as const : 'user' as const,
      content: m.text,
    })),
    { role: 'user', content: userJustSaid },
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: defaultConfig.model,
      messages,
      temperature: 0.9,
      max_tokens: 150,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data: AIChatResponse = await response.json()
  return { text: data.message, emotion: data.emotion }
  */

  throw new Error('API not configured')
}

// ============================================================
// 语音合成（TTS）
//
// 声音一致性架构（Provider 无关）：
//   OfficerTypeConfig.voiceProfile 描述"什么样的声音"
//   → Web Speech：直接用 gender/pitch/rate
//   → 豆包 / OpenAI：在下方 PROVIDER_VOICE_MAP 映射 voice ID
//
// 切换 Provider：改 ACTIVE_TTS_PROVIDER + 填入对应 API key
// ============================================================

type TTSProvider = 'webspeech' | 'doubao' | 'openai'

const ACTIVE_TTS_PROVIDER: TTSProvider = 'webspeech'

/** 各 Provider 的面签官 voice ID 映射（Web Speech 不需要，直接用 voiceProfile） */
const PROVIDER_VOICE_MAP: Record<Exclude<TTSProvider, 'webspeech'>, Record<OfficerType, string>> = {
  doubao: {
    // TODO: 接入豆包 TTS 后替换为实际 voice ID
    pressure:  '',   // ← 豆包深沉男声
    standard:  '',   // ← 豆包中性男声
    friendly:  '',   // ← 豆包温暖女声
    trump:     '',   // ← 豆包特质男声
    custom:    '',   // ← 豆包自定义
  },
  openai: {
    pressure:  'onyx',
    standard:  'alloy',
    friendly:  'nova',
    trump:     'echo',
    custom:    'alloy',
  },
}

export async function textToSpeech(
  text: string,
  officerType: OfficerType = 'standard',
): Promise<void> {
  const config = officerTypes.find(o => o.id === officerType)
  if (!config) return

  if (ACTIVE_TTS_PROVIDER === 'webspeech') {
    // 浏览器原生 TTS（免费）— 从 voiceProfile 读取参数，保证同一类型每次发音一致
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      utterance.rate = config.voiceProfile.rate
      utterance.pitch = config.voiceProfile.pitch

      const genderKeywords = config.voiceProfile.gender === 'female'
        ? ['female', 'woman', 'samantha', 'zira']
        : ['male', 'guy', 'daniel', 'david']

      const voices = window.speechSynthesis.getVoices()
      const bestVoice =
        voices.find(v => v.lang.startsWith('en') && genderKeywords.some(k => v.name.toLowerCase().includes(k)))
        ?? voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'))
        ?? voices.find(v => v.lang.startsWith('en-US'))
        ?? voices.find(v => v.lang.startsWith('en'))
      if (bestVoice) utterance.voice = bestVoice

      window.speechSynthesis.speak(utterance)
    }
    return
  }

  // ---- 远程 TTS（豆包 / OpenAI）— 后续接入 ----
  const voiceId = PROVIDER_VOICE_MAP[ACTIVE_TTS_PROVIDER][officerType]
  console.log(`[TTS] Provider=${ACTIVE_TTS_PROVIDER} voice=${voiceId} text=${text.slice(0, 60)}...`)
  // TODO: 调用豆包/OpenAI TTS API
  // const audioBuffer = await fetchTTS(text, voiceId, ACTIVE_TTS_PROVIDER)
  // playAudio(audioBuffer)
}

// ============================================================
// 语音转文字（STT — 后续接入）
// ============================================================

export async function speechToText(
  audioBlob: Blob,
): Promise<string | null> {
  if (USE_MOCK || !OPENAI_API_KEY) {
    return null
  }

  // ---- 真实 Whisper API 调用（后续取消注释） ----
  /*
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')
  formData.append('model', 'whisper-1')
  formData.append('language', 'en')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Whisper API error: ${response.status}`)
  }

  const data = await response.json()
  return data.text
  */

  return null
}

// ---- Prompt 构建（辅助函数） ----

function buildAnalysisPrompt(): string {
  return `${defaultConfig.systemPrompt}

You are now in ANALYSIS mode. Given the applicant's background, output a JSON object with:
{
  "analysis": {
    "visaType": "B2" | "B1" | "F1" | "H1B" | "L1",
    "riskPoints": ["risk 1", "risk 2", ...],
    "suggestedQuestions": ["question area 1", "question area 2", ...],
    "strategy": "brief strategy for this interview",
    "greeting": "a natural opening greeting as the visa officer"
  }
}`
}

function buildConversationPrompt(context: UserContext): string {
  return `${defaultConfig.systemPrompt}

Current interview context:
- Visa type: ${context.visaType}
- Purpose: ${context.purpose}
- Destination: ${context.destination}
- Occupation: ${context.occupation}
- Previous US visa: ${context.previousVisa ? 'Yes' : 'No'}

Continue the conversation naturally. Keep responses to 1-3 sentences.
Output JSON: { "message": "...", "emotion": "neutral|friendly|stern|curious|reassuring|thoughtful", "followUpExpected": true|false }`
}

export { defaultConfig, OPENAI_API_KEY, USE_MOCK }
