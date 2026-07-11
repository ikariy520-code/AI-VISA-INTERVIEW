import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'

// ========================================
// 模块页面 — 各功能独立加载，便于并行开发与合并
// ========================================
import VoicePage from './modules/voice'
import CustomOfficerPage from './modules/voice/CustomOfficerPage'
import PracticePage from './modules/practice'
import FeedbackPage from './modules/feedback'
import AdminInvitesPage from './pages/AdminInvitesPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/voice" element={<VoicePage />} />
      <Route path="/voice/custom" element={<CustomOfficerPage />} />
      <Route path="/practice" element={<PracticePage />} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/admin/invites" element={<AdminInvitesPage />} />
    </Routes>
  )
}

export default App
