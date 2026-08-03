import type { OfficerType } from '../../voice/types.ts'

export interface InterviewModePolicy {
  id: 'pressure' | 'standard' | 'friendly' | 'custom'
  maxFollowUps: number
  maxFollowUpsPerQuestion: number
  shortAnswerWordThreshold: number
  shortAnswerCharacterThreshold: number
  endOfTurnSilenceMs: number
  /** Provider speech-rate adjustment in the documented [-50, 100] range. */
  speechRate: number
  speakingStyleEn: string
  speakingStyleZh: string
}

const STANDARD_POLICY: InterviewModePolicy = {
  id: 'standard',
  maxFollowUps: 3,
  maxFollowUpsPerQuestion: 1,
  shortAnswerWordThreshold: 5,
  shortAnswerCharacterThreshold: 6,
  endOfTurnSilenceMs: 2_000,
  speechRate: 0,
  speakingStyleEn: 'Start promptly. Use natural connected American speech, restrained variation in intonation, and short conversational pauses. Sound like you are asking the applicant directly, not reading a script. Keep a serious, neutral visa-window tone.',
  speakingStyleZh: '使用正常、自然的面签窗口语速；语气冷静、严肃、简短、中立、专注；像直接与申请人说话，而不是朗读文字稿。',
}

export function resolveInterviewModePolicy(officerType: OfficerType): InterviewModePolicy {
  switch (officerType) {
    case 'pressure':
      return {
        id: 'pressure',
        maxFollowUps: 5,
        maxFollowUpsPerQuestion: 1,
        shortAnswerWordThreshold: 8,
        shortAnswerCharacterThreshold: 10,
        endOfTurnSilenceMs: 1_800,
        speechRate: 20,
        speakingStyleEn: 'Start promptly. Use a brisk, clear American visa-window pace, clipped pauses, and a firm neutral tone with restrained skepticism. Sound direct and conversational, not theatrical or scripted.',
        speakingStyleZh: '使用更快但清晰的面签窗口语速；语气坚定、中立、停顿短，保持克制审慎；像直接与申请人说话，而不是朗读文字稿。',
      }
    case 'friendly':
      return {
        id: 'friendly',
        maxFollowUps: 2,
        maxFollowUpsPerQuestion: 1,
        shortAnswerWordThreshold: 4,
        shortAnswerCharacterThreshold: 4,
        endOfTurnSilenceMs: 2_400,
        speechRate: -10,
        speakingStyleEn: 'Start promptly. Use a slightly slower, clear American visa-window pace with natural connected speech and mild professional warmth. Stay serious, neutral, and evidence-focused; do not praise or reassure.',
        speakingStyleZh: '使用略慢、清晰的面签窗口语速；保持轻微职业礼貌、严肃、中立并专注事实；像直接与申请人说话，而不是朗读文字稿。',
      }
    case 'custom':
      return { ...STANDARD_POLICY, id: 'custom' }
    default:
      return STANDARD_POLICY
  }
}
