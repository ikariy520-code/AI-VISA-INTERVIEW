import type { InterviewSession } from '../../feedback/types'
import type { ChatMessage, UserContext } from '../../practice/types'
import type { F1InterviewState } from '../../practice/services/f1InterviewController'
import type { B2InterviewState } from '../../practice/services/b2InterviewController'
import type { OfficerType } from '../../voice/types'

const ACTIVE_INTERVIEW_KEY = 'visa_active_interview_v1'
const FEEDBACK_SESSION_KEY = 'visa_feedback_session_v1'
const RECOVERY_TTL_MS = 4 * 60 * 60 * 1000

export interface LiveInterviewProgress {
  messages: ChatMessage[]
  elapsedSeconds: number
  f1State: F1InterviewState | null
  b2State: B2InterviewState | null
  pendingQuestion: string
}

export interface CompletedInterviewRecovery {
  messages: ChatMessage[]
  duration: string
}

export interface ActiveInterviewRecovery {
  attemptId: string
  officerType: OfficerType
  userContext: UserContext
  progress?: LiveInterviewProgress
  completed?: CompletedInterviewRecovery
  updatedAt: number
}

function storageAvailable() {
  return typeof window !== 'undefined' && Boolean(window.sessionStorage)
}

function safeParse<T>(key: string): T | null {
  if (!storageAvailable()) return null
  try {
    const value = window.sessionStorage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

function safeWrite(key: string, value: unknown) {
  if (!storageAvailable()) return
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Recovery is best-effort and must never block the interview itself.
  }
}

function isFresh(updatedAt: unknown) {
  return Number.isFinite(updatedAt) && Date.now() - Number(updatedAt) <= RECOVERY_TTL_MS
}

export function createInterviewAttempt(officerType: OfficerType, userContext: UserContext) {
  clearInterviewRecovery()
  const attemptId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const recovery: ActiveInterviewRecovery = {
    attemptId,
    officerType,
    userContext,
    updatedAt: Date.now(),
  }
  safeWrite(ACTIVE_INTERVIEW_KEY, recovery)
  return recovery
}

export function loadInterviewRecovery(): ActiveInterviewRecovery | null {
  const recovery = safeParse<ActiveInterviewRecovery>(ACTIVE_INTERVIEW_KEY)
  if (
    !recovery
    || typeof recovery.attemptId !== 'string'
    || !recovery.attemptId
    || typeof recovery.officerType !== 'string'
    || !recovery.userContext
    || !isFresh(recovery.updatedAt)
  ) {
    return null
  }
  return recovery
}

export function saveLiveInterviewProgress(progress: LiveInterviewProgress) {
  const recovery = loadInterviewRecovery()
  if (!recovery || recovery.completed) return
  safeWrite(ACTIVE_INTERVIEW_KEY, {
    ...recovery,
    progress,
    updatedAt: Date.now(),
  } satisfies ActiveInterviewRecovery)
}

export function saveCompletedInterview(completed: CompletedInterviewRecovery) {
  const recovery = loadInterviewRecovery()
  if (!recovery) return
  safeWrite(ACTIVE_INTERVIEW_KEY, {
    ...recovery,
    progress: undefined,
    completed,
    updatedAt: Date.now(),
  } satisfies ActiveInterviewRecovery)
}

export function saveFeedbackSession(session: InterviewSession) {
  safeWrite(FEEDBACK_SESSION_KEY, { session, updatedAt: Date.now() })
}

export function loadFeedbackSession(): InterviewSession | null {
  const stored = safeParse<{ session?: InterviewSession; updatedAt?: number }>(FEEDBACK_SESSION_KEY)
  return stored?.session && isFresh(stored.updatedAt) ? stored.session : null
}

export function clearInterviewRecovery() {
  if (!storageAvailable()) return
  try {
    window.sessionStorage.removeItem(ACTIVE_INTERVIEW_KEY)
    window.sessionStorage.removeItem(FEEDBACK_SESSION_KEY)
  } catch {
    // Ignore storage failures.
  }
}
