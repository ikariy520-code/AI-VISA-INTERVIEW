import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { UserContext, ChatMessage, InterviewStatus, AIAnalysisResult, OfficerEmotion } from '../types'
import type { OfficerType } from '../../voice/types'
import { generateOfficerResponse, textToSpeech } from '../services/openai'
import { getMockGreeting } from '../data/mockOfficer'
import { getRandomOfficerName } from '../../voice/data/officerNames'
import ChatBubble from './ChatBubble'
import VoiceControls from './VoiceControls'
import OfficerNameIntro from './OfficerNameIntro'

// ========================================
// Step 4: 面签对话室 — 核心体验
//
// 流程：
//   1. AI 面签官说开场白
//   2. 用户通过文字输入回答（后续替换为语音）
//   3. AI 分析回答 → 追问或下一题
//   4. 多轮对话后 AI 给出结束语
//
// 语音就绪：
//   · 麦克风按钮 + 录音动画 — 点击后以文字代替语音
//   · 后续接入 Web Speech API 替换文字输入
//   · 所有对话记录保存 → 对接 Phase 3 反馈
// ========================================

interface Props {
  context: UserContext
  analysis: AIAnalysisResult
  officerType: OfficerType
  onComplete: (messages: ChatMessage[]) => void
}

let msgCounter = 0
function nextId() { return `msg-${++msgCounter}-${Date.now()}` }

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function InterviewRoom({ context, analysis, officerType, onComplete }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<InterviewStatus>('officer-speaking')
  const [elapsed, setElapsed] = useState(0)
  const [userInput, setUserInput] = useState('')
  const [officerEmotion, setOfficerEmotion] = useState<OfficerEmotion>('friendly')
  const [officerName] = useState(() => getRandomOfficerName())  // 随机面签官姓名
  const [showIntro, setShowIntro] = useState(true)               // 出场动画
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  // 计时器（出场动画结束后启动）
  useEffect(() => {
    if (showIntro) return
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [showIntro])

  // 开场白（出场动画结束后播放）
  useEffect(() => {
    if (showIntro) return
    const timer = setTimeout(() => {
      const greeting = getMockGreeting(context.visaType)
      const msg: ChatMessage = {
        id: nextId(),
        role: 'officer',
        text: greeting,
        timestamp: formatTime(elapsed),
        emotion: 'friendly',
      }
      setMessages([msg])
      setStatus('idle')
      // TTS 朗读开场白（使用当前面签官类型的音色）
      setTimeout(() => textToSpeech(greeting, officerType), 100)
    }, 500)
    return () => clearTimeout(timer)
  }, [showIntro]) // eslint-disable-line react-hooks/exhaustive-deps

  // 自动滚动
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 用户发送消息
  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || status === 'processing') return

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      text: text.trim(),
      timestamp: formatTime(elapsed),
    }

    setMessages(prev => [...prev, userMsg])
    setUserInput('')
    setStatus('processing')

    // 构建对话历史
    const history = messages.map(m => ({ role: m.role, text: m.text }))

    try {
      // 调用 AI（mock 模式下本地生成回复）
      const response = await generateOfficerResponse(context, history, text.trim(), officerType)

      // 模拟自然延迟（真人对话不会秒回）
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200))

      const officerMsg: ChatMessage = {
        id: nextId(),
        role: 'officer',
        text: response.text,
        timestamp: formatTime(elapsed),
        emotion: response.emotion as OfficerEmotion,
      }

      setMessages(prev => [...prev, officerMsg])
      setOfficerEmotion(response.emotion as OfficerEmotion)

      // TTS 朗读面签官回复（音色从 officerType 配置读取，保证每次一致）
      textToSpeech(response.text, officerType)

      // 判断是否结束
      const lower = response.text.toLowerCase()
      if (
        lower.includes('approved') ||
        lower.includes('visa is approved') ||
        lower.includes('your visa will') ||
        lower.includes('next!') ||
        lower.includes('have a good trip') ||
        lower.includes('take care')
      ) {
        setStatus('idle')
        // 延迟结束
        setTimeout(() => {
          setMessages(prev => {
            onComplete(prev)
            return prev
          })
        }, 2000)
      } else {
        setStatus('idle') // 等待用户下一个回答
      }
    } catch {
      setStatus('idle')
    }
  }, [messages, context, elapsed, status, onComplete])

  // 手动结束
  const handleEnd = () => {
    clearInterval(timerRef.current)
    setStatus('processing')
    setMessages(prev => {
      onComplete(prev)
      return prev
    })
  }

  return (
    <>
      {/* ---- 面签官姓名出场动画 ---- */}
      {showIntro && (
        <OfficerNameIntro
          name={officerName}
          onComplete={() => setShowIntro(false)}
        />
      )}

      <div className="flex flex-col h-[calc(100vh-120px)] max-w-2xl mx-auto">
      {/* ---- 顶部：AI 面签官头像 ---- */}
      <div className="flex flex-col items-center py-6 border-b border-slate-100">
        {/* 大号头像 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={officerEmotion}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className={`w-16 h-16 rounded-[18px] bg-gradient-to-br flex items-center justify-center shadow-lg
              ${officerEmotion === 'friendly' || officerEmotion === 'reassuring' ? 'from-emerald-500 to-emerald-600 shadow-emerald-500/20' :
                officerEmotion === 'stern' ? 'from-amber-500 to-amber-600 shadow-amber-500/20' :
                officerEmotion === 'curious' || officerEmotion === 'thoughtful' ? 'from-violet-500 to-violet-600 shadow-violet-500/20' :
                'from-blue-500 to-blue-600 shadow-blue-500/20'}`}
            >
              <span className="text-2xl">
                {officerEmotion === 'friendly' || officerEmotion === 'reassuring' ? '😊' :
                 officerEmotion === 'stern' ? '🤨' :
                 officerEmotion === 'curious' || officerEmotion === 'thoughtful' ? '🤔' : '🫡'}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-3 text-center">
          <p className="text-[15px] font-semibold text-slate-900">
            {officerName} 面签官
          </p>
          <p className="text-[11px] text-slate-400 font-medium">
            {context.visaType} · {context.purpose || '面签练习'}
          </p>
        </div>

        {/* 说话指示 */}
        {status === 'officer-speaking' && (
          <div className="flex items-center gap-[2px] mt-2">
            {[0, 1, 2, 3].map(i => (
              <motion.span
                key={i}
                animate={{ height: [4, 12, 6, 10, 4] }}
                transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.12 }}
                className="w-[3px] rounded-full bg-blue-400"
              />
            ))}
          </div>
        )}
      </div>

      {/* ---- 中间：对话区域 ---- */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
        {messages.map(msg => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* ---- 底部：输入 + 控制 ---- */}
      <div className="border-t border-slate-200 bg-white">
        {/* 文字输入栏（语音就绪 — 后续替换为纯语音输入） */}
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(userInput) }}
            placeholder={
              status === 'processing' ? 'AI 正在思考...' :
              status === 'officer-speaking' ? '等待面签官说完...' :
              '输入你的回答...（后续版本支持语音输入）'
            }
            disabled={status === 'processing' || status === 'officer-speaking'}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200
              text-[14px] text-slate-900 placeholder:text-slate-400
              outline-none transition-all duration-200
              focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white
              disabled:bg-slate-100 disabled:text-slate-400"
          />

          {/* 发送按钮 */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => handleSend(userInput)}
            disabled={status === 'processing' || status === 'officer-speaking' || !userInput.trim()}
            className="px-4 py-2.5 rounded-xl bg-blue-500 text-white text-[14px] font-semibold
              hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed
              transition-all duration-200 shadow-sm shadow-blue-500/20"
          >
            发送
          </motion.button>
        </div>

        {/* 语音控制栏 */}
        <VoiceControls
          status={status}
          elapsed={formatTime(elapsed)}
          onStartSpeak={() => inputRef.current?.focus()}
          onStopSpeak={() => {}}
          onEndInterview={handleEnd}
        />
      </div>
      </div>
    </>
  )
}
