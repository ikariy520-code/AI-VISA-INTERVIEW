import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HiOutlineChevronDown,
  HiOutlineClock,
  HiOutlineUser,
  HiOutlineUserCircle,
} from 'react-icons/hi2'
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

  return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[10px] font-semibold text-[#86868b]"><HiOutlineClock className="h-3.5 w-3.5" />回答 {time}</span>
}

export default function TranscriptBubble({ qa }: { qa: QAPair }) {
  const [showFeedback, setShowFeedback] = useState(false)
  const { voice } = qa.feedback

  return (
    <div className="group rounded-[22px] border border-black/[0.06] bg-[#fbfbfd] p-4 sm:p-5">
      {/* 时间戳 + 录音条 */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a1a1a6]">
          {qa.timestamp}
        </span>
        {/* 录音回放条 */}
        <AudioBar duration={voice.duration} />
      </div>

      {/* 面签官提问 */}
      <div className="mb-3 flex gap-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[13px] bg-[#eaf4ff] text-[#0071e3]">
          <HiOutlineUserCircle className="h-[18px] w-[18px]" />
        </div>
        <div className="flex-1">
          <p className="rounded-[18px] rounded-tl-md bg-white px-4 py-3 text-[14px] font-medium leading-6 text-[#1d1d1f] ring-1 ring-black/[0.06]">
            {qa.question}
          </p>
        </div>
      </div>

      {/* 用户回答 */}
      <div className="mb-1 flex gap-3">
        <div className="ml-7 flex-1 sm:ml-12">
          <p className="rounded-[18px] rounded-tr-md bg-[#1d1d1f] px-4 py-3 text-[14px] leading-6 text-white">
            {qa.answer}
          </p>
        </div>
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[13px] bg-[#eef0f3] text-[#6e6e73]">
          <HiOutlineUser className="h-[18px] w-[18px]" />
        </div>
      </div>

      {/* 展开教练点评按钮 */}
      <div className="ml-7 sm:ml-12">
        <button
          onClick={() => setShowFeedback(!showFeedback)}
          className="flex items-center gap-1.5 py-2 text-[12px] font-semibold text-[#86868b] transition-colors duration-200 hover:text-[#0071e3]"
        >
          <HiOutlineChevronDown className={`h-4 w-4 transition-transform duration-200 ${showFeedback ? 'rotate-180' : ''}`} />
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
