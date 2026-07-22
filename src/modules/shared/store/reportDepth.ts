export type ReportDepth = 'more_answers' | 'basic' | 'strong' | 'full'

export function reportDepthForAnswerCount(answerCount: number): ReportDepth {
  if (answerCount <= 4) return 'more_answers'
  if (answerCount < 7) return 'basic'
  if (answerCount < 10) return 'strong'
  return 'full'
}
