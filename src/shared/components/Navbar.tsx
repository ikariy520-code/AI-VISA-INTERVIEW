import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useAccess } from '../../access/AccessContext'

// ========================================
// 极简导航 — 中英品牌标识
// ========================================

export default function Navbar() {
  const { user, loading, signOut } = useAuth()
  const { hasAccess, loading: accessLoading } = useAccess()

  return (
    <motion.nav
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0, 1] }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4"
    >
      <Link to="/" className="flex items-center gap-2.5 group">
        {/* Logo mark */}
        <div className="w-8 h-8 rounded-[10px] bg-[#3B82F6] flex items-center justify-center
          shadow-sm shadow-blue-500/20 transition-shadow duration-300
          group-hover:shadow-md group-hover:shadow-blue-500/25">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
        {/* 品牌名 — 中英结合 */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold text-slate-900 tracking-tight">
            面签AI
          </span>
          <span className="text-[10px] font-medium text-slate-400 tracking-[0.08em] uppercase">
            Coach
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        {!loading && user ? (
          <>
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 shadow-sm">
              <span className={`w-1.5 h-1.5 rounded-full ${accessLoading ? 'bg-slate-300' : hasAccess ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <span className="max-w-[160px] truncate text-[11px] text-slate-500">{user.email}</span>
              <span className="text-[10px] font-medium text-slate-400">{hasAccess ? '已解锁' : '待解锁'}</span>
            </div>
            <button
              onClick={() => void signOut()}
              className="rounded-full border border-slate-200 bg-white/80 px-3.5 py-2 text-[12px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              退出
            </button>
          </>
        ) : !loading ? (
          <>
            <Link to="/login" className="rounded-full px-3.5 py-2 text-[12px] font-medium text-slate-600 transition hover:text-slate-900">登录</Link>
            <Link to="/register" className="rounded-full bg-blue-500 px-4 py-2 text-[12px] font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-600">注册</Link>
          </>
        ) : null}
      </div>
    </motion.nav>
  )
}
