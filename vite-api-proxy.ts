// ========================================
// Vite 插件 — 本地 API 代理
//
// 开发模式下模拟 Netlify Functions
// 读取本地 .env.local 中的 DEEPSEEK_API_KEY
// 代理 /api/ai-chat 和 /api/ai-score 到 DeepSeek
//
// 生产环境不生效（由 Netlify Functions 接管）
// ========================================

import type { Plugin } from 'vite'

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1/chat/completions'

export function apiProxyPlugin(): Plugin {
  return {
    name: 'vite-api-proxy',
    configureServer(server) {
      // 处理 /api/ai-chat
      server.middlewares.use('/api/ai-chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const apiKey = process.env.DEEPSEEK_API_KEY
        if (!apiKey) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: 'DEEPSEEK_API_KEY not set in .env.local' }))
          return
        }

        // 收集请求 body
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        }
        let body: any
        try {
          body = JSON.parse(Buffer.concat(chunks).toString())
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
          return
        }

        const { messages, temperature, max_tokens, response_format } = body
        if (!messages || !Array.isArray(messages)) {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Missing messages' }))
          return
        }

        const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

        const requestBody: any = {
          model,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 512,
        }
        if (response_format) {
          requestBody.response_format = response_format
        }

        try {
          const response = await fetch(DEEPSEEK_BASE, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
          })

          res.writeHead(response.status, { 'Content-Type': 'application/json' })
          const text = await response.text()
          res.end(text)
        } catch (err: any) {
          res.writeHead(502)
          res.end(JSON.stringify({ error: 'Failed to reach AI service', detail: err.message }))
        }
      })

      // 处理 /api/ai-score
      server.middlewares.use('/api/ai-score', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const apiKey = process.env.DEEPSEEK_API_KEY
        if (!apiKey) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: 'DEEPSEEK_API_KEY not set in .env.local' }))
          return
        }

        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        }
        let body: any
        try {
          body = JSON.parse(Buffer.concat(chunks).toString())
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
          return
        }

        const { question, answer } = body
        if (!question || !answer) {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Missing question or answer' }))
          return
        }

        const scoringPrompt = `You are evaluating an F1 US visa interview answer. The visa officer asked: "${question}"

The applicant answered: "${answer}"

Evaluate this answer across the following criteria on a scale of 1-5. Also provide a brief assessment of the applicant's voice delivery confidence (inferred from text patterns like sentence length, hesitations, filler words). Return ONLY valid JSON with this structure:

{
  "content": {
    "logic": { "score": <1-5>, "comment": "<one sentence>" },
    "specificity": { "score": <1-5>, "comment": "<one sentence>" },
    "persuasion": { "score": <1-5>, "comment": "<one sentence>" },
    "ties": { "score": <1-5>, "comment": "<one sentence>" }
  },
  "voice": {
    "confidence": <1-100>,
    "emotion": "<confident|natural|hesitant|nervous|tense>",
    "description": "<one sentence>"
  },
  "verdict": "<favorable|neutral|unfavorable>",
  "summary": "<one sentence overall assessment>",
  "suggestions": ["<tip1>", "<tip2>"]
}`

        try {
          const response = await fetch(DEEPSEEK_BASE, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
              messages: [
                { role: 'system', content: 'You are an expert visa interview coach. Always respond with valid JSON only.' },
                { role: 'user', content: scoringPrompt },
              ],
              temperature: 0.5,
              max_tokens: 800,
              response_format: { type: 'json_object' },
            }),
          })

          res.writeHead(response.status, { 'Content-Type': 'application/json' })
          const text = await response.text()
          res.end(text)
        } catch (err: any) {
          res.writeHead(502)
          res.end(JSON.stringify({ error: 'Failed to reach AI service', detail: err.message }))
        }
      })
    },
  }
}
