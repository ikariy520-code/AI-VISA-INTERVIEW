// ========================================
// Mock 面签官数据
//
// 模拟 AI 面签官的对话行为：
//   · 分析阶段 — 根据不同签证类型返回分析策略
//   · 对话阶段 — 根据上下文返回自然对话 + 情绪
//
// 无 API key 时的完整 demo 体验
// ========================================

import type {
  VisaType, UserContext, AIAnalysisResult,
} from '../types'
import type { OfficerType } from '../../voice/types'

// ---- 分析阶段：按签证类型返回策略 ----

export function mockAnalyzeUser(context: UserContext): AIAnalysisResult {
  const patterns: Record<VisaType, AIAnalysisResult> = {
    B2: {
      visaType: 'B2',
      riskPoints: [
        '旅行目的是否单纯（排除移民倾向）',
        '国内约束力是否充分（工作、家庭、资产）',
        '旅行计划是否具体、合理',
      ],
      suggestedQuestions: [
        '出行目的与行程安排',
        '国内工作情况',
        '家庭状况与归国约束',
        '经济能力与旅行预算',
        '过往出国记录',
      ],
      strategy: '重点验证申请人的国内约束力和旅行计划的真实性。B2 签证关注申请人是否有移民倾向，需要让申请人展示明确的归国意愿。',
      greeting: `你好，欢迎来面签。请把你的护照给我。

Good morning. Please give me your passport.

So, what's the purpose of your trip to the United States?`,
    },
    B1: {
      visaType: 'B1',
      riskPoints: [
        '商务活动的真实性',
        '国内雇佣关系是否稳定',
        '公司资质与邀请函',
      ],
      suggestedQuestions: [
        '商务访问的具体内容',
        '公司与职位情况',
        '邀请方信息',
        '过往商务出差记录',
        '归国后的工作安排',
      ],
      strategy: '验证商务访问的合理性和必要性。关注申请人所在公司的规模和申请人在公司的角色，确认商务活动结束后会按时回国。',
      greeting: `你好，欢迎来面签。请把护照给我。

Good morning. Please give me your passport.

What's the purpose of your trip to the United States?`,
    },
    F1: {
      visaType: 'F1',
      riskPoints: [
        '学习计划的真实性和合理性',
        '毕业后是否有归国意愿',
        '经济能力是否足够支持学业',
        '所选学校与专业的匹配度',
      ],
      suggestedQuestions: [
        '为什么选择这所学校/专业',
        '学业完成后的计划',
        '学费和生活费来源',
        '之前的学习与工作经历',
        '对美国教育的了解程度',
      ],
      strategy: '验证留学动机的真实性，评估学业完成后的归国意愿。F1 签证需注意申请人是否有清晰的职业规划与中国国内的就业前景。',
      greeting: `你好，欢迎来面签。请把护照和 I-20 给我。

Good morning. Please give me your passport and I-20 form.

So, which university will you be attending?`,
    },
    H1B: {
      visaType: 'H1B',
      riskPoints: [
        '工作岗位与学历背景的匹配度',
        '雇主资质与雇佣真实性',
        '是否有移民倾向',
      ],
      suggestedQuestions: [
        '工作内容与职责',
        '学历与工作经验',
        '雇主信息与薪资',
        '为什么选择来美国工作',
        '长期职业规划',
      ],
      strategy: '验证专业职位与申请人背景的匹配度。关注雇佣关系的真实性以及申请人是否是合格的 specialty occupation 从业者。',
      greeting: `你好，欢迎来面签。请把你的护照和 I-797 给我。

Good morning. Please give me your passport and I-797 approval notice.

So, tell me about the position you'll be taking in the United States.`,
    },
    L1: {
      visaType: 'L1',
      riskPoints: [
        '跨国公司的真实关联性',
        '申请人在海外公司的工作年限是否达标',
        '管理层或专业技能的资质',
        '美国公司的运营状况',
      ],
      suggestedQuestions: [
        '在海外公司的工作内容与年限',
        '在美国公司将担任的职务',
        '两家公司的关系',
        '管理团队的规模',
        '在美国的工作目标',
      ],
      strategy: '验证跨国公司的关联性以及申请人的管理层/专业技能资质。L1 签证需要确认申请人在过去三年中有至少一年的海外公司工作经验。',
      greeting: `你好，欢迎来面签。请把你的护照和 L1 申请材料给我。

Good morning. Please give me your passport and L1 petition documents.

Tell me about your current role at the company and what you'll be doing in the US office.`,
    },
  }

  return patterns[context.visaType]
}

