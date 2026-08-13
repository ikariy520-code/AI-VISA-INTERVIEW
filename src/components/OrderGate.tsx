import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { HiOutlineArrowRight, HiOutlineLockClosed, HiOutlineShieldCheck } from 'react-icons/hi2'
import {
  DEV_ORDER_ACCESS,
  OrderAccessContext,
  parseOrderAccess,
  type OrderAccess,
} from '../shared/orderAccess'

interface Props {
  children: ReactNode
}

type GateState = 'checking' | 'locked' | 'authenticated'

export default function OrderGate({ children }: Props) {
  const localAccess = import.meta.env.DEV || Boolean(window.desktopBridge)
  const [state, setState] = useState<GateState>(localAccess ? 'authenticated' : 'checking')
  const [access, setAccess] = useState<OrderAccess | null>(localAccess ? DEV_ORDER_ACCESS : null)
  const [orderNumber, setOrderNumber] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refreshAccess = useCallback(async () => {
    if (localAccess) return DEV_ORDER_ACCESS
    const response = await fetch('/api/auth/status', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null
    if (!response.ok) {
      throw new Error(typeof payload?.message === 'string' ? payload.message : '使用权益验证失败。')
    }
    const nextAccess = parseOrderAccess(payload)
    if (!nextAccess) throw new Error('使用权益数据无效。')
    setAccess(nextAccess)
    return nextAccess
  }, [localAccess])

  useEffect(() => {
    if (localAccess) return
    const controller = new AbortController()
    let disposed = false
    const timeout = window.setTimeout(() => controller.abort(), 8_000)
    fetch('/api/auth/status', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null
        if (response.ok) {
          const nextAccess = parseOrderAccess(payload)
          if (!nextAccess) throw new Error('使用权益数据无效。')
          if (!nextAccess.unlimited && Number(nextAccess.remainingUses) <= 0) {
            setAccess(null)
            setError('该订单号的面签次数已经用完，请购买新的面签次数。')
            setState('locked')
            return
          }
          if (!nextAccess.unlimited && nextAccess.expiresAt && Date.parse(nextAccess.expiresAt) <= Date.now()) {
            setAccess(null)
            setError('该订单号已过期，请联系客服或购买新的面签次数。')
            setState('locked')
            return
          }
          setAccess(nextAccess)
          setState('authenticated')
          return
        }
        if (response.status !== 401 && typeof payload?.message === 'string') setError(payload.message)
        setState('locked')
      })
      .catch(fetchError => {
        if (disposed) return
        setError(fetchError instanceof DOMException && fetchError.name === 'AbortError'
          ? '使用权益验证超时，请检查网络后重试。'
          : fetchError instanceof Error ? fetchError.message : '暂时无法连接服务，请稍后重试。')
        setState('locked')
      })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      disposed = true
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [localAccess])

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault()
    const submittedOrderNumber = orderNumber.trim()
    if (!submittedOrderNumber || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/auth/order', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: submittedOrderNumber }),
      })
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null
      if (!response.ok) {
        throw new Error(typeof payload?.message === 'string'
          ? payload.message
          : '订单号验证失败，请重新输入。')
      }
      const nextAccess = parseOrderAccess(payload)
      if (!nextAccess) throw new Error('订单权益数据无效，请重新输入。')
      setAccess(nextAccess)
      setState('authenticated')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '订单号验证失败，请重新输入。')
    } finally {
      setSubmitting(false)
    }
  }

  if (state === 'authenticated' && access) {
    return (
      <OrderAccessContext.Provider value={{ access, refreshAccess }}>
        {children}
      </OrderAccessContext.Provider>
    )
  }

  if (state === 'checking') {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5f7] px-6">
        <div className="flex flex-col items-center gap-4 text-[#6e6e73]" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#d2d2d7] border-t-[#0071e3]" />
          <p className="text-sm font-medium">正在验证使用权益…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f5f5f7] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:px-5 sm:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,1),rgba(245,245,247,0))]" />
      <motion.section
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.28, 0.11, 0.32, 1] }}
        className="relative w-full max-w-[430px] rounded-[26px] border border-black/[0.06] bg-white/95 px-6 py-8 shadow-[0_20px_60px_rgba(0,0,0,0.075)] backdrop-blur-xl sm:rounded-[30px] sm:px-10 sm:py-11 sm:shadow-[0_24px_80px_rgba(0,0,0,0.08)]"
      >
        <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#eaf4ff] text-[#0071e3] shadow-[inset_0_0_0_1px_rgba(0,113,227,0.05)]">
          <HiOutlineLockClosed className="h-8 w-8" aria-hidden="true" />
        </div>

        <div className="text-center">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#0071e3]">正式版服务</p>
          <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-[#1d1d1f]">验证面签订单</h1>
          <p className="mx-auto mt-3 max-w-[310px] text-[15px] leading-6 text-[#6e6e73]">
            网站内容可以自由浏览。开始实时 AI 面签前，请输入购买平台中的订单号。
          </p>
        </div>

        <form className="mt-8" onSubmit={submitOrder}>
          <label htmlFor="order-number" className="mb-2 block text-[13px] font-medium text-[#424245]">
            订单号
          </label>
          <input
            id="order-number"
            value={orderNumber}
            onChange={event => setOrderNumber(event.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            maxLength={64}
            placeholder="请输入订单号"
            className="h-13 w-full rounded-2xl border border-black/[0.12] bg-[#fbfbfd] px-4 py-3.5 text-center text-[17px] font-semibold tracking-[0.12em] text-[#1d1d1f] outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-[#a1a1a6] focus:border-[#0071e3] focus:bg-white focus:ring-4 focus:ring-[#0071e3]/10"
          />

          <div className="min-h-11 pt-2" aria-live="polite">
            {error && (
              <p className="text-center text-[13px] leading-5 text-[#c9342f]">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!orderNumber.trim() || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0071e3] px-5 py-3.5 text-[16px] font-semibold text-white shadow-[0_8px_24px_rgba(0,113,227,0.2)] transition hover:bg-[#0068d1] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          >
            {submitting ? '正在验证…' : '验证订单并进入面签'}
            {!submitting && <HiOutlineArrowRight className="h-5 w-5" aria-hidden="true" />}
          </button>
        </form>

        <div className="mt-7 flex items-center justify-center gap-1.5 text-[12px] text-[#8e8e93]">
          <HiOutlineShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>报告成功展示后，订单次数才会扣减 1 次</span>
        </div>

        <a href="/" className="mt-4 block text-center text-[13px] font-medium text-[#6e6e73] transition hover:text-[#1d1d1f]">
          暂不面签，返回浏览网站
        </a>
      </motion.section>
    </main>
  )
}
