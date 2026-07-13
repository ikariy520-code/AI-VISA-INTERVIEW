// ========================================
// AI 服务层（Provider 无关）
//
// 对话生成、用户分析全部走 /api/ai-chat 代理：
//   · 本地开发 → Vite 插件转发到 DeepSeek API
//   · 生产部署 → Netlify Function 转发到 DeepSeek API
//
// 自动降级：API 不可用时回退到 mock 模式
// TTS / STT 暂用浏览器原生 API
// ========================================

import type {
  VisaType, UserContext, AIAnalysisResult,
  OpenAIConfig,
} from '../types'
import type { OfficerType } from '../../voice/types'
import { officerTypes } from '../../voice/data/officerTypes'
import { mockAnalyzeUser, mockGenerateResponse } from '../data/mockOfficer'

// ---- 配置 ----

const AI_CHAT_ENDPOINT = '/api/ai-chat'
const REQUEST_TIMEOUT_MS = 15000

const BASE_SYSTEM_PROMPT = `You are a US visa officer conducting an interview. Your core rules:
- Ask one question at a time, wait for the answer
- Evaluate: ties to home country, purpose of travel, financial ability, travel history
- The interview should feel like a real conversation, not an interrogation
- Conduct the entire interview in natural American English only
- Never translate or repeat an interview question in Chinese
- If the applicant speaks Chinese or another language, reply only in English and ask them to answer in English
- Keep responses concise — 1-3 sentences per question
- Never ask for or repeat identifying details such as a passport number, SEVIS ID, DS-160 confirmation number, date of birth, phone number, email address, exact home address, or bank/account number
- If a document check is relevant, simulate the applicant handing over the document; never ask them to upload a real document or provide its identifying numbers`

const trimText = (value: string | undefined, maxLength: number) =>
  value?.trim().slice(0, maxLength) || undefined

/**
 * Only these product-approved, non-identifying fields may be placed in an AI prompt.
 * Keeping this mapping explicit prevents future UI fields from being sent by accident.
 */
function buildSafeInterviewContext(context: UserContext): Record<string, unknown> {
  if (context.visaType === 'F1') {
    return {
      visaType: context.visaType,
      schoolNameOrAlias: trimText(context.purpose, 100),
      degreeLevel: context.degreeLevel,
      major: trimText(context.major, 100),
      enrollmentMonth: context.enrollmentDate,
      programDuration: trimText(context.duration, 40),
      currentStatus: context.currentStatus,
      schoolReason: trimText(context.schoolReason, 160),
      majorReason: trimText(context.majorReason, 160),
      fundingSource: context.fundingSource || undefined,
      annualBudgetRange: context.budgetRange || undefined,
      hasUsRelatives: Boolean(context.hasUsRelatives),
      usRelativeType: context.hasUsRelatives ? trimText(context.usRelativeType, 40) : undefined,
      hasPreviousVisa: context.previousVisa,
      hasPreviousVisaDenial: Boolean(context.previousVisaDenied),
      refusalReasonCategory: context.previousVisaDenied ? trimText(context.refusalReason, 80) : undefined,
      hasStudyOrWorkGap: Boolean(context.hasStudyGap),
      gapExplanation: context.hasStudyGap ? trimText(context.gapExplanation, 160) : undefined,
      postGraduationPlan: context.postGraduationPlan || undefined,
      homeTies: context.homeTies?.slice(0, 6),
      interviewConcern: trimText(context.notes, 240),
    }
  }

  return {
    visaType: context.visaType,
    travelPurposeCategory: context.b2Purpose || trimText(context.purpose, 40),
    departureMonth: context.travelMonth,
    destinations: trimText(context.destination, 80),
    plannedDuration: trimText(context.duration, 40),
    currentStatus: context.b2CurrentStatus || trimText(context.occupation, 40),
    travelFunding: context.travelFunding,
    tripStyle: context.b2Purpose === 'tourism' ? context.tripStyle : undefined,
    travelCompanion: context.b2Purpose === 'tourism' ? context.travelCompanion : undefined,
    usContactRelation: context.b2Purpose === 'family-visit' || context.b2Purpose === 'friend-visit'
      ? trimText(context.usContactRelation, 40)
      : undefined,
    contactProvidesStay: context.b2Purpose === 'family-visit' || context.b2Purpose === 'friend-visit'
      ? Boolean(context.contactProvidesStay)
      : undefined,
    contactPaysExpenses: context.b2Purpose === 'family-visit' || context.b2Purpose === 'friend-visit'
      ? Boolean(context.contactPaysExpenses)
      : undefined,
    hasMetContact: context.b2Purpose === 'family-visit' || context.b2Purpose === 'friend-visit'
      ? Boolean(context.hasMetContact)
      : undefined,
    homeTies: context.homeTies?.slice(0, 7),
    currentStatusDuration: trimText(context.workTenureRange, 40),
    travelBudgetRange: context.travelBudget || undefined,
    travelHistoryRegions: context.travelHistoryRegions?.slice(0, 5),
    hasPreviousVisa: context.previousVisaAnswer ? context.previousVisa : undefined,
    hasPreviousVisaDenial: context.previousVisaDenied ? true : undefined,
    refusalReasonCategory: context.previousVisaDenied ? trimText(context.refusalReason, 80) : undefined,
    hadLongStayOrOverstay: context.hadOverstay ? true : undefined,
    returnReason: trimText(context.returnReason, 160),
    interviewConcern: trimText(context.notes, 240),
  }
}

