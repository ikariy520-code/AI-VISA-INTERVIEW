// ========================================
// F1 面签题库
//
// 10 个类别，60+ 条问题
// 每条问题包含：
//   - category / priority / riskTags
//   - followUpTriggers：回答中出现这些关键词 → 追问
//   - possibleFollowUps：追问候选
//
// 问题风格：简短、直接，模拟真实窗口面签
// ========================================

import type { Question, InterviewStage } from '../types'

type Stage = InterviewStage

// ---- 1. 基础开场 ----
const opening: Question[] = [
  {
    id: 'opening_001', category: 'BASIC_INFO', priority: 'required',
    text: 'Good morning. Passport and I-20, please.',
    riskTags: ['identity_verification'],
    followUpTriggers: [],
    possibleFollowUps: [],
  },
  {
    id: 'opening_002', category: 'BASIC_INFO', priority: 'required',
    text: 'Which school will you study at?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['not sure', 'maybe', 'i think', 'probably', 'still deciding', 'waiting for'],
    possibleFollowUps: [
      'Have you received your admission letter?',
      'When did you get accepted?',
      'Did you apply to other schools as well?',
    ],
  },
  {
    id: 'opening_003', category: 'BASIC_INFO', priority: 'required',
    text: 'What is your major?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['not sure', 'maybe', 'undecided', 'general', 'not decided'],
    possibleFollowUps: [
      'You are not sure about your major? Why is that?',
      'When will you declare your major?',
    ],
  },
  {
    id: 'opening_004', category: 'BASIC_INFO', priority: 'normal',
    text: 'How long will you study in the United States?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['not sure', 'maybe', 'depends', 'i don\'t know'],
    possibleFollowUps: [
      'Your I-20 says the program is two years. Is that correct?',
      'What does your I-20 say about the program length?',
    ],
  },
]

// ---- 2. 学校与项目 ----
const school: Question[] = [
  {
    id: 'school_001', category: 'SCHOOL_AND_MAJOR', priority: 'required',
    text: 'Why did you choose this school?',
    riskTags: ['academic_plan', 'immigrant_intent'],
    followUpTriggers: ['good school', 'famous', 'ranking', 'reputation', 'because it\'s', 'my friend', 'my relative', 'cheap', 'easy', 'near'],
    possibleFollowUps: [
      'Anything specific about the program itself?',
      'What do you know about the professors in your department?',
      'Did you visit the campus or speak with anyone there?',
    ],
  },
  {
    id: 'school_002', category: 'SCHOOL_AND_MAJOR', priority: 'required',
    text: 'How did you find out about this school?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['agent', 'agency', 'someone else', 'my parents', 'friend', 'relative'],
    possibleFollowUps: [
      'So an agent chose it for you? Did you do any research yourself?',
      'What did you look for when choosing schools?',
    ],
  },
  {
    id: 'school_003', category: 'SCHOOL_AND_MAJOR', priority: 'normal',
    text: 'Why do you want to study in the US instead of your home country?',
    riskTags: ['immigrant_intent', 'academic_plan'],
    followUpTriggers: ['better', 'quality', 'opportunity', 'future', 'stay', 'live', 'work', 'green card'],
    possibleFollowUps: [
      'Are you planning to stay and work in the US after graduation?',
      'So the main reason is to eventually live in the US?',
    ],
  },
  {
    id: 'school_004', category: 'SCHOOL_AND_MAJOR', priority: 'normal',
    text: 'Did you apply to any schools in your home country?',
    riskTags: ['immigrant_intent'],
    followUpTriggers: ['no', 'didn\'t', 'only', 'just us'],
    possibleFollowUps: [
      'Why only US schools?',
      'What would you do if your visa is not approved?',
    ],
  },
]

