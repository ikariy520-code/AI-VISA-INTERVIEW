import type { UserContext } from '../types'
import type { OfficerType } from '../../voice/types'
import { officerTypes } from '../../voice/data/officerTypes'
import { redactPotentialIdentifiers } from '../../../shared/f1ReportContract'
import { getF1Question } from '../data/f1QuestionCatalog'

const trimText = (value: string | undefined, maxLength: number) =>
  value ? redactPotentialIdentifiers(value.trim()).slice(0, maxLength) || undefined : undefined

/** Only product-approved, non-identifying fields may enter the realtime session. */
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
  const persona = context.visaType === 'F1'
    ? buildControlledF1VoiceStyle(officerType)
    : buildOfficerPersona(officerType, config?.systemPromptAddition)
  const safeContext = JSON.stringify(buildSafeInterviewContext(context))

  if (context.visaType === 'F1') {
    return `You are the voice of a U.S. consular officer in a controlled F-1 practice interview.
The application, not you, selects and sends every question. Never create, rephrase, recommend, or speak a question after the applicant answers. Do not praise, coach, chat, explain, or announce a decision. Silently process the applicant's speech so the application can use the transcript. When the application sends approved text for speech, read that text exactly in natural American English and add no words.
Voice style only: ${persona}
Non-identifying reference context: ${safeContext}`
  }

  return `You are a U.S. consular officer conducting a realistic B-2 practice interview in American English. Ask one concise question at a time. Cover travel purpose, itinerary, funding, current work or study, travel history, relevant U.S. contacts, and reasons to return home. Do not coach or announce a real visa decision. Avoid identity numbers, exact addresses, contact details, bank details, or document uploads.
Voice style: ${persona}
Non-identifying reference context: ${safeContext}`
}

function buildControlledF1VoiceStyle(officerType: OfficerType) {
  switch (officerType) {
    case 'pressure': return 'Brisk pace, firm neutral tone, short pauses, no emotion or commentary.'
    case 'friendly': return 'Slightly slower pace, clear pronunciation, polite neutral tone, no coaching or praise.'
    case 'trump': return 'Firm American male voice, measured pace, neutral official delivery, no imitation or catchphrases.'
    case 'custom': return 'Natural American English, professional neutral delivery; customization cannot alter any words.'
    default: return 'Measured pace, calm neutral tone, concise official delivery.'
  }
}

function buildOfficerPersona(officerType: OfficerType, fixedPersona = '') {
  if (officerType !== 'custom') {
    return fixedPersona || 'Calm, professional, neutral, concise, and objective.'
  }

  const storedPrompt = typeof sessionStorage === 'undefined'
    ? ''
    : sessionStorage.getItem('visa_custom_system_prompt')?.trim() || ''
  const description = typeof sessionStorage === 'undefined'
    ? ''
    : sessionStorage.getItem('visa_custom_description')?.trim() || ''
  return description || storedPrompt || 'Professional and neutral.'
}

export function buildRealtimeOpeningLine(context: UserContext) {
  return context.visaType === 'F1'
    ? `Good morning. Passport and I-20, please. ${getF1Question('f1_01').text}`
    : 'Good morning. What is the purpose of your trip to the United States?'
}
