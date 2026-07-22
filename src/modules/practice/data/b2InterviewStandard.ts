export const B2_INTERVIEW_MAX_MAIN_QUESTIONS = 9
export const B2_INTERVIEW_HARD_LIMIT_SECONDS = 6 * 60
export const B2_INTERVIEW_CLOSING_LINE = '好的，谢谢。今天的模拟面签到这里结束。'
export const B2_INTERVIEW_OPENING_LINE = '您好，请把护照递给我。您去美国的主要目的是什么？'

export function isB2InterviewClosingLine(text: string) {
  return text.replace(/[，。！？,.!?\s]+/g, '').includes('好的谢谢今天的模拟面签到这里结束')
}
