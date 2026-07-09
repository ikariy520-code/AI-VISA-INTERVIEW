import { motion } from 'framer-motion'
import type { InterviewStatus } from '../types'

// ========================================
// 语音控制栏
// 麦克风按钮 + 状态文字 + 计时器
// 后续接入 Web Speech API / 真实录音
// ========================================

interface Props {
  status: InterviewStatus
  elapsed: string        // "02:34"
  onStartSpeak: () => void
  onStopSpeak: () => void
  onEndInterview: () => void
}

const statusText: Record<InterviewStatus, string> = {
  'idle': '等待面签官发言...',
  'officer-speaking': 'AI 面签官正在说话...',
  'user-speaking': '正在录音中...',
  'processing': 'AI 正在思考...',
}

export default function VoiceControls({
  status, elapsed, onStartSpeak, onStopSpeak, onEndInterview,
}: Props) {
  const isUserTurn = status === 'user-speaking'
  const isOfficerTurn = status === 'officer-speaking' || status === 'idle'
  const isProcessing = status === 'processing'

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-white border-t border-slate-200">
      {/* 计时器 */}
      <div className="flex items-center gap-1.5 min-w-[60px]">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        <span className="text-[13px] font-mono text-slate-600 tabular-nums font-medium">
          {elapsed}
        </span>
      </div>

      {/* 状态 */}
      <span className="flex-1 text-center text-[12px] text-slate-400 font-medium">
        {statusText[status]}
      </span>

      {/* 麦克风按钮 */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={isUserTurn ? onStopSpeak : onStartSpeak}
        disabled={isOfficerTurn || isProcessing}
        className={`relative w-12 h-12 rounded-full flex items-center justify-center
          transition-all duration-300 ${
            isUserTurn
              ? 'bg-red-500 shadow-lg shadow-red-500/30 scale-110'
              : isProcessing
              ? 'bg-slate-300 cursor-not-allowed'
              : 'bg-blue-500 shadow-md shadow-blue-500/20 hover:bg-blue-600'
          }`}
      >
        {/* 录音时的脉冲环 */}
        {isUserTurn && (
          <motion.span
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="absolute inset-0 rounded-full border-2 border-red-400"
          />
        )}

        {isProcessing ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="animate-spin">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="white" strokeWidth="2" />
            <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" />
            <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" />
          </svg>
        )}
      </motion.button>

      {/* 结束按钮 */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onEndInterview}
        className="px-3 py-2 rounded-lg text-[11px] font-medium text-slate-400
          hover:text-red-500 hover:bg-red-50 transition-all duration-200"
      >
        结束
      </motion.button>
    </div>
  )
}
