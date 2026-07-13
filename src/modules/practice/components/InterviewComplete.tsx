import { useRef, useEffect, useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  HiOutlineArrowPath,
  HiOutlineArrowRight,
  HiOutlineCheck,
  HiOutlineChartBarSquare,
  HiOutlineClock,
  HiOutlineDocumentArrowDown,
  HiOutlineExclamationTriangle,
  HiOutlineQuestionMarkCircle,
} from 'react-icons/hi2'
import type { ChatMessage, UserContext, AIAnalysisResult, InterviewRecord } from '../types'
import type { InterviewSession } from '../../feedback/types'
import { analyzeInterview, analyzeInterviewWithAI } from '../../shared/store/analysisEngine'
import { generateSessionId, getNowFormatted } from '../../shared/store/interviewStore'

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

const AI_FEEDBACK_TIMEOUT_MS = 8000

interface FeedbackResult {
  session: InterviewSession
  usedLocalFallback: boolean
}

function waitForFeedback<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('AI_FEEDBACK_TIMEOUT')), timeoutMs)
    promise.then(
      value => {
        window.clearTimeout(timer)
        resolve(value)
      },
      error => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function generateFeedbackResult(record: InterviewRecord): Promise<FeedbackResult> {
  try {
    const session = await waitForFeedback(analyzeInterviewWithAI(record), AI_FEEDBACK_TIMEOUT_MS)
    return { session, usedLocalFallback: false }
  } catch (error) {
    console.warn('[InterviewComplete] AI scoring unavailable, using rule engine:', error)
    return { session: analyzeInterview(record), usedLocalFallback: true }
  }
}

export default function InterviewComplete({ messages, context, analysis, duration }: Props) {
  const navigate = useNavigate()
  const feedbackPromiseRef = useRef<Promise<FeedbackResult> | null>(null)
  const [feedbackState, setFeedbackState] = useState<'generating' | 'ready' | 'error'>('generating')
  const [feedbackError, setFeedbackError] = useState('')
  const [feedbackSession, setFeedbackSession] = useState<InterviewSession | null>(null)

  const officerQuestions = messages.filter(m => m.role === 'officer')
  const userAnswers = messages.filter(m => m.role === 'user')

  // 面签完成后仅生成本次反馈，不写入个人记录或云端数据库。
  useEffect(() => {
    if (messages.length === 0) {
      setFeedbackError('暂无可分析的对话记录。')
      setFeedbackState('error')
      return
    }

    if (!feedbackPromiseRef.current) {
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

      feedbackPromiseRef.current = generateFeedbackResult(record)
    }

    let cancelled = false
    void feedbackPromiseRef.current.then(
      ({ session, usedLocalFallback }) => {
        if (!cancelled) {
          setFeedbackSession(session)
          setFeedbackError(usedLocalFallback ? 'AI 服务未连接，已使用本地规则生成反馈。' : '')
          setFeedbackState('ready')
        }
      },
      error => {
        console.warn('[InterviewComplete] Feedback generation failed:', error)
        if (!cancelled) {
          setFeedbackError('反馈生成失败，请稍后再试。')
          setFeedbackState('error')
        }
      },
    )

    return () => { cancelled = true }
  }, [analysis, context, duration, messages])

  // 跳转反馈页
  const handleViewFeedback = useCallback(() => {
    if (!feedbackSession) return
    navigate('/feedback', {
      state: { session: feedbackSession },
    })
  }, [navigate, feedbackSession])

  const handleRetry = useCallback(() => {
    navigate('/practice', { replace: true })
  }, [navigate])

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center pb-12">
      {/* 完成图标 */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="mb-7"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-[#158f65] text-white shadow-xl shadow-emerald-500/20">
          <HiOutlineCheck className="h-9 w-9" />
        </div>
      </motion.div>

      {/* 标题 */}
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-[34px] font-semibold tracking-[-0.05em] text-[#1d1d1f]"
      >
        这次练习，完成了。
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-8 mt-3 max-w-lg text-center text-[14px] leading-6 text-[#6e6e73]"
      >
        每一次完整表达都在积累稳定感。反馈正在整理你最值得优先改进的部分。
      </motion.p>

      {/* 数据概览卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="app-card mb-4 grid w-full grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5"
      >
        <div className="rounded-2xl bg-[#f5f5f7] p-4">
          <HiOutlineChartBarSquare className="h-5 w-5 text-[#0071e3]" />
          <span className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#86868b]">签证类型</span>
          <span className="mt-1 block text-[13px] font-semibold text-[#1d1d1f]">{visaTypeLabel[context.visaType] ?? context.visaType}</span>
        </div>
        <div className="rounded-2xl bg-[#f5f5f7] p-4">
          <HiOutlineClock className="h-5 w-5 text-[#6554c0]" />
          <span className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#86868b]">对话时长</span>
          <span className="mt-1 block text-[13px] font-semibold tabular-nums text-[#1d1d1f]">{duration}</span>
        </div>
        <div className="rounded-2xl bg-[#f5f5f7] p-4">
          <HiOutlineQuestionMarkCircle className="h-5 w-5 text-[#9a5f12]" />
          <span className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#86868b]">提问数量</span>
          <span className="mt-1 block text-[13px] font-semibold text-[#1d1d1f]">{officerQuestions.length} 个问题</span>
        </div>
        <div className="rounded-2xl bg-[#f5f5f7] p-4">
          <HiOutlineCheck className="h-5 w-5 text-[#158f65]" />
          <span className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#86868b]">回答数量</span>
          <span className="mt-1 block text-[13px] font-semibold text-[#1d1d1f]">{userAnswers.length} 条回答</span>
        </div>

        {/* AI 策略简述 */}
        {analysis.strategy && (
          <div className="col-span-2 rounded-2xl border border-black/[0.06] bg-white p-4 sm:col-span-4">
            <span className="text-[12px] font-semibold text-[#424245]">本次面签策略</span>
            <p className="mt-1 text-[12px] leading-6 text-[#6e6e73]">{analysis.strategy}</p>
          </div>
        )}
      </motion.div>

      {/* 风险点提醒 */}
      {analysis.riskPoints.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-4 w-full rounded-[20px] border border-amber-200/70 bg-[#fff6e6] p-5"
        >
          <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#8a5818]"><HiOutlineExclamationTriangle className="h-[17px] w-[17px]" /> 本次需要留意</p>
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
        className="flex w-full flex-col gap-3 sm:flex-row"
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleViewFeedback}
          disabled={feedbackState !== 'ready'}
          className="app-button-primary flex-1"
        >
          {feedbackState === 'generating' ? <><HiOutlineArrowPath className="h-4 w-4 animate-spin" /> 正在整理反馈</> : feedbackState === 'ready' ? <><HiOutlineDocumentArrowDown className="h-4 w-4" /> 查看并下载反馈 <HiOutlineArrowRight className="h-4 w-4" /></> : '反馈生成失败'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleRetry}
          className="app-button-secondary"
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
