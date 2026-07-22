export const B2_OFFICIAL_CRITERIA_VERSION = '2026-07-22'

export const B2_OFFICIAL_CRITERIA = [
  {
    id: 'DOS_DS160_ACCURACY',
    authority: 'U.S. Department of State',
    title: 'DS-160: Frequently Asked Questions',
    url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/forms/ds-160-online-nonimmigrant-visa-application/ds-160-faqs.html',
    rule: 'The applicant is responsible for ensuring that DS-160 answers are accurate and complete and certifies that the answers are true and correct.',
    coachingBoundary: 'Check completeness and consistency only. Never recommend hiding, changing, or inventing a material fact.',
  },
  {
    id: 'FAM_B2_RESIDENCE_ABROAD',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.2-2(B) Temporary Visitors',
    url: 'https://fam.state.gov/fam/09fam/09fam040202.html',
    rule: 'A temporary visitor must have a residence abroad they do not intend to abandon.',
    coachingBoundary: 'Assess the complete record. Do not treat property ownership or any single family relationship as mandatory proof.',
  },
  {
    id: 'FAM_B2_LIMITED_DURATION',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.2-2(B) and 402.2-2(D) Temporary Period of Stay',
    url: 'https://fam.state.gov/fam/09fam/09fam040202.html',
    rule: 'The intended visit must have a specifically limited duration, and the projected stay should be consistent with the stated purpose.',
    coachingBoundary: 'Identify missing or inconsistent time facts. Do not claim that a particular trip length automatically qualifies or disqualifies an applicant.',
  },
  {
    id: 'FAM_B2_LEGITIMATE_PURPOSE',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.2-2(B) Temporary Visitors',
    url: 'https://fam.state.gov/fam/09fam/09fam040202.html',
    rule: 'The visit must be for legitimate activities relating to business or pleasure; tourism and social visits to relatives or friends are recognized B-2 purposes.',
    coachingBoundary: 'Check whether the stated purpose and planned activities are coherent. Do not invent an itinerary or encourage a different purpose.',
  },
  {
    id: 'FAM_B2_REALISTIC_PLAN',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.2-2(D) Temporary Period of Stay',
    url: 'https://fam.state.gov/fam/09fam/09fam040202.html',
    rule: 'The applicant should have specific and realistic plans for the contemplated visit and reasonable certainty of departure after the temporary visit.',
    coachingBoundary: 'Assess only the plan actually provided. Missing detail is an evidence gap, not proof of an improper purpose.',
  },
  {
    id: 'FAM_B2_EXPENSES',
    authority: 'U.S. Department of State Foreign Affairs Manual',
    title: '9 FAM 402.2-2(E) Expenses During Visit',
    url: 'https://fam.state.gov/fam/09fam/09fam040202.html',
    rule: 'Arrangements for the expenses of the visit and return abroad should be adequate and consistent with a lawful temporary visit.',
    coachingBoundary: 'Compare only the disclosed payer, budget, income range, and trip facts. Never request account numbers or claim to verify funds.',
  },
]

export const B2_OFFICIAL_RULE_IDS = new Set(B2_OFFICIAL_CRITERIA.map(rule => rule.id))
