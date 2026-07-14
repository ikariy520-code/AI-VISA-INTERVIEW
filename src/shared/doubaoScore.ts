export function buildDoubaoScoreMessages(question: string, answer: string) {
  const outputShape = {
    content: {
      logic: { score: 3, comment: '中文简评' },
      specificity: { score: 3, comment: '中文简评' },
      persuasion: { score: 3, comment: '中文简评' },
      ties: { score: 3, comment: '中文简评' },
    },
    voice: {
      confidence: 60,
      emotion: 'natural',
      description: '仅根据转写文本判断表达状态的中文说明',
    },
    verdict: 'neutral',
    summary: '中文总结',
    suggestions: ['中文建议一', '中文建议二'],
  }

  return [
    {
      role: 'system',
      content: `You are an expert US visa interview coach. Evaluate one answer and return exactly one JSON object.

Rules:
- Score logic, specificity, persuasion and home-country ties from 1 to 5.
- verdict must be exactly favorable, neutral, or unfavorable.
- voice.confidence is 1 to 100 and may only reflect linguistic decisiveness visible in the transcript, not acoustic qualities.
- voice.emotion must be calm, nervous, confident, hesitant, tense, or natural.
- Write comments, summary, description and exactly two actionable suggestions in Simplified Chinese.
- Judge relevance to the supplied question. A concise direct Yes or No can be appropriate for a yes-no question.
- Never decide visa approval, refusal, truthfulness, asylum intent, or legal eligibility.
- Do not repeat or infer names, document numbers, contact details, addresses, or other identifiers.
- Return JSON only, with this exact shape:
${JSON.stringify(outputShape)}`,
    },
    {
      role: 'user',
      content: JSON.stringify({ question, answer }),
    },
  ]
}
