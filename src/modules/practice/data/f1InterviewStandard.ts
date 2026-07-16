export const F1_STUDENT_VISA_SOURCE_URL =
  'https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html'

export const F1_FAM_SOURCE_URL =
  'https://fam.state.gov/FAM/09FAM/09FAM040205.html'

/** Product guardrails, not limits published by the U.S. Department of State. */
export const F1_INTERVIEW_MAX_MAIN_QUESTIONS = 10
export const F1_INTERVIEW_MAX_FOLLOW_UPS = 4
export const F1_INTERVIEW_HARD_LIMIT_SECONDS = 10 * 60

export const F1_INTERVIEW_CLOSING_LINE =
  'Thank you. This concludes the practice interview.'

export type F1EvaluationDimensionId =
  | 'identity_eligibility'
  | 'study_authenticity'
  | 'academic_readiness'
  | 'financial_capacity'
  | 'departure_intent'
  | 'risk_consistency'

export interface F1EvaluationDimension {
  id: F1EvaluationDimensionId
  code: string
  promptRule: string
}

/**
 * Shared F-1 evidence framework for the realtime interview and the future
 * feedback model. It summarizes the official sources; it is not presented as
 * a list of official interview questions or a substitute for adjudication.
 */
export const F1_EVALUATION_DIMENSIONS: readonly F1EvaluationDimension[] = [
  {
    id: 'identity_eligibility',
    code: 'IDENTITY',
    promptRule:
      'I-20/SEVIS/school/program clarity: check that the school, program, start/length, and I-20 understanding are coherent. Treat actual SEVIS status and fee payment as external system checks; never claim to verify them and never request an ID number.',
  },
  {
    id: 'study_authenticity',
    code: 'STUDY',
    promptRule:
      'Genuine study purpose: why this program, why this school, why the United States, and why now must form a specific and plausible full-time study purpose.',
  },
  {
    id: 'academic_readiness',
    code: 'ACADEMIC',
    promptRule:
      'Academic preparation and fit: prior study/work, major choice, program knowledge, grades or language preparation only when volunteered or covered by an allowed follow-up. Do not re-adjudicate the school admission decision.',
  },
  {
    id: 'financial_capacity',
    code: 'FUNDS',
    promptRule:
      'Financial capacity: sponsor/source, credible source of income, and approximate available amount must plausibly cover the I-20 educational, living, and travel costs. Do not request bank/account identifiers.',
  },
  {
    id: 'departure_intent',
    code: 'DEPARTURE',
    promptRule:
      'Present nonimmigrant intent: the post-study path and reasons to depart the United States should be concrete and plausible. A lawful, temporary OPT plan alone is not adverse and a young student need not have an inflexible lifetime career plan.',
  },
  {
    id: 'risk_consistency',
    code: 'RISK',
    promptRule:
      'Risk and consistency: compare the form, earlier answers, and later answers for material contradictions, reliance on unauthorized work, immigration intent, or possible misrepresentation. Sensitive fields, lawful OPT, administrative/security review, or online-presence concerns are flags only, never automatic refusal; do not invent a concern or ask for social-media handles.',
  },
]

export function isF1InterviewClosingLine(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  return normalized.includes('thank you this concludes the practice interview')
    || normalized.includes('thank you this concludes our practice interview')
}
