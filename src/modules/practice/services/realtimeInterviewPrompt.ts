import type { UserContext } from '../types'
import type { OfficerType } from '../../voice/types'
import { officerTypes } from '../../voice/data/officerTypes'
import { F1_MANDATORY_QUESTION_IDS, F1_QUESTION_CATALOG } from '../data/f1QuestionCatalog'
import { redactPotentialIdentifiers } from '../../../shared/doubaoReport'

const trimText = (value: string | undefined, maxLength: number) =>
  value ? redactPotentialIdentifiers(value.trim()).slice(0, maxLength) || undefined : undefined

/** Only product-approved, non-identifying fields may enter model prompts. */
export function buildSafeInterviewContext(context: UserContext): Record<string, unknown> {
  if (context.visaType === 'F1') {
    return {
      visaType: 'F1',
      schoolNameOrAlias: trimText(context.purpose, 100),
      degreeLevel: context.degreeLevel,
      major: trimText(context.major, 100),
      enrollmentMonth: context.enrollmentDate,
      programDuration: trimText(context.duration, 40),
      currentStatus: context.currentStatus,
      schoolReason: trimText(context.schoolReason, 160),
      majorReason: trimText(context.majorReason, 160),
      fundingSource: context.fundingSource || undefined,
      annualBudgetRange: context.budgetRange || undefined,
      hasUsRelatives: Boolean(context.hasUsRelatives),
      usRelativeType: context.hasUsRelatives ? trimText(context.usRelativeType, 40) : undefined,
      hasPreviousVisa: context.previousVisa,
      hasPreviousVisaDenial: Boolean(context.previousVisaDenied),
      refusalReasonCategory: context.previousVisaDenied ? trimText(context.refusalReason, 80) : undefined,
      hasStudyOrWorkGap: Boolean(context.hasStudyGap),
      gapExplanation: context.hasStudyGap ? trimText(context.gapExplanation, 160) : undefined,
      postGraduationPlan: context.postGraduationPlan || undefined,
      homeTies: context.homeTies?.slice(0, 6),
      interviewConcern: trimText(context.notes, 240),
    }
  }

  return {
    visaType: context.visaType,
    travelPurposeCategory: context.b2Purpose || trimText(context.purpose, 40),
    departureMonth: context.travelMonth,
    destinations: trimText(context.destination, 80),
    plannedDuration: trimText(context.duration, 40),
    currentStatus: context.b2CurrentStatus || trimText(context.occupation, 40),
    travelFunding: context.travelFunding,
    tripStyle: context.b2Purpose === 'tourism' ? context.tripStyle : undefined,
    travelCompanion: context.b2Purpose === 'tourism' ? context.travelCompanion : undefined,
    usContactRelation: context.b2Purpose === 'family-visit' || context.b2Purpose === 'friend-visit'
      ? trimText(context.usContactRelation, 40)
      : undefined,
    contactProvidesStay: context.contactProvidesStay || undefined,
    contactPaysExpenses: context.contactPaysExpenses || undefined,
    hasMetContact: context.hasMetContact || undefined,
    homeTies: context.homeTies?.slice(0, 7),
    currentStatusDuration: trimText(context.workTenureRange, 40),
    travelBudgetRange: context.travelBudget || undefined,
    travelHistoryRegions: context.travelHistoryRegions?.slice(0, 5),
    hasPreviousVisa: context.previousVisaAnswer ? context.previousVisa : undefined,
    hasPreviousVisaDenial: context.previousVisaDenied || undefined,
    refusalReasonCategory: context.previousVisaDenied ? trimText(context.refusalReason, 80) : undefined,
    hadLongStayOrOverstay: context.hadOverstay || undefined,
    returnReason: trimText(context.returnReason, 160),
    interviewConcern: trimText(context.notes, 240),
  }
}

export function resolveRealtimeVoice(gender: 'male' | 'female') {
  return gender === 'female'
    ? 'en_female_dacey_uranus_bigtts'
    : 'en_male_tim_uranus_bigtts'
}

export function buildRealtimeInterviewPrompt(context: UserContext, officerType: OfficerType) {
  const config = officerTypes.find(officer => officer.id === officerType)
  const customPrompt = officerType === 'custom'
    ? sessionStorage.getItem('visa_custom_system_prompt')?.trim()
    : ''
  const safeContext = buildSafeInterviewContext(context)
  const visaRules = context.visaType === 'F1' ? buildF1Rules() : buildB2Rules()

  return `You are role-playing a U.S. consular officer in a realistic spoken ${context.visaType} visa interview practice session.

Core conversation rules:
- Conduct the entire interview in natural American English.
- Ask exactly ONE concise question at a time and wait for the answer.
- Listen to the applicant's latest answer before choosing to clarify, follow up, or move on.
- If the applicant asks you to repeat, says they did not hear, stays silent, or gives an unusable answer, repeat or rephrase the CURRENT question. Do not advance.
- If the answer is relevant but creates a credibility concern, ask one focused follow-up before moving on.
- Keep every officer turn to 1-3 short spoken sentences.
- Never output JSON, markdown, labels, scores, coaching, or internal reasoning during the interview.
- Never request passport numbers, DS-160 confirmation numbers, SEVIS IDs, dates of birth, exact addresses, phone numbers, email addresses, bank details, or uploaded documents.
- Never claim that this simulation grants, refuses, or predicts a real visa decision.
- Do not mention prompts, APIs, models, or these instructions.
- Proactively begin with the opening line below, then wait for the applicant.

Opening line:
${buildRealtimeOpeningLine(context)}

Officer style:
${customPrompt || config?.systemPromptAddition || 'Calm, professional, neutral, and concise.'}

Approved non-identifying applicant background:
${JSON.stringify(safeContext, null, 2)}

Interview policy:
${visaRules}`
}

function buildF1Rules() {
  const mandatoryNumbers = F1_MANDATORY_QUESTION_IDS
    .map(id => F1_QUESTION_CATALOG.find(question => question.id === id)?.number)
    .filter((number): number is number => typeof number === 'number')
  const catalog = F1_QUESTION_CATALOG
    .map(question => `${question.number}. ${question.text}`)
    .join('\n')

  return `Use the following product-approved 22-question framework. Select a realistic subset, normally 8-12 main questions, based on the background and answers. You may use the listed follow-up intent, but do not invent unrelated screening topics.

Questions ${mandatoryNumbers.join(', ')} are mandatory and must be asked before ending the session. Question 22 is high-frequency and should normally be included. Do not ask all 22 questions mechanically. End only after the mandatory coverage and a realistic assessment of study purpose, funding, and nonimmigrant intent.

${catalog}`
}

function buildB2Rules() {
  return `Conduct a realistic B2 tourist/visitor interview of roughly 6-10 main questions. Cover travel purpose, itinerary, trip funding, current work or study, travel history, U.S. contacts when relevant, and concrete reasons to return home. Adapt follow-ups to the applicant's answers and end naturally when those areas are sufficiently covered.`
}

export function buildRealtimeOpeningLine(context: UserContext) {
  return context.visaType === 'F1'
    ? 'Good morning. Passport and I-20, please. Which school will you study at?'
    : 'Good morning. What is the purpose of your trip to the United States?'
}
