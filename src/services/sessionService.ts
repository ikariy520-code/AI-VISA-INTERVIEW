import type { InterviewSession, QAPair } from '../modules/feedback/types'
import { getSavedSessions, clearAllSessions } from '../modules/shared/store/interviewStore'
import { requireSupabase } from '../lib/supabase'

interface RawTranscriptItem {
  id: string
  question: string
  answer: string
  timestamp: string
}

interface FeedbackItem {
  id: string
  feedback: QAPair['feedback']
}

function splitSession(session: InterviewSession) {
  const rawTranscript: RawTranscriptItem[] = session.transcript.map(({ id, question, answer, timestamp }) => ({
    id,
    question,
    answer,
    timestamp,
  }))
  const feedbackPayload: FeedbackItem[] = session.transcript.map(({ id, feedback }) => ({ id, feedback }))
  return { rawTranscript, feedbackPayload }
}

function mergeSession(sessionRow: any, feedbackRow: any): InterviewSession {
  const feedbackById = new Map<string, QAPair['feedback']>(
    ((feedbackRow?.feedback_payload ?? []) as FeedbackItem[]).map((item) => [item.id, item.feedback]),
  )
  const transcript = ((sessionRow.raw_transcript ?? []) as RawTranscriptItem[]).map((item) => ({
    ...item,
    feedback: feedbackById.get(item.id),
  })).filter((item): item is QAPair => Boolean(item.feedback))

  return {
    id: sessionRow.id,
    date: sessionRow.interview_date,
    time: sessionRow.interview_time,
    duration: sessionRow.duration,
    title: sessionRow.title,
    overallScore: Number(feedbackRow?.overall_score ?? 0),
    transcript,
  }
}

export async function listCloudSessions(): Promise<InterviewSession[]> {
  const client = requireSupabase()
  const { data: sessions, error: sessionError } = await client
    .from('interview_sessions')
    .select('id, title, interview_date, interview_time, duration, raw_transcript, created_at')
    .order('created_at', { ascending: false })

  if (sessionError) throw sessionError
  if (!sessions?.length) return []

  const ids = sessions.map((session) => session.id)
  const { data: feedbackRows, error: feedbackError } = await client
    .from('interview_feedback')
    .select('session_id, overall_score, feedback_payload')
    .in('session_id', ids)

  if (feedbackError) throw feedbackError
  const feedbackBySession = new Map((feedbackRows ?? []).map((row) => [row.session_id, row]))
  return sessions
    .filter((session) => feedbackBySession.has(session.id))
    .map((session) => mergeSession(session, feedbackBySession.get(session.id)))
}

export async function saveCloudSession(
  session: InterviewSession,
  options?: { sourceClientId?: string },
): Promise<void> {
  const client = requireSupabase()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('请先登录。')

  const { rawTranscript, feedbackPayload } = splitSession(session)
  const { error: sessionError } = await client.from('interview_sessions').upsert({
    id: session.id,
    user_id: userData.user.id,
    title: session.title,
    interview_date: session.date,
    interview_time: session.time,
    duration: session.duration,
    raw_transcript: rawTranscript,
    source_client_id: options?.sourceClientId ?? null,
  }, { onConflict: 'id' })
  if (sessionError) throw sessionError

  const { error: feedbackError } = await client.from('interview_feedback').upsert({
    session_id: session.id,
    user_id: userData.user.id,
    overall_score: session.overallScore,
    feedback_payload: feedbackPayload,
  }, { onConflict: 'session_id' })
  if (feedbackError) throw feedbackError
}

export async function deleteCloudSession(sessionId: string): Promise<void> {
  const { error } = await requireSupabase().from('interview_sessions').delete().eq('id', sessionId)
  if (error) throw error
}

export function getLegacySessionCount(): number {
  return getSavedSessions().length
}

export async function importLegacySessions(): Promise<number> {
  const legacySessions = getSavedSessions()
  let imported = 0
  for (const legacySession of legacySessions) {
    const cloudSession = {
      ...legacySession,
      id: crypto.randomUUID(),
    }
    await saveCloudSession(cloudSession, { sourceClientId: legacySession.id })
    imported += 1
  }
  if (imported === legacySessions.length) clearAllSessions()
  return imported
}
