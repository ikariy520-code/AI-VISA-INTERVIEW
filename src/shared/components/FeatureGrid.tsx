import FeatureCard from './FeatureCard'
import type { FeatureCardData } from '../types'

// ========================================
// 核心功能入口
// 简介短而有力，核心卖点一句话讲透
// ========================================

const features: FeatureCardData[] = [
  {
    id: 'practice',
    title: '面签实战',
    description: '选择面签官与签证类型，模拟真实面签环境反复练习。',
    route: '/voice',
    accentClass: 'from-emerald-500 to-emerald-600',
    shadowClass: 'shadow-emerald-500/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <polyline points="6 9 10 12 14 8 18 11" />
      </svg>
    ),
  },
  {
    id: 'feedback',
    title: '反馈总结',
    description: '从内容、语气、情绪多维度拆解每次回答，精准定位薄弱点。',
    route: '/feedback',
    accentClass: 'from-amber-500 to-amber-600',
    shadowClass: 'shadow-amber-500/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
]

export default function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-6 max-w-3xl mx-auto pb-24">
      {features.map((f, i) => (
        <FeatureCard key={f.id} {...f} index={i} />
      ))}
    </div>
  )
}
