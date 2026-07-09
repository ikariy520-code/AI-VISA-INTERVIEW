import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import type { VisaType, UserContext, InterviewStep, AIAnalysisResult, ChatMessage } from './types'
import type { OfficerType } from '../voice/types'
import { officerTypes } from '../voice/data/officerTypes'
import VisaTypeSelector from './components/VisaTypeSelector'
import UserContextForm from './components/UserContextForm'
import AIAnalysisScreen from './components/AIAnalysisScreen'
import InterviewRoom from './components/InterviewRoom'
import InterviewComplete from './components/InterviewComplete'

// ========================================
// 面签实战 — 主页面
//
// 5 步流程：
//   select-type → context-form → ai-analysis → interview → complete
//
// 模块独立：本文件夹可单独拆分给其他成员开发
// 接口契约：导出的 InterviewRecord 对接反馈模块
//
// 入口守卫：必须先从第一部分选择面签官类型才能进入
//   无 officerType → 自动跳回 /voice 并弹窗提示
//
// 面签官类型来源（优先级从高到低）：
//   1. react-router location.state.officerType（从声音选择页跳转来）
//   2. sessionStorage['visa_officer_type']（页面刷新恢复）
//   3. 无 → 跳回 /voice
// ========================================

// 页面切换动画
const pageTransition = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: [0.25, 0.1, 0, 1] },
}

export default function PracticePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState<InterviewStep>('select-type')
  const [visaType, setVisaType] = useState<VisaType | null>(null)
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [duration, setDuration] = useState('')

  const guardRedirected = useRef(false)

  // ══════════════════════════════════════════════════
  // ⚠️ GUARD_BYPASS — 临时跳过入口守卫（开发调试用）
  //    true  = 无需从第一页选面签官，默认使用 standard 类型
  //    false = 恢复守卫，无 officerType 时自动跳回 /voice
  // ══════════════════════════════════════════════════
  const GUARD_BYPASS = true

  // 面签官类型：从路由 state 读取，回退到 sessionStorage
  const officerType: OfficerType | null = useMemo(() => {
    const fromRoute = (location.state as any)?.officerType as OfficerType | undefined
    if (fromRoute && ['pressure', 'standard', 'friendly', 'trump', 'custom'].includes(fromRoute)) {
      sessionStorage.setItem('visa_officer_type', fromRoute)
      return fromRoute
    }
    const fromStorage = sessionStorage.getItem('visa_officer_type') as OfficerType | null
    if (fromStorage && ['pressure', 'standard', 'friendly', 'trump', 'custom'].includes(fromStorage)) {
      return fromStorage
    }
    // 守卫绕过时默认返回 standard 类型
    if (GUARD_BYPASS) return 'standard'
    return null
  }, [location.state])

  // 入口守卫：没有选择面签官类型 → 跳回第一部分
  useEffect(() => {
    if (GUARD_BYPASS) return
    if (guardRedirected.current) return
    if (!officerType) {
      guardRedirected.current = true
      navigate('/voice', { replace: true })
    }
  }, [officerType, navigate])

  // officerType 未就绪时不渲染（等待守卫跳转）
  const officerConfig = useMemo(
    () => officerType ? officerTypes.find(o => o.id === officerType) ?? null : null,
    [officerType],
  )

  // Step 1 → Step 2
  const handleSelectType = useCallback((type: VisaType) => {
    setVisaType(type)
    setStep('context-form')
  }, [])

  // Step 2 → Step 3
  const handleContextSubmit = useCallback((context: UserContext) => {
    setUserContext(context)
    setStep('ai-analysis')
  }, [])

  // Step 3 → Step 4
  const handleAnalysisComplete = useCallback((result: AIAnalysisResult) => {
    setAnalysis(result)
    setStep('interview')
  }, [])

  // Step 4 → Step 5
  const handleInterviewComplete = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs)
    // 计算时长
    const firstTs = msgs[0]?.timestamp ?? '00:00'
    const lastTs = msgs[msgs.length - 1]?.timestamp ?? '00:00'
    setDuration(lastTs)
    setStep('complete')
  }, [])

  // 返回
  const handleBack = useCallback(() => {
    if (step === 'context-form') setStep('select-type')
    else if (step === 'complete') setStep('select-type')
  }, [step])

  // 重置
  const handleReset = useCallback(() => {
    setStep('select-type')
    setVisaType(null)
    setUserContext(null)
    setAnalysis(null)
    setMessages([])
    setDuration('')
  }, [])

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* ---- 顶部导航条 ---- */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
        <button
          onClick={() => (step === 'select-type' ? navigate('/') : handleBack())}
          className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400
            hover:text-slate-700 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {step === 'select-type' ? '首页' : '返回'}
        </button>

        <span className="text-[13px] font-semibold text-slate-700 tracking-tight">
          面签实战
        </span>

        {/* 步骤进度指示 */}
        <div className="flex items-center gap-1.5">
          {(['select-type', 'context-form', 'ai-analysis', 'interview', 'complete'] as InterviewStep[]).map((s, i) => (
            <span
              key={s}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                step === s
                  ? 'bg-blue-500 scale-125'
                  : ['select-type', 'context-form', 'ai-analysis', 'interview', 'complete'].indexOf(step) > i
                  ? 'bg-blue-300'
                  : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ---- 步骤内容 ---- */}
      <div className="px-4 py-8">
        {officerType && officerConfig ? (
          <AnimatePresence mode="wait">
            <motion.div key={step} {...pageTransition}>
              {step === 'select-type' && (
                <VisaTypeSelector onSelect={handleSelectType} />
              )}

              {step === 'context-form' && visaType && (
                <UserContextForm
                  visaType={visaType}
                  onSubmit={handleContextSubmit}
                  onBack={handleBack}
                />
              )}

              {step === 'ai-analysis' && userContext && (
                <AIAnalysisScreen
                  context={userContext}
                  onComplete={handleAnalysisComplete}
                />
              )}

              {step === 'interview' && userContext && analysis && (
                <InterviewRoom
                  context={userContext}
                  analysis={analysis}
                  officerType={officerType}
                  onComplete={handleInterviewComplete}
                />
              )}

              {step === 'complete' && userContext && analysis && (
                <InterviewComplete
                  messages={messages}
                  context={userContext}
                  analysis={analysis}
                  duration={duration}
                />
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          /* officerType 未就绪 — 等待守卫跳转回 /voice */
          <div className="flex items-center justify-center py-24">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
