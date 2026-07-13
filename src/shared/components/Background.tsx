import { motion, useReducedMotion } from 'framer-motion'

export default function Background() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f5f5f7_58%,#f5f5f7_100%)]" />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, x: -24, y: 12, scale: 0.94 }}
        animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0, scale: 1 }}
        transition={{ duration: 1.25, ease: [0.28, 0.11, 0.32, 1] }}
        className="absolute -left-24 top-24 h-[30rem] w-[30rem] rounded-full bg-blue-200/20 blur-[90px]"
      />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, x: 20, y: -12, scale: 0.95 }}
        animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0, scale: 1 }}
        transition={{ duration: 1.45, ease: [0.28, 0.11, 0.32, 1], delay: 0.12 }}
        className="absolute -right-28 top-1/3 h-[28rem] w-[28rem] rounded-full bg-indigo-200/20 blur-[100px]"
      />
      <div className="absolute bottom-[-16rem] left-1/2 h-[32rem] w-[46rem] -translate-x-1/2 rounded-full bg-emerald-100/20 blur-[110px]" />
    </div>
  )
}
