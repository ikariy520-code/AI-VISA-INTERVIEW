// ========================================
// Mock 面签官数据
//
// 模拟 AI 面签官的对话行为：
//   · 分析阶段 — 根据不同签证类型返回分析策略
//   · 对话阶段 — F1 使用面签状态机引擎
//
// 无 API key 时的完整 demo 体验
// ========================================

import type {
  VisaType, UserContext, AIAnalysisResult,
} from '../types'
import type { OfficerType } from '../../voice/types'
import { createInterviewFlow } from '../services/interviewFlow'

// ---- 状态机实例（F1 专用，按面试生命周期管理） ----

let flowInstance: ReturnType<typeof createInterviewFlow> | null = null
function ensureFlow(context: UserContext) {
  if (!flowInstance) {
    flowInstance = createInterviewFlow(context)
  }
  return flowInstance
}

/** 重置状态机（新面试开始时调用） */
export function resetInterviewFlow() {
  flowInstance = null
}

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
      greeting: `Good morning. Please give me your passport.

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
      greeting: `Good morning. Please give me your passport.

What's the purpose of your trip to the United States?`,
    },
    F1: {
      visaType: 'F1',
      riskPoints: [
        '学术计划的真实性和合理性',
        '毕业后是否有移民倾向',
        '经济能力是否充分',
        '国内约束力是否足够',
      ],
      suggestedQuestions: [
        '学校与专业选择理由',
        '学术背景匹配度',
        '资金能力与来源',
        '家庭状况与国内约束',
        '毕业后归国计划',
        '过往旅行与签证记录',
      ],
      strategy: 'F1 学术签证面签将使用真实面签逻辑：从基础身份 → 学校专业 → 学术计划 → 资金 → 家庭 → 回国计划逐步深入，根据回答质量动态追问，穿插材料请求。重点评估学术真实性、资金充分性、回国意愿。',
      greeting: '', // F1 使用 flow 引擎动态生成，此处留空
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
      greeting: `Good morning. Please give me your passport and I-797 approval notice.

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
      greeting: `Good morning. Please give me your passport and L1 petition documents.

Tell me about your current role at the company and what you'll be doing in the US office.`,
    },
  }

  return patterns[context.visaType]
}

// ---- 对话阶段：Mock 面签官回应 ----

interface MockResponse {
  text: string
  emotion: 'neutral' | 'friendly' | 'stern' | 'curious' | 'reassuring' | 'thoughtful'
}

// 非 F1 的回退模板（保留原有简单轮次系统）
const fallbackTemplates: Record<string, MockResponse[][]> = {
  B2: [
    [{ text: 'I see. So you\'re planning to visit as a tourist. Which cities are you planning to visit?', emotion: 'neutral' }],
    [{ text: 'And what do you do for a living here in China? Tell me about your job.', emotion: 'neutral' }],
    [{ text: 'Do you have family here? Are you married? Any children?', emotion: 'friendly' }],
    [{ text: 'How do you plan to fund this trip? What\'s your budget?', emotion: 'stern' }],
    [{ text: 'Alright. Do you have any other travel history — Europe, Asia, anywhere else?', emotion: 'neutral' }],
  ],
  B1: [
    [{ text: 'I see — a business trip. Which company is inviting you, and what\'s your relationship with them?', emotion: 'neutral' }],
    [{ text: 'And what exactly will you be doing during these business meetings?', emotion: 'neutral' }],
    [{ text: 'How long have you been with your current employer?', emotion: 'curious' }],
    [{ text: 'Does your company have an office or operations in the United States?', emotion: 'stern' }],
    [{ text: 'Alright, last question — after this business trip, what do you have waiting for you back in China?', emotion: 'friendly' }],
  ],
  H1B: [
    [{ text: 'Tell me more about the role you\'ll be taking. What will your day-to-day responsibilities look like?', emotion: 'neutral' }],
    [{ text: 'Your educational background — how does it relate to this position?', emotion: 'neutral' }],
    [{ text: 'How did you find this job? Did you apply, or did the company reach out to you?', emotion: 'curious' }],
    [{ text: 'What do you know about the company? Their size, their main business?', emotion: 'stern' }],
    [{ text: 'Final question — where do you see your career in five years?', emotion: 'friendly' }],
  ],
  L1: [
    [{ text: 'How long have you been working for this company outside the US?', emotion: 'neutral' }],
    [{ text: 'Describe your current role. What do you manage or specialize in?', emotion: 'curious' }],
    [{ text: 'And in the US office — what will be different about your role there?', emotion: 'thoughtful' }],
    [{ text: 'How are the two offices connected? What\'s the relationship between the China and US entities?', emotion: 'neutral' }],
    [{ text: 'Last question — once your assignment in the US is complete, what\'s next?', emotion: 'friendly' }],
  ],
}

const fallbackClosings = [
  { text: 'Alright, I think I have everything I need. Your visa is approved. You\'ll receive your passport back within a few days. Have a good trip.', emotion: 'friendly' },
  { text: 'Thank you for your time. Based on our conversation, I\'m approving your visa. You should receive your passport within 3-5 business days. Take care.', emotion: 'reassuring' },
  { text: 'Okay, I\'ve heard enough. Your visa will be processed. Wait for notification about your passport. Next!', emotion: 'neutral' },
]

// ---- 对话生成主函数 ----

export function mockGenerateResponse(
  context: UserContext,
  history: Array<{ role: string; text: string }>,
  userJustSaid: string,
  officerType: OfficerType = 'standard',
): { text: string; emotion: string; isClosing?: boolean; isDocumentRequest?: boolean } {
  // ---- F1：使用状态机引擎 ----
  if (context.visaType === 'F1') {
    const flow = ensureFlow(context)
    // The state machine owns the current question, answer assessment and next turn.
    const turn = flow.nextTurn(userJustSaid)

    if (turn.isClosing) {
      resetInterviewFlow()
    }

    return { text: turn.text, emotion: turn.emotion, isClosing: turn.isClosing, isDocumentRequest: turn.isDocumentRequest }
  }

  // ---- 非 F1：回退到简单轮次模板 ----
  const templates = fallbackTemplates[context.visaType] ?? fallbackTemplates.B2
  const officerTurns = history.filter(m => m.role === 'officer').length

  if (officerTurns >= templates.length) {
    const closing = fallbackClosings[Math.floor(Math.random() * fallbackClosings.length)]
    return { text: closing.text, emotion: closing.emotion }
  }

  const roundTemplates = templates[officerTurns] ?? templates[templates.length - 1]
  const picked = roundTemplates[Math.floor(Math.random() * roundTemplates.length)]
  return { text: picked.text, emotion: picked.emotion }
}

// ---- 工具函数：生成开场白 ----

export function getMockGreeting(visaType: VisaType, context?: UserContext): string {
  // F1：使用状态机生成开场白
  if (visaType === 'F1' && context) {
    const flow = ensureFlow(context)
    const turn = flow.nextTurn() // 无用户回答 → 返回第一个问题
    return turn.text
  }

  // 非 F1：固定开场白
  const greetings: Record<string, string> = {
    B2: `Good morning. Please give me your passport.

So, what's the purpose of your trip to the United States?`,

    B1: `Good morning. Please give me your passport.

What's the purpose of your trip to the United States?`,

    H1B: `Good morning. Please give me your passport and I-797 approval notice.

So, tell me about the position you'll be taking in the United States.`,

    L1: `Good morning. Please give me your passport and L1 petition documents.

Tell me about your current role at the company and what you'll be doing in the US office.`,
  }
  return greetings[visaType] ?? greetings.B2
}