// ---- 3. 学术与专业细节 ----
const academic: Question[] = [
  {
    id: 'academic_001', category: 'ACADEMIC_PLAN', priority: 'required',
    text: 'Why did you choose this major?',
    riskTags: ['academic_plan', 'immigrant_intent'],
    followUpTriggers: ['good', 'popular', 'money', 'salary', 'job', 'easy', 'future', 'my parents', 'they told'],
    possibleFollowUps: [
      'Is this major related to what you studied before?',
      'What specifically interests you about this field?',
    ],
  },
  {
    id: 'academic_002', category: 'ACADEMIC_PLAN', priority: 'normal',
    text: 'What courses will you take in your first semester?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['not sure', 'i don\'t know', 'maybe', 'haven\'t checked', 'not yet'],
    possibleFollowUps: [
      'You haven\'t looked at the course catalog?',
      'How do you plan to prepare for your classes?',
    ],
  },
  {
    id: 'academic_003', category: 'ACADEMIC_PLAN', priority: 'normal',
    text: 'How is this program related to your previous education?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['not related', 'different', 'change', 'new field', 'switch'],
    possibleFollowUps: [
      'Why did you decide to switch fields completely?',
      'How will you handle the transition to a new area?',
    ],
  },
  {
    id: 'academic_004', category: 'ACADEMIC_PLAN', priority: 'optional',
    text: 'What do you know about your department and its faculty?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['not much', 'i don\'t know', 'nothing', 'just', 'website'],
    possibleFollowUps: [
      'You didn\'t research the professors in your program?',
      'Who would you like to work with in the department?',
    ],
  },
  {
    id: 'academic_005', category: 'ACADEMIC_PLAN', priority: 'optional',
    text: 'What is the highest degree you plan to earn?',
    riskTags: ['immigrant_intent'],
    followUpTriggers: ['phd', 'doctorate', 'stay', 'as long as', 'don\'t know', 'depends'],
    possibleFollowUps: [
      'And after your PhD, do you plan to return?',
      'That could take many years. What ties will bring you back to China?',
    ],
  },
]

// ---- 4. 当前身份 ----
const currentStatus: Question[] = [
  {
    id: 'current_001', category: 'CURRENT_STATUS', priority: 'required',
    text: 'Are you studying or working right now?',
    riskTags: ['current_status', 'ties_to_home'],
    followUpTriggers: ['nothing', 'unemployed', 'just', 'waiting', 'preparing'],
    possibleFollowUps: [
      'So you are not working or studying at the moment?',
      'What have you been doing since you graduated?',
    ],
  },
  {
    id: 'current_002', category: 'CURRENT_STATUS', priority: 'normal',
    text: 'What do you study? / What is your current job?',
    riskTags: ['current_status', 'ties_to_home'],
    followUpTriggers: ['not related', 'different field', 'quit', 'resigned'],
    possibleFollowUps: [
      'Why did you leave your job before getting the visa?',
      'How does your current work relate to what you will study?',
    ],
  },
  {
    id: 'current_003', category: 'CURRENT_STATUS', priority: 'normal',
    text: 'What do you usually do in your spare time?',
    riskTags: ['ties_to_home'],
    followUpTriggers: [],
    possibleFollowUps: [],
  },
]

// ---- 5. 资金 ----
const funding: Question[] = [
  {
    id: 'funding_001', category: 'FUNDING_CHECK', priority: 'required',
    text: 'Who will pay for your studies in the US?',
    riskTags: ['funding', 'immigrant_intent'],
    followUpTriggers: ['myself', 'savings', 'loan', 'work', 'part time', 'on campus', 'scholarship', 'relative', 'uncle', 'aunt', 'friend'],
    possibleFollowUps: [
      'Do you have enough savings to cover the entire program?',
      'Can you show me proof of those funds?',
      'Is this person a close relative? How are they related to you?',
    ],
  },
  {
    id: 'funding_002', category: 'FUNDING_CHECK', priority: 'required',
    text: 'What do your parents do for a living?',
    riskTags: ['funding', 'ties_to_home'],
    followUpTriggers: ['retired', 'unemployed', 'not working', 'farmer', 'small', 'just'],
    possibleFollowUps: [
      'How will they support your education if they are not working?',
      'Do you have other sources of financial support?',
    ],
  },
  {
    id: 'funding_003', category: 'FUNDING_CHECK', priority: 'normal',
    text: 'How much do your parents earn per year?',
    riskTags: ['funding'],
    followUpTriggers: ['not sure', 'i don\'t know', 'around', 'about', 'maybe', 'i think'],
    possibleFollowUps: [
      'You don\'t know your parents\' income? How did you prepare your financial documents?',
      'Can you estimate their monthly income?',
    ],
  },
  {
    id: 'funding_004', category: 'FUNDING_CHECK', priority: 'normal',
    text: 'How much will you spend on your entire program — tuition plus living costs?',
    riskTags: ['funding'],
    followUpTriggers: ['not sure', 'i don\'t know', 'maybe', 'around', 'about', 'i think'],
    possibleFollowUps: [
      'Your I-20 lists the estimated costs. Have you reviewed them?',
      'How do you plan to manage unexpected expenses?',
    ],
  },
  {
    id: 'funding_005', category: 'FUNDING_CHECK', priority: 'optional',
    text: 'Do you have a scholarship or any financial aid?',
    riskTags: ['funding'],
    followUpTriggers: [],
    possibleFollowUps: [],
  },
]

