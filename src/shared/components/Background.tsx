import { motion, useReducedMotion } from 'framer-motion'

export default function Background() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f5f5f7_58%,#f5f5f7_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_14%,rgba(191,219,254,0.22),transparent_38%),radial-gradient(circle_at_100%_48%,rgba(199,210,254,0.18),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(209,250,229,0.17),transparent_38%)] sm:hidden" />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, x: -24, y: 12, scale: 0.94 }}
        animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0, scale: 1 }}
        transition={{ duration: 1.25, ease: [0.28, 0.11, 0.32, 1] }}
        className="absolute -left-24 top-24 hidden h-[30rem] w-[30rem] rounded-full bg-blue-200/20 blur-[90px] sm:block"
      />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, x: 20, y: -12, scale: 0.95 }}
        animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0, scale: 1 }}
        transition={{ duration: 1.45, ease: [0.28, 0.11, 0.32, 1], delay: 0.12 }}
        className="absolute -right-28 top-1/3 hidden h-[28rem] w-[28rem] rounded-full bg-indigo-200/20 blur-[100px] sm:block"
      />
      <div className="absolute bottom-[-16rem] left-1/2 hidden h-[32rem] w-[46rem] -translate-x-1/2 rounded-full bg-emerald-100/20 blur-[110px] sm:block" />
    </div>
  )
}
