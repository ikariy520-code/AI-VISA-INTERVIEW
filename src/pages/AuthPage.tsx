import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../auth/AuthContext'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

const copy: Record<AuthMode, { title: string; subtitle: string; button: string }> = {
  login: { title: '欢迎回来', subtitle: '登录后继续你的面签练习与个人记录', button: '登录' },
  register: { title: '创建账号', subtitle: '保存每一次练习，在任意设备继续查看', button: '注册' },
  forgot: { title: '找回密码', subtitle: '我们会向你的邮箱发送重置链接', button: '发送重置邮件' },
  reset: { title: '设置新密码', subtitle: '请输入一组新的安全密码', button: '更新密码' },
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { user, configured, signIn, signUp, sendPasswordReset, updatePassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const destination = ((location.state as { from?: string } | null)?.from) || '/'

  if (user && mode !== 'reset') return <Navigate to={destination} replace />

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!configured) {
      setError('登录服务尚未完成配置。请先连接 Supabase 项目。')
      return
    }
    if ((mode === 'register' || mode === 'reset') && password.length < 8) {
      setError('密码至少需要 8 个字符。')
      return
    }
    if ((mode === 'register' || mode === 'reset') && password !== confirmPassword) {
      setError('两次输入的密码不一致。')
      return
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        navigate(destination, { replace: true })
      } else if (mode === 'register') {
        const result = await signUp(email, password)
        if (result.needsEmailConfirmation) {
          setMessage('注册成功，请打开邮箱完成验证后再登录。')
        } else {
          navigate(destination, { replace: true })
        }
      } else if (mode === 'forgot') {
        await sendPasswordReset(email)
        setMessage('重置邮件已发送，请检查邮箱。')
      } else {
        await updatePassword(password)
        setMessage('密码已更新，现在可以继续使用。')
        setTimeout(() => navigate('/', { replace: true }), 900)
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : '操作失败，请稍后再试。'
      setError(raw === 'Invalid login credentials' ? '邮箱或密码不正确。' : raw)
    } finally {
      setLoading(false)
    }
  }

  const info = copy[mode]
  const showEmail = mode !== 'reset'
  const showPassword = mode !== 'forgot'

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-5 py-10 flex items-center justify-center">
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/" className="mb-7 inline-flex items-center gap-2 text-[13px] text-slate-500 hover:text-slate-800">
          <span>←</span><span>返回首页</span>
        </Link>
        <div className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-9 shadow-xl shadow-slate-200/40">
          <div className="mb-7">
            <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center mb-5 shadow-sm shadow-blue-500/20">AI</div>
            <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">{info.title}</h1>
            <p className="mt-2 text-[14px] leading-6 text-slate-500">{info.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {showEmail && (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-600">邮箱</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-[14px] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" placeholder="name@example.com" />
              </label>
            )}
            {showPassword && (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-600">{mode === 'reset' ? '新密码' : '密码'}</span>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-[14px] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" placeholder="至少 8 个字符" />
              </label>
            )}
            {(mode === 'register' || mode === 'reset') && (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-600">确认密码</span>
                <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-[14px] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" placeholder="再次输入密码" />
              </label>
            )}
            {mode === 'login' && <div className="text-right"><Link to="/forgot-password" className="text-[12px] text-blue-600 hover:text-blue-700">忘记密码？</Link></div>}
            {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-[12px] text-red-600">{error}</p>}
            {message && <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-[12px] text-emerald-700">{message}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-500 px-4 py-3 text-[14px] font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-600 disabled:opacity-60">
              {loading ? '请稍候…' : info.button}
            </button>
          </form>

          {mode === 'login' && <p className="mt-6 text-center text-[13px] text-slate-500">还没有账号？ <Link to="/register" state={{ from: destination }} className="font-medium text-blue-600">立即注册</Link></p>}
          {mode === 'register' && <p className="mt-6 text-center text-[13px] text-slate-500">已经有账号？ <Link to="/login" state={{ from: destination }} className="font-medium text-blue-600">返回登录</Link></p>}
          {mode === 'forgot' && <p className="mt-6 text-center"><Link to="/login" className="text-[13px] font-medium text-blue-600">返回登录</Link></p>}
        </div>
      </motion.div>
    </div>
  )
}