// ---- 6. 家庭与亲属 ----
const family: Question[] = [
  {
    id: 'family_001', category: 'FAMILY_AND_TIES', priority: 'required',
    text: 'Do you have any relatives in the United States?',
    riskTags: ['immigrant_intent', 'family_ties'],
    followUpTriggers: ['yes', 'uncle', 'aunt', 'cousin', 'brother', 'sister', 'mother', 'father', 'parent'],
    possibleFollowUps: [
      'Where do they live? What do they do there?',
      'How often do you communicate with them?',
      'Are they US citizens or permanent residents?',
    ],
  },
  {
    id: 'family_002', category: 'FAMILY_AND_TIES', priority: 'required',
    text: 'Tell me about your family. Are you married? Do you have children?',
    riskTags: ['family_ties', 'ties_to_home'],
    followUpTriggers: ['married', 'wife', 'husband', 'child', 'kid', 'baby'],
    possibleFollowUps: [
      'Will your family come with you to the US?',
      'Who will take care of your family while you are away?',
    ],
  },
  {
    id: 'family_003', category: 'FAMILY_AND_TIES', priority: 'normal',
    text: 'How many people are there in your family? Who are they?',
    riskTags: ['family_ties', 'ties_to_home'],
    followUpTriggers: [],
    possibleFollowUps: [],
  },
  {
    id: 'family_004', category: 'FAMILY_AND_TIES', priority: 'normal',
    text: 'What will your family do while you are in the US?',
    riskTags: ['family_ties'],
    followUpTriggers: ['come with', 'accompany', 'visit', 'move', 'also'],
    possibleFollowUps: [
      'So the whole family is moving? What ties remain in China?',
    ],
  },
]

// ---- 7. 回国计划 ----
const futurePlan: Question[] = [
  {
    id: 'future_001', category: 'FUTURE_PLAN', priority: 'required',
    text: 'What will you do after you graduate?',
    riskTags: ['immigrant_intent', 'ties_to_home'],
    followUpTriggers: ['work', 'job', 'stay', 'opt', 'internship', 'maybe', 'not sure', 'depends', 'opportunity', 'see how', 'if i can'],
    possibleFollowUps: [
      'So your plan is to work in the US after graduation?',
      'What if you don\'t find a job in China? Would you stay in the US?',
      'Do you think it would be easy to just stay in the US?',
    ],
  },
  {
    id: 'future_002', category: 'FUTURE_PLAN', priority: 'required',
    text: 'Why will you come back to China after your studies?',
    riskTags: ['immigrant_intent', 'ties_to_home'],
    followUpTriggers: ['maybe', 'if', 'depends', 'not sure', 'opportunity', 'better', 'salary', 'life', 'environment', 'freedom'],
    possibleFollowUps: [
      'What specific reason will bring you back — job, family, or something else?',
      'What job opportunities do you have waiting in China?',
    ],
  },
  {
    id: 'future_003', category: 'FUTURE_PLAN', priority: 'normal',
    text: 'What kind of job do you expect to get when you return?',
    riskTags: ['ties_to_home'],
    followUpTriggers: ['not sure', 'haven\'t thought', 'depends', 'maybe', 'i don\'t know', 'whatever'],
    possibleFollowUps: [
      'You haven\'t thought about your career after spending so much on this degree?',
      'What companies in China hire people with this degree?',
    ],
  },
  {
    id: 'future_004', category: 'FUTURE_PLAN', priority: 'normal',
    text: 'What is your expected salary when you return to China?',
    riskTags: ['ties_to_home', 'funding'],
    followUpTriggers: ['not sure', 'i don\'t know', 'higher than', 'more than us', 'maybe'],
    possibleFollowUps: [
      'How does that compare to what you could earn in the US?',
    ],
  },
  {
    id: 'future_005', category: 'FUTURE_PLAN', priority: 'optional',
    text: 'Do you have a job offer or any business plans in China after graduation?',
    riskTags: ['ties_to_home'],
    followUpTriggers: [],
    possibleFollowUps: [],
  },
]