// ---- 对话阶段：模拟面签官回应 ----

interface MockResponse {
  text: string
  emotion: 'neutral' | 'friendly' | 'stern' | 'curious' | 'reassuring' | 'thoughtful'
}

// 不同签证类型 × 对话轮次的回复模版
// 每轮有几组变体，避免重复

const responseTemplates: Record<VisaType, MockResponse[][]> = {
  B2: [
    // 第 1 轮 — 问出行目的
    [
      { text: 'I see. So you\'re planning to visit as a tourist. Which cities are you planning to visit?', emotion: 'neutral' },
      { text: 'A tourist visit. How long do you plan to stay in the United States?', emotion: 'curious' },
      { text: 'Okay, traveling for leisure. Have you been to the United States before?', emotion: 'neutral' },
    ],
    // 第 2 轮 — 问工作/国内约束
    [
      { text: 'And what do you do for a living here in China? Tell me about your job.', emotion: 'neutral' },
      { text: 'Tell me about your current employment. How long have you been working there?', emotion: 'curious' },
      { text: 'I\'d like to know more about your ties to China. What do you do for work?', emotion: 'neutral' },
    ],
    // 第 3 轮 — 问家庭
    [
      { text: 'Do you have family here? Are you married? Any children?', emotion: 'friendly' },
      { text: 'Tell me about your family situation. Married? Kids?', emotion: 'neutral' },
      { text: 'Who are you traveling with? And who will be staying back home?', emotion: 'curious' },
    ],
    // 第 4 轮 — 问经济
    [
      { text: 'How do you plan to fund this trip? What\'s your budget?', emotion: 'stern' },
      { text: 'And financially — who is covering the expenses for this trip?', emotion: 'neutral' },
      { text: 'Traveling to the US can be expensive. How are you financing this trip?', emotion: 'curious' },
    ],
    // 第 5 轮 — 收尾
    [
      { text: 'Alright. Do you have any other travel history — Europe, Asia, anywhere else?', emotion: 'neutral' },
      { text: 'One more question — have you traveled internationally before?', emotion: 'friendly' },
      { text: 'I want to make sure I understand — what do you plan to do to ensure you return to China after your visit?', emotion: 'stern' },
    ],
  ],
  B1: [
    [
      { text: 'I see — a business trip. Which company is inviting you, and what\'s your relationship with them?', emotion: 'neutral' },
      { text: 'Business visit. Can you tell me more about the company you\'ll be meeting with?', emotion: 'curious' },
    ],
    [
      { text: 'And what exactly will you be doing during these business meetings? What\'s the agenda?', emotion: 'neutral' },
      { text: 'Tell me specifically what you\'ll be discussing or presenting during your visit.', emotion: 'stern' },
    ],
    [
      { text: 'How long have you been with your current employer? And what\'s your position there?', emotion: 'curious' },
      { text: 'Let\'s talk about your current role. What do you do, and how long have you been there?', emotion: 'neutral' },
    ],
    [
      { text: 'Does your company have an office or operations in the United States?', emotion: 'stern' },
      { text: 'Is there a US branch of your company? Will you be working there during your visit?', emotion: 'neutral' },
    ],
    [
      { text: 'Alright, last question — after this business trip, what do you have waiting for you back in China?', emotion: 'friendly' },
      { text: 'And can you tell me why this trip needs to happen now, and not be handled remotely?', emotion: 'curious' },
    ],
  ],
  F1: [
    [
      { text: 'Why this university? There are many great schools. What made you choose this one?', emotion: 'curious' },
      { text: 'Interesting choice. What attracted you to this particular program?', emotion: 'friendly' },
    ],
    [
      { text: 'And how do you plan to pay for your tuition and living expenses?', emotion: 'neutral' },
      { text: 'Studying in the US is very expensive. Who is funding your education?', emotion: 'stern' },
    ],
    [
      { text: 'What do you plan to do after you graduate? Will you return to China?', emotion: 'stern' },
      { text: 'Let\'s talk about your plans after graduation. Where do you see yourself?', emotion: 'neutral' },
    ],
    [
      { text: 'Have you applied to any universities in China? Why not pursue this degree at home?', emotion: 'curious' },
      { text: 'There are good universities here in China too. Why is studying in the US important to you?', emotion: 'thoughtful' },
    ],
    [
      { text: 'Alright. Can you tell me what you know about the city where the university is located?', emotion: 'friendly' },
      { text: 'Last question — if your visa is approved, when do you plan to arrive in the US?', emotion: 'neutral' },
    ],
  ],
  H1B: [
    [
      { text: 'Tell me more about the role you\'ll be taking. What will your day-to-day responsibilities look like?', emotion: 'neutral' },
      { text: 'Can you walk me through what the job entails? Be specific about your responsibilities.', emotion: 'curious' },
    ],
    [
      { text: 'Your educational background — how does it relate to this position?', emotion: 'neutral' },
      { text: 'I want to understand the connection between your degree and this job. Can you elaborate?', emotion: 'thoughtful' },
    ],
    [
      { text: 'How did you find this job? Did you apply, or did the company reach out to you?', emotion: 'curious' },
      { text: 'Tell me about the hiring process. How did you connect with this employer?', emotion: 'neutral' },
    ],
    [
      { text: 'What do you know about the company? Their size, their main business?', emotion: 'stern' },
      { text: 'Do you know who you\'ll be reporting to? And how big is the team?', emotion: 'neutral' },
    ],
    [
      { text: 'Final question — where do you see your career in five years?', emotion: 'friendly' },
      { text: 'And after your H1B term — what are your long-term plans?', emotion: 'thoughtful' },
    ],
  ],
  L1: [
    [
      { text: 'How long have you been working for this company outside the US?', emotion: 'neutral' },
      { text: 'Can you confirm your employment dates with the company? When did you start?', emotion: 'stern' },
    ],
    [
      { text: 'Describe your current role. What do you manage or specialize in?', emotion: 'curious' },
      { text: 'Tell me about your team — how many people report to you?', emotion: 'neutral' },
    ],
    [
      { text: 'And in the US office — what will be different about your role there?', emotion: 'thoughtful' },
      { text: 'Why does the US office need you specifically, as opposed to hiring locally?', emotion: 'stern' },
    ],
    [
      { text: 'How are the two offices connected? What\'s the relationship between the China and US entities?', emotion: 'neutral' },
      { text: 'Tell me about the corporate structure — who owns the US entity?', emotion: 'curious' },
    ],
    [
      { text: 'Last question — once your assignment in the US is complete, what\'s next?', emotion: 'friendly' },
      { text: 'And what do you think will be the biggest challenge in the US role?', emotion: 'thoughtful' },
    ],
  ],
}

