import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

interface AccessContextValue {
  hasAccess: boolean
  loading: boolean
  remainingInterviews: number
  maxInterviews: number
  expiresAt: string | null
  activeSessionKey: string | null
  refresh: () => Promise<void>
  redeemInviteCode: (code: string) => Promise<void>
  beginInterview: () => Promise<string>
}

interface AccessResponse {
  unlocked?: boolean
  remainingInterviews?: number
  maxInterviews?: number
  expiresAt?: string | null
  error?: string
}

const ACTIVE_SESSION_KEY = 'visa_active_interview_session'
const AccessContext = createContext<AccessContextValue | null>(null)

function getSessionKey(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_SESSION_KEY)
  } catch {
    return null
  }
}

function accessHeaders(sessionKey?: string | null): HeadersInit {
  return sessionKey ? { 'X-Interview-Session': sessionKey } : {}
}

async function readJson(response: Response): Promise<AccessResponse> {
  return response.json().catch(() => ({})) as Promise<AccessResponse>
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [remainingInterviews, setRemainingInterviews] = useState(0)
  const [maxInterviews, setMaxInterviews] = useState(0)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(() => getSessionKey())

  const applyAccess = useCallback((data: AccessResponse) => {
    setHasAccess(Boolean(data.unlocked))
    setRemainingInterviews(Number(data.remainingInterviews ?? 0))
    setMaxInterviews(Number(data.maxInterviews ?? 0))
    setExpiresAt(data.expiresAt ?? null)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/access', {
        credentials: 'include',
        headers: accessHeaders(getSessionKey()),
      })
      applyAccess(await readJson(response))
    } catch {
      setHasAccess(false)
    } finally {
      setLoading(false)
    }
  }, [applyAccess])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const redeemInviteCode = useCallback(async (code: string) => {
    const response = await fetch('/api/invite/redeem', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    })
    const data = await readJson(response)
    if (!response.ok) {
      if (response.status === 429) throw new Error('尝试次数过多，请15分钟后再试。')
      if (data.error === 'INVITE_UNAVAILABLE') throw new Error('邀请码已失效、已达到设备上限或次数已经用完。')
      throw new Error('邀请码无效，请检查后重新输入。')
    }
    applyAccess(data)
  }, [applyAccess])

  const beginInterview = useCallback(async () => {
    let sessionKey = getSessionKey()
    if (!sessionKey) {
      sessionKey = crypto.randomUUID().replace(/-/g, '')
      sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionKey)
      setActiveSessionKey(sessionKey)
    }
    const response = await fetch('/api/interview/start', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...accessHeaders(sessionKey) },
      body: JSON.stringify({ sessionKey }),
    })
    const data = await readJson(response)
    if (!response.ok) {
      sessionStorage.removeItem(ACTIVE_SESSION_KEY)
      setActiveSessionKey(null)
      if (data.error === 'INTERVIEW_LIMIT_REACHED') throw new Error('此邀请码的面签次数已经用完。')
      throw new Error('无法开始面签，请重新输入邀请码。')
    }
    applyAccess(data)
    return sessionKey
  }, [applyAccess])

  const value = useMemo<AccessContextValue>(() => ({
    hasAccess,
    loading,
    remainingInterviews,
    maxInterviews,
    expiresAt,
    activeSessionKey,
    refresh,
    redeemInviteCode,
    beginInterview,
  }), [hasAccess, loading, remainingInterviews, maxInterviews, expiresAt, activeSessionKey, refresh, redeemInviteCode, beginInterview])

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}

export function useAccess(): AccessContextValue {
  const value = useContext(AccessContext)
  if (!value) throw new Error('useAccess must be used inside AccessProvider')
  return value
}

export function getActiveInterviewSessionKey(): string | null {
  return getSessionKey()
}

export function clearActiveInterviewSession(): void {
  try {
    sessionStorage.removeItem(ACTIVE_SESSION_KEY)
  } catch {
    // ignore storage errors
  }
}
