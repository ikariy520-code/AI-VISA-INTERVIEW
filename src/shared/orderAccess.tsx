import { createContext, useContext } from 'react'

export interface OrderAccess {
  role: 'admin' | 'customer'
  unlimited: boolean
  totalUses: number | null
  usedUses: number | null
  remainingUses: number | null
  availableUses: number | null
  expiresAt: string | null
}

export interface OrderAccessContextValue {
  access: OrderAccess
  refreshAccess: () => Promise<OrderAccess>
}

export const DEV_ORDER_ACCESS: OrderAccess = {
  role: 'admin',
  unlimited: true,
  totalUses: null,
  usedUses: null,
  remainingUses: null,
  availableUses: null,
  expiresAt: null,
}

export const OrderAccessContext = createContext<OrderAccessContextValue>({
  access: DEV_ORDER_ACCESS,
  refreshAccess: async () => DEV_ORDER_ACCESS,
})

export function parseOrderAccess(value: unknown): OrderAccess | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (candidate.role === 'admin' && candidate.unlimited === true) return DEV_ORDER_ACCESS
  if (
    candidate.role === 'customer'
    && candidate.unlimited === false
    && Number.isSafeInteger(candidate.totalUses)
    && Number.isSafeInteger(candidate.usedUses)
    && Number.isSafeInteger(candidate.remainingUses)
    && Number.isSafeInteger(candidate.availableUses)
  ) {
    return {
      role: 'customer',
      unlimited: false,
      totalUses: Number(candidate.totalUses),
      usedUses: Number(candidate.usedUses),
      remainingUses: Number(candidate.remainingUses),
      availableUses: Number(candidate.availableUses),
      expiresAt: typeof candidate.expiresAt === 'string' ? candidate.expiresAt : null,
    }
  }
  return null
}

export function useOrderAccess() {
  return useContext(OrderAccessContext)
}
