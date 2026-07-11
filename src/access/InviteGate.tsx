import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAccess } from './AccessContext'

interface InviteGateProps {
  children?: React.ReactNode
  title?: string
  description?: string
  onUnlocked?: () => void
}

export default function InviteGate({
  children,
  title = '输入邀请码，解锁 AI 面签',
  description = '输入购买后收到的邀请码，即可在当前浏览器使用 AI 面签并查看本次反馈总结。',
  onUnlocked,
}: InviteGateProps) {
  const { hasAccess, loading, redeemInviteCode } = useAccess()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (hasAccess) return <>{children}</>

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await redeemInviteCode(code)
      onUnlocked?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '兑换失败，请稍后再试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto my-8 bg-white border border-slate-200 rounded-3xl p-7 sm:p-9 shadow-xl shadow-slate-200/40"
    >
      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          <path d="M12 15v2" />
        </svg>
      </div>
      <h2 className="text-[22px] font-semibold text-slate-900 tracking-tight">{title}</h2>
      <p className="mt-2 text-[14px] leading-6 text-slate-500">{description}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <label className="block text-[12px] font-medium text-slate-600" htmlFor="invite-code">
          邀请码
        </label>
        <input
          id="invite-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoComplete="one-time-code"
          placeholder="请输入邀请码"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] tracking-[0.08em] text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
        />
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting || code.trim().length < 6}
          className="w-full rounded-xl bg-blue-500 px-4 py-3 text-[14px] font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? '正在验证…' : '验证并解锁'}
        </button>
      </form>
      <p className="mt-4 text-center text-[11px] text-slate-400">邀请码会激活当前浏览器；更换设备或清除 Cookie 可能需要重新激活。</p>
    </motion.section>
  )
}
