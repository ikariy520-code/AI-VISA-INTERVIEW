import { motion } from 'framer-motion'
import { HiOutlineCalendarDays, HiOutlineClock, HiOutlineQuestionMarkCircle } from 'react-icons/hi2'
import type { InterviewSession } from '../types'
import TranscriptBubble from './TranscriptBubble'

// ========================================
// Session 详情
// 会话元信息 + 完整对话记录 + 逐条反馈
// ========================================

function overallLabel(score: number | null) {
  if (score === null) return { text: '等待分析', color: 'text-[#6e6e73] bg-[#f5f5f7]', ring: 'ring-black/10' }
  if (score >= 4) return { text: '表现稳定', color: 'text-[#147a58] bg-[#eaf8f2]', ring: 'ring-emerald-200/70' }
  if (score >= 3) return { text: '继续巩固', color: 'text-[#8a5818] bg-[#fff6e6]', ring: 'ring-amber-200/70' }
  return { text: '优先加强', color: 'text-[#b53a34] bg-[#fff0ef]', ring: 'ring-red-200/70' }
}

export default function SessionDetail({ session }: { session: InterviewSession }) {
  const label = overallLabel(session.overallScore)

  return (
    <motion.div
      key={session.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0, 1] }}
      className="flex-1 overflow-y-auto"
    >
      {/* 顶部信息卡 */}
      <div className="border-b border-black/[0.06] bg-[#fbfbfd] px-5 py-7 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#86868b]">Interview report</p>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[#1d1d1f] sm:text-[30px]">
              {session.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-medium text-[#86868b]">
              <span className="inline-flex items-center gap-1.5"><HiOutlineCalendarDays className="h-4 w-4" />{session.date} · {session.time}</span>
              <span className="inline-flex items-center gap-1.5"><HiOutlineClock className="h-4 w-4" />{session.duration}</span>
              <span className="inline-flex items-center gap-1.5"><HiOutlineQuestionMarkCircle className="h-4 w-4" />{session.transcript.length} 轮问答</span>
            </div>
          </div>
          {/* 综合评分 */}
          <div className={`flex min-w-[132px] items-center justify-between gap-4 rounded-[20px] px-4 py-3 ring-1 ${label.color} ${label.ring}`}>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-75">综合表现</p><p className="mt-1 text-[12px] font-semibold">{label.text}</p></div>
            <p className="text-[28px] font-semibold tracking-[-0.05em]">{session.overallScore?.toFixed(1) ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* 对话记录 */}
      <div className="mx-auto max-w-4xl space-y-10 px-5 py-7 sm:px-8 sm:py-9">
        {session.transcript.map((qa, i) => (
          <TranscriptBubble key={qa.id} qa={qa} />
        ))}
      </div>

      {/* 底部留白 */}
      <div className="h-20" />
    </motion.div>
  )
}
