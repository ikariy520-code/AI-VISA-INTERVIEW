import { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { HiOutlineArrowLeft, HiOutlineCheck } from 'react-icons/hi2'
import type { VisaType, UserContext, InterviewStep, ChatMessage } from './types'
import type { OfficerType } from '../voice/types'
import { officerTypes } from '../voice/data/officerTypes'
import VisaTypeSelector from './components/VisaTypeSelector'
import UserContextForm from './components/UserContextForm'
import VoiceInterviewRoom from '../voice/components/VoiceInterviewRoom'
import InterviewComplete from './components/InterviewComplete'

// ========================================
// 面签实战 — 主页面
//
// 4 步流程：
//   select-type → context-form → interview → complete
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
  initial: { opacity: 0, y: 14, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.997 },
  transition: { duration: 0.36, ease: [0.28, 0.11, 0.32, 1] },
}

const steps: InterviewStep[] = ['select-type', 'context-form', 'interview', 'complete']
const stepMeta: Record<InterviewStep, { label: string; short: string }> = {
  'select-type': { label: '选择签证类型', short: '类型' },
  'context-form': { label: '建立面签背景', short: '背景' },
  'interview': { label: '模拟面签', short: '面签' },
  'complete': { label: '生成反馈', short: '反馈' },
}

export default function PracticePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState<InterviewStep>('select-type')
  const [visaType, setVisaType] = useState<VisaType | null>(null)
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [duration, setDuration] = useState('')

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
    return null
  }, [location.state])

  useEffect(() => {
    if (!officerType) navigate('/voice', { replace: true })
  }, [navigate, officerType])

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

  // Step 2 → realtime interview
  const handleContextSubmit = useCallback((context: UserContext) => {
    setUserContext(context)
    setStep('interview')
  }, [])

  // Interview → report
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
    setMessages([])
    setDuration('')
  }, [])

  return (
    <div className="app-page">
      {/* ---- 顶部导航条 ---- */}
      <header className="app-topbar">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <button
            type="button"
            onClick={() => (step === 'select-type' ? navigate('/') : handleBack())}
            className="app-icon-button"
            aria-label={step === 'select-type' ? '返回首页' : '返回上一步'}
          >
            <HiOutlineArrowLeft className="h-[18px] w-[18px]" />
          </button>

          <div className="text-center">
            <p className="text-[13px] font-semibold text-[#1d1d1f]">{stepMeta[step].label}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#86868b]">
              Step {steps.indexOf(step) + 1} of {steps.length}
            </p>
          </div>

          <div className="hidden items-center gap-1.5 sm:flex" aria-label="面签流程进度">
            {steps.map((item, index) => {
              const currentIndex = steps.indexOf(step)
              const isDone = index < currentIndex
              const isActive = item === step
              return (
                <span
                  key={item}
                  className={`flex h-7 items-center justify-center rounded-full transition-all duration-300 ${
                    isActive
                      ? 'w-16 bg-[#1d1d1f] text-[10px] font-semibold text-white'
                      : isDone
                        ? 'w-7 bg-[#eaf4ff] text-[#0071e3]'
                        : 'w-2 bg-black/[0.09] text-transparent'
                  }`}
                >
                  {isActive ? stepMeta[item].short : isDone ? <HiOutlineCheck className="h-3.5 w-3.5" /> : ''}
                </span>
              )
            })}
          </div>
          <div className="w-10 sm:hidden" />
        </div>
      </header>

      {/* ---- 步骤内容 ---- */}
      <main className={step === 'interview' ? 'px-3 py-3 sm:px-5' : 'px-5 py-10 sm:px-8 sm:py-14'}>
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

              {step === 'interview' && userContext && (
                <VoiceInterviewRoom
                  context={userContext}
                  officerType={officerType}
                  onComplete={handleInterviewComplete}
                />
              )}

              {step === 'complete' && userContext && (
                <InterviewComplete
                  messages={messages}
                  context={userContext}
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
      </main>
    </div>
  )
}
