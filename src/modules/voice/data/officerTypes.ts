import type { OfficerType, OfficerTypeConfig, ResolvedOfficerType } from '../types'
import { secureRandomUnit } from '../../../shared/secureRandom.ts'

// ========================================
// 面签官配置
//
// demoText / demoTextEn — 试音时展示的文案
//   （后续接真实 TTS 时，这些文案会被朗读出来）
// systemPromptAddition — 拼接到 OpenAI systemPrompt
// ========================================

export const officerTypes: OfficerTypeConfig[] = [
  // ---- 1. 随机面签官 ----
  {
    id: 'random',
    label: '随机面签官',
    subtitle: '未知风格 · 模拟真实抽签',
    description:
      '确认后从压力型、标准型、友好型中随机抽取一位。提前不知道窗口风格，更接近真实面签的不确定感。',
    icon: '🎲',
    gradient: 'from-slate-500 to-zinc-700',
    ringColor: 'ring-slate-400',
    demoText: '',
    demoTextEn: '',
    systemPromptAddition: '',
    voiceProfile: { gender: 'male', pitch: 1.0, rate: 1.0, style: 'neutral' },
  },

  // ---- 2. 压力型面签官 ----
  {
    id: 'pressure',
    label: '压力型面签官',
    subtitle: '适合拒签 · 二签练习',
    description:
      '语速快、追问直接、停顿极少。模拟高压面签场景，训练你在紧迫节奏下保持冷静、准确回应。',
    icon: '🦅',
    gradient: 'from-red-500 to-rose-600',
    ringColor: 'ring-red-400',
    demoText: '',
    demoTextEn: '',
    systemPromptAddition: `High-pressure: brisk, direct, skeptical, and demanding about precision/consistency. Use short, natural spoken wording and common contractions. Use allowed follow-ups firmly when triggered. Pressure comes from pace and scrutiny, never interruption, insults, or invented questions. Use 1-2 short sentences.`,
    voiceProfile: { gender: 'male', pitch: 0.85, rate: 1.5, style: 'stern' },
  },

  // ---- 3. 标准型面签官 ----
  {
    id: 'standard',
    label: '标准型面签官',
    subtitle: '常规面签 · 通用练习',
    description:
      '正常语速语调，问题简短明确，情绪平稳克制。模拟真实面签窗口的日常节奏，是最接近真实场景的选择。',
    icon: '⚖️',
    gradient: 'from-blue-500 to-indigo-600',
    ringColor: 'ring-blue-400',
    demoText: '',
    demoTextEn: '',
    systemPromptAddition: `Standard: measured pace, short direct wording, calm and neutral. Sound like a real officer speaking at a visa window, not someone reading a formal document. Use ordinary spoken American English and natural contractions. Evaluate school/program, purpose, funding, study and return plans objectively. Use allowed follow-ups for vague, inconsistent, or short answers.`,
    voiceProfile: { gender: 'male', pitch: 1.0, rate: 1.0, style: 'neutral' },
  },

  // ---- 4. 友好型面签官 ----
  {
    id: 'friendly',
    label: '友好型面签官',
    subtitle: '新手入门 · 建立信心',
    description:
      '语速稍慢，发音清晰，问题完整自然。适合第一次面签的申请人建立信心，在轻松的氛围中练习表达。',
    icon: '😊',
    gradient: 'from-emerald-500 to-teal-600',
    ringColor: 'ring-emerald-400',
    demoText: '',
    demoTextEn: '',
    systemPromptAddition: `Friendly: slightly slower, clear, patient, warm, and reassuring without coaching. Use natural everyday wording and contractions while staying professional. Keep the same evidence/consistency standard, deliver scrutiny gently, and use allowed follow-ups only when needed.`,
    voiceProfile: { gender: 'female', pitch: 1.1, rate: 0.85, style: 'warm' },
  },

  // ---- 5. 自定义 ----
  {
    id: 'custom',
    label: '自定义',
    subtitle: '自由描述 · 个性化体验',
    description: '按你的想法描述一位面签官的性格、风格、说话方式，AI 将据此定制专属面签体验。',
    icon: '✨',
    gradient: 'from-purple-500 to-pink-600',
    ringColor: 'ring-purple-400',
    demoText: '',
    demoTextEn: '',
    systemPromptAddition: '', // 运行时根据用户描述动态生成
    voiceProfile: { gender: 'male', pitch: 1.0, rate: 1.0, style: 'neutral' },
  },
]

export const RANDOM_OFFICER_POOL: readonly ResolvedOfficerType[] = ['pressure', 'standard', 'friendly']

export function isOfficerType(value: unknown): value is OfficerType {
  return typeof value === 'string' && officerTypes.some(officer => officer.id === value)
}

export function resolveOfficerType(type: OfficerType, randomValue = secureRandomUnit()): ResolvedOfficerType {
  if (type !== 'random') return type
  const normalized = Number.isFinite(randomValue) ? Math.min(Math.max(randomValue, 0), 0.999999999) : 0
  return RANDOM_OFFICER_POOL[Math.floor(normalized * RANDOM_OFFICER_POOL.length)]
}
