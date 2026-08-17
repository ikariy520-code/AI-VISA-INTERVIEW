export const F1_STUDENT_VISA_SOURCE_URL =
  'https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html'

export const F1_FAM_SOURCE_URL =
  'https://fam.state.gov/FAM/09FAM/09FAM040205.html'

/** Product guardrails, not limits published by the U.S. Department of State. */
// This is a safety ceiling, not a target. The controller normally closes as
// soon as its dynamic evidence target and mandatory coverage are complete.
export const F1_INTERVIEW_MAX_MAIN_QUESTIONS = 10
/** Opening question plus every new main question and follow-up; explicit repeats do not add to the count. */
export const F1_INTERVIEW_MAX_TOTAL_QUESTIONS = 16
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
      'School and status clarity: check that the accepted school, program, timing, and I-20-level study plan are coherent. Treat actual SEVIS status and fee payment as external system checks; never claim to verify them and never request an ID number.',
  },
  {
    id: 'study_authenticity',
    code: 'STUDY',
    promptRule:
      'Genuine full-course study purpose: why this program, why this school, why the United States, and why now should form a specific and plausible academic purpose rather than a pretext for another activity.',
  },
  {
    id: 'academic_readiness',
    code: 'ACADEMIC',
    promptRule:
      'Academic preparation and fit: prior study or work, major choice, program knowledge, and relevant preparation may be explored when needed. Do not act as an admissions counselor, re-adjudicate the school decision, or reject a field merely because similar education exists at home.',
  },
  {
    id: 'financial_capacity',
    code: 'FUNDS',
    promptRule:
      'Financial capacity: readily available first-year funding plus specifically identified reliable later-year sources should plausibly cover educational, living, and travel costs without unauthorized U.S. employment. Do not demand all years in cash or request bank/account identifiers.',
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
      'Material consistency: compare the snapshot, earlier answers, and later answers for concrete contradictions, reliance on unauthorized work, immigration intent, prior noncompliance, or possible material misrepresentation. Explore criminal, security, travel, or immigration issues only when case evidence triggers them; never invent a concern, infer deception from demeanor, or ask for social-media handles.',
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
