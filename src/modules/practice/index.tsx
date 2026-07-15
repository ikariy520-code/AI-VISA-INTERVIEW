import { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { HiOutlineArrowLeft, HiOutlineCheck } from 'react-icons/hi2'
import type { VisaType, UserContext, InterviewStep } from './types'
import type { OfficerType } from '../voice/types'
import { officerTypes } from '../voice/data/officerTypes'
import VisaTypeSelector from './components/VisaTypeSelector'
import UserContextForm from './components/UserContextForm'

// ========================================
// 面签实战 — 主页面
//
// 2 步流程：
//   select-type → context-form → 实时语音面签
//
// 填完背景后，所有信息汇入 prompt，交给豆包端到端实时语音。
// ========================================

const pageTransition = {
  initial: { opacity: 0, y: 14, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.997 },
  transition: { duration: 0.36, ease: [0.28, 0.11, 0.32, 1] },
}

const steps: InterviewStep[] = ['select-type', 'context-form']
const stepMeta: Record<InterviewStep, { label: string; short: string }> = {
  'select-type': { label: '选择签证类型', short: '类型' },
  'context-form': { label: '建立面签背景', short: '背景' },
}

export default function PracticePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState<InterviewStep>('select-type')
  const [visaType, setVisaType] = useState<VisaType | null>(null)

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

  const officerConfig = useMemo(
    () => officerType ? officerTypes.find(o => o.id === officerType) ?? null : null,
    [officerType],
  )

  // Step 1 → Step 2
  const handleSelectType = useCallback((type: VisaType) => {
    setVisaType(type)
    setStep('context-form')
  }, [])

  // Step 2 → 跳转实时语音面签
  const handleContextSubmit = useCallback((context: UserContext) => {
    navigate('/voice/live', {
      state: {
        officerType,
        userContext: context,
      },
    })
  }, [navigate, officerType])

  const handleBack = useCallback(() => {
    if (step === 'context-form') setStep('select-type')
  }, [step])

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
      <main className="px-5 py-10 sm:px-8 sm:py-14">
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
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex items-center justify-center py-24">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </main>
    </div>
  )
}
