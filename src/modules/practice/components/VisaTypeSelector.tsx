import { motion } from 'framer-motion'
import {
  HiOutlineAcademicCap,
  HiOutlineArrowRight,
  HiOutlineGlobeAlt,
} from 'react-icons/hi2'
import type { IconType } from 'react-icons'
import type { VisaType } from '../types'

interface VisaOption {
  id: VisaType
  label: string
  fullName: string
  description: string
  note: string
  icon: IconType
  tone: string
}

const visaTypes: VisaOption[] = [
  {
    id: 'F1',
    label: 'F1 学术签证',
    fullName: 'Academic Visa',
    description: '赴美留学、学术进修',
    note: '重点练习学校、专业、资金与回国规划',
    icon: HiOutlineAcademicCap,
    tone: 'bg-[#f1efff] text-[#6554c0]',
  },
  {
    id: 'B2',
    label: 'B2 旅游签证',
    fullName: 'Tourist Visa',
    description: '赴美旅游、探亲、访友',
    note: '重点练习行程、费用、联系人与回国约束',
    icon: HiOutlineGlobeAlt,
    tone: 'bg-[#eaf4ff] text-[#0062c3]',
  },
]

export default function VisaTypeSelector({ onSelect }: { onSelect: (type: VisaType) => void }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.28, 0.11, 0.32, 1] }}
        className="mb-9 text-center"
      >
        <span className="app-eyebrow">Visa category</span>
        <h1 className="app-title mt-5">先选择这次要突破的场景。</h1>
        <p className="app-subtitle mx-auto">面签问题会根据签证类型重新组织，让练习内容更贴近真实判断重点。</p>
      </motion.div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {visaTypes.map((visa, index) => {
          const Icon = visa.icon
          return (
            <motion.button
              key={visa.id}
              type="button"
              initial={{ opacity: 0, y: 18, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.08, duration: 0.48, ease: [0.28, 0.11, 0.32, 1] }}
              whileTap={{ scale: 0.992 }}
              onClick={() => onSelect(visa.id)}
              className="app-card-interactive group flex min-h-[260px] flex-col p-7 text-left sm:p-8"
            >
              <div className="flex items-start justify-between">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${visa.tone}`}>
                  <Icon className="h-[23px] w-[23px]" />
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.07] bg-white text-[#86868b] transition-all group-hover:bg-[#1d1d1f] group-hover:text-white">
                  <HiOutlineArrowRight className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868b]">{visa.fullName}</p>
              <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#1d1d1f]">{visa.label}</h2>
              <p className="mt-2 text-[14px] text-[#424245]">{visa.description}</p>
              <p className="mt-auto pt-5 text-[12px] leading-6 text-[#86868b]">{visa.note}</p>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