// 结束语
const closingResponses: MockResponse[] = [
  { text: 'Alright, I think I have everything I need. Your visa is approved. You\'ll receive your passport back within a few days. Have a good trip.', emotion: 'friendly' },
  { text: 'Thank you for your time. Based on our conversation, I\'m approving your visa. You should receive your passport within 3-5 business days. Take care.', emotion: 'reassuring' },
  { text: 'Okay, I\'ve heard enough. Your visa will be processed. Wait for notification about your passport. Next!', emotion: 'neutral' },
]

// 追问 / 需要更多信息
const followUpResponses: MockResponse[] = [
  { text: 'Could you be a bit more specific? I need more detail on that.', emotion: 'stern' },
  { text: 'Hmm, I\'m not sure I follow. Can you explain that more clearly?', emotion: 'curious' },
  { text: 'Let me ask again — I need a more direct answer please.', emotion: 'stern' },
  { text: 'Okay, but I\'d like you to elaborate on that a little more.', emotion: 'neutral' },
]

// ---- 各类型的情绪概率分布 ----

// 自定义类型的情绪权重（根据难度动态调整）
function getCustomWeights(): Record<string, number> {
  const raw = sessionStorage.getItem('visa_custom_difficulty')
  const difficulty = raw ? parseInt(raw) : 3
  if (difficulty <= 2) {
    // 低难度：友好为主
    return { friendly: 0.40, reassuring: 0.25, neutral: 0.20, curious: 0.10, thoughtful: 0.05, stern: 0 }
  }
  if (difficulty >= 4) {
    // 高难度：严厉为主
    return { stern: 0.40, curious: 0.25, neutral: 0.15, thoughtful: 0.10, friendly: 0.05, reassuring: 0.05 }
  }
  // 中等难度：均衡
  return { neutral: 0.35, curious: 0.25, thoughtful: 0.20, friendly: 0.10, stern: 0.08, reassuring: 0.02 }
}

const baseWeights: Record<string, Record<string, number>> = {
  pressure:   { stern: 0.45, curious: 0.30, neutral: 0.20, thoughtful: 0.05, friendly: 0, reassuring: 0 },
  standard:   { neutral: 0.50, curious: 0.20, thoughtful: 0.15, friendly: 0.10, stern: 0.05, reassuring: 0 },
  friendly:   { friendly: 0.40, reassuring: 0.25, thoughtful: 0.20, curious: 0.10, neutral: 0.05, stern: 0 },
  trump:      { curious: 0.35, friendly: 0.25, stern: 0.20, neutral: 0.10, thoughtful: 0.10, reassuring: 0 },
}

