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
  endOfTurnSilenceMs: 1_800,
  speechRate: 0,
  speakingStyleEn: 'Measured, natural American visa-window pace; calm, serious, concise, neutral, and attentive. Read supplied text exactly.',
  speakingStyleZh: '使用正常、自然的面签窗口语速；语气冷静、严肃、简短、中立、专注；逐字朗读给定文本。',
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
        endOfTurnSilenceMs: 1_300,
        speechRate: 20,
        speakingStyleEn: 'Brisk but intelligible American visa-window pace; firm neutral tone, short pauses, restrained skepticism, serious and precise. Read supplied text exactly.',
        speakingStyleZh: '使用更快但清晰的面签窗口语速；语气坚定、中立、停顿短，保持克制审慎；逐字朗读给定文本。',
      }
    case 'friendly':
      return {
        id: 'friendly',
        maxFollowUps: 2,
        maxFollowUpsPerQuestion: 1,
        shortAnswerWordThreshold: 4,
        shortAnswerCharacterThreshold: 4,
        endOfTurnSilenceMs: 2_100,
        speechRate: -10,
        speakingStyleEn: 'Slightly slower, clear American visa-window pace with mild professional warmth; serious, neutral, and evidence-focused. Read supplied text exactly.',
        speakingStyleZh: '使用略慢、清晰的面签窗口语速；保持轻微职业礼貌、严肃、中立并专注事实；逐字朗读给定文本。',
      }
    case 'custom':
      return { ...STANDARD_POLICY, id: 'custom' }
    default:
      return STANDARD_POLICY
  }
}
