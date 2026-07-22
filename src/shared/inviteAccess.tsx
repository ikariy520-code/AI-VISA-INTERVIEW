import { createContext, useContext } from 'react'

export interface InviteAccess {
  role: 'vip' | 'tester'
  unlimited: boolean
  totalUses: number | null
  usedUses: number | null
  remainingUses: number | null
}

export interface InviteAccessContextValue {
  access: InviteAccess
  refreshAccess: () => Promise<InviteAccess>
}

export const DEV_INVITE_ACCESS: InviteAccess = {
  role: 'vip',
  unlimited: true,
  totalUses: null,
  usedUses: null,
  remainingUses: null,
}

export const InviteAccessContext = createContext<InviteAccessContextValue>({
  access: DEV_INVITE_ACCESS,
  refreshAccess: async () => DEV_INVITE_ACCESS,
})

export function parseInviteAccess(value: unknown): InviteAccess | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (candidate.role === 'vip' && candidate.unlimited === true) return DEV_INVITE_ACCESS
  if (
    candidate.role === 'tester'
    && candidate.unlimited === false
    && Number.isSafeInteger(candidate.totalUses)
    && Number.isSafeInteger(candidate.usedUses)
    && Number.isSafeInteger(candidate.remainingUses)
  ) {
    return {
      role: 'tester',
      unlimited: false,
      totalUses: Number(candidate.totalUses),
      usedUses: Number(candidate.usedUses),
      remainingUses: Number(candidate.remainingUses),
    }
  }
  return null
}

export function useInviteAccess() {
  return useContext(InviteAccessContext)
}