/** 获取情绪权重（自定义类型按难度动态计算） */
function getEmotionWeights(ot: OfficerType): Record<string, number> {
  if (ot === 'custom') return getCustomWeights()
  return baseWeights[ot] ?? baseWeights.standard
}

function pickWeightedEmotion(weights: Record<string, number>, fallback: string): string {
  const r = Math.random()
  let cumulative = 0
  for (const [emotion, weight] of Object.entries(weights)) {
    cumulative += weight
    if (r <= cumulative) return emotion
  }
  return fallback
}

// 特朗普风格后处理
function trumpify(text: string): string {
  const prefixes = [
    'OK, let me tell you — ', 'Look, ', 'Here\'s the thing — ',
    'Believe me — ', 'I\'ll be honest with you — ',
  ]
  const suffixes = [
    '. Tremendous, by the way', '. Really something', '',
    '. We\'ll see, we\'ll see', '', '',
  ]
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
  return prefix + text.charAt(0).toLowerCase() + text.slice(1) + suffix
}

// ---- 对话生成主函数 ----

export function mockGenerateResponse(
  context: UserContext,
  history: Array<{ role: string; text: string }>,
  _userJustSaid: string,
  officerType: OfficerType = 'standard',
): { text: string; emotion: string } {
  // 统计对话轮次（officer 说了几次）
  const officerTurns = history.filter(m => m.role === 'officer').length
  const templates = responseTemplates[context.visaType]
  const weights = getEmotionWeights(officerType)

  // 追问概率：压力型 50%，标准 30%，友好 15%，特朗普 35%，自定义按难度
  function getCustomFollowUpChance(): number {
    const raw = sessionStorage.getItem('visa_custom_difficulty')
    const difficulty = raw ? parseInt(raw) : 3
    // 难度 1→0.10  2→0.20  3→0.30  4→0.40  5→0.50
    return +(difficulty * 0.10).toFixed(2)
  }
  const followUpChance: Record<string, number> = {
    pressure: 0.50, standard: 0.30, friendly: 0.15, trump: 0.35,
    custom: getCustomFollowUpChance(),
  }

  // 如果问了 5 轮以上，给结束语
  if (officerTurns >= 5 || officerTurns >= templates.length) {
    const closing = closingResponses[Math.floor(Math.random() * closingResponses.length)]
    let text = closing.text
    let emotion = pickWeightedEmotion(weights, closing.emotion)
    if (officerType === 'trump') text = trumpify(text)
    return { text, emotion }
  }

  // 偶尔追问
  const fupChance = officerType === 'custom' ? getCustomFollowUpChance() : (followUpChance[officerType] ?? 0.3)
  if (officerTurns > 0 && Math.random() < fupChance) {
    const followUp = followUpResponses[Math.floor(Math.random() * followUpResponses.length)]
    let text = followUp.text
    let emotion = pickWeightedEmotion(weights, followUp.emotion)
    if (officerType === 'trump') text = trumpify(text)
    return { text, emotion }
  }

  // 从当前轮次的模版中随机选一条
  const roundTemplates = templates[officerTurns] ?? templates[templates.length - 1]
  const picked = roundTemplates[Math.floor(Math.random() * roundTemplates.length)]
  let text = picked.text
  let emotion = pickWeightedEmotion(weights, picked.emotion)
  if (officerType === 'trump') text = trumpify(text)
  return { text, emotion }
}

// ---- 工具函数：生成开场白 ----

export function getMockGreeting(visaType: VisaType): string {
  const greetings: Record<VisaType, string> = {
    B2: `你好，欢迎来面签。请把你的护照给我。

Good morning. Please give me your passport.

So, what's the purpose of your trip to the United States?`,

    B1: `你好，欢迎来面签。请把护照给我。

Good morning. Please give me your passport.

What's the purpose of your trip to the United States?`,

    F1: `你好，欢迎来面签。请把护照和 I-20 给我。

Good morning. Please give me your passport and I-20 form.

So, which university will you be attending?`,

    H1B: `你好，欢迎来面签。请把护照和 I-797 给我。

Good morning. Please give me your passport and I-797 approval notice.

So, tell me about the position you'll be taking in the United States.`,

    L1: `你好，欢迎来面签。请把护照和 L1 申请材料给我。

Good morning. Please give me your passport and L1 petition documents.

Tell me about your current role at the company and what you'll be doing in the US office.`,
  }
  return greetings[visaType]
}
