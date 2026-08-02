import type { InterviewStage } from '../types.ts'
import type { F1OfficialRuleId } from './f1OfficialCriteria.ts'

export type F1QuestionId =
  | 'f1_01' | 'f1_02' | 'f1_03' | 'f1_04' | 'f1_05' | 'f1_06'
  | 'f1_07' | 'f1_08' | 'f1_09' | 'f1_10' | 'f1_11' | 'f1_12'
  | 'f1_13' | 'f1_14' | 'f1_15' | 'f1_16' | 'f1_17' | 'f1_18'
  | 'f1_19' | 'f1_20' | 'f1_21' | 'f1_22'

export type F1SelectionPolicy = 'core' | 'adaptive' | 'mandatory' | 'high-frequency'
export type F1AnswerShape = 'open' | 'yes-no' | 'compound'

export type F1FollowUpCondition = 'affirmative' | 'negative' | 'uncertain' | 'evidence-gap' | 'keyword'
export type F1VisaReviewFactor =
  | 'academic-preparation'
  | 'study-purpose-and-program-fit'
  | 'financial-capacity'
  | 'departure-intent'
  | 'application-consistency'
  | 'eligibility-and-compliance'

export interface F1FollowUpRule {
  id: string
  text: string
  when: F1FollowUpCondition
  reviewFactor: F1VisaReviewFactor
  officialRuleIds: readonly F1OfficialRuleId[]
  keywords?: readonly string[]
  evidenceKeywords?: readonly string[]
  riskKeywords?: readonly string[]
}

export interface F1QuestionDefinition {
  id: F1QuestionId
  number: number
  stage: InterviewStage
  topic: string
  text: string
  selection: F1SelectionPolicy
  answerShape: F1AnswerShape
  evaluationFocus: string[]
  followUps?: readonly F1FollowUpRule[]
  sensitive?: boolean
  privacyGuidance?: string
}

/**
 * Product-owned F1 framework. The language model may assess an answer, but it
 * must never invent, remove, renumber, or silently replace these 22 questions.
 */
