import { HiOutlineChartBarSquare, HiOutlineMicrophone } from 'react-icons/hi2'
import FeatureCard from './FeatureCard'

const features = [
  {
    id: 'practice',
    eyebrow: 'Practice',
    title: '练到开口就稳',
    description: '按真实背景追问，提前适应面签节奏。',
    route: '/voice',
    icon: HiOutlineMicrophone,
    tone: 'blue' as const,
    action: '开始模拟',
  },
  {
    id: 'feedback',
    eyebrow: 'Feedback',
    title: '每次都更进一步',
    description: '看见问题，也看见下一步。',
    route: '/feedback',
    icon: HiOutlineChartBarSquare,
    tone: 'mint' as const,
    action: '查看反馈',
  },
]

export default function FeatureGrid() {
  return (
    <section className="mobile-snap-rail mobile-card-rail mx-auto w-full max-w-5xl gap-4 px-4 pb-16 pt-12 sm:grid sm:grid-flow-row sm:grid-cols-1 sm:overflow-visible sm:px-8 md:grid-cols-2 md:pb-20 md:pt-20">
      {features.map((feature, index) => (
        <FeatureCard key={feature.id} {...feature} index={index} />
      ))}
    </section>
  )
}
