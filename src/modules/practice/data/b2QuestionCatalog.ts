export type B2QuestionId =
  | 'b2_01' | 'b2_02' | 'b2_03' | 'b2_04' | 'b2_05' | 'b2_06'
  | 'b2_07' | 'b2_08' | 'b2_09' | 'b2_10' | 'b2_11' | 'b2_12'
  | 'b2_13' | 'b2_14' | 'b2_15' | 'b2_16' | 'b2_17' | 'b2_18'
  | 'b2_19' | 'b2_20' | 'b2_21' | 'b2_22' | 'b2_23' | 'b2_24'

export type B2QuestionTopic = 'purpose' | 'itinerary' | 'funding' | 'current_status' | 'departure' | 'us_contact' | 'travel_history'

export interface B2QuestionDefinition {
  id: B2QuestionId
  number: number
  topic: B2QuestionTopic
  text: string
  answerShape: 'open' | 'yes-no'
  conditional?: 'tourism' | 'contact' | 'previous-us-visa' | 'denial' | 'overstay' | 'third-party-funding'
}

export const B2_QUESTION_CATALOG: readonly B2QuestionDefinition[] = [
  { id: 'b2_01', number: 1, topic: 'purpose', text: '您去美国的主要目的是什么？', answerShape: 'open' },
  { id: 'b2_02', number: 2, topic: 'itinerary', text: '您计划什么时候出发，在美国停留多久？', answerShape: 'open' },
  { id: 'b2_03', number: 3, topic: 'itinerary', text: '您计划去哪些城市，主要安排是什么？', answerShape: 'open' },
  { id: 'b2_04', number: 4, topic: 'itinerary', text: '您为什么选择这些目的地？', answerShape: 'open', conditional: 'tourism' },
  { id: 'b2_05', number: 5, topic: 'itinerary', text: '这次谁和您一起旅行？', answerShape: 'open' },
  { id: 'b2_06', number: 6, topic: 'funding', text: '这次旅行的费用由谁承担？', answerShape: 'open' },
  { id: 'b2_07', number: 7, topic: 'funding', text: '这次旅行预计总共花费多少？', answerShape: 'open' },
  { id: 'b2_08', number: 8, topic: 'current_status', text: '您目前是做什么工作的，或者现在是什么状态？', answerShape: 'open' },
  { id: 'b2_09', number: 9, topic: 'current_status', text: '您目前的工作或这个状态持续多久了？', answerShape: 'open' },
  { id: 'b2_10', number: 10, topic: 'current_status', text: '这次旅行期间，您的工作或学习是怎么安排的？', answerShape: 'open' },
  { id: 'b2_11', number: 11, topic: 'departure', text: '旅行结束以后，您回来有什么安排？', answerShape: 'open' },
  { id: 'b2_12', number: 12, topic: 'us_contact', text: '您在美国有亲属或朋友吗？', answerShape: 'yes-no' },
  { id: 'b2_13', number: 13, topic: 'us_contact', text: '您和美国联系人的关系是什么？', answerShape: 'open', conditional: 'contact' },
  { id: 'b2_14', number: 14, topic: 'us_contact', text: '您在美国期间住在哪里，由谁安排住宿？', answerShape: 'open' },
  { id: 'b2_15', number: 15, topic: 'travel_history', text: '您以前去过哪些国家或地区？', answerShape: 'open' },
  { id: 'b2_16', number: 16, topic: 'travel_history', text: '您以前去过美国吗？上次停留了多久？', answerShape: 'open', conditional: 'previous-us-visa' },
  { id: 'b2_17', number: 17, topic: 'travel_history', text: '您以前申请美国签证时被拒签过吗？', answerShape: 'yes-no', conditional: 'denial' },
  { id: 'b2_18', number: 18, topic: 'travel_history', text: '您以前在美国有没有逾期停留？', answerShape: 'yes-no', conditional: 'overstay' },
  { id: 'b2_19', number: 19, topic: 'purpose', text: '您为什么选择现在去美国？', answerShape: 'open' },
  { id: 'b2_20', number: 20, topic: 'itinerary', text: '这次行程是谁安排的？', answerShape: 'open' },
  { id: 'b2_21', number: 21, topic: 'funding', text: '这笔旅行费用准备从哪里支付？', answerShape: 'open', conditional: 'third-party-funding' },
  { id: 'b2_22', number: 22, topic: 'departure', text: '有哪些工作、学习或家庭安排需要您按计划回来？', answerShape: 'open' },
  { id: 'b2_23', number: 23, topic: 'us_contact', text: '您这次探望的人和您是什么关系，计划相处多久？', answerShape: 'open', conditional: 'contact' },
  { id: 'b2_24', number: 24, topic: 'us_contact', text: '您以前和这位朋友见过面吗？', answerShape: 'yes-no', conditional: 'contact' },
]

export const B2_CORE_TOPICS: readonly B2QuestionTopic[] = ['purpose', 'itinerary', 'funding', 'current_status', 'departure']

const questionMap = new Map(B2_QUESTION_CATALOG.map(question => [question.id, question]))

export function getB2Question(id: B2QuestionId) {
  const question = questionMap.get(id)
  if (!question) throw new Error(`Unknown B2 question: ${id}`)
  return question
}
