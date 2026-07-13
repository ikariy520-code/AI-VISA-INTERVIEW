import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineSparkles,
} from 'react-icons/hi2'

export default function HeroSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pt-32 text-center sm:px-8 sm:pt-40">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.28, 0.11, 0.32, 1], delay: 0.08 }}
        className="app-eyebrow"
      >
        <HiOutlineSparkles className="h-3.5 w-3.5" />
        AI 面签陪练
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.28, 0.11, 0.32, 1], delay: 0.12 }}
        className="mt-5 text-[14px] font-semibold tracking-[0.12em] text-[#0071e3] sm:text-[15px]"
      >
        VISA WITH CONFIDENCE
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.72, ease: [0.28, 0.11, 0.32, 1], delay: 0.16 }}
        className="mx-auto mt-5 max-w-4xl text-[52px] font-semibold leading-[0.98] tracking-[-0.065em] text-[#1d1d1f] sm:text-[76px] lg:text-[92px]"
      >
        练出<span className="gradient-text">信心</span>
        <br />
        拿下<span className="gradient-text">签证</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.28, 0.11, 0.32, 1], delay: 0.28 }}
        className="mx-auto mt-7 max-w-2xl text-[17px] leading-8 text-[#6e6e73] sm:text-[20px]"
      >
        模拟真实追问，给出清晰反馈。
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.28, 0.11, 0.32, 1], delay: 0.4 }}
        className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
      >
        <Link to="/voice" className="app-button-primary w-full sm:w-auto">
          开始练习
          <HiOutlineArrowRight className="h-4 w-4" />
        </Link>
        <div className="inline-flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-[#6e6e73]">
          <HiOutlineCheckCircle className="h-[17px] w-[17px] text-emerald-600" />
          无需上传证件
        </div>
      </motion.div>
    </section>
  )
}
