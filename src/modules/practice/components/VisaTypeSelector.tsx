import { motion } from 'framer-motion'
import type { VisaType, VisaTypeInfo } from '../types'

// ========================================
// Step 1: 选择签证类型
// 卡片式布局，每个卡片展示签证类型信息
// ========================================

const visaTypes: VisaTypeInfo[] = [
  {
    id: 'F1',
    label: 'F1 学术签证',
    fullName: 'Academic Visa',
    description: '赴美留学、学术进修',
    accentClass: 'from-violet-500 to-violet-600 shadow-violet-500/20',
    icon: '🎓',
  },
  {
    id: 'B2',
    label: 'B2 旅游签证',
    fullName: 'Tourist Visa',
    description: '赴美旅游、探亲、医疗',
    accentClass: 'from-blue-500 to-blue-600 shadow-blue-500/20',
    icon: '🏖️',
  },
]

interface Props {
  onSelect: (type: VisaType) => void
}

export default function VisaTypeSelector({ onSelect }: Props) {
  return (
    <div className="flex flex-col items-center">
      {/* 标题区 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10"
      >
        <h1 className="text-[28px] font-semibold text-slate-900 mb-2 tracking-tight">
          选择你的签证类型
        </h1>
        <p className="text-[14px] text-slate-500 font-normal">
          AI 面签官会根据签证类型调整提问策略
        </p>
      </motion.div>

      {/* 签证卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        {visaTypes.map((visa, i) => (
          <motion.button
            key={visa.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i, duration: 0.4, ease: [0.25, 0.1, 0, 1] }}
            onClick={() => onSelect(visa.id)}
            className="group relative text-left p-5 rounded-2xl bg-white border border-slate-200
              hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5
              transition-all duration-300 hover:-translate-y-1"
          >
            {/* 图标 */}
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${visa.accentClass}
              flex items-center justify-center text-lg mb-3
              transition-shadow duration-300 group-hover:shadow-md`}>
              <span>{visa.icon}</span>
            </div>

            {/* 文字 */}
            <h3 className="text-[15px] font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
              {visa.label}
            </h3>
            <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider mb-1">
              {visa.fullName}
            </p>
            <p className="text-[13px] text-slate-500 font-normal leading-relaxed">
              {visa.description}
            </p>

            {/* 底部指示线 */}
            <div className="mt-3 w-8 h-[2px] rounded-full bg-slate-200
              group-hover:w-12 group-hover:bg-blue-400 transition-all duration-300" />
          </motion.button>
        ))}
      </div>
    </div>
  )
}
