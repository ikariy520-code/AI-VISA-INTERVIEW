import { motion } from 'framer-motion'
import { HiOutlineUser } from 'react-icons/hi2'
import type { OfficerEmotion } from '../types'

interface Props {
  emotion: OfficerEmotion
  isSpeaking: boolean
  size?: 'sm' | 'md' | 'lg'
}

const emotionConfig: Record<OfficerEmotion, { tone: string; ring: string; label: string }> = {
  neutral: { tone: 'bg-[#eef0f3] text-[#55565a]', ring: 'ring-black/[0.06]', label: '' },
  friendly: { tone: 'bg-[#eaf8f2] text-[#147a58]', ring: 'ring-emerald-300/50', label: '友好' },
  stern: { tone: 'bg-[#fff6e6] text-[#9a5f12]', ring: 'ring-amber-300/50', label: '严肃' },
  curious: { tone: 'bg-[#f1efff] text-[#6554c0]', ring: 'ring-violet-300/50', label: '追问' },
  reassuring: { tone: 'bg-[#eaf4ff] text-[#0062c3]', ring: 'ring-blue-300/50', label: '安抚' },
  thoughtful: { tone: 'bg-[#eef0ff] text-[#505cbd]', ring: 'ring-indigo-300/50', label: '思考' },
}

const sizes = {
  sm: { container: 'h-10 w-10 rounded-[14px]', icon: 'h-[18px] w-[18px]', badge: 'text-[9px] px-1.5 py-0.5' },
  md: { container: 'h-14 w-14 rounded-[19px]', icon: 'h-6 w-6', badge: 'text-[10px] px-2 py-0.5' },
  lg: { container: 'h-20 w-20 rounded-[26px]', icon: 'h-8 w-8', badge: 'text-[10px] px-2.5 py-1' },
}

export default function OfficerAvatar({ emotion, isSpeaking, size = 'md' }: Props) {
  const config = emotionConfig[emotion]
  const sizeConfig = sizes[size]

  return (
    <div className="relative inline-flex flex-col items-center gap-2">
      <motion.div
        animate={isSpeaking ? {
          scale: [1, 1.035, 1],
          boxShadow: ['0 0 0 0 rgba(0,113,227,.18)', '0 0 0 14px rgba(0,113,227,0)', '0 0 0 0 rgba(0,113,227,0)'],
        } : { scale: 1 }}
        transition={isSpeaking ? { repeat: Infinity, duration: 1.55, ease: 'easeInOut' } : { duration: 0.3 }}
        className={`${sizeConfig.container} ${config.tone} ${config.ring} flex items-center justify-center ring-1 ring-offset-2 ring-offset-[#f5f5f7] transition-colors duration-500`}
      >
        <HiOutlineUser className={sizeConfig.icon} />
      </motion.div>

      {config.label && size !== 'sm' && (
        <motion.span
          key={config.label}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${sizeConfig.badge} rounded-full border border-black/[0.07] bg-white font-semibold text-[#6e6e73]`}
        >
          {config.label}
        </motion.span>
      )}
    </div>
  )
}