export const F1_QUESTION_CATALOG: readonly F1QuestionDefinition[] = [
  {
    id: 'f1_01', number: 1, stage: 'BASIC_INFO', topic: 'school', selection: 'core', answerShape: 'open',
    text: 'Which school are you going to?',
    evaluationFocus: ['directness', 'consistency_with_background'],
    followUps: [{ id: 'f1_01_school_name', text: "What's the full name of the school?", when: 'uncertain', reviewFactor: 'application-consistency', officialRuleIds: ['DOS_ACADEMIC_PREPARATION'] }],
  },
  {
    id: 'f1_02', number: 2, stage: 'SCHOOL_AND_MAJOR', topic: 'school', selection: 'adaptive', answerShape: 'open',
    text: 'How did you hear about this school?',
    evaluationFocus: ['specificity', 'independent_research'],
    followUps: [{ id: 'f1_02_research', text: 'What did you look at before you applied?', when: 'keyword', reviewFactor: 'study-purpose-and-program-fit', officialRuleIds: ['DOS_ACADEMIC_PREPARATION'], keywords: ['agent', 'agency', 'friend', 'relative', 'consultant'] }],
  },
  {
    id: 'f1_03', number: 3, stage: 'SCHOOL_AND_MAJOR', topic: 'school', selection: 'adaptive', answerShape: 'open',
    text: 'Why did you choose this school?',
    evaluationFocus: ['school_knowledge', 'program_fit', 'specificity'],
    followUps: [{ id: 'f1_03_program_fit', text: 'What part of the program fits your plan?', when: 'evidence-gap', reviewFactor: 'study-purpose-and-program-fit', officialRuleIds: ['DOS_ACADEMIC_PREPARATION'], evidenceKeywords: ['program', 'curriculum', 'course', 'faculty', 'professor', 'research', 'laboratory', 'lab', 'specialization', 'concentration'], riskKeywords: ['ranking', 'reputation', 'famous', 'prestige', 'good school', 'best school'] }],
  },
  {
    id: 'f1_04', number: 4, stage: 'BASIC_INFO', topic: 'major', selection: 'core', answerShape: 'open',
    text: "What's your major?",
    evaluationFocus: ['directness', 'consistency_with_background'],
    followUps: [{ id: 'f1_04_program_name', text: "What's the exact program name?", when: 'uncertain', reviewFactor: 'application-consistency', officialRuleIds: ['DOS_ACADEMIC_PREPARATION'] }],
  },
  {
    id: 'f1_05', number: 5, stage: 'ACADEMIC_PLAN', topic: 'major', selection: 'adaptive', answerShape: 'open',
    text: 'Why did you choose this major?',
    evaluationFocus: ['academic_motivation', 'background_fit', 'specificity'],
    followUps: [{ id: 'f1_05_background_fit', text: 'How does it relate to your past studies or work?', when: 'evidence-gap', reviewFactor: 'academic-preparation', officialRuleIds: ['DOS_ACADEMIC_PREPARATION'], evidenceKeywords: ['previous', 'undergraduate', 'degree', 'course', 'study', 'studies', 'work', 'job', 'research', 'experience', 'background', 'skill'] }],
  },
  {
    id: 'f1_06', number: 6, stage: 'ACADEMIC_PLAN', topic: 'study_purpose', selection: 'adaptive', answerShape: 'open',
    text: 'Why do you want to study in the United States?',
    evaluationFocus: ['academic_purpose', 'nonimmigrant_intent', 'specificity'],
    followUps: [{ id: 'f1_06_us_specific', text: "What's the main academic reason you want to study in the U.S.?", when: 'evidence-gap', reviewFactor: 'study-purpose-and-program-fit', officialRuleIds: ['DOS_ACADEMIC_PREPARATION', 'FAM_EDUCATION_HOME_COUNTRY_CALIBRATION'], evidenceKeywords: ['program', 'curriculum', 'course', 'faculty', 'professor', 'research', 'training', 'laboratory', 'lab', 'academic'] }],
  },
  {
    id: 'f1_07', number: 7, stage: 'ACADEMIC_PLAN', topic: 'program', selection: 'adaptive', answerShape: 'open',
    text: 'How long is your program?',
    evaluationFocus: ['program_knowledge', 'consistency_with_background'],
    followUps: [{ id: 'f1_07_i20_length', text: 'How long does your I-20 say the program is?', when: 'uncertain', reviewFactor: 'application-consistency', officialRuleIds: ['DOS_ACADEMIC_PREPARATION'] }],
  },
  {
    id: 'f1_08', number: 8, stage: 'CURRENT_STATUS', topic: 'current_status', selection: 'adaptive', answerShape: 'compound',
    text: 'Where are you studying or working now?',
    evaluationFocus: ['current_status', 'timeline_consistency'],
    followUps: [{ id: 'f1_08_gap_activity', text: 'What were you doing during that time?', when: 'keyword', reviewFactor: 'application-consistency', officialRuleIds: ['DOS_ACADEMIC_PREPARATION'], keywords: ['unemployed', 'nothing', 'gap', 'not working', 'not studying'] }],
  },
  {
    id: 'f1_09', number: 9, stage: 'CURRENT_STATUS', topic: 'personal', selection: 'adaptive', answerShape: 'open',
    text: 'Do you have any hobbies?',
    evaluationFocus: ['natural_delivery', 'directness'],
  },
  {
    id: 'f1_10', number: 10, stage: 'CURRENT_STATUS', topic: 'personal', selection: 'adaptive', answerShape: 'open',
    text: 'What do you do in your spare time?',
    evaluationFocus: ['natural_delivery', 'specificity'],
  },
  {
    id: 'f1_11', number: 11, stage: 'FUTURE_PLAN', topic: 'future_plan', selection: 'core', answerShape: 'compound',
    text: 'What are your plans after graduation?',
    evaluationFocus: ['career_plan', 'home_country_ties', 'internal_consistency'],
    followUps: [{ id: 'f1_11_return_plan', text: 'What do you plan to do after the program?', when: 'keyword', reviewFactor: 'departure-intent', officialRuleIds: ['DOS_DEPARTURE_INTENT', 'FAM_RESIDENCE_ABROAD', 'FAM_PRESENT_INTENT_CALIBRATION'], keywords: ['not sure', 'maybe', 'stay', 'depends', 'undecided', 'see what happens'] }],
  },
  {
    id: 'f1_12', number: 12, stage: 'FUNDING_CHECK', topic: 'funding', selection: 'core', answerShape: 'open',
    text: "Who's paying for your studies?",
    evaluationFocus: ['funding_source', 'financial_consistency'],
    followUps: [
      { id: 'f1_12_sponsor_identity', text: 'Who exactly is your sponsor?', when: 'keyword', reviewFactor: 'financial-capacity', officialRuleIds: ['DOS_FINANCIAL_CAPACITY'], keywords: ['they', 'someone', 'sponsor', 'family'] },
      { id: 'f1_12_sponsor_basis', text: 'Why are they paying for your studies?', when: 'keyword', reviewFactor: 'financial-capacity', officialRuleIds: ['DOS_FINANCIAL_CAPACITY'], keywords: ['relative', 'friend', 'uncle', 'aunt', 'company', 'employer'] },
    ],
  },
  {
    id: 'f1_13', number: 13, stage: 'FUNDING_CHECK', topic: 'funding', selection: 'adaptive', answerShape: 'open',
    text: 'About how much will your studies cost each year?',
    evaluationFocus: ['cost_awareness', 'financial_consistency'],
    followUps: [{ id: 'f1_13_annual_total', text: 'About how much are tuition and living costs for one year?', when: 'uncertain', reviewFactor: 'financial-capacity', officialRuleIds: ['DOS_FINANCIAL_CAPACITY'] }],
  },
  {
    id: 'f1_14', number: 14, stage: 'FUNDING_CHECK', topic: 'family_funding', selection: 'adaptive', answerShape: 'compound',
    text: 'What do your parents do, and about how much do they earn?',
    evaluationFocus: ['funding_plausibility', 'internal_consistency'],
    sensitive: true,
    privacyGuidance: 'Collect only occupations and an approximate income range; never request employer names, account numbers, or bank balances.',
  },
  {
    id: 'f1_15', number: 15, stage: 'FAMILY_AND_TIES', topic: 'family', selection: 'adaptive', answerShape: 'compound',
    text: 'Do you have any siblings? What do they do, and do they plan to study abroad?',
    evaluationFocus: ['family_context', 'home_country_ties', 'internal_consistency'],
  },
  {
    id: 'f1_16', number: 16, stage: 'FAMILY_AND_TIES', topic: 'us_relatives', selection: 'adaptive', answerShape: 'yes-no',
    text: 'Do you have any relatives in the United States? What is your relationship, which state do they live in, and what do they do?',
    evaluationFocus: ['ds160_consistency', 'relationship_context'],
    followUps: [{ id: 'f1_16_relative_details', text: 'Which relative? What state are they in, and what do they do?', when: 'affirmative', reviewFactor: 'application-consistency', officialRuleIds: ['FAM_RESIDENCE_ABROAD', 'FAM_PRESENT_INTENT_CALIBRATION'] }],
    sensitive: true,
    privacyGuidance: 'Do not ask for a relative’s name, exact address, phone number, email address, or immigration document number.',
  },
  {
    id: 'f1_17', number: 17, stage: 'TRAVEL_HISTORY', topic: 'travel_history', selection: 'adaptive', answerShape: 'compound',
    text: 'Have you traveled abroad before? Have you ever traveled to the United States?',
    evaluationFocus: ['travel_history', 'timeline_consistency', 'compliance_history'],
    followUps: [{ id: 'f1_17_us_trip', text: 'Why did you go to the U.S., and did you leave on time?', when: 'keyword', reviewFactor: 'eligibility-and-compliance', officialRuleIds: [], keywords: ['united states', 'usa', 'u.s.', 'america'] }],
  },
  {
    id: 'f1_18', number: 18, stage: 'SECURITY_AND_DS160', topic: 'us_contact', selection: 'adaptive', answerShape: 'open',
    text: 'What is your relationship to the U.S. point of contact listed on your DS-160, and what do they do?',
    evaluationFocus: ['ds160_consistency', 'relationship_context'],
    sensitive: true,
    privacyGuidance: 'Ask only for the relationship and general role; never request the contact’s name, address, phone number, or email address.',
  },
  {
    id: 'f1_19', number: 19, stage: 'SECURITY_AND_DS160', topic: 'mistreatment', selection: 'mandatory', answerShape: 'yes-no',
    text: 'Have you ever experienced harm or mistreatment in China?',
    evaluationFocus: ['directness', 'internal_consistency'],
    followUps: [{ id: 'f1_19_brief_details', text: 'Briefly, what happened? No names or exact locations.', when: 'affirmative', reviewFactor: 'eligibility-and-compliance', officialRuleIds: [] }],
    sensitive: true,
    privacyGuidance: 'Allow a brief category-level explanation only. Do not collect names, exact locations, organizations, dates of birth, or evidence files.',
  },
  {
    id: 'f1_20', number: 20, stage: 'SECURITY_AND_DS160', topic: 'return_fear', selection: 'mandatory', answerShape: 'yes-no',
    text: 'Do you fear harm or mistreatment if you return to China?',
    evaluationFocus: ['directness', 'internal_consistency_with_question_19'],
    followUps: [{ id: 'f1_20_return_concern', text: 'What makes you concerned about returning?', when: 'affirmative', reviewFactor: 'eligibility-and-compliance', officialRuleIds: [] }],
    sensitive: true,
    privacyGuidance: 'Accept a brief reason only and do not request identifying incident details or supporting documents.',
  },
  {
    id: 'f1_21', number: 21, stage: 'TRAVEL_HISTORY', topic: 'africa_travel', selection: 'mandatory', answerShape: 'yes-no',
    text: 'Have you ever traveled to Africa?',
    evaluationFocus: ['travel_history', 'timeline_consistency'],
    followUps: [{ id: 'f1_21_trip_details', text: 'Which country, when, and why?', when: 'affirmative', reviewFactor: 'eligibility-and-compliance', officialRuleIds: [] }],
  },
  {
    id: 'f1_22', number: 22, stage: 'SECURITY_AND_DS160', topic: 'safety_judgment', selection: 'high-frequency', answerShape: 'yes-no',
    text: 'Would you fear for your safety if there were riots in the United States?',
    evaluationFocus: ['directness', 'reasoning', 'natural_delivery'],
  },
]

export const F1_MANDATORY_QUESTION_IDS: readonly F1QuestionId[] = ['f1_19', 'f1_20', 'f1_21']

const questionMap = new Map(F1_QUESTION_CATALOG.map(question => [question.id, question]))

export function getF1Question(id: F1QuestionId): F1QuestionDefinition {
  const question = questionMap.get(id)
  if (!question) throw new Error(`Unknown F1 question: ${id}`)
  return question
}
