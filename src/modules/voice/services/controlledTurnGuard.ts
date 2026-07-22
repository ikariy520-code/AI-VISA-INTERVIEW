export interface ControlledAnswerDecision {
  accepted: boolean
  awaitingAnswer: boolean
  text: string
}

/**
 * Consume at most one completed transcript for the currently open officer
 * question. Duplicate provider events are ignored until the next question has
 * finished playing and opens a new answer turn.
 */
export function consumeControlledAnswer(
  awaitingAnswer: boolean,
  transcript: string,
): ControlledAnswerDecision {
  const text = transcript.trim()
  if (!awaitingAnswer) return { accepted: false, awaitingAnswer: false, text: '' }
  if (!text) return { accepted: false, awaitingAnswer: true, text: '' }
  return { accepted: true, awaitingAnswer: false, text }
}
