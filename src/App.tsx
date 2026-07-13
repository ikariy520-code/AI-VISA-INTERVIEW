import { AnimatePresence, motion } from 'framer-motion'
import { Routes, Route, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'

// ========================================
// 模块页面 — 各功能独立加载，便于并行开发与合并
// ========================================
import VoicePage from './modules/voice'
import CustomOfficerPage from './modules/voice/CustomOfficerPage'
import VoiceInterviewRoom from './modules/voice/components/VoiceInterviewRoom'
import PracticePage from './modules/practice'
import FeedbackPage from './modules/feedback'
import AdminInvitesPage from './pages/AdminInvitesPage'

function App() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, filter: 'blur(5px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, filter: 'blur(4px)' }}
        transition={{ duration: 0.26, ease: [0.28, 0.11, 0.32, 1] }}
      >
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/voice/custom" element={<CustomOfficerPage />} />
          <Route path="/voice/live" element={<VoiceInterviewRoom />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/admin/invites" element={<AdminInvitesPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default App
