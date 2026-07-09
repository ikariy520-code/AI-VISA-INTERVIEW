import { motion } from 'framer-motion'
import type { OfficerEmotion } from '../types'

// ========================================
// AI 面签官头像
// 根据情绪变化颜色、表情、动画
// ========================================

interface Props {
  emotion: OfficerEmotion
  isSpeaking: boolean
  size?: 'sm' | 'md' | 'lg'
}

const emotionConfig: Record<OfficerEmotion, {
  bg: string
  ring: string
  shadow: string
  label: string
  expression: string    // emoji 表情
}> = {
  neutral:     { bg: 'from-slate-500 to-slate-600', ring: 'ring-slate-300', shadow: 'shadow-slate-500/20', label: '', expression: '🫡' },
  friendly:    { bg: 'from-emerald-500 to-emerald-600', ring: 'ring-emerald-300', shadow: 'shadow-emerald-500/20', label: '友好', expression: '😊' },
  stern:       { bg: 'from-amber-500 to-amber-600', ring: 'ring-amber-300', shadow: 'shadow-amber-500/20', label: '严肃', expression: '🤨' },
  curious:     { bg: 'from-violet-500 to-violet-600', ring: 'ring-violet-300', shadow: 'shadow-violet-500/20', label: '追问', expression: '🤔' },
  reassuring:  { bg: 'from-blue-500 to-blue-600', ring: 'ring-blue-300', shadow: 'shadow-blue-500/20', label: '安抚', expression: '🙂' },
  thoughtful:  { bg: 'from-indigo-500 to-indigo-600', ring: 'ring-indigo-300', shadow: 'shadow-indigo-500/20', label: '思考', expression: '🧐' },
}

const sizeConfig = {
  sm: { container: 'w-10 h-10 rounded-xl', icon: 'text-base', badge: 'text-[9px] px-1.5 py-0.5', ring: 'ring-2' },
  md: { container: 'w-14 h-14 rounded-2xl', icon: 'text-xl', badge: 'text-[10px] px-2 py-0.5', ring: 'ring-[3px]' },
  lg: { container: 'w-20 h-20 rounded-[22px]', icon: 'text-3xl', badge: 'text-[11px] px-2.5 py-1', ring: 'ring-[3px]' },
}

export default function OfficerAvatar({ emotion, isSpeaking, size = 'md' }: Props) {
  const emo = emotionConfig[emotion]
  const sz = sizeConfig[size]

  return (
    <div className="relative inline-flex flex-col items-center gap-2">
      {/* 头像圆 */}
      <motion.div
        animate={isSpeaking ? {
          scale: [1, 1.04, 1],
          boxShadow: [
            '0 0 0 0 rgba(59,130,246,0.2)',
            '0 0 0 12px rgba(59,130,246,0)',
            '0 0 0 0 rgba(59,130,246,0)',
          ],
        } : { scale: 1 }}
        transition={isSpeaking ? { repeat: Infinity, duration: 1.5, ease: 'easeInOut' } : {}}
        className={`${sz.container} bg-gradient-to-br ${emo.bg} ${emo.shadow}
          flex items-center justify-center
          ring-offset-2 ${sz.ring} ${emo.ring}
          transition-all duration-500`}
      >
        <span className={sz.icon}>{emo.expression}</span>
      </motion.div>

      {/* 情绪标签 */}
      {emo.label && size !== 'sm' && (
        <motion.span
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          key={emo.label}
          className={`${sz.badge} rounded-full bg-white border border-slate-200 text-slate-600 font-medium`}
        >
          {emo.label}
        </motion.span>
      )}

      {/* 说话指示器 */}
      {isSpeaking && size !== 'sm' && (
        <div className="flex items-center gap-[2px]">
          {[0, 1, 2, 3].map(i => (
            <motion.span
              key={i}
              animate={{ height: [4, 12, 6, 10, 4] }}
              transition={{
                repeat: Infinity,
                duration: 0.6,
                delay: i * 0.12,
                ease: 'easeInOut',
              }}
              className="w-[3px] rounded-full bg-blue-400"
            />
          ))}
        </div>
      )}
    </div>
  )
}