// 根据面签官类型拼接不同的 system prompt
function buildSystemPrompt(officerType: OfficerType): string {
  if (officerType === 'custom') {
    const custom = sessionStorage.getItem('visa_custom_system_prompt')
    if (custom) {
      return `${BASE_SYSTEM_PROMPT}\n\n${custom}\n\nNon-negotiable language rule: every officer utterance must be written in English only.`
    }
  }
  const config = officerTypes.find(o => o.id === officerType)
  const addition = config?.systemPromptAddition ?? officerTypes.find(o => o.id === 'standard')!.systemPromptAddition
  return `${BASE_SYSTEM_PROMPT}\n\n${addition}\n\nNon-negotiable language rule: every officer utterance must be written in English only.`
}

const containsCjk = (value: string) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value)

const defaultConfig: OpenAIConfig = {
  apiKey: '',
  model: 'deepseek-chat',
  voice: 'alloy',
  systemPrompt: buildSystemPrompt('standard'),
}

export function resetApiStatus() {
  // 保留兼容接口。
}

// ---- 通用 AI 调用 ----

interface AICallOptions {
  messages: Array<{ role: string; content: string }>
  temperature?: number
  maxTokens?: number
  responseFormat?: { type: string }
}

async function callAI(options: AICallOptions): Promise<string> {
  const response = await fetch(AI_CHAT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 256,
      response_format: options.responseFormat,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any
    throw new Error(err.error || `API error: ${response.status}`)
  }

  const responseData = await response.json() as any
  const content = responseData.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty AI response')
  return content
}

// ============================================================
// 分析用户背景 → 输出面签策略
// ============================================================