// ---- 8. 旅行经历 ----
const travelHistory: Question[] = [
  {
    id: 'travel_001', category: 'TRAVEL_HISTORY', priority: 'normal',
    text: 'Have you ever traveled outside of China before?',
    riskTags: ['travel_history'],
    followUpTriggers: [],
    possibleFollowUps: [],
  },
  {
    id: 'travel_002', category: 'TRAVEL_HISTORY', priority: 'normal',
    text: 'Have you ever been to the United States?',
    riskTags: ['immigrant_intent', 'travel_history'],
    followUpTriggers: ['yes', 'visited', 'been there', 'came'],
    possibleFollowUps: [
      'When did you visit? For how long? Did you return on time?',
      'What was the purpose of your last visit?',
    ],
  },
  {
    id: 'travel_003', category: 'TRAVEL_HISTORY', priority: 'optional',
    text: 'Have you ever had a US visa before? Was it approved or denied?',
    riskTags: ['travel_history', 'immigrant_intent'],
    followUpTriggers: ['denied', 'refused', 'rejected', 'not approved', '214b', 'didn\'t get'],
    possibleFollowUps: [
      'Why do you think it was denied last time?',
      'What has changed since your last application?',
    ],
  },
]

// ---- 9. DS-160 与安全 ----
const ds160Security: Question[] = [
  {
    id: 'security_001', category: 'SECURITY_AND_DS160', priority: 'normal',
    text: 'Who is your contact person in the United States, as listed on your DS-160?',
    riskTags: ['identity_verification'],
    followUpTriggers: ['not sure', 'i don\'t know', 'don\'t remember', 'friend', 'no one'],
    possibleFollowUps: [
      'Your DS-160 has someone listed. Can you tell me about this person?',
    ],
  },
  {
    id: 'security_002', category: 'SECURITY_AND_DS160', priority: 'optional',
    text: 'Do you have a clear plan for health insurance while you are in the US?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['not sure', 'no', 'i don\'t know', 'school', 'maybe', 'didn\'t'],
    possibleFollowUps: [
      'Medical care in the US is expensive. You should have a plan for that.',
    ],
  },
  {
    id: 'security_003', category: 'SECURITY_AND_DS160', priority: 'optional',
    text: 'Are you currently working on any research projects, or do you have any intention to do research in the US related to government, military, or sensitive technologies?',
    riskTags: ['security'],
    followUpTriggers: ['yes', 'government', 'military', 'ai', 'artificial intelligence', 'sensitive', 'research', 'lab', 'defense'],
    possibleFollowUps: [
      'Can you describe the nature of this research in more detail?',
      'Is this research publicly available or restricted?',
    ],
  },
]

