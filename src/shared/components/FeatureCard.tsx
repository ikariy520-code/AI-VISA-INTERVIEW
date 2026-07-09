import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

// ========================================
// 功能卡片
// 白底 + 清晰边框线 + 悬停蓝色提亮
// 简洁克制，不堆砌信息
// ========================================

interface FeatureCardProps {
  icon: ReactNode
  title: string
  description: string
  route: string
  index: number
  accentClass: string
  shadowClass: string
}

export default function FeatureCard({
  icon, title, description, route, index, accentClass, shadowClass,
}: FeatureCardProps) {
  const navigate = useNavigate()

  return (
    <motion.button
      onClick={() => navigate(route)}
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.55,
        delay: 0.9 + index * 0.12,
        ease: [0.25, 0.1, 0, 1],
      }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      className="group relative flex flex-col items-start text-left
        bg-white border border-slate-200 rounded-2xl
        p-7 sm:p-8 cursor-pointer
        transition-all duration-300 ease-out
        hover:border-blue-300 hover:shadow-lg hover:shadow-slate-200/50"
    >
      {/* 图标区 — 彩色渐变底 + 细阴影 */}
      <div
        className={`relative w-12 h-12 rounded-xl bg-gradient-to-br ${accentClass}
          flex items-center justify-center mb-5 shadow-sm ${shadowClass}
          transition-transform duration-300 group-hover:scale-105`}
      >
        <div className="text-white text-[22px]">{icon}</div>
      </div>

      {/* 标题 — 中等字重，清晰可读 */}
      <h3 className="text-[19px] sm:text-[21px] font-semibold text-slate-900 mb-2.5 tracking-[-0.01em]">
        {title}
      </h3>

      {/* 描述 — 一行足矣，不啰嗦 */}
      <p className="text-[14px] text-slate-500 font-normal leading-relaxed">
        {description}
      </p>

      {/* 底部指示线 — 悬停时出现蓝色 */}
      <div className="mt-6 w-6 h-[1.5px] rounded-full bg-slate-300
        transition-all duration-300
        group-hover:w-8 group-hover:bg-blue-500" />
    </motion.button>
  )
}
