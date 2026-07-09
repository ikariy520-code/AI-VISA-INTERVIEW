import { motion } from 'framer-motion'
import type { InterviewSession } from '../types'
import TranscriptBubble from './TranscriptBubble'

// ========================================
// Session 详情
// 会话元信息 + 完整对话记录 + 逐条反馈
// ========================================

function overallLabel(score: number) {
  if (score >= 4) return { text: '表现优秀', color: 'text-emerald-600 bg-emerald-50' }
  if (score >= 3) return { text: '仍需练习', color: 'text-amber-600 bg-amber-50' }
  return { text: '需要大幅提升', color: 'text-red-600 bg-red-50' }
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
      <div className="px-8 pt-8 pb-6 border-b border-slate-100">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-[22px] font-semibold text-slate-900 mb-1.5">
              {session.title}
            </h1>
            <div className="flex items-center gap-3 text-[13px] text-slate-400 font-normal">
              <span>{session.date}</span>
              <span className="text-slate-300">·</span>
              <span>{session.time}</span>
              <span className="text-slate-300">·</span>
              <span>时长 {session.duration}</span>
              <span className="text-slate-300">·</span>
              <span>{session.transcript.length} 轮问答</span>
            </div>
          </div>
          {/* 综合评分 */}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[14px] font-bold ${label.color}`}>
            {session.overallScore.toFixed(1)} / 5.0
          </div>
        </div>
      </div>

      {/* 对话记录 */}
      <div className="px-8 py-6 space-y-8 max-w-3xl">
        {session.transcript.map((qa, i) => (
          <TranscriptBubble key={qa.id} qa={qa} />
        ))}
      </div>

      {/* 底部留白 */}
      <div className="h-20" />
    </motion.div>
  )
}
