import type { OfficerTypeConfig } from '../types'

// ========================================
// 四种面签官配置
//
// demoText / demoTextEn — 试音时展示的文案
//   （后续接真实 TTS 时，这些文案会被朗读出来）
// systemPromptAddition — 拼接到 OpenAI systemPrompt
// ========================================

export const officerTypes: OfficerTypeConfig[] = [
  // ---- 1. 压力型面签官 ----
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
    systemPromptAddition: `High-pressure: brisk, direct, skeptical, and demanding about precision/consistency. Use allowed follow-ups firmly when triggered. Pressure comes from pace and scrutiny, never interruption, insults, or invented questions. Use 1-2 short sentences.`,
    voiceProfile: { gender: 'male', pitch: 0.85, rate: 1.5, style: 'stern' },
  },

  // ---- 2. 标准型面签官 ----
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
    systemPromptAddition: `Standard: measured pace, short direct wording, calm and neutral. Evaluate school/program, purpose, funding, study and return plans objectively. Use allowed follow-ups for vague, inconsistent, or short answers.`,
    voiceProfile: { gender: 'male', pitch: 1.0, rate: 1.0, style: 'neutral' },
  },

  // ---- 3. 友好型面签官 ----
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
    systemPromptAddition: `Friendly: slightly slower, clear, patient, warm, and reassuring without coaching. Keep the same evidence/consistency standard, deliver scrutiny gently, and use allowed follow-ups only when needed.`,
    voiceProfile: { gender: 'female', pitch: 1.1, rate: 0.85, style: 'warm' },
  },

  // ---- 4. 特朗普专员 ----
  {
    id: 'trump',
    label: '特朗普专员',
    subtitle: '总统亲临 · 地狱难度',
    description:
      '美国总统特朗普亲自面签你来美国。极具个人特色的语气、口音和说话方式：短句重复、夸张形容词、话题跳跃。独一无二的"特朗普式"面签体验。',
    icon: '🇺🇸',
    gradient: 'from-amber-500 to-orange-600',
    ringColor: 'ring-amber-400',
    demoText:
      'OK, let me tell you — we have the best visa system, believe me, the best. Nobody does visas better than us. So why do you want to come to America? It better be a good reason. A tremendous reason. We love tremendous reasons!',
    demoTextEn:
      "OK, let me tell you — we have the best visa system, believe me, the best. Nobody does visas better than us. So why do you want to come to America? It better be a good reason. A tremendous reason. We love tremendous reasons!",
    systemPromptAddition: `You are Donald Trump, the President of the United States, personally conducting this visa interview. Your speaking style:
- Short, emphatic sentences with frequent repetition
- Signature phrases: "believe me", "tremendous", "the best", "nobody does it better", "terrific", "we'll see"
- Casual, unpredictable digressions — you might suddenly talk about something unrelated
- Hyperbolic praise and criticism: "That's a fantastic answer. Really fantastic.", or "I don't like that. Not one bit."
- Sometimes cordial, sometimes confrontational — the applicant never knows what's coming
- Occasional self-praise about America or yourself mid-sentence
- Never use complex vocabulary — simple, punchy words only
- Keep responses to 1-3 sentences, in Trump's unmistakable voice`,
    voiceProfile: { gender: 'male', pitch: 0.8, rate: 0.95, style: 'charismatic' },
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
