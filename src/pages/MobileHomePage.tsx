import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  HiOutlineArrowRight,
  HiOutlineArrowUpRight,
  HiOutlineChartBarSquare,
  HiOutlineCheckCircle,
  HiOutlineMicrophone,
  HiOutlineSparkles,
} from 'react-icons/hi2'
import Background from '../shared/components/Background'

const mobileFeatures = [
  {
    id: 'practice',
    eyebrow: 'Practice',
    title: '练到开口就稳',
    description: '按真实背景追问，提前适应面签节奏。',
    route: '/voice',
    action: '开始模拟',
    icon: HiOutlineMicrophone,
    iconClassName: 'bg-[#eaf4ff] text-[#0062c3]',
  },
  {
    id: 'feedback',
    eyebrow: 'Feedback',
    title: '每次都更进一步',
    description: '看见问题，也看见下一步。',
    route: '/feedback',
    action: '查看反馈',
    icon: HiOutlineChartBarSquare,
    iconClassName: 'bg-[#eaf8f2] text-[#147a58]',
  },
]

const ease = [0.28, 0.11, 0.32, 1] as const

export default function MobileHomePage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#f5f5f7]">
      <Background />

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, ease }}
            className="app-eyebrow mx-auto"
          >
            <HiOutlineSparkles className="h-3.5 w-3.5" />
            AI 面签陪练
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.06, ease }}
            className="mt-4 text-center text-[12px] font-semibold tracking-[0.14em] text-[#0071e3]"
          >
            VISA WITH CONFIDENCE
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, delay: 0.1, ease }}
            className="mx-auto mt-3 text-center text-[clamp(46px,13.2vw,54px)] font-semibold leading-[0.91] tracking-[-0.07em] text-[#1d1d1f]"
          >
            <span className="whitespace-nowrap">练出<span className="gradient-text">信心</span></span>
            <br />
            <span className="whitespace-nowrap">拿下<span className="gradient-text">签证</span></span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18, ease }}
            className="mt-5 text-center text-[15px] leading-6 text-[#6e6e73]"
          >
            模拟真实追问，给出清晰反馈。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24, ease }}
            className="mt-5 flex items-center justify-center gap-4"
          >
            <Link to="/voice" className="app-button-primary min-h-11 px-5 py-2.5 active:scale-[0.975]">
              开始练习
              <HiOutlineArrowRight className="h-4 w-4" />
            </Link>
            <div className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-[#6e6e73]">
              <HiOutlineCheckCircle className="h-4 w-4 text-emerald-600" />
              无需上传证件
            </div>
          </motion.div>

          <section className="mt-8 grid gap-3" aria-label="主要功能">
            {mobileFeatures.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 16, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.52, delay: 0.3 + index * 0.08, ease }}
                  whileTap={{ scale: 0.985 }}
                >
                  <Link
                    to={feature.route}
                    className="group flex min-h-[148px] items-start gap-4 rounded-[24px] border border-black/[0.07] bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.02),0_14px_42px_rgba(0,0,0,0.055)]"
                  >
                    <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[15px] ${feature.iconClassName}`}>
                      <Icon className="h-5 w-5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#86868b]">
                        {feature.eyebrow}
                      </span>
                      <span className="mt-1 block text-[21px] font-semibold tracking-[-0.04em] text-[#1d1d1f]">
                        {feature.title}
                      </span>
                      <span className="mt-1.5 block text-[12px] leading-5 text-[#6e6e73]">
                        {feature.description}
                      </span>
                      <span className="mt-2.5 block text-[12px] font-semibold text-[#424245]">
                        {feature.action}
                      </span>
                    </span>

                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-black/[0.07] bg-white text-[#86868b] transition-colors group-active:bg-[#1d1d1f] group-active:text-white">
                      <HiOutlineArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </motion.div>
              )
            })}
          </section>
        </main>

        <footer className="border-t border-black/[0.06] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-center">
          <p className="text-[10px] font-medium tracking-[0.07em] text-[#86868b]">
            面签 AI Coach · 让准备变成可以看见的进步
          </p>
        </footer>
      </div>
    </div>
  )
}
