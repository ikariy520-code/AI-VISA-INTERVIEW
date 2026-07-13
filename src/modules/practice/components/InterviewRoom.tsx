import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HiOutlineArrowPath, HiOutlineSignal } from 'react-icons/hi2'
import type { UserContext, ChatMessage, InterviewStatus, AIAnalysisResult, OfficerEmotion } from '../types'
import type { OfficerType } from '../../voice/types'
import { generateOfficerResponse, textToSpeech } from '../services/openai'
import { getMockGreeting, resetInterviewFlow } from '../data/mockOfficer'
import { getRandomOfficerName } from '../../voice/data/officerNames'
import { useVoiceInput, formatDuration } from '../hooks/useVoiceInput'
import ChatBubble from './ChatBubble'
import VoiceControls from './VoiceControls'
import OfficerNameIntro from './OfficerNameIntro'
import OfficerAvatar from './OfficerAvatar'

// ========================================
// Step 4: 面签对话室 — 语音交互
//
// 流程：
//   1. AI 面签官说出问题（TTS）
//   2. 用户点击麦克风按钮开始录音
//   3. 用户说话，麦克风显示录音动画+时长
//   4. 用户点击停止录音 → 语音识别 → 提交答案
//   5. AI 分析回答 → 追问或下一题
//
// 状态流转：
//   idle → (点击麦克风) → user-speaking → (停止录音) → processing → idle
// ========================================

interface Props {
  context: UserContext
  analysis: AIAnalysisResult
  officerType: OfficerType
  onComplete: (messages: ChatMessage[]) => void
}

let msgCounter = 0
function nextId() { return `msg-${++msgCounter}-${Date.now()}` }

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

/** 检测结束语 */
function checkClosingText(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('approved') ||
    lower.includes('visa is approved') ||
    lower.includes('your visa will') ||
    lower.includes('next!') ||
    lower.includes('have a good trip') ||
    lower.includes('take care') ||
    lower.includes('process your visa') ||
    lower.includes('notified of the result') ||
    lower.includes('that\'s all for') ||
    lower.includes('we\'ll review')
  )
}

