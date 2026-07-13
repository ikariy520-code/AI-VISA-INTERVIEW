import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HiOutlineIdentification } from 'react-icons/hi2'

export default function OfficerNameIntro({ name, onComplete }: { name: string; onComplete: () => void }) {
  const [phase, setPhase] = useState<'show' | 'exit'>('show')

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setPhase('exit'), 1650)
    const completeTimer = window.setTimeout(onComplete, 2250)
    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(completeTimer)
    }
  }, [onComplete])

  return (
    <AnimatePresence>
      {phase === 'show' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.28, 0.11, 0.32, 1] }}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#f5f5f7]/96 px-6 backdrop-blur-xl"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.97, filter: 'blur(5px)' }}
            transition={{ duration: 0.58, ease: [0.28, 0.11, 0.32, 1] }}
            className="text-center"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#1d1d1f] text-white shadow-xl shadow-black/15">
              <HiOutlineIdentification className="h-6 w-6" />
            </span>
            <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#86868b]">Your visa officer</p>
            <h1 className="mt-3 text-[48px] font-semibold tracking-[-0.06em] text-[#1d1d1f] sm:text-[66px]">{name}</h1>
            <p className="mt-3 text-[14px] text-[#6e6e73]">面签官已准备好，先听完问题再作答。</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
