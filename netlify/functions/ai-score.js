// ========================================
// Netlify Function — AI 评分代理
//
// 作用：接收面试对话记录，调用 AI 进行多维度评分
// 端点：POST /.netlify/functions/ai-score
//
// 用于面试结束后的语音质量和内容质量评估
// ========================================

const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1/chat/completions'
const DEFAULT_MODEL = 'deepseek-chat'

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { question, answer } = body

  if (!question || !answer) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing question or answer' }) }
  }

  const scoringPrompt = `You are evaluating an F1 US visa interview answer. The visa officer asked: "${question}"

The applicant answered: "${answer}"

Evaluate this answer across the following criteria on a scale of 1-5. Also provide a brief assessment of the applicant's voice delivery confidence (inferred from text patterns like sentence length, hesitations, filler words). Return ONLY valid JSON:

{
  "content": {
    "logic": { "score": <1-5>, "comment": "<one sentence in English>" },
    "specificity": { "score": <1-5>, "comment": "<one sentence in English>" },
    "persuasion": { "score": <1-5>, "comment": "<one sentence in English>" },
    "ties": { "score": <1-5>, "comment": "<one sentence in English>" }
  },
  "voice": {
    "confidence": <1-100>,
    "emotion": "<confident|natural|hesitant|nervous|tense>",
    "description": "<one sentence in English>"
  },
  "verdict": "<favorable|neutral|unfavorable>",
  "summary": "<one sentence overall assessment in English>",
  "suggestions": ["<one concrete improvement tip>", "<another tip>"]
}`

  try {
    const response = await fetch(DEEPSEEK_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: 'You are an expert visa interview coach. Always respond with valid JSON only.' },
          { role: 'user', content: scoringPrompt },
        ],
        temperature: 0.5,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[ai-score] API error:', response.status, errorText)
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `AI service error: ${response.status}`, detail: errorText.slice(0, 500) }),
      }
    }

    const data = await response.json()
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  } catch (err) {
    console.error('[ai-score] Fetch error:', err.message)
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to reach AI service', detail: err.message }),
    }
  }
}
