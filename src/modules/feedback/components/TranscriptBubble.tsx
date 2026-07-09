import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { QAPair } from '../types'
import CoachFeedback from './CoachFeedback'

// ========================================
// 单轮问答气泡
// 展示：录音回放条 + 问答对话 + 展开教练点评
// ========================================

function AudioBar({ duration }: { duration: number }) {
  const mins = Math.floor(duration / 60)
  const secs = Math.floor(duration % 60)
  const time = `${mins}:${secs.toString().padStart(2, '0')}`

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 w-fit">
      {/* 播放按钮（占位 — 第二阶段接入真实音频后替换为真实播放） */}
      <button
        className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center
          hover:bg-blue-600 transition-colors flex-shrink-0"
        title="播放录音"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      </button>

      {/* 波形示意条 */}
      <div className="flex items-end gap-[1px] h-5">
        {Array.from({ length: 20 }, () => Math.random() * 0.7 + 0.3).map((h, i) => (
          <div
            key={i}
            className="w-[2px] bg-blue-400/60 rounded-full"
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>

      {/* 时长 */}
      <span className="text-[11px] text-slate-400 font-mono tabular-nums flex-shrink-0">{time}</span>
    </div>
  )
}

export default function TranscriptBubble({ qa }: { qa: QAPair }) {
  const [showFeedback, setShowFeedback] = useState(false)
  const { voice } = qa.feedback

  return (
    <div className="group">
      {/* 时间戳 + 录音条 */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-5 h-[1px] bg-slate-200" />
        <span className="text-[11px] text-slate-400 font-medium tracking-wider">
          {qa.timestamp}
        </span>
        {/* 录音回放条 */}
        <AudioBar duration={voice.duration} />
      </div>

      {/* 面签官提问 */}
      <div className="flex gap-3 mb-3">
        <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-white text-[11px] font-bold">官</span>
        </div>
        <div className="flex-1">
          <p className="text-[14px] text-slate-800 font-medium leading-relaxed bg-blue-50/60 rounded-xl rounded-tl-sm px-4 py-2.5">
            {qa.question}
          </p>
        </div>
      </div>

      {/* 用户回答 */}
      <div className="flex gap-3 mb-1">
        <div className="flex-1 ml-10">
          <p className="text-[14px] text-slate-600 leading-relaxed bg-white border border-slate-200 rounded-xl rounded-tl-sm px-4 py-2.5">
            {qa.answer}
          </p>
        </div>
        <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-slate-500 text-[11px] font-bold">你</span>
        </div>
      </div>

      {/* 展开教练点评按钮 */}
      <div className="ml-10">
        <button
          onClick={() => setShowFeedback(!showFeedback)}
          className="text-[12px] font-medium text-slate-400 hover:text-blue-500
            transition-colors duration-200 flex items-center gap-1.5 py-1"
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 ${showFeedback ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {showFeedback ? '收起教练点评' : '查看教练点评'}
        </button>

        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0, 1] }}
              className="overflow-hidden"
            >
              <CoachFeedback feedback={qa.feedback} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
