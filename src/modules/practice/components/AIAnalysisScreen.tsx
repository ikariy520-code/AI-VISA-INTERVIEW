import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  HiOutlineCheck,
  HiOutlineClipboardDocumentCheck,
  HiOutlineExclamationTriangle,
  HiOutlineFlag,
  HiOutlineMagnifyingGlass,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
} from 'react-icons/hi2'
import type { IconType } from 'react-icons'
import { analyzeUserContext } from '../services/openai'
import type { AIAnalysisResult, UserContext } from '../types'

interface Props {
  context: UserContext
  onComplete: (analysis: AIAnalysisResult) => void
}

const thinkingSteps: Array<{ label: string; detail: string; icon: IconType }> = [
  { label: '识别签证类型', detail: '确认本次面签的判断重点', icon: HiOutlineMagnifyingGlass },
  { label: '整理背景信息', detail: '只使用你确认过的必要资料', icon: HiOutlineClipboardDocumentCheck },
  { label: '评估风险点', detail: '定位最可能出现的追问方向', icon: HiOutlineShieldCheck },
  { label: '生成面签策略', detail: '调整节奏、语气与问题顺序', icon: HiOutlineFlag },
  { label: '准备开场', detail: '即将进入模拟面签', icon: HiOutlineSparkles },
]

export default function AIAnalysisScreen({ context, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [doneSteps, setDoneSteps] = useState<number[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    thinkingSteps.forEach((_, index) => {
      timers.push(setTimeout(() => {
        setCurrentStep(index)
        setDoneSteps(previous => previous.includes(index) ? previous : [...previous, index])
      }, 560 * (index + 1)))
    })
    timers.push(setTimeout(async () => {
      try {
        const analysis = await analyzeUserContext(context)
        timers.push(setTimeout(() => onComplete(analysis), 420))
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '面签策略暂时无法生成，请稍后重试。')
      }
    }, 560 * (thinkingSteps.length + 1)))
    return () => timers.forEach(clearTimeout)
  }, [attempt, context, onComplete])

  const progress = Math.round(((doneSteps.length + 0.2) / thinkingSteps.length) * 100)

  return (
    <div className="mx-auto flex min-h-[68vh] max-w-3xl items-center justify-center">
      <div className="grid w-full gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center lg:text-left"
        >
          <div className="relative mx-auto flex h-28 w-28 items-center justify-center lg:mx-0">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border border-dashed border-[#0071e3]/35"
            />
            <motion.span
              animate={{ scale: [1, 1.08, 1], opacity: [0.45, 0.16, 0.45] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-3 rounded-full bg-[#eaf4ff]"
            />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#1d1d1f] text-white shadow-xl shadow-black/15">
              <HiOutlineSparkles className="h-7 w-7" />
            </span>
          </div>

          <span className="app-eyebrow mt-7">Preparing · {Math.min(progress, 100)}%</span>
          <h1 className="mt-5 text-[31px] font-semibold tracking-[-0.045em] text-[#1d1d1f]">正在为你准备<br className="hidden lg:block" />本次面签。</h1>
          <p className="mt-3 text-[13px] leading-6 text-[#6e6e73]">我们会把背景信息整理成清晰的提问策略，不会改变你刚刚填写的内容。</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="app-card p-4 sm:p-5"
        >
          <div className="space-y-1.5">
            {thinkingSteps.map((step, index) => {
              const Icon = step.icon
              const isDone = doneSteps.includes(index)
              const isCurrent = index === currentStep && !error
              return (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: index <= currentStep ? 1 : 0.38, x: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all duration-300 ${
                    isCurrent ? 'bg-[#f5f5f7]' : 'bg-transparent'
                  }`}
                >
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[13px] transition-all duration-300 ${
                    isDone ? 'bg-[#eaf4ff] text-[#0071e3]' : 'bg-black/[0.04] text-[#a1a1a6]'
                  }`}>
                    <Icon className="h-[17px] w-[17px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-semibold ${isDone ? 'text-[#1d1d1f]' : 'text-[#86868b]'}`}>{step.label}</p>
                    <p className="mt-0.5 text-[11px] text-[#a1a1a6]">{step.detail}</p>
                  </div>
                  <AnimatePresence mode="wait">
                    {isDone ? (
                      <motion.span key="done" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex h-6 w-6 items-center justify-center rounded-full bg-[#158f65] text-white">
                        <HiOutlineCheck className="h-3.5 w-3.5" />
                      </motion.span>
                    ) : isCurrent ? (
                      <motion.span key="working" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.2, repeat: Infinity }} className="h-2 w-2 rounded-full bg-[#0071e3]" />
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-red-200/70 bg-[#fff0ef] p-4">
              <HiOutlineExclamationTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#c9342f]" />
              <div>
                <p className="text-[12px] leading-5 text-[#a22d29]">{error}</p>
                <button type="button" onClick={() => { setError(''); setDoneSteps([]); setCurrentStep(0); setAttempt(value => value + 1) }} className="mt-2 text-[12px] font-semibold text-[#8f2723] hover:underline">
                  重新准备
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
