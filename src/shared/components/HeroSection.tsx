import { motion } from 'framer-motion'

// ========================================
// Hero 区
// 中英结合，品牌质感
// ========================================

export default function HeroSection() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0, 1], delay: 0.15 }}
      className="text-center px-6 pt-28 pb-6"
    >
      {/* Slogan */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
          bg-blue-50 border border-blue-100 mb-10"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-[13px] text-blue-600 font-semibold tracking-[0.06em] uppercase">
          Visa with Confidence
        </span>
      </motion.div>

      {/* 主标题 */}
      <h1 className="text-[42px] sm:text-[56px] md:text-[68px] lg:text-[80px]
        font-bold text-slate-900 tracking-[-0.03em] leading-[1.08] mb-5">
        练出<span className="gradient-text">信心</span>
        <br />
        拿下<span className="gradient-text">签证</span>
      </h1>

      {/* 副标题 */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="text-[17px] sm:text-[19px] text-slate-500 font-normal
          max-w-xl mx-auto leading-relaxed tracking-normal"
      >
        AI 面签官实时对话练习，精准反馈帮你改进
      </motion.p>

      {/* 细线分割 */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: 1.0, ease: [0.25, 0.1, 0, 1] }}
        className="w-10 h-[2px] bg-slate-300 mx-auto mt-10 rounded-full"
      />
    </motion.div>
  )
}
