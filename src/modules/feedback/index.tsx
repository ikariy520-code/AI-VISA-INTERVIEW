import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineDocumentArrowDown,
  HiOutlineLockClosed,
} from 'react-icons/hi2'
import type { InterviewSession } from './types'
import { normalizeInterviewSession } from './normalizeSession'
import FeedbackReportView from './components/FeedbackReportView'
import { buildFeedbackReport, sampleFeedbackReport } from './reportViewModel'

export default function FeedbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const rawSession = (location.state as { session?: InterviewSession } | null)?.session ?? null
  const session = useMemo(() => normalizeInterviewSession(rawSession), [rawSession])
  const report = useMemo(() => session ? buildFeedbackReport(session) : sampleFeedbackReport, [session])

  return (
    <div className="app-page">
      <header className="app-topbar print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <button onClick={() => navigate('/')} className="app-icon-button" aria-label="返回首页">
            <HiOutlineArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-[#1d1d1f]">面签反馈报告</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#86868b]">Review · Improve · Repeat</p>
          </div>
          <button onClick={() => window.print()} className="app-icon-button" aria-label="保存为 PDF">
            <HiOutlineDocumentArrowDown className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <div id="feedback-report" className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="print:hidden mb-5 rounded-[20px] border border-emerald-200/70 bg-[#eaf8f2] px-4 py-4 sm:flex sm:items-center sm:justify-between sm:px-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[13px] bg-white text-[#158f65] shadow-sm"><HiOutlineLockClosed className="h-[17px] w-[17px]" /></span>
            <div>
              <p className="text-[13px] font-semibold text-[#146c50]">只在当前页面保留</p>
              <p className="mt-1 text-[12px] leading-5 text-[#347861]">不会写入历史记录或服务器。刷新、关闭页面后无法找回，请离开前保存。</p>
            </div>
          </div>
          <button onClick={() => window.print()} className="app-button-secondary mt-3 w-full bg-white sm:mt-0 sm:w-auto">
            <HiOutlineDocumentArrowDown className="h-4 w-4" /> 保存为 PDF
          </button>
        </motion.div>

        <FeedbackReportView report={report} />

        <div className="print:hidden mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button onClick={() => window.print()} className="app-button-primary"><HiOutlineDocumentArrowDown className="h-4 w-4" /> 保存为 PDF</button>
          <button onClick={() => navigate('/practice', { replace: true })} className="app-button-secondary">
            <HiOutlineArrowPath className="h-4 w-4" /> 再练一次
          </button>
        </div>
      </div>
    </div>
  )
}