export default function InterviewRoom({ context, analysis, officerType, onComplete }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<InterviewStatus>('officer-speaking')
  const [elapsed, setElapsed] = useState(0)
  const [officerEmotion, setOfficerEmotion] = useState<OfficerEmotion>('friendly')
  const [officerName] = useState(() => getRandomOfficerName())
  const [showIntro, setShowIntro] = useState(true)
  const [aiError, setAiError] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const processingRef = useRef(false)
  const lastUserAnswerRef = useRef('')

  // ---- 语音输入 ----

  const handleVoiceResult = useCallback((text: string) => {
    lastUserAnswerRef.current = text
    // 触发提交逻辑
    submitAnswer(text)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const voice = useVoiceInput({
    onResult: handleVoiceResult,
    lang: 'en-US',
  })

  // ---- 计时器 ----

  useEffect(() => {
    if (showIntro) return
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [showIntro])

  // ---- 开场白 ----

  useEffect(() => {
    if (showIntro) return
    const timer = setTimeout(() => {
      resetInterviewFlow()
      const greeting = getMockGreeting(context.visaType, context)
      const msg: ChatMessage = {
        id: nextId(),
        role: 'officer',
        text: greeting,
        timestamp: formatElapsed(elapsed),
        emotion: 'friendly',
      }
      setMessages([msg])
      setStatus('idle') // 等待用户开始录音
      setTimeout(() => textToSpeech(greeting, officerType), 150)
    }, 500)
    return () => clearTimeout(timer)
  }, [showIntro]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 自动滚动 ----

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ---- 提交用户回答 ----

  const submitAnswer = useCallback(async (text: string) => {
    if (!text.trim() || processingRef.current) return
    processingRef.current = true

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      text: text.trim(),
      timestamp: formatElapsed(elapsed),
    }

    setMessages(prev => [...prev, userMsg])
    setStatus('processing')
    setAiError('')

    const history = messages.map(m => ({ role: m.role, text: m.text }))

    try {
      const response = await generateOfficerResponse(context, history, text.trim(), officerType)

      // 模拟自然延迟
      await new Promise(r => setTimeout(r, 800 + Math.random() * 800))

      const officerMsg: ChatMessage = {
        id: nextId(),
        role: 'officer',
        text: response.text,
        timestamp: formatElapsed(elapsed),
        emotion: response.emotion as OfficerEmotion,
        isDocumentRequest: response.isDocumentRequest,
      }

      setMessages(prev => [...prev, officerMsg])
      setOfficerEmotion(response.emotion as OfficerEmotion)

      // TTS 朗读
      textToSpeech(response.text, officerType)

      // 结束判断
      if (response.isClosing || checkClosingText(response.text)) {
        processingRef.current = false
        setStatus('idle')
        setTimeout(() => {
          setMessages(prev => {
            onComplete(prev)
            return prev
          })
        }, 2500)
      } else {
        processingRef.current = false
        setStatus('idle') // 等待用户下一轮录音
      }
    } catch (error) {
      processingRef.current = false
      setStatus('idle')
      setAiError(error instanceof Error ? error.message : 'AI 暂时无法回答，请稍后重试。')
    }
  }, [messages, context, elapsed, officerType, onComplete])

  // ---- 麦克风点击 ----

  const handleMicPress = useCallback(() => {
    if (status === 'processing' || status === 'officer-speaking') return

    if (status === 'user-speaking') {
      // 正在录音 → 停止并提交
      voice.stop()
    } else {
      // idle → 开始录音
      voice.start()
      setStatus('user-speaking')
    }
  }, [status, voice])

  // ---- 监听录音结束（用户调用了 stop） ----

  // 当 isRecording 从 true 变成 false 且不是由 submitAnswer 触发的 processing
  // voice.onResult 会在 stop 后异步触发 submitAnswer
  // 需要在这里处理状态转换

  // 使用 ref 追踪上一个 isRecording 值
  const wasRecordingRef = useRef(false)
  useEffect(() => {
    const wasRecording = wasRecordingRef.current
    wasRecordingRef.current = voice.isRecording

    // 如果用户取消了录音（比如 SpeechRecognition 异常结束）且没有识别结果
    if (wasRecording && !voice.isRecording && !voice.partialTranscript && status === 'user-speaking') {
      // 短暂停留后回到 idle
      const t = setTimeout(() => setStatus('idle'), 500)
      return () => clearTimeout(t)
    }
  }, [voice.isRecording, voice.partialTranscript, status])

  // ---- 手动结束 ----

  const handleEnd = useCallback(() => {
    clearInterval(timerRef.current)
    voice.cancel()
    setMessages(prev => {
      onComplete(prev)
      return prev
    })
  }, [voice, onComplete])

  return (
    <>
      {/* ---- 面签官姓名出场动画 ---- */}
      {showIntro && (
        <OfficerNameIntro
          name={officerName}
          onComplete={() => setShowIntro(false)}
        />
      )}

      <div className="app-card mx-auto flex h-[calc(100vh-104px)] max-w-3xl flex-col overflow-hidden">
        {/* ---- 顶部：AI 面签官头像 ---- */}
        <div className="relative flex flex-col items-center border-b border-black/[0.06] bg-white px-5 py-5">
          <div className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-[#eaf8f2] px-2.5 py-1 text-[10px] font-semibold text-[#147a58]">
            <HiOutlineSignal className="h-3.5 w-3.5" /> 实时面签
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={officerEmotion}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.28, 0.11, 0.32, 1] }}
            >
              <OfficerAvatar emotion={officerEmotion} isSpeaking={status === 'officer-speaking'} size="md" />
            </motion.div>
          </AnimatePresence>

          <div className="mt-2 text-center">
            <p className="text-[15px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              {officerName} 面签官
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-[#86868b]">
              {context.visaType} · {context.purpose || '面签练习'}
            </p>
          </div>

          {/* 说话指示 */}
          {status === 'officer-speaking' && (
            <div className="flex items-center gap-[2px] mt-2">
              {[0, 1, 2, 3, 4].map(i => (
                <motion.span
                  key={i}
                  animate={{ height: [3, 11, 5, 9, 3] }}
                  transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.09 }}
                  className="w-[2px] rounded-full bg-[#0071e3]"
                />
              ))}
            </div>
          )}

          {/* 处理中指示 */}
          {status === 'processing' && (
            <div className="mt-2 flex items-center gap-2 text-[11px] font-medium text-[#86868b]">
              <HiOutlineArrowPath className="h-3.5 w-3.5 animate-spin text-[#0071e3]" />
              正在组织下一次追问
            </div>
          )}
        </div>

        {/* ---- 中间：对话区域 ---- */}
        <div className="flex-1 space-y-1 overflow-y-auto bg-[#fbfbfd] px-4 py-5 sm:px-6">
          {messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))}

          {/* 录音时的实时转写预览 */}
          {status === 'user-speaking' && voice.partialTranscript && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-end"
            >
              <div className="max-w-[82%] rounded-[18px] rounded-br-md border border-[#0071e3]/15 bg-[#eaf4ff] px-4 py-3">
                <p className="text-[14px] italic leading-relaxed text-[#536271]">
                  {voice.partialTranscript}
                </p>
              </div>
            </motion.div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* ---- 底部：语音控制 ---- */}
        {aiError && (
          <div className="mx-4 mb-2 rounded-2xl border border-red-200/70 bg-[#fff0ef] px-4 py-3 text-[12px] text-[#b53a34] sm:mx-6">
            {aiError}
          </div>
        )}
        <VoiceControls
          status={status}
          elapsed={formatElapsed(elapsed)}
          recordingDuration={formatDuration(voice.duration)}
          partialTranscript={voice.partialTranscript}
          error={voice.error}
          isSupported={voice.isSupported}
          onMicPress={handleMicPress}
          onEndInterview={handleEnd}
        />
      </div>
    </>
  )
}
