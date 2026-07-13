import { motion } from 'framer-motion'
import {
  HiMiniStop,
  HiOutlineArrowPath,
  HiOutlineClock,
  HiOutlineMicrophone,
  HiOutlineStopCircle,
} from 'react-icons/hi2'
import type { InterviewStatus } from '../types'

interface Props {
  status: InterviewStatus
  elapsed: string
  recordingDuration: string
  partialTranscript: string
  error: string | null
  isSupported: boolean
  onMicPress: () => void
  onEndInterview: () => void
}

const statusLabel: Record<InterviewStatus, { text: string; sub: string }> = {
  idle: { text: '轮到你回答', sub: '想清楚第一句，再开始表达' },
  'user-speaking': { text: '正在记录回答', sub: '说完后再次点击即可提交' },
  processing: { text: '正在理解你的回答', sub: '下一次追问正在生成' },
  'officer-speaking': { text: '先听完面签官的问题', sub: '问题结束后麦克风会自动就绪' },
}

const containsCjk = (value: string) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value)

export default function VoiceControls({
  status,
  elapsed,
  recordingDuration,
  partialTranscript,
  error,
  isSupported,
  onMicPress,
  onEndInterview,
}: Props) {
  const isUserTurn = status === 'user-speaking'
  const isProcessing = status === 'processing'
  const isIdle = status === 'idle'
  const isInteractive = isIdle || isUserTurn
  const label = statusLabel[status]

  return (
    <div className="border-t border-black/[0.07] bg-white/95 backdrop-blur-xl">
      {isUserTurn && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden px-4 pt-3 sm:px-6">
          <div className="rounded-2xl border border-red-200/60 bg-[#fff7f6] px-4 py-2.5 text-center">
            <p className="text-[12px] leading-5 text-[#6e6e73]">
              <span lang="en" translate="no">
                {containsCjk(partialTranscript)
                  ? 'Please answer in English.'
                  : partialTranscript || (isSupported ? 'Listening to your answer…' : 'Speech recognition is not supported in this browser.')}
              </span>
            </p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <p className={`truncate text-[12px] font-semibold ${isUserTurn ? 'text-[#c9342f]' : isIdle ? 'text-[#0071e3]' : 'text-[#6e6e73]'}`}>{label.text}</p>
          <p className="mt-0.5 hidden truncate text-[10px] text-[#a1a1a6] sm:block">{label.sub}</p>
          {error && <p className="mt-1 truncate text-[10px] text-[#c9342f]">{error}</p>}
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: isInteractive ? 0.92 : 1 }}
          onClick={isInteractive ? onMicPress : undefined}
          disabled={!isInteractive}
          className={`relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl transition-all duration-300 ${
            isUserTurn
              ? 'scale-105 bg-[#c9342f] shadow-red-500/25'
              : isIdle
                ? 'bg-[#0071e3] shadow-blue-500/25 hover:scale-[1.03] hover:bg-[#0062c3]'
                : 'cursor-not-allowed bg-[#d2d2d7] shadow-black/5'
          }`}
          aria-label={isUserTurn ? '停止并提交回答' : '开始回答'}
        >
          {isUserTurn && (
            <motion.span
              animate={{ scale: [1, 1.45, 1], opacity: [0.36, 0, 0.36] }}
              transition={{ repeat: Infinity, duration: 1.7 }}
              className="absolute inset-0 rounded-full border-2 border-[#c9342f]"
            />
          )}
          {isProcessing ? (
            <HiOutlineArrowPath className="h-6 w-6 animate-spin" />
          ) : isUserTurn ? (
            <HiMiniStop className="h-5 w-5" />
          ) : (
            <HiOutlineMicrophone className="h-6 w-6" />
          )}
        </motion.button>

        <div className="flex items-center justify-end gap-2">
          <div className="hidden items-center gap-1.5 rounded-full bg-[#f5f5f7] px-3 py-2 text-[11px] font-semibold text-[#6e6e73] sm:flex">
            <HiOutlineClock className="h-3.5 w-3.5" />
            <span className="tabular-nums">{isUserTurn ? recordingDuration : elapsed}</span>
          </div>
          <button
            type="button"
            onClick={onEndInterview}
            disabled={isProcessing}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold text-[#86868b] transition hover:bg-[#fff0ef] hover:text-[#c9342f] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <HiOutlineStopCircle className="h-4 w-4" />
            <span className="hidden sm:inline">结束</span>
          </button>
        </div>
      </div>
    </div>
  )
}
