import { motion } from 'framer-motion'
import type { InterviewStatus } from '../types'

// ========================================
// 语音控制栏
//
// 基于 InterviewStatus 切换状态：
//   idle              → 蓝色麦克风 + "点击麦克风开始回答"
//   user-speaking     → 红色麦克风（录音中）+ 脉冲动画 + 时长
//   processing        → 灰色转圈 + "AI 正在思考..."
//   officer-speaking  → 灰色禁用 + "等待面签官发言..."
//
// 录音流程：点击 → 说话 → 再次点击 → 停止 & 自动提交
// ========================================

interface Props {
  status: InterviewStatus
  elapsed: string                       // "02:34" — 总面试计时
  recordingDuration: string             // "00:05" — 当前录音时长
  partialTranscript: string             // 实时转写文字
  error: string | null
  isSupported: boolean
  onMicPress: () => void
  onEndInterview: () => void
}

const statusLabel: Record<InterviewStatus, { text: string; sub: string }> = {
  'idle':               { text: '点击麦克风开始回答',  sub: '说完后再次点击停止并提交' },
  'user-speaking':      { text: '正在录音...',          sub: '点击停止提交回答' },
  'processing':         { text: 'AI 正在思考...',       sub: '分析你的回答中' },
  'officer-speaking':   { text: '等待面签官发言...',    sub: '请先听完面签官的问题' },
}

export default function VoiceControls({
  status, elapsed, recordingDuration,
  partialTranscript, error, isSupported,
  onMicPress, onEndInterview,
}: Props) {
  const isUserTurn = status === 'user-speaking'
  const isProcessing = status === 'processing'
  const isOfficerTurn = status === 'officer-speaking'
  const isIdle = status === 'idle'
  const isInteractive = isIdle || isUserTurn

  const label = statusLabel[status]

  return (
    <div className="border-t border-slate-200 bg-white">
      {/* ---- 状态提示区 ---- */}
      <div className="px-4 pt-3 pb-1 text-center">
        <p className={`text-[13px] font-semibold transition-colors duration-300
          ${isUserTurn ? 'text-red-500' : isIdle ? 'text-blue-600' : 'text-slate-500'}`}
        >
          {label.text}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {label.sub}
        </p>

        {/* 录音时长 */}
        {isUserTurn && (
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[15px] font-mono font-semibold text-red-500 tabular-nums">
              {recordingDuration}
            </span>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <p className="text-[11px] text-red-400 mt-1">{error}</p>
        )}
      </div>

      {/* ---- 实时转写预览 ---- */}
      {isUserTurn && (
        <div className="px-4 pb-2">
          <div className="min-h-[28px] px-3 py-1.5 rounded-lg bg-red-50/60 border border-red-100
            text-center transition-all duration-200">
            {partialTranscript ? (
              <p className="text-[13px] text-slate-600 leading-relaxed">
                {partialTranscript}
              </p>
            ) : (
              <p className="text-[12px] text-slate-400 italic">
                {isSupported ? '正在听取你的回答...' : '浏览器不支持语音识别，请使用 Chrome'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---- 控制栏 ---- */}
      <div className="flex items-center gap-4 px-4 pb-4 pt-1">
        {/* 面试计时器 */}
        <div className="flex items-center gap-1.5 min-w-[60px]">
          <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300
            ${isUserTurn ? 'bg-red-400 animate-pulse' : isProcessing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}
          />
          <span className="text-[13px] font-mono text-slate-600 tabular-nums font-medium">
            {elapsed}
          </span>
        </div>

        {/* 中央：麦克风按钮 */}
        <div className="flex-1 flex justify-center">
          <motion.button
            whileTap={{ scale: isInteractive ? 0.9 : 1 }}
            onClick={isInteractive ? onMicPress : undefined}
            disabled={!isInteractive}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center
              transition-all duration-300 shadow-lg
              ${isUserTurn
                ? 'bg-red-500 shadow-red-500/30 scale-110 cursor-pointer'
                : isIdle
                  ? 'bg-blue-500 shadow-blue-500/30 hover:bg-blue-600 hover:scale-105 cursor-pointer'
                  : 'bg-slate-300 shadow-slate-300/20 cursor-not-allowed'
              }`}
          >
            {/* 录音时的双层脉冲环 */}
            {isUserTurn && (
              <>
                <motion.span
                  animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.8 }}
                  className="absolute inset-0 rounded-full border-2 border-red-400"
                />
                <motion.span
                  animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: 0.3 }}
                  className="absolute inset-0 rounded-full border border-red-300"
                />
              </>
            )}

            {/* 等待时的呼吸环 */}
            {isIdle && (
              <motion.span
                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.1, 0.3] }}
                transition={{ repeat: Infinity, duration: 2.5 }}
                className="absolute inset-0 rounded-full border-2 border-blue-300"
              />
            )}

            {/* 图标 */}
            {isProcessing ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            ) : isUserTurn ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <rect x="9" y="4" width="6" height="16" rx="2" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="white" strokeWidth="2" />
                <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" />
                <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" />
              </svg>
            )}
          </motion.button>
        </div>

        {/* 结束按钮 */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onEndInterview}
          disabled={isProcessing}
          className="px-3 py-2 rounded-lg text-[11px] font-medium text-slate-400
            hover:text-red-500 hover:bg-red-50 transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          结束
        </motion.button>
      </div>
    </div>
  )
}
