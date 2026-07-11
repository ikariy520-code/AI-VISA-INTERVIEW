import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'

// ========================================
// 模块页面 — 各功能独立加载，便于并行开发与合并
// ========================================
import VoicePage from './modules/voice'
import CustomOfficerPage from './modules/voice/CustomOfficerPage'
import PracticePage from './modules/practice'
import FeedbackPage from './modules/feedback'
import AuthPage from './pages/AuthPage'
import RequireAuth from './auth/RequireAuth'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      <Route path="/voice" element={<VoicePage />} />
      <Route path="/voice/custom" element={<CustomOfficerPage />} />
      <Route path="/practice" element={<RequireAuth><PracticePage /></RequireAuth>} />
      <Route path="/feedback" element={<RequireAuth><FeedbackPage /></RequireAuth>} />
    </Routes>
  )
}

export default App
