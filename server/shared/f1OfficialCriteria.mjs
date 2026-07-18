export const F1_OFFICIAL_CRITERIA_VERSION = '2026-07-19'

export const F1_OFFICIAL_CRITERIA = [
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
]

export const F1_OFFICIAL_RULE_IDS = new Set(F1_OFFICIAL_CRITERIA.map(rule => rule.id))
