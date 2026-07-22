import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { HiOutlineArrowRight, HiOutlineMicrophone } from 'react-icons/hi2'

export default function Navbar() {
  return (
    <motion.nav
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.28, 0.11, 0.32, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-8 sm:py-4">
        <Link to="/" className="group flex items-center gap-3" aria-label="面签 AI Coach 首页">
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#1d1d1f] text-white shadow-lg shadow-black/10 transition-transform duration-300 group-active:scale-[0.96] sm:group-hover:scale-[1.03]">
            <HiOutlineMicrophone className="h-[19px] w-[19px]" />
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-[-0.025em] text-[#1d1d1f]">面签 AI</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#86868b]">Coach</span>
          </span>
        </Link>

        <Link to="/voice" className="app-button-secondary min-h-10 px-4 py-2 text-[13px] active:scale-[0.97]">
          开始练习
          <HiOutlineArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </motion.nav>
  )
}
