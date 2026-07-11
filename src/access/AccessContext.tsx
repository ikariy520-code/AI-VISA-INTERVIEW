import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { requireSupabase } from '../lib/supabase'

export type AccessStatus = 'locked' | 'active' | 'expired' | 'revoked'

interface AccessContextValue {
  status: AccessStatus
  hasAccess: boolean
  loading: boolean
  expiresAt: string | null
  refresh: () => Promise<void>
  redeemInviteCode: (code: string) => Promise<void>
}

const AccessContext = createContext<AccessContextValue | null>(null)

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [status, setStatus] = useState<AccessStatus>('locked')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus('locked')
      setExpiresAt(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await requireSupabase()
      .from('user_entitlements')
      .select('status, expires_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      setLoading(false)
      throw error
    }

    const nextStatus = (data?.status ?? 'locked') as AccessStatus
    const isExpired = data?.expires_at && new Date(data.expires_at).getTime() <= Date.now()
    setStatus(isExpired ? 'expired' : nextStatus)
    setExpiresAt(data?.expires_at ?? null)
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    refresh().catch((error) => {
      console.error('[Access] Failed to load entitlement', error)
      setStatus('locked')
      setLoading(false)
    })
  }, [authLoading, refresh])

  const redeemInviteCode = useCallback(async (code: string) => {
    const normalized = code.trim()
    if (normalized.length < 6) throw new Error('请输入有效的邀请码。')

    const { error } = await requireSupabase().rpc('redeem_invite_code', { p_code: normalized })
    if (error) {
      if (/INVALID|EXPIRED/i.test(error.message)) {
        throw new Error('邀请码无效、已过期或已经被使用。')
      }
      throw error
    }
    await refresh()
  }, [refresh])

  const value = useMemo<AccessContextValue>(() => ({
    status,
    hasAccess: status === 'active',
    loading,
    expiresAt,
    refresh,
    redeemInviteCode,
  }), [status, loading, expiresAt, refresh, redeemInviteCode])

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}

export function useAccess(): AccessContextValue {
  const value = useContext(AccessContext)
  if (!value) throw new Error('useAccess must be used inside AccessProvider')
  return value
}
