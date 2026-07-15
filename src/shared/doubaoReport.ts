export interface InterviewReportTurn {
  role: 'officer' | 'user'
  text: string
  timestamp: string
}

export interface InterviewReportRequest {
  visaType: string
  safeContext: Record<string, unknown>
  transcript: InterviewReportTurn[]
}

const IDENTIFIER_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Z]{3}\d{10}\b/gi, '[REDACTED_PASSPORT]'],
  [/\bN\d{9}\b/gi, '[REDACTED_SEVIS_ID]'],
  [/\bAA\d{8}\b/gi, '[REDACTED_DS160_ID]'],
  [/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]'],
  [/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '[REDACTED_PHONE]'],
  [/\b\d{15,19}\b/g, '[REDACTED_ACCOUNT]'],
]

export function redactPotentialIdentifiers(value: string) {
  return IDENTIFIER_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  )
}

export function sanitizeReportRequest(value: unknown): InterviewReportRequest | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const visaType = String(input.visaType ?? '').trim().slice(0, 10)
  const rawSafeContext = input.safeContext && typeof input.safeContext === 'object' && !Array.isArray(input.safeContext)
    ? input.safeContext as Record<string, unknown>
    : {}
  const serializedContext = JSON.stringify(rawSafeContext)
  const safeContext = serializedContext.length <= 12_000
    ? JSON.parse(redactPotentialIdentifiers(serializedContext)) as Record<string, unknown>
    : {}
  if (!Array.isArray(input.transcript) || !visaType) return null

  const transcript = input.transcript
    .slice(0, 50)
    .map((turn): InterviewReportTurn | null => {
      if (!turn || typeof turn !== 'object') return null
      const item = turn as Record<string, unknown>
      const role = item.role === 'officer' ? 'officer' : item.role === 'user' ? 'user' : null
      const text = redactPotentialIdentifiers(String(item.text ?? '').trim()).slice(0, 4_000)
      if (!role || !text) return null
      return { role, text, timestamp: String(item.timestamp ?? '00:00').slice(0, 20) }
    })
    .filter((turn): turn is InterviewReportTurn => turn !== null)

  return transcript.length >= 2 ? { visaType, safeContext, transcript } : null
}

export function buildDoubaoReportMessages(input: InterviewReportRequest) {
  return [
    {
      role: 'system',
      content: `You analyze a complete U.S. visa interview practice transcript. Return valid JSON only.

Evaluate each valid officer-question/applicant-answer pair using the applicant's non-identifying background. Do not invent facts. Do not predict a real visa outcome. Treat voice confidence as a text-based estimate because raw audio is unavailable.

Required JSON schema:
{
  "overallScore": 1-5,
  "answers": [
    {
      "index": 1,
      "verdict": "favorable" | "neutral" | "unfavorable",
      "content": {
        "logic": { "score": 1-5, "comment": "Chinese" },
        "specificity": { "score": 1-5, "comment": "Chinese" },
        "persuasion": { "score": 1-5, "comment": "Chinese" },
        "ties": { "score": 1-5, "comment": "Chinese" }
      },
      "voice": { "confidence": 1-100, "emotion": "calm|nervous|confident|hesitant|tense|natural", "description": "Chinese" },
      "summary": "Chinese",
      "suggestions": ["Chinese", "Chinese"]
    }
  ]
}

Ignore repeat requests, did-not-hear turns, silence, and administrative document handoff when pairing questions and answers. Keep comments concise and actionable.`,
    },
    {
      role: 'user',
      content: JSON.stringify(input),
    },
  ]
}

export function getArkMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return null
  const first = choices[0] as { message?: { content?: unknown } } | undefined
  return typeof first?.message?.content === 'string' ? first.message.content : null
}
