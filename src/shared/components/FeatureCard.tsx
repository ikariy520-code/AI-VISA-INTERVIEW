import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { HiOutlineArrowUpRight } from 'react-icons/hi2'
import type { IconType } from 'react-icons'

interface FeatureCardProps {
  icon: IconType
  eyebrow: string
  title: string
  description: string
  route: string
  action: string
  index: number
  tone: 'blue' | 'mint'
}

export default function FeatureCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  route,
  action,
  index,
  tone,
}: FeatureCardProps) {
  const navigate = useNavigate()
  const toneClass = tone === 'blue'
    ? 'bg-[#eaf4ff] text-[#0062c3]'
    : 'bg-[#eaf8f2] text-[#147a58]'

  return (
    <motion.button
      type="button"
      onClick={() => navigate(route)}
      initial={{ opacity: 0, y: 22, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.58, delay: 0.48 + index * 0.1, ease: [0.28, 0.11, 0.32, 1] }}
      whileTap={{ scale: 0.992 }}
      className="app-card-interactive group min-h-[220px] p-7 text-left sm:p-8"
    >
      <div className="flex items-start justify-between">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${toneClass}`}>
          <Icon className="h-[22px] w-[22px]" />
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.07] bg-white text-[#86868b] transition-all duration-300 group-hover:bg-[#1d1d1f] group-hover:text-white">
          <HiOutlineArrowUpRight className="h-4 w-4" />
        </span>
      </div>

      <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868b]">{eyebrow}</p>
      <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#1d1d1f] sm:text-[28px]">{title}</h2>
      <p className="mt-3 max-w-md text-[14px] leading-6 text-[#6e6e73]">{description}</p>
      <p className="mt-6 text-[13px] font-semibold text-[#424245] transition-colors group-hover:text-[#0071e3]">{action}</p>
    </motion.button>
  )
}
