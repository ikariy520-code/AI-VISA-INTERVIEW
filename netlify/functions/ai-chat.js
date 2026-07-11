// ========================================
// Netlify Function — AI API 代理
//
// 作用：接收前端请求，附加 API Key，转发到 DeepSeek API
// 部署到 Netlify 后自动变为 Serverless Function
//
// 端点：POST /.netlify/functions/ai-chat
//
// 环境变量（在 Netlify Dashboard 中设置）：
//   DEEPSEEK_API_KEY — DeepSeek API 密钥
//   DEEPSEEK_MODEL   — 可选，默认 deepseek-chat
// ========================================

const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1/chat/completions'
const DEFAULT_MODEL = 'deepseek-chat'

exports.handler = async (event) => {
  // ---- 仅允许 POST ----
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  // ---- 读取 API Key ----
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server not configured: missing DEEPSEEK_API_KEY' }),
    }
  }

  // ---- 解析请求 ----
  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    }
  }

  const { messages, temperature, max_tokens, response_format } = body

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing or invalid "messages" array' }),
    }
  }

  // ---- 构建 DeepSeek API 请求 ----
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL

  const requestBody = {
    model,
    messages,
    temperature: temperature ?? 0.7,
    max_tokens: max_tokens ?? 512,
  }

  // DeepSeek 支持 JSON mode（与 OpenAI 兼容）
  if (response_format) {
    requestBody.response_format = response_format
  }

  // ---- 调用 DeepSeek API ----
  try {
    const response = await fetch(DEEPSEEK_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[ai-chat] DeepSeek API error:', response.status, errorText)
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: `AI service error: ${response.status}`,
          detail: errorText.slice(0, 500),
        }),
      }
    }

    const data = await response.json()

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  } catch (err) {
    console.error('[ai-chat] Fetch error:', err.message)
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to reach AI service', detail: err.message }),
    }
  }
}
