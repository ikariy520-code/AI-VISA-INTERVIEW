import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { clearInterviewRecovery, loadFeedbackSession } from '../shared/store/interviewRecovery'

export default function FeedbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { session?: InterviewSession } | null
  const [storedSession] = useState(() => loadFeedbackSession())
  const rawSession = routeState?.session ?? storedSession
  const session = useMemo(() => normalizeInterviewSession(rawSession), [rawSession])
  const [showSample, setShowSample] = useState(false)
  const report = useMemo(() => session ? buildFeedbackReport(session) : showSample ? sampleFeedbackReport : null, [session, showSample])
  const isB2 = Boolean(session && /\bB[\s-]?2\b/i.test(session.title))
  const [completionState, setCompletionState] = useState<'recording' | 'recorded' | 'error'>(session ? 'recording' : 'recorded')
  const [completionError, setCompletionError] = useState('')
  const [completionAttempt, setCompletionAttempt] = useState(0)

  const recordCompletion = useCallback(async () => {
    if (!session) return
    setCompletionState('recording')
    setCompletionError('')
    try {
      const response = await fetch('/api/auth/complete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: session.id }),
      })
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null
      if (!response.ok || payload?.allowed !== true) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : '本次面签完成状态确认失败。')
      }
      setCompletionState('recorded')
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : '本次面签完成状态确认失败。')
      setCompletionState('error')
    }
  }, [session])

  useEffect(() => {
    if (!session) return
    void recordCompletion()
  }, [completionAttempt, recordCompletion, session])

  if (!report) {
    return (
      <div className="app-page">
        <div className="flex min-h-[100dvh] items-center justify-center px-4 text-center sm:px-6">
          <div className="app-card max-w-md p-6 sm:p-10">
            <h1 className="text-[26px] font-semibold tracking-[-0.04em] text-[#1d1d1f]">本次报告不在当前页面中</h1>
            <p className="mt-3 text-[13px] leading-6 text-[#6e6e73]">报告不会长期保存。刷新或关闭页面后，本次结果无法恢复；你可以重新练习，或单独查看一份明确标注的演示报告。</p>
            <div className="mt-7 flex flex-col gap-3">
              <button onClick={() => { clearInterviewRecovery(); navigate('/practice', { replace: true }) }} className="app-button-primary">重新开始练习</button>
              <button onClick={() => setShowSample(true)} className="app-button-secondary">查看演示报告</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (session && completionState !== 'recorded') {
    return (
      <div className="app-page">
        <div className="flex min-h-[100dvh] items-center justify-center px-4 text-center sm:px-6">
          <div className="app-card max-w-md p-6 sm:p-10" role="status" aria-live="polite">
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] ${completionState === 'error' ? 'bg-[#fff1f0] text-[#c9342f]' : 'bg-[#eaf4ff] text-[#0071e3]'}`}>
              <HiOutlineArrowPath className={`h-6 w-6 ${completionState === 'recording' ? 'animate-spin' : ''}`} />
            </div>
            <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.04em] text-[#1d1d1f]">
              {completionState === 'error' ? '暂时无法确认本次完成' : '正在确认本次面签完成'}
            </h1>
            <p className="mt-3 text-[13px] leading-6 text-[#6e6e73]">
              {completionState === 'error'
                ? completionError
                : '确认成功后将扣减本订单 1 次面签权益，并立即展示本次报告。'}
            </p>
            {completionState === 'error' && (
              <button onClick={() => setCompletionAttempt(value => value + 1)} className="app-button-primary mt-7 w-full">
                <HiOutlineArrowPath className="h-4 w-4" /> 重新确认并查看报告
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-page">
      <header className="app-topbar print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
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

      <div id="feedback-report" className="mx-auto max-w-6xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:py-12">
        {session && <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="print:hidden mb-5 rounded-[20px] border border-emerald-200/70 bg-[#eaf8f2] px-4 py-4 sm:flex sm:items-center sm:justify-between sm:px-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[13px] bg-white text-[#158f65] shadow-sm"><HiOutlineLockClosed className="h-[17px] w-[17px]" /></span>
            <div>
              <p className="text-[13px] font-semibold text-[#146c50]">只在当前页面保留</p>
              <p className="mt-1 text-[12px] leading-5 text-[#347861]">本站不长期保存报告；脱敏背景和面签转写仅用于按 {isB2 ? 'B-2' : 'F-1'} 官方依据与证据规则完成本次分析。当前标签页内刷新后仍可恢复，关闭标签页后将无法找回，请离开前保存。</p>
            </div>
          </div>
          <button onClick={() => window.print()} className="app-button-secondary mt-3 w-full bg-white sm:mt-0 sm:w-auto">
            <HiOutlineDocumentArrowDown className="h-4 w-4" /> 保存为 PDF
          </button>
        </motion.div>}

        <FeedbackReportView report={report} />

        <div className="print:hidden mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button onClick={() => window.print()} className="app-button-primary"><HiOutlineDocumentArrowDown className="h-4 w-4" /> 保存为 PDF</button>
          <button onClick={() => { clearInterviewRecovery(); navigate('/practice', { replace: true }) }} className="app-button-secondary">
            <HiOutlineArrowPath className="h-4 w-4" /> 再练一次
          </button>
        </div>
      </div>
    </div>
  )
}
