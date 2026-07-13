import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineDocumentArrowDown,
  HiOutlineDocumentChartBar,
  HiOutlineLockClosed,
} from 'react-icons/hi2'
import type { InterviewSession } from './types'
import SessionDetail from './components/SessionDetail'

export default function FeedbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const session = (location.state as { session?: InterviewSession } | null)?.session ?? null

  return (
    <div className="app-page">
      <header className="app-topbar print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <button onClick={() => navigate('/')} className="app-icon-button" aria-label="返回首页">
            <HiOutlineArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-[#1d1d1f]">本次面签反馈</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#86868b]">Review & improve</p>
          </div>
          <div className="w-10" />
        </div>
      </header>

      {session ? (
          <div id="feedback-report" className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="print:hidden mb-4 rounded-[20px] border border-emerald-200/70 bg-[#eaf8f2] px-4 py-4 sm:flex sm:items-center sm:justify-between sm:px-5"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[13px] bg-white text-[#158f65] shadow-sm"><HiOutlineLockClosed className="h-[17px] w-[17px]" /></span>
                <div>
                  <p className="text-[13px] font-semibold text-[#146c50]">这份反馈只属于本次练习</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#347861]">网站不会长期保存面签记录，离开前请下载 PDF 或截图留存。</p>
                </div>
              </div>
              <button
                onClick={() => window.print()}
                className="app-button-secondary mt-3 w-full bg-white sm:mt-0 sm:w-auto"
              >
                <HiOutlineDocumentArrowDown className="h-4 w-4" /> 下载 PDF
              </button>
            </motion.div>

            <div className="app-card overflow-hidden print:border-0 print:shadow-none">
              <SessionDetail session={session} />
            </div>

            <div className="print:hidden mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button onClick={() => window.print()} className="app-button-primary"><HiOutlineDocumentArrowDown className="h-4 w-4" /> 下载 / 打印 PDF</button>
              <button
                onClick={() => navigate('/practice', { replace: true })}
                className="app-button-secondary"
              >
                <HiOutlineArrowPath className="h-4 w-4" /> 再练一次
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[70vh] items-center justify-center px-6 text-center">
            <div className="max-w-md">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#eaf4ff] text-[#0071e3]"><HiOutlineDocumentChartBar className="h-7 w-7" /></div>
              <h1 className="text-[26px] font-semibold tracking-[-0.04em] text-[#1d1d1f]">完成一次练习，反馈才会出现。</h1>
              <p className="mt-3 text-[13px] leading-6 text-[#6e6e73]">我们不会保存历史记录。面签结束后，请在当前页面立即查看并下载本次总结。</p>
              <button onClick={() => navigate('/voice')} className="app-button-primary mt-7">开始面签</button>
            </div>
          </div>
        )}
    </div>
  )
}
