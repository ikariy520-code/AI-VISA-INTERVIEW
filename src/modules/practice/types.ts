// ========================================
// 面签实战模块 — 类型定义
//
// 流程：
//   1. 选签证类型 → 2. 填写背景 → 3. AI分析 →
//   4. 实时语音对话 → 5. 完成总结
//
// 与第三阶段反馈模块的数据对接：
//   对话记录 → 可导出为 feedback/types.ts 的 InterviewSession
// ========================================

// ---- 签证类型 ----

export type VisaType = 'B2' | 'B1' | 'F1' | 'H1B' | 'L1'

export interface VisaTypeInfo {
  id: VisaType
  label: string          // 中文标签
  fullName: string       // 签证全称
  description: string    // 一句话说明
  accentClass: string    // 卡片主题色
  icon: string           // emoji 图标
}

// ---- 用户背景 ----

export interface UserContext {
  visaType: VisaType
  purpose: string        // 出行目的
  destination: string    // 目的地城市
  duration: string       // 计划停留时长
  previousVisa: boolean  // 是否有过美国签证
  occupation: string     // 当前职业
  notes: string          // 补充说明
}

// ---- AI 对话 ----

/** 消息角色 */
export type MessageRole = 'officer' | 'user' | 'system'

/** AI 面签官情绪 */
export type OfficerEmotion = 'neutral' | 'friendly' | 'stern' | 'curious' | 'reassuring' | 'thoughtful'

/** 单条消息 */
export interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  timestamp: string       // "02:34"
  emotion?: OfficerEmotion // officer 消息的情绪
}

// ---- 面试状态 ----

export type InterviewStep =
  | 'select-type'
  | 'context-form'
  | 'ai-analysis'
  | 'interview'
  | 'complete'

export type InterviewStatus = 'idle' | 'officer-speaking' | 'user-speaking' | 'processing'

// ---- OpenAI API 对接（占位 — 后续填入 API key 即可启用） ----

export interface OpenAIConfig {
  apiKey: string
  model: string           // e.g. 'gpt-4o-realtime' or 'gpt-4o'
  voice: string           // e.g. 'alloy', 'echo', 'shimmer'
  systemPrompt: string
}

export interface AIAnalysisResult {
  visaType: VisaType
  riskPoints: string[]       // AI 判断的风险点
  suggestedQuestions: string[]  // AI 准备问的问题方向
  strategy: string           // AI 对本次面签的策略简述
  greeting: string           // 开场白
}

// ---- 面试完整记录 — 可导出对接 feedback/types.ts ----

export interface InterviewRecord {
  id: string
  date: string
  time: string
  duration: string           // "14:32"
  visaType: VisaType
  userContext: UserContext
  messages: ChatMessage[]
  aiAnalysis: AIAnalysisResult
}
