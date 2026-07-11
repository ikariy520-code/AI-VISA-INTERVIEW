import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { AIAnalysisResult } from '../types'
import { analyzeUserContext } from '../services/openai'
import type { UserContext } from '../types'
import { useAccess } from '../../../access/AccessContext'

// ========================================
// Step 3: AI 分析中
// 过渡动画 — AI "思考"的用户体验
// ========================================

interface Props {
  context: UserContext
  onComplete: (analysis: AIAnalysisResult) => void
}

const thinkingSteps = [
  { label: '识别签证类型...', icon: '🔍' },
  { label: '分析背景信息...', icon: '📋' },
  { label: '评估风险点...', icon: '⚡' },
  { label: '生成面签策略...', icon: '🧠' },
  { label: '准备开场...', icon: '🎯' },
]

export default function AIAnalysisScreen({ context, onComplete }: Props) {
  const { beginInterview } = useAccess()
  const [currentStep, setCurrentStep] = useState(0)
  const [doneSteps, setDoneSteps] = useState<number[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // 逐步展示思考过程
    const timers: ReturnType<typeof setTimeout>[] = []

    thinkingSteps.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setCurrentStep(i)
        setDoneSteps(prev => [...prev, i])
      }, 600 * (i + 1)))
    })

    // 最后一步后触发 AI 分析
    timers.push(setTimeout(async () => {
      try {
        await beginInterview()
        const analysis = await analyzeUserContext(context)
        setTimeout(() => onComplete(analysis), 400)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI 分析暂时不可用，请稍后重试。')
      }
    }, 600 * (thinkingSteps.length + 1)))

    return () => timers.forEach(clearTimeout)
  }, [context, onComplete, attempt, beginInterview])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      {/* 动画：AI 脑图标 */}
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        className="mb-8"
      >
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500
          flex items-center justify-center shadow-lg shadow-blue-500/25">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a4 4 0 0 1 4 4v1h2a2 2 0 0 1 2 2v1a4 4 0 0 1-3.5 3.97" />
            <path d="M12 2a4 4 0 0 0-4 4v1H6a2 2 0 0 0-2 2v1a4 4 0 0 0 3.5 3.97" />
            <circle cx="12" cy="13" r="5" />
            <path d="M12 18v2" />
            <path d="M9 21h6" />
          </svg>
        </div>
      </motion.div>

      {/* 标题 */}
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-[20px] font-semibold text-slate-900 mb-8 tracking-tight"
      >
        AI 正在分析你的情况...
      </motion.h2>

      {/* 思考步骤 */}
      <div className="space-y-2 w-72">
        {thinkingSteps.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{
              opacity: i <= currentStep ? 1 : 0.3,
              x: 0,
            }}
            transition={{ delay: 0.05 * i }}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${
              doneSteps.includes(i)
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-100 text-slate-400'
            }`}
          >
            <span className="text-sm">{step.icon}</span>
            <span className="text-[13px] font-medium">{step.label}</span>
            <AnimatePresence>
              {doneSteps.includes(i) && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="ml-auto text-emerald-500"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* 提示 */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-8 text-[12px] text-slate-400"
      >
        这通常需要 3-5 秒 · 接入 OpenAI API 后实时分析
      </motion.p>
      {error && (
        <div className="mt-5 max-w-sm rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-center">
          <p className="text-[12px] text-red-600">{error}</p>
          <button onClick={() => { setError(''); setAttempt(value => value + 1) }} className="mt-2 text-[12px] font-semibold text-red-700 hover:text-red-800">
            重新尝试
          </button>
        </div>
      )}
    </div>
  )
}
