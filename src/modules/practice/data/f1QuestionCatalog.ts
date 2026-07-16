import type { InterviewStage } from '../types.ts'

export type F1QuestionId =
  | 'f1_01' | 'f1_02' | 'f1_03' | 'f1_04' | 'f1_05' | 'f1_06'
  | 'f1_07' | 'f1_08' | 'f1_09' | 'f1_10' | 'f1_11' | 'f1_12'
  | 'f1_13' | 'f1_14' | 'f1_15' | 'f1_16' | 'f1_17' | 'f1_18'
  | 'f1_19' | 'f1_20' | 'f1_21' | 'f1_22'

export type F1SelectionPolicy = 'core' | 'adaptive' | 'mandatory' | 'high-frequency'
export type F1AnswerShape = 'open' | 'yes-no' | 'compound'

export interface F1QuestionDefinition {
  id: F1QuestionId
  number: number
  stage: InterviewStage
  topic: string
  text: string
  selection: F1SelectionPolicy
  answerShape: F1AnswerShape
  evaluationFocus: string[]
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
    text: 'Which school will you study at?',
    evaluationFocus: ['directness', 'consistency_with_background'],
  },
  {
    id: 'f1_02', number: 2, stage: 'SCHOOL_AND_MAJOR', topic: 'school', selection: 'adaptive', answerShape: 'open',
    text: 'How did you learn about this school?',
    evaluationFocus: ['specificity', 'independent_research'],
  },
  {
    id: 'f1_03', number: 3, stage: 'SCHOOL_AND_MAJOR', topic: 'school', selection: 'adaptive', answerShape: 'open',
    text: 'Why did you choose this school?',
    evaluationFocus: ['school_knowledge', 'program_fit', 'specificity'],
  },
  {
    id: 'f1_04', number: 4, stage: 'BASIC_INFO', topic: 'major', selection: 'core', answerShape: 'open',
    text: 'What is your major?',
    evaluationFocus: ['directness', 'consistency_with_background'],
  },
  {
    id: 'f1_05', number: 5, stage: 'ACADEMIC_PLAN', topic: 'major', selection: 'adaptive', answerShape: 'open',
    text: 'Why did you choose this major?',
    evaluationFocus: ['academic_motivation', 'background_fit', 'specificity'],
  },
  {
    id: 'f1_06', number: 6, stage: 'ACADEMIC_PLAN', topic: 'study_purpose', selection: 'adaptive', answerShape: 'open',
    text: 'Why do you want to study in the United States?',
    evaluationFocus: ['academic_purpose', 'nonimmigrant_intent', 'specificity'],
  },
  {
    id: 'f1_07', number: 7, stage: 'ACADEMIC_PLAN', topic: 'program', selection: 'adaptive', answerShape: 'open',
    text: 'How long will you study in the United States?',
    evaluationFocus: ['program_knowledge', 'consistency_with_background'],
  },
  {
    id: 'f1_08', number: 8, stage: 'CURRENT_STATUS', topic: 'current_status', selection: 'adaptive', answerShape: 'compound',
    text: 'Where are you studying or working now?',
    evaluationFocus: ['current_status', 'timeline_consistency'],
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
    text: 'What is your future plan? What will you do after graduation?',
    evaluationFocus: ['career_plan', 'home_country_ties', 'internal_consistency'],
  },
  {
    id: 'f1_12', number: 12, stage: 'FUNDING_CHECK', topic: 'funding', selection: 'core', answerShape: 'open',
    text: 'Who will support your studies?',
    evaluationFocus: ['funding_source', 'financial_consistency'],
  },
  {
    id: 'f1_13', number: 13, stage: 'FUNDING_CHECK', topic: 'funding', selection: 'adaptive', answerShape: 'open',
    text: 'How much money will you spend on your studies?',
    evaluationFocus: ['cost_awareness', 'financial_consistency'],
  },
  {
    id: 'f1_14', number: 14, stage: 'FUNDING_CHECK', topic: 'family_funding', selection: 'adaptive', answerShape: 'compound',
    text: 'What do your parents do, and approximately how much do they earn?',
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
    text: 'Do you have any relatives in the United States?',
    evaluationFocus: ['ds160_consistency', 'relationship_context'],
    sensitive: true,
    privacyGuidance: 'Do not ask for a relative’s name, exact address, phone number, email address, or immigration document number.',
  },
  {
    id: 'f1_17', number: 17, stage: 'TRAVEL_HISTORY', topic: 'travel_history', selection: 'adaptive', answerShape: 'compound',
    text: 'Have you traveled abroad before? Have you ever traveled to the United States?',
    evaluationFocus: ['travel_history', 'timeline_consistency', 'compliance_history'],
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
    sensitive: true,
    privacyGuidance: 'Allow a brief category-level explanation only. Do not collect names, exact locations, organizations, dates of birth, or evidence files.',
  },
  {
    id: 'f1_20', number: 20, stage: 'SECURITY_AND_DS160', topic: 'return_fear', selection: 'mandatory', answerShape: 'yes-no',
    text: 'Do you fear harm or mistreatment if you return to China?',
    evaluationFocus: ['directness', 'internal_consistency_with_question_19'],
    sensitive: true,
    privacyGuidance: 'Accept a brief reason only and do not request identifying incident details or supporting documents.',
  },
  {
    id: 'f1_21', number: 21, stage: 'TRAVEL_HISTORY', topic: 'africa_travel', selection: 'mandatory', answerShape: 'yes-no',
    text: 'Have you ever traveled to Africa?',
    evaluationFocus: ['travel_history', 'timeline_consistency'],
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