export async function analyzeUserContext(
  context: UserContext,
): Promise<AIAnalysisResult> {
  const prompt = `${buildSystemPrompt('standard')}

You are now in ANALYSIS mode. Given the applicant's background below, output a JSON object:

{
  "analysis": {
    "visaType": "B2" | "B1" | "F1" | "H1B" | "L1",
    "riskPoints": ["risk 1", "risk 2", ...],
    "suggestedQuestions": ["question area 1", "question area 2", ...],
    "strategy": "brief interview strategy in Chinese",
    "greeting": "a natural opening greeting as the visa officer in English"
  }
}

Applicant background:
${JSON.stringify(buildSafeInterviewContext(context), null, 2)}`

  try {
    const content = await callAI({
      messages: [
        { role: 'system', content: 'You are a US visa officer. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      maxTokens: 600,
      responseFormat: { type: 'json_object' },
    })

    const parsed = JSON.parse(content)
    return parsed.analysis ?? parsed
  } catch (err) {
    console.warn('[AI] analyzeUserContext failed, falling back to mock:', err)
    return mockAnalyzeUser(context)
  }
}

// ============================================================
// AI 对话生成
// ============================================================

export async function generateOfficerResponse(
  context: UserContext,
  conversationHistory: Array<{ role: string; text: string }>,
  userJustSaid: string,
  officerType: OfficerType = 'standard',
): Promise<{ text: string; emotion: string; isClosing?: boolean; isDocumentRequest?: boolean }> {
  const systemPrompt = buildSystemPrompt(officerType)

  // 构建消息历史
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  // 注入面试上下文（第一轮）
  if (conversationHistory.length <= 1) {
    messages.push({
      role: 'system',
      content: `Current interview context (approved non-identifying fields only):
${JSON.stringify(buildSafeInterviewContext(context), null, 2)}`,
    })
  }

  // 注入对话历史（最近 10 轮避免过长）
  const recentHistory = conversationHistory.slice(-20)
  for (const m of recentHistory) {
    messages.push({
      role: m.role === 'officer' ? 'assistant' : 'user',
      content: m.text,
    })
  }

  // 确保最后一条用户消息被包含
  if (userJustSaid && (recentHistory.length === 0 || recentHistory[recentHistory.length - 1]?.role !== 'user')) {
    messages.push({ role: 'user', content: userJustSaid })
  }

  messages.push({
    role: 'system',
    content: `Continue the conversation naturally as the visa officer. Ask only ONE question. Output valid JSON:
{ "text": "<your next question or statement as the officer, in English only>", "emotion": "<neutral|friendly|stern|curious|reassuring|thoughtful>", "isClosing": <true|false> }
The text field must contain English only, even when the applicant answered in another language.`,
  })

  try {
    const content = await callAI({
      messages,
      temperature: 0.85,
      maxTokens: 200,
    })

    const parsed = JSON.parse(content)
    const responseText = String(parsed.text || '').trim()
    if (!responseText || containsCjk(responseText)) {
      throw new Error('The AI returned a non-English officer response')
    }

    return {
      text: responseText,
      emotion: parsed.emotion || 'neutral',
      isClosing: parsed.isClosing || false,
      isDocumentRequest: parsed.isDocumentRequest || false,
    }
  } catch (err) {
    console.warn('[AI] generateOfficerResponse failed, falling back to mock:', err)
    return mockGenerateResponse(context, conversationHistory, userJustSaid, officerType)
  }
}

// ============================================================
// 语音合成（TTS）
// ============================================================

type TTSProvider = 'webspeech' | 'doubao' | 'openai'

const ACTIVE_TTS_PROVIDER: TTSProvider = 'webspeech'

const PROVIDER_VOICE_MAP: Record<Exclude<TTSProvider, 'webspeech'>, Record<OfficerType, string>> = {
  doubao: {
    pressure:  '', standard:  '', friendly:  '', trump:     '', custom:    '',
  },
  openai: {
    pressure:  'onyx', standard:  'alloy', friendly:  'nova', trump:     'echo', custom:    'alloy',
  },
}

export async function textToSpeech(text: string, officerType: OfficerType = 'standard'): Promise<void> {
  const config = officerTypes.find(o => o.id === officerType)
  if (!config) return

  if (ACTIVE_TTS_PROVIDER === 'webspeech') {
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

  const voiceId = PROVIDER_VOICE_MAP[ACTIVE_TTS_PROVIDER][officerType]
  console.log(`[TTS] Provider=${ACTIVE_TTS_PROVIDER} voice=${voiceId} text=${text.slice(0, 60)}...`)
}

// ============================================================
// 语音转文字（STT）
// ============================================================

export async function speechToText(audioBlob: Blob): Promise<string | null> {
  // 当前使用浏览器 SpeechRecognition（见 useVoiceInput hook）
  // 此函数为未来云端 STT 预留
  return null
}

// ---- Prompt 构建 ----

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

Current interview context (approved non-identifying fields only):
${JSON.stringify(buildSafeInterviewContext(context), null, 2)}

Continue the conversation naturally. Keep responses to 1-3 sentences.
Output JSON: { "message": "...", "emotion": "neutral|friendly|stern|curious|reassuring|thoughtful", "followUpExpected": true|false }`
}

export { defaultConfig }
