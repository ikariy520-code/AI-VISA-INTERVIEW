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

export type DegreeLevel = 'bachelor' | 'master' | 'phd' | 'language' | 'other'
export type CurrentStatus = 'student' | 'new-graduate' | 'employed' | 'unemployed' | 'gap'
export type FundingSource = 'parents' | 'self' | 'scholarship' | 'relatives' | 'combined' | 'other'
export type BudgetRange = 'under-30k' | '30k-50k' | '50k-80k' | '80k-plus' | 'not-sure'
export type PostGraduationPlan = 'return-work' | 'further-study' | 'family-business' | 'undecided' | 'other'
export type HomeTie = 'career' | 'study' | 'spouse-children' | 'family-responsibility' | 'property' | 'business' | 'other'
export type B2Purpose = 'tourism' | 'family-visit' | 'friend-visit' | 'other-short-visit'
export type B2CurrentStatus = 'employed' | 'self-employed' | 'student' | 'retired' | 'unemployed' | 'other'
export type TravelFunding = 'self' | 'spouse-parents' | 'us-contact' | 'shared' | 'other'
export type TravelCompanion = 'alone' | 'spouse' | 'parents' | 'children' | 'friends' | 'colleagues' | 'relatives'
export type TripStyle = 'independent' | 'group-tour' | 'with-family-friends'
export type TravelBudget = 'under-3k' | '3k-6k' | '6k-10k' | '10k-plus' | 'not-sure'
export type TravelRegion = 'asia' | 'europe' | 'oceania' | 'north-america' | 'other'

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
  purpose: string        // 出行目的（F1 签证复用为学校名称）
  destination: string    // 目的地城市
  duration: string       // 计划停留时长
  previousVisa: boolean  // 是否有过美国签证
  occupation: string     // 当前职业
  notes: string          // 补充说明
  major?: string         // F1 签证专用：专业
  degreeLevel?: DegreeLevel
  enrollmentDate?: string
  currentStatus?: CurrentStatus
  schoolReason?: string
  majorReason?: string
  fundingSource?: FundingSource | ''
  budgetRange?: BudgetRange | ''
  hasUsRelatives?: boolean
  usRelativeType?: string
  previousVisaDenied?: boolean
  refusalReason?: string
  hasStudyGap?: boolean
  gapExplanation?: string
  postGraduationPlan?: PostGraduationPlan | ''
  homeTies?: HomeTie[]
  b2Purpose?: B2Purpose
  travelMonth?: string
  b2CurrentStatus?: B2CurrentStatus
  travelFunding?: TravelFunding
  tripStyle?: TripStyle
  travelCompanion?: TravelCompanion
  usContactRelation?: string
  contactProvidesStay?: boolean
  contactPaysExpenses?: boolean
  hasMetContact?: boolean
  workTenureRange?: string
  travelBudget?: TravelBudget | ''
  travelHistoryRegions?: TravelRegion[]
  hadOverstay?: boolean
  returnReason?: string
  previousVisaAnswer?: 'yes' | 'no'
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
  isDocumentRequest?: boolean // 是否为材料请求
}

// ---- 面签状态机 ----

/** 面签阶段 */
export type InterviewStage =
  | 'START'
  | 'BASIC_INFO'
  | 'SCHOOL_AND_MAJOR'
  | 'ACADEMIC_PLAN'
  | 'CURRENT_STATUS'
  | 'FUNDING_CHECK'
  | 'FAMILY_AND_TIES'
  | 'FUTURE_PLAN'
  | 'TRAVEL_HISTORY'
  | 'SECURITY_AND_DS160'
  | 'DOCUMENT_CHECK'
  | 'END'

/** 问题对象 */
export interface Question {
  id: string
  category: InterviewStage
  text: string
  priority: 'required' | 'normal' | 'optional'
  riskTags: string[]
  followUpTriggers: string[]
  possibleFollowUps: string[]
}

/** 状态机内部状态 */
export interface InterviewState {
  stage: InterviewStage
  stageIndex: number
  askedQuestionIds: Set<string>
  totalQuestions: number
  consecutiveCategoryCount: Record<string, number>
  pendingFollowUp: Question | null
  askedDocumentQuestions: Set<string>
  userShortAnswerCount: number
  riskFlags: string[]
}

/** 状态机输出：面签官响应 */
export interface OfficerTurn {
  text: string
  emotion: OfficerEmotion
  isClosing?: boolean
  isDocumentRequest?: boolean
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
