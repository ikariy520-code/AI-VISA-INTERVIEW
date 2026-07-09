// ========================================
// 声音选择模块 — 类型定义
//
// 四种面签官类型，影响：
//   1. 试音 demo 文案
//   2. AI 对话的 systemPrompt（LLM 无关，适用于任何模型）
//   3. Mock 对话的话术风格
//   4. TTS 语音合成 — 通过 voiceProfile 描述音色特征
//      （Provider 无关；具体 voice ID 映射在 tts.ts 服务层）
// ========================================

/** 面签官类型 ID */
export type OfficerType = 'pressure' | 'standard' | 'friendly' | 'trump' | 'custom'

/** 自定义面签官数据 */
export interface CustomOfficerData {
  description: string   // 用户描述想要的类型
  difficulty: number     // 1～5 难度，1 最轻松 5 最困难
}

/**
 * 音色特征描述（Provider 无关）
 *
 * 描述"什么样的声音"，不绑定任何具体的 TTS Provider。
 * - Web Speech API → 直接用 gender/pitch/rate 匹配浏览器音色
 * - 豆包 / OpenAI → tts.ts 服务层把 OfficerType 映射到 Provider 的 voice ID
 */
export interface VoiceProfile {
  gender: 'male' | 'female'   // 性别倾向
  pitch: number               // 0~2，越低越低沉
  rate: number                // 0.1~10，语速
  style: string               // 风格标签：'stern' | 'neutral' | 'warm' | 'charismatic'
}

/** 面签官配置 */
export interface OfficerTypeConfig {
  id: OfficerType
  label: string              // 中文名称
  subtitle: string           // 适用场景
  description: string        // 详细描述
  icon: string               // emoji 头像
  gradient: string           // 卡片主题渐变 (Tailwind 类)
  ringColor: string          // 选中态环色
  demoText: string           // 试音展示的中文文案
  demoTextEn: string         // 试音展示的英文文案
  /** 注入到 AI systemPrompt 的角色描述（LLM 无关） */
  systemPromptAddition: string
  /**
   * 音色特征 — 保证同一面签官类型每次发音一致。
   * Provider 无关：Web Speech 直接使用，豆包/OpenAI 在 tts.ts 映射。
   */
  voiceProfile: VoiceProfile
}
