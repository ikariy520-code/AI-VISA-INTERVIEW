import type { InterviewRecord } from '../practice/types'
import type { FeedbackReport } from './reportViewModel'
import { normalizeFeedbackReport } from './reportViewModel'

const CLIENT_TIMEOUT_MS = 135_000

export class FeedbackApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'FeedbackApiError'
    this.code = code
  }
}

export async function requestDeepSeekFeedback(record: InterviewRecord): Promise<FeedbackReport> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)

  try {
    const response = await fetch('/api/feedback-report', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: record.id,
        date: record.date,
        time: record.time,
        duration: record.duration,
        visaType: record.visaType,
        officerType: record.officerType,
        userContext: record.userContext,
        transcript: record.messages
          .filter(message => message.role === 'officer' || message.role === 'user')
          .map(message => ({
            role: message.role,
            text: message.text,
            timestamp: message.timestamp,
          })),
      }),
      signal: controller.signal,
    })

    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      // The error below intentionally avoids exposing upstream response content.
    }

    if (!response.ok) {
      const errorPayload = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
      throw new FeedbackApiError(
        typeof errorPayload.code === 'string' ? errorPayload.code : 'FEEDBACK_REQUEST_FAILED',
        typeof errorPayload.message === 'string' ? errorPayload.message : '反馈分析暂时失败。',
      )
    }

    const reportPayload = payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).report
      : null
    const report = normalizeFeedbackReport(reportPayload)
    if (!report) throw new FeedbackApiError('INVALID_FEEDBACK_REPORT', '反馈报告格式无效。')
    return report
  } catch (error) {
    if (error instanceof FeedbackApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new FeedbackApiError('FEEDBACK_TIMEOUT', '反馈分析超时。')
    }
    throw new FeedbackApiError('FEEDBACK_NETWORK_ERROR', '无法连接反馈分析服务。')
  } finally {
    window.clearTimeout(timeout)
  }
}
