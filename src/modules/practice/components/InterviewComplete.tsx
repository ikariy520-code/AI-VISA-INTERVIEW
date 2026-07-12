import { useRef, useEffect, useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { ChatMessage, UserContext, AIAnalysisResult, InterviewRecord } from '../types'
import type { InterviewSession } from '../../feedback/types'
import { analyzeInterview, analyzeInterviewWithAI } from '../../shared/store/analysisEngine'
import { generateSessionId, getNowFormatted } from '../../shared/store/interviewStore'
import { InviteRequiredError } from '../services/openai'
import { clearActiveInterviewSession } from '../../../access/AccessContext'

// ========================================
// Step 5: 面签完成
// 自动保存对话记录 → 分析引擎生成反馈 → 桥接到第三阶段
// ========================================

interface Props {
  messages: ChatMessage[]
  context: UserContext
  analysis: AIAnalysisResult
  duration: string
}

const visaTypeLabel: Record<string, string> = {
  B2: 'B2 旅游签证',
  B1: 'B1 商务签证',
  F1: 'F1 学术签证',
  H1B: 'H1B 工作签证',
  L1: 'L1 跨国经理',
}

export default function InterviewComplete({ messages, context, analysis, duration }: Props) {
  const navigate = useNavigate()
  const savedRef = useRef(false)
  const [feedbackState, setFeedbackState] = useState<'generating' | 'ready' | 'error'>('generating')
  const [feedbackError, setFeedbackError] = useState('')
  const [feedbackSession, setFeedbackSession] = useState<InterviewSession | null>(null)

  const officerQuestions = messages.filter(m => m.role === 'officer')
  const userAnswers = messages.filter(m => m.role === 'user')

  // 面签完成后仅生成本次反馈，不写入个人记录或云端数据库。
  useEffect(() => {
    if (savedRef.current || messages.length === 0) return
    savedRef.current = true

    const { date, time } = getNowFormatted()
    const id = generateSessionId()

    const record: InterviewRecord = {
      id,
      date,
      time,
      duration,
      visaType: context.visaType,
      userContext: context,
      messages,
      aiAnalysis: analysis,
    }

    let cancelled = false
    const generateFeedback = async () => {
      try {
        const session = await analyzeInterviewWithAI(record)
        if (!cancelled) {
          setFeedbackSession(session)
          setFeedbackState('ready')
        }
      } catch (error) {
        if (error instanceof InviteRequiredError) {
          if (!cancelled) {
            setFeedbackError(error.message)
            setFeedbackState('error')
          }
          return
        }

        console.warn('[InterviewComplete] AI scoring failed, using rule engine:', error)
        try {
          const session = analyzeInterview(record)
          if (!cancelled) {
            setFeedbackSession(session)
            setFeedbackState('ready')
          }
        } catch (fallbackError) {
          console.warn('[InterviewComplete] Feedback generation failed:', fallbackError)
          if (!cancelled) {
            setFeedbackError('反馈生成失败，请稍后再试。')
            setFeedbackState('error')
          }
        }
      }
    }
    void generateFeedback()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 跳转反馈页
  const handleViewFeedback = useCallback(() => {
    if (!feedbackSession) return
    navigate('/feedback', {
      state: { session: feedbackSession },
    })
  }, [navigate, feedbackSession])

  const handleRetry = useCallback(() => {
    clearActiveInterviewSession()
    navigate('/practice', { replace: true })
  }, [navigate])

  return (
    <div className="flex flex-col items-center max-w-lg mx-auto">
      {/* 完成图标 */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="mb-6"
      >
        <div className="w-20 h-20 rounded-[22px] bg-gradient-to-br from-emerald-500 to-emerald-600
          flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </motion.div>

      {/* 标题 */}
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-[24px] font-semibold text-slate-900 mb-2 tracking-tight"
      >
        面签完成！
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-[14px] text-slate-500 mb-8"
      >
        你的表现已经记录下来，可以查看 AI 教练的详细分析
      </motion.p>

      {/* 数据概览卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full bg-white border border-slate-200 rounded-2xl p-5 mb-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-slate-500">签证类型</span>
          <span className="text-[13px] font-semibold text-slate-900">{visaTypeLabel[context.visaType] ?? context.visaType}</span>
        </div>
        <div className="w-full h-[1px] bg-slate-100" />

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-slate-500">对话时长</span>
          <span className="text-[13px] font-semibold text-slate-900 font-mono">{duration}</span>
        </div>
        <div className="w-full h-[1px] bg-slate-100" />

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-slate-500">提问数量</span>
          <span className="text-[13px] font-semibold text-slate-900">{officerQuestions.length} 个问题</span>
        </div>
        <div className="w-full h-[1px] bg-slate-100" />

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-slate-500">回答数量</span>
          <span className="text-[13px] font-semibold text-slate-900">{userAnswers.length} 条回答</span>
        </div>

        {/* AI 策略简述 */}
        {analysis.strategy && (
          <>
            <div className="w-full h-[1px] bg-slate-100" />
            <div>
              <span className="text-[13px] font-medium text-slate-700">AI 策略分析</span>
              <p className="text-[12px] text-slate-500 leading-relaxed mt-1">{analysis.strategy}</p>
            </div>
          </>
        )}
      </motion.div>

      {/* 风险点提醒 */}
      {analysis.riskPoints.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6"
        >
          <p className="text-[12px] font-semibold text-amber-700 mb-2">⚠️ AI 识别你的风险点</p>
          <ul className="space-y-1">
            {analysis.riskPoints.map((point, i) => (
              <li key={i} className="text-[12px] text-amber-700 flex gap-2">
                <span className="font-bold">{i + 1}.</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* 行动按钮 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col sm:flex-row gap-3 w-full"
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleViewFeedback}
          disabled={feedbackState !== 'ready'}
          className="flex-1 px-5 py-3 rounded-xl bg-blue-500 text-[14px] font-semibold text-white
            hover:bg-blue-600 transition-all duration-200 shadow-sm shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {feedbackState === 'generating' ? '正在生成反馈…' : feedbackState === 'ready' ? '查看并下载反馈 →' : '反馈生成失败'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleRetry}
          className="px-5 py-3 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-600
            hover:border-slate-300 hover:text-slate-800 transition-all duration-200"
        >
          再练一次
        </motion.button>
      </motion.div>

      {feedbackError && <p className="mt-3 text-center text-[12px] text-amber-600">{feedbackError}</p>}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-6 text-[11px] text-slate-400"
      >
        本次反馈不会长期保存，生成后请立即下载 PDF 或截图留存
      </motion.p>
    </div>
  )
}
