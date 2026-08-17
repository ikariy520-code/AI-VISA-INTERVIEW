import { motion, useReducedMotion } from 'framer-motion'
import { Routes, Route, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'

// ========================================
// 模块页面 — 各功能独立加载，便于并行开发与合并
// ========================================
import VoicePage from './modules/voice'
import CustomOfficerPage from './modules/voice/CustomOfficerPage'
import PracticePage from './modules/practice'
import FeedbackPage from './modules/feedback'
import VoiceInterviewRoute from './modules/voice/components/VoiceInterviewRoute'

function App() {
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches

  return (
    <motion.div
      key={location.pathname}
      initial={reduceMotion ? false : isMobile ? { opacity: 0, y: 8 } : { opacity: 0, filter: 'blur(5px)' }}
      animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: isMobile ? 0.26 : 0.22, ease: [0.28, 0.11, 0.32, 1] }}
      className="min-h-[100dvh]"
    >
      <Routes location={location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/voice" element={<VoicePage />} />
        <Route path="/voice/custom" element={<CustomOfficerPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/voice/live" element={<VoiceInterviewRoute />} />
        <Route path="/feedback" element={<FeedbackPage />} />
      </Routes>
    </motion.div>
  )
}

export default App
