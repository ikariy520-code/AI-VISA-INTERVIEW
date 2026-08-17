export type F1OfficialRuleId =
  | 'DOS_ACADEMIC_PREPARATION'
  | 'DOS_DEPARTURE_INTENT'
  | 'DOS_FINANCIAL_CAPACITY'
  | 'DOS_INDIVIDUAL_ASSESSMENT'
  | 'DOS_MATERIAL_MISREPRESENTATION'
  | 'FAM_STUDENT_VISA_QUALIFICATIONS'
  | 'FAM_ADEQUATE_FINANCIAL_RESOURCES'
  | 'FAM_RESIDENCE_ABROAD'
  | 'FAM_PRESENT_INTENT_CALIBRATION'
  | 'FAM_EDUCATION_HOME_COUNTRY_CALIBRATION'
  | 'FAM_MISREPRESENTATION_EVIDENCE_STANDARD'

export interface F1OfficialRule {
  id: F1OfficialRuleId
  authority: 'U.S. Department of State' | 'U.S. Department of State Foreign Affairs Manual'
  title: string
  url: string
  rule: string
  coachingBoundary: string
}

/**
 * Product-owned summary of current official sources. These rules guide practice
 * feedback; they are not a prediction of adjudication and must be reviewed when
 * the upstream pages change.
 */
export const F1_OFFICIAL_CRITERIA_VERSION = '2026-08-10.2'

export const F1_OFFICIAL_CRITERIA: readonly F1OfficialRule[] = [
  {
    id: 'DOS_ACADEMIC_PREPARATION',
    authority: 'U.S. Department of State',
    title: 'Student Visa - Additional Documentation May Be Required',
    url: 'https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html',
    rule: 'A consular officer may request evidence of academic preparation, including prior school records and standardized test results required by the U.S. school.',
    coachingBoundary: 'Assess whether the applicant can explain the study plan and preparation consistently. Do not re-adjudicate admission or invent missing records.',
  },
  {
    id: 'DOS_DEPARTURE_INTENT',
    authority: 'U.S. Department of State',
    title: 'Student Visa - Additional Documentation May Be Required',
    url: 'https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html',
    rule: 'A consular officer may request evidence of intent to depart the United States upon completion of the course of study.',
    coachingBoundary: 'Assess present intent and coherence of the post-study path. Do not demand property, a fixed lifetime plan, or a promise to return to one particular country.',
  },
  {
    id: 'DOS_FINANCIAL_CAPACITY',
    authority: 'U.S. Department of State',
    title: 'Student Visa - Additional Documentation May Be Required',
    url: 'https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html',
    rule: 'A consular officer may request evidence of how the applicant will pay all educational, living, and travel costs.',
    coachingBoundary: 'Compare only the cost and funding facts actually provided. Missing amounts are an evidence gap, not proof that funds are insufficient.',
  },
  {
    id: 'DOS_INDIVIDUAL_ASSESSMENT',
    authority: 'U.S. Department of State',
    title: 'Visa Denials - Individual 214(b) Assessment',
    url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/visa-denials.html',
    rule: 'A consular officer considers each nonimmigrant visa application individually, including the applicant\'s circumstances, travel or study plans, financial resources, and ties outside the United States.',
    coachingBoundary: 'Ask only questions that can clarify a material fact in this applicant\'s case. Do not use stereotypes, generic trivia, or a reported interview question as a reason to ask it.',
  },
  {
    id: 'DOS_MATERIAL_MISREPRESENTATION',
    authority: 'U.S. Department of State',
    title: 'Visa Denials - Fraud and Material Misrepresentation',
    url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/visa-denials.html',
    rule: 'Willful fraud or misrepresentation of a material fact can make a visa applicant ineligible. A fact is material when the truth could affect eligibility.',
    coachingBoundary: 'Probe a concrete contradiction neutrally, but never accuse the applicant of fraud, infer deception from nervousness, or invent a conflict that is not in the supplied record.',
  },
  {
    id: 'FAM_STUDENT_VISA_QUALIFICATIONS',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.5-5(C) Qualifying for a Student Visa',
    url: 'https://fam.state.gov/FAM/09FAM/09FAM040205.html',
    rule: 'An F-1 applicant must show acceptance evidenced by Form I-20, intent to enter solely for a full course of study, present intent to leave after the approved activity, sufficient funds, and preparation for the course of study.',
    coachingBoundary: 'Use these elements as the interview\'s decision boundary. The simulator must gather relevant facts without pretending to verify government systems or deciding the real case.',
  },
  {
    id: 'FAM_ADEQUATE_FINANCIAL_RESOURCES',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.5-5(G)(1) Adequate Financial Resources',
    url: 'https://fam.state.gov/FAM/09FAM/09FAM040205.html',
    rule: 'An F-1 applicant should have readily available funds for the first year and specifically identified, reliable funding for later years without relying on unauthorized U.S. employment.',
    coachingBoundary: 'Do not demand cash for the entire program at once. Ask about approximate costs, sources, reliability, and any stated reliance on work; never request account identifiers.',
  },
  {
    id: 'FAM_RESIDENCE_ABROAD',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.5-5(E)(1) Residence Abroad Required',
    url: 'https://fam.state.gov/FAM/09FAM/09FAM040205.html',
    rule: 'The applicant must have a residence abroad they do not intend to abandon and must presently intend to depart the United States when the approved activity is complete.',
    coachingBoundary: 'Evaluate current intent from the complete record. Do not convert this into a requirement for property ownership or an inflexible long-range career plan.',
  },
  {
    id: 'FAM_PRESENT_INTENT_CALIBRATION',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.5-5(E)(1) Student Intent Calibration',
    url: 'https://fam.state.gov/FAM/09FAM/09FAM040205.html',
    rule: 'Students often lack the strong economic and social ties of more established applicants. Adjudication focuses on present intent, and young applicants may be unable to explain a detailed long-range plan.',
    coachingBoundary: 'Do not penalize youth, lack of property, or a concise but clear answer. Identify only material gaps or contradictions in present intent.',
  },
  {
    id: 'FAM_EDUCATION_HOME_COUNTRY_CALIBRATION',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.5-5(E)(2) Education and Ties Abroad',
    url: 'https://fam.state.gov/FAM/09FAM/09FAM040205.html',
    rule: 'A proposed field need not appear useful or unavailable in the applicant\'s home country in order to qualify for an F-1 visa.',
    coachingBoundary: 'Assess the applicant\'s genuine study purpose and internal consistency, not whether the same subject could be studied at home.',
  },
  {
    id: 'FAM_MISREPRESENTATION_EVIDENCE_STANDARD',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 302.9-4(B) Evidence and Opportunity to Explain',
    url: 'https://fam.state.gov/FAM/09FAM/09FAM030209.html',
    rule: 'Silence or failure to volunteer an unasked fact is not by itself a misrepresentation, and an inconsistency does not automatically establish willful material misrepresentation. A finding requires evidence beyond mere suspicion and a material line of inquiry, with an opportunity for the applicant to explain or correct the record.',
    coachingBoundary: 'The report may identify the exact statements that need clarification and propose a neutral follow-up. It must not label the applicant dishonest, treat nervousness as evidence, or convert an unasked detail into an adverse fact.',
  },
]

export const F1_OFFICIAL_RULE_IDS = F1_OFFICIAL_CRITERIA.map(rule => rule.id)