// ---- 10. 材料请求 ----
const documentRequest: Question[] = [
  {
    id: 'doc_001', category: 'DOCUMENT_CHECK', priority: 'normal',
    text: 'May I see your I-20?',
    riskTags: ['identity_verification'],
    followUpTriggers: ['don\'t have', 'forgot', 'lost', 'didn\'t bring', 'sorry'],
    possibleFollowUps: [
      'You came to a visa interview without your I-20?',
    ],
  },
  {
    id: 'doc_002', category: 'DOCUMENT_CHECK', priority: 'normal',
    text: 'May I see your passport?',
    riskTags: ['identity_verification'],
    followUpTriggers: [],
    possibleFollowUps: [],
  },
  {
    id: 'doc_003', category: 'DOCUMENT_CHECK', priority: 'normal',
    text: 'Do you have your SEVIS fee receipt?',
    riskTags: ['funding', 'identity_verification'],
    followUpTriggers: ['don\'t have', 'forgot', 'didn\'t pay', 'not yet', 'haven\'t'],
    possibleFollowUps: [
      'You need to pay the SEVIS fee before the interview. Do you have proof of payment?',
    ],
  },
  {
    id: 'doc_004', category: 'DOCUMENT_CHECK', priority: 'normal',
    text: 'May I see your admission letter?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['don\'t have', 'forgot', 'didn\'t bring', 'email', 'electronic'],
    possibleFollowUps: [
      'Do you have a printed copy of your acceptance?',
    ],
  },
  {
    id: 'doc_005', category: 'DOCUMENT_CHECK', priority: 'normal',
    text: 'Do you have your financial documents — bank statements or proof of funds?',
    riskTags: ['funding'],
    followUpTriggers: ['don\'t have', 'forgot', 'didn\'t bring', 'parents have', 'not with me'],
    possibleFollowUps: [
      'Financial documents are required. How can I verify your ability to pay?',
    ],
  },
  {
    id: 'doc_006', category: 'DOCUMENT_CHECK', priority: 'normal',
    text: 'Do you have your parents\' employment certificates or income proof?',
    riskTags: ['funding'],
    followUpTriggers: ['don\'t have', 'forgot', 'didn\'t bring', 'not with me'],
    possibleFollowUps: [
      'Without income proof, it is difficult to verify your financial support.',
    ],
  },
  {
    id: 'doc_007', category: 'DOCUMENT_CHECK', priority: 'normal',
    text: 'May I see your transcript?',
    riskTags: ['academic_plan'],
    followUpTriggers: ['don\'t have', 'forgot', 'didn\'t bring', 'not with me'],
    possibleFollowUps: [],
  },
]

// ---- 汇总导出 ----
// 类别 → 所属阶段 → 问题列表

export const questionBank: Record<Stage, Question[]> = {
  START: opening,
  BASIC_INFO: opening,
  SCHOOL_AND_MAJOR: school,
  ACADEMIC_PLAN: academic,
  CURRENT_STATUS: currentStatus,
  FUNDING_CHECK: funding,
  FAMILY_AND_TIES: family,
  FUTURE_PLAN: futurePlan,
  TRAVEL_HISTORY: travelHistory,
  SECURITY_AND_DS160: ds160Security,
  DOCUMENT_CHECK: documentRequest,
  END: [],
}

// ---- 可选插入的阶段（不按顺序，随机穿插） ----

export const INSERTABLE_STAGES: Stage[] = [
  'TRAVEL_HISTORY',
  'SECURITY_AND_DS160',
  'DOCUMENT_CHECK',
]

// ---- 阶段顺序（主流程） ----

export const STAGE_ORDER: Stage[] = [
  'BASIC_INFO',
  'SCHOOL_AND_MAJOR',
  'ACADEMIC_PLAN',
  'CURRENT_STATUS',
  'FUNDING_CHECK',
  'FAMILY_AND_TIES',
  'FUTURE_PLAN',
]

// ---- 数量控制 ----

export const MIN_QUESTIONS = 8
export const MAX_QUESTIONS = 14
export const MAX_CONSECUTIVE_SAME_CATEGORY = 3
export const SHORT_ANSWER_THRESHOLD = 5 // words
export const MAX_SHORT_ANSWERS_BEFORE_PROBE = 2

// ---- 材料请求概率 ----

export const DOCUMENT_PROBABILITIES: Record<string, number> = {
  doc_001: 0.65, // I-20 — high
  doc_002: 0.40, // passport — medium
  doc_003: 0.25, // SEVIS receipt — low-medium
  doc_004: 0.35, // admission letter — medium
  doc_005: 0.55, // financial docs — high in funding stage
  doc_006: 0.45, // parents' employment proof — medium-high in funding
  doc_007: 0.25, // transcript — low-medium
}

// ---- 主阶段 → 若回答不充分则优先追问的类别 ----

export const FALLBACK_FOLLOWUP_MAP: Record<string, string[]> = {
  FUNDING_CHECK: ['funding_002', 'funding_003', 'doc_005', 'doc_006'],
  FUTURE_PLAN: ['future_002', 'future_003'],
  SCHOOL_AND_MAJOR: ['school_001', 'academic_002'],
  ACADEMIC_PLAN: ['academic_001', 'academic_002', 'academic_003'],
}
