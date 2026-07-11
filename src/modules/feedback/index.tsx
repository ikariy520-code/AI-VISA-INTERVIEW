import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { InterviewSession } from './types'
import SessionDetail from './components/SessionDetail'
import InviteGate from '../../access/InviteGate'
import { clearActiveInterviewSession } from '../../access/AccessContext'

export default function FeedbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const session = (location.state as { session?: InterviewSession } | null)?.session ?? null

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="print:hidden sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <span>←</span><span>返回首页</span>
        </button>
        <span className="text-[13px] font-semibold text-slate-800">本次面签反馈</span>
        <div className="w-20" />
      </header>

      <InviteGate
        title="输入邀请码查看反馈"
        description="反馈总结只对已激活邀请码的浏览器开放。本次报告不会长期保存，请及时下载或截图。"
      >
        {session ? (
          <div id="feedback-report" className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="print:hidden mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 sm:flex sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[13px] font-semibold text-amber-800">请立即保存本次反馈</p>
                <p className="mt-1 text-[12px] leading-5 text-amber-700">网站不会保存个人面签记录。建议点击下载 PDF，或直接截图保存。</p>
              </div>
              <button
                onClick={() => window.print()}
                className="mt-3 w-full rounded-xl bg-amber-600 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-amber-700 sm:mt-0 sm:w-auto"
              >
                下载 / 打印 PDF
              </button>
            </motion.div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
              <SessionDetail session={session} />
            </div>

            <div className="print:hidden mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button onClick={() => window.print()} className="rounded-xl bg-blue-500 px-5 py-3 text-[14px] font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-600">下载 / 打印 PDF</button>
              <button
                onClick={() => {
                  clearActiveInterviewSession()
                  navigate('/practice', { replace: true })
                }}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-[14px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
              >
                再练一次
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[70vh] items-center justify-center px-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-2xl">📄</div>
              <h1 className="text-[20px] font-semibold text-slate-900">没有可查看的本次反馈</h1>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">反馈不会保存到服务器。请完成一次面签后立即下载或截图。</p>
              <button onClick={() => navigate('/practice')} className="mt-6 rounded-xl bg-blue-500 px-5 py-3 text-[14px] font-semibold text-white hover:bg-blue-600">开始面签</button>
            </div>
          </div>
        )}
      </InviteGate>
    </div>
  )
}
