export const B2_INTERVIEW_MAX_MAIN_QUESTIONS = 9
/** Opening question plus every new main question and follow-up; explicit repeats do not add to the count. */
export const B2_INTERVIEW_MAX_TOTAL_QUESTIONS = 14
export const B2_INTERVIEW_HARD_LIMIT_SECONDS = 6 * 60
export const B2_INTERVIEW_CLOSING_LINE = '好的，谢谢。今天的模拟面签到这里结束。'
export const B2_INTERVIEW_OPENING_LINE = '您好，请把护照递给我。您去美国的主要目的是什么？'

export type B2EvaluationDimensionId =
  | 'ds160_accuracy'
  | 'purpose_legitimacy'
  | 'itinerary_duration'
  | 'funding_adequacy'
  | 'departure_intent'
  | 'plan_credibility'

export interface B2EvaluationDimension {
  id: B2EvaluationDimensionId
  code: string
  promptRule: string
}

/**
 * Shared B-2 evidence framework for the realtime interview and the future
 * feedback model. It summarizes the official sources; it is not presented as
 * a list of official interview questions or a substitute for adjudication.
 */
export const B2_EVALUATION_DIMENSIONS: readonly B2EvaluationDimension[] = [
  {
    id: 'ds160_accuracy',
    code: 'DS160',
    promptRule:
      'DS-160 准确性与完整性:核验申请人口头回答与所填信息的完整性和一致性,只做一致性核验;绝不建议隐瞒、更改或编造任何实质性事实。',
  },
  {
    id: 'purpose_legitimacy',
    code: 'PURPOSE',
    promptRule:
      '访问目的合法性:旅游、探亲访友等短期访问均为美国承认的 B-2 目的;核验所述目的与计划活动是否连贯一致;不虚构行程,不诱导申请人改变目的。',
  },
  {
    id: 'itinerary_duration',
    code: 'ITINERARY',
    promptRule:
      '行程与停留时长:访问必须有明确有限的停留期限,预计停留应与所述目的相符;识别缺失或不一致的时间事实,但不得把某一种时长说成自动合格或不合格。',
  },
  {
    id: 'funding_adequacy',
    code: 'FUNDS',
    promptRule:
      '费用资金:访美及返程费用的安排应充分并与合法的短期访问相符;只比对本人口述的出资人、预算、收入范围与行程事实;绝不索取银行账号,也不声称核验资金。',
  },
  {
    id: 'departure_intent',
    code: 'DEPARTURE',
    promptRule:
      '国外住所与返回意愿:申请人须有无意放弃的国外住所;不把房产或某一家庭关系视为必须具备的证据,只评估完整记录。',
  },
  {
    id: 'plan_credibility',
    code: 'CREDIBILITY',
    promptRule:
      '现实计划与可信度:申请人应有具体现实的访问计划和合理确信的离境安排;只评估实际提供的计划,缺失细节是证据缺口,而非不良目的的证据。',
  },
]

export function isB2InterviewClosingLine(text: string) {
  return text.replace(/[，。！？,.!?\s]+/g, '').includes('好的谢谢今天的模拟面签到这里结束')
}
