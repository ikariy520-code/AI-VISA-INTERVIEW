// ========================================
// 反馈模块类型定义
//
// 数据来源：第二阶段实时语音对话
// 分析分两条线：
//   A. 语音分析 — 从录音中提取（语速/停顿/情绪/音调）
//   B. 内容分析 — 从文字转写中评估（逻辑/具体性/说服力）
// ========================================

// ---- A. 语音分析（录音 → AI 提取） ----

export interface VoiceMetrics {
  /** 语速：词/分钟 */
  wordsPerMinute: number
  /** 最长停顿（秒） */
  longestPause: number
  /** 填充词计数（um, uh, like 等） */
  fillerCount: number
  /** 填充词列表 */
  fillers: string[]
  /** 音量稳定性 1-5（5=稳定） */
  volumeStability: number
  /** 语速稳定性 1-5（5=稳定一致） */
  paceStability: number
}

export interface VoiceEmotion {
  /** 主导情绪 */
  primary: 'calm' | 'nervous' | 'confident' | 'hesitant' | 'tense' | 'natural'
  /** 情绪稳定性 1-5 */
  stability: number
  /** 一句话描述情绪表现 */
  description: string
}

export interface VoiceAnalysis {
  metrics: VoiceMetrics
  emotion: VoiceEmotion
  /** 可播放的录音片段路径（后续接真实 URL） */
  audioUrl: string | null
  /** 录音时长（秒） */
  duration: number
}

// ---- B. 内容分析（转写文字 → AI 评估） ----

export interface ContentDimension {
  label: string          // 逻辑 / 具体性 / 说服力 / 约束力展示
  score: number          // 1-5
  comment: string
}

export interface ContentAnalysis {
  dimensions: ContentDimension[]
  summary: string
  suggestions: string[]
}

// ---- 综合反馈 ----

export interface AnswerFeedback {
  /** 综合判决 */
  verdict: 'favorable' | 'neutral' | 'unfavorable'
  /** 语言分析 */
  voice: VoiceAnalysis
  /** 内容分析 */
  content: ContentAnalysis
}

// ---- 一轮问答 ----

export interface QAPair {
  id: string
  question: string
  answer: string            // 语音转写文字
  timestamp: string         // "02:34"
  feedback: AnswerFeedback
}

// ---- 一次完整面签 ----

export interface InterviewSession {
  id: string
  date: string
  time: string
  duration: string
  title: string
  overallScore: number     // 综合 1-5
  transcript: QAPair[]
}
