import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  HiMiniMicrophone,
  HiMiniStop,
  HiOutlineArrowPath,
  HiOutlineExclamationTriangle,
  HiOutlineShieldCheck,
  HiOutlineSignal,
} from 'react-icons/hi2'
import type { OfficerType } from '../types'
import { officerTypes } from '../data/officerTypes'
import { getRandomOfficerName } from '../data/officerNames'
import OfficerIcon from '../OfficerIcon'
import type { ChatMessage, UserContext } from '../../practice/types'
import {
  buildRealtimeInterviewPrompt,
  resolveRealtimeVoice,
} from '../../practice/services/realtimeInterviewPrompt'
import {
  DoubaoRealtimeClient,
  realtimeEventText,
  type DoubaoRealtimeEvent,
} from '../services/doubaoRealtime'

interface RealtimeChatMessage extends ChatMessage {
  streaming?: boolean
}

interface Props {
  context: UserContext
  officerType: OfficerType
  onComplete: (messages: ChatMessage[]) => void
}

type Phase =
  | 'checking'
  | 'ready'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'ending'
  | 'ended'
  | 'error'

let messageSequence = 0
const nextMessageId = () => `doubao-message-${++messageSequence}-${Date.now()}`
const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export default function VoiceInterviewRoom({ context, officerType, onComplete }: Props) {
  const officerConfig = officerTypes.find(officer => officer.id === officerType)
    ?? officerTypes.find(officer => officer.id === 'standard')!

  const [phase, setPhase] = useState<Phase>('checking')
  const [messages, setMessages] = useState<RealtimeChatMessage[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [officerName] = useState(() => getRandomOfficerName())

  const clientRef = useRef<DoubaoRealtimeClient | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const activeUserMessageRef = useRef<string | null>(null)
  const activeOfficerMessageRef = useRef<string | null>(null)
  const currentUserTextRef = useRef('')
  const currentOfficerTextRef = useRef('')
  const connectedRef = useRef(false)
  const mutedRef = useRef(false)
  const endingRef = useRef(false)
  const endedRef = useRef(false)
  const elapsedRef = useRef(0)
  const messagesRef = useRef<RealtimeChatMessage[]>([])

  const returnToListening = useCallback(() => {
    setPhase(mutedRef.current ? 'muted' : 'listening')
  }, [])

  const upsertMessage = useCallback((
    id: string,
    role: 'officer' | 'user',
    text: string,
    streaming: boolean,
  ) => {
    setMessages(current => {
      const index = current.findIndex(message => message.id === id)
      if (index === -1) return [...current, { id, role, text, streaming, timestamp: formatElapsed(elapsedRef.current) }]
      const next = [...current]
      next[index] = { ...next[index], text, streaming }
      return next
    })
  }, [])

  const finishOfficerMessage = useCallback((finalText = '') => {
    const id = activeOfficerMessageRef.current
    if (!id) return
    if (finalText) currentOfficerTextRef.current = finalText
    upsertMessage(id, 'officer', currentOfficerTextRef.current, false)
    activeOfficerMessageRef.current = null
    currentOfficerTextRef.current = ''
  }, [upsertMessage])

  const handleRealtimeEvent = useCallback((event: DoubaoRealtimeEvent) => {
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.started': {
        finishOfficerMessage()
        currentUserTextRef.current = ''
        const id = nextMessageId()
        activeUserMessageRef.current = id
        upsertMessage(id, 'user', '正在识别…', true)
        setPhase('listening')
        break
      }

      case 'conversation.item.input_audio_transcription.delta': {
        const text = realtimeEventText(event)
        if (!text) break
        currentUserTextRef.current = text
        const id = activeUserMessageRef.current ?? nextMessageId()
        activeUserMessageRef.current = id
        upsertMessage(id, 'user', text, true)
        break
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const text = realtimeEventText(event) || currentUserTextRef.current
        const id = activeUserMessageRef.current
        if (id && text) upsertMessage(id, 'user', text, false)
        if (id && !text) {
          setMessages(current => current.filter(message => message.id !== id))
        }
        activeUserMessageRef.current = null
        currentUserTextRef.current = ''
        setPhase('thinking')
        break
      }

      case 'conversation.item.input_audio_transcription.failed':
        setErrorMessage('这句话没有听清，请靠近麦克风再说一次。')
        returnToListening()
        break

      case 'response.output_text.delta': {
        const delta = realtimeEventText(event)
        if (!delta) break
        const id = activeOfficerMessageRef.current ?? nextMessageId()
        activeOfficerMessageRef.current = id
        currentOfficerTextRef.current += delta
        upsertMessage(id, 'officer', currentOfficerTextRef.current, true)
        setPhase('speaking')
        break
      }

      case 'response.output_text.done': {
        finishOfficerMessage(realtimeEventText(event))
        break
      }

      case 'response.output_audio.started':
        setPhase('speaking')
        break

      case 'response.output_audio.done':
        returnToListening()
        break

      case 'response.done':
        finishOfficerMessage()
        returnToListening()
        break

      case 'response.canceled':
        finishOfficerMessage()
        returnToListening()
        break

      case 'error':
        setErrorMessage(providerErrorMessage(event))
        setPhase('error')
        break

      case 'session.closed':
        if (endingRef.current) {
          setPhase('ended')
        }
        break

      default:
        break
    }
  }, [finishOfficerMessage, returnToListening, upsertMessage])

  const startInterview = useCallback(async () => {
    clientRef.current?.destroy()
    setErrorMessage('')
    setMessages([])
    setMicLevel(0)
    setIsMuted(false)
    setElapsed(0)
    elapsedRef.current = 0
    messagesRef.current = []
    mutedRef.current = false
    endedRef.current = false
    endingRef.current = false
    connectedRef.current = false
    activeUserMessageRef.current = null
    activeOfficerMessageRef.current = null
    currentUserTextRef.current = ''
    currentOfficerTextRef.current = ''
    setPhase('connecting')

    const client = new DoubaoRealtimeClient({
      instructions: buildRealtimeInterviewPrompt(context, officerType),
      voice: resolveRealtimeVoice(officerConfig.voiceProfile.gender),
      onEvent: handleRealtimeEvent,
      onInputLevel: setMicLevel,
      onConnectionState: (state) => {
        if (state === 'connecting') setPhase('connecting')
        if (state === 'connected') connectedRef.current = true
        if (state === 'closed') {
          connectedRef.current = false
          if (!endingRef.current && !endedRef.current) setPhase('error')
        }
      },
      onError: (message) => {
        setErrorMessage(message)
        if (!connectedRef.current) setPhase('error')
      },
    })

    clientRef.current = client
    try {
      await client.start()
      setPhase(current => current === 'connecting'
        ? (mutedRef.current ? 'muted' : 'listening')
        : current)
    } catch {
      clientRef.current = null
      setPhase('error')
    }
  }, [context, handleRealtimeEvent, officerConfig.voiceProfile.gender, officerType])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/realtime-health', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { message?: unknown } | null
          throw new Error(typeof payload?.message === 'string'
            ? payload.message
            : '实时语音服务的 API Key 尚未配置。')
        }
        setPhase('ready')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setErrorMessage(error instanceof Error ? error.message : '无法检查实时语音连接配置。')
        setPhase('error')
      })

    return () => {
      controller.abort()
      clientRef.current?.destroy()
      clientRef.current = null
    }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (!connectedRef.current || phase === 'ending' || phase === 'ended') return
    const timer = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const toggleMute = useCallback(() => {
    if (!connectedRef.current || endingRef.current) return
    const nextMuted = !mutedRef.current
    mutedRef.current = nextMuted
    setIsMuted(nextMuted)
    clientRef.current?.setMuted(nextMuted)
    setMicLevel(0)
    setPhase(nextMuted ? 'muted' : 'listening')
  }, [])

  const endInterview = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    endedRef.current = true
    setPhase('ending')
    setMicLevel(0)
    try {
      await clientRef.current?.end()
    } finally {
      clientRef.current = null
      connectedRef.current = false
      setPhase('ended')
      endingRef.current = false
      const completedMessages = messagesRef.current
        .filter(message => !message.streaming && message.text.trim())
        .map(({ streaming: _streaming, ...message }) => message)
      onComplete(completedMessages)
    }
  }, [onComplete])

  const status = phaseStatus(phase)
  const isConnected = ['listening', 'thinking', 'speaking', 'muted'].includes(phase)
  const canStart = phase === 'ready' || phase === 'error' || phase === 'ended'

  return (
    <div className="app-card relative mx-auto flex h-[calc(100vh-112px)] max-w-3xl flex-col overflow-hidden">
      <header className="relative z-10 flex shrink-0 items-center justify-between px-5 py-4">
        <span className="w-12 text-[11px] tabular-nums text-[#86868b]">{formatElapsed(elapsed)}</span>

        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${status.className}`}>
          {status.spin
            ? <HiOutlineArrowPath className="h-3 w-3 animate-spin" />
            : <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />}
          {status.label}
        </div>

        {isConnected || phase === 'ending' ? (
          <button
            type="button"
            onClick={endInterview}
            disabled={phase === 'ending'}
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#86868b] transition hover:bg-[#fff0ef] hover:text-[#c9342f] disabled:opacity-50"
          >
            结束
          </button>
        ) : <span className="w-12" />}
      </header>

      <section className="flex shrink-0 flex-col items-center px-5 pb-3 pt-1">
        <motion.div
          animate={phase === 'speaking' ? { scale: [1, 1.035, 1] } : { scale: 1 }}
          transition={{ repeat: phase === 'speaking' ? Infinity : 0, duration: 1.3 }}
          className="relative"
        >
          <OfficerIcon type={officerType} className="h-20 w-20 rounded-[26px] shadow-lg" />
          {isConnected && (
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#147a58] text-white shadow-sm">
              <HiOutlineSignal className="h-3.5 w-3.5" />
            </span>
          )}
        </motion.div>
        <h1 className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
          {officerName}
        </h1>
        <p className="text-[12px] text-[#86868b]">
          {officerConfig.label} · AI Realtime
        </p>
      </section>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-2.5">
          {messages.length === 0 && phase !== 'connecting' && (
            <div className="mx-auto mt-6 max-w-sm rounded-[24px] border border-black/[0.06] bg-white/80 px-6 py-6 text-center shadow-[0_18px_60px_rgba(0,0,0,0.05)] backdrop-blur-xl">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#eaf4ff] text-[#0071e3]">
                <HiOutlineSignal className="h-5 w-5" />
              </div>
              <p className="mt-4 text-[15px] font-semibold text-[#1d1d1f]">实时语音面签</p>
              <p className="mt-2 text-[12px] leading-5 text-[#6e6e73]">
                开始后保持自然对话即可。AI 面签官会实时听取、理解并用语音追问；面签官说话时也可以直接开口打断。
              </p>
            </div>
          )}

          {messages.map(message => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[84%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'rounded-br-md bg-[#0071e3] text-white'
                  : 'rounded-bl-md bg-[#f2f2f7] text-[#1d1d1f]'
              } ${message.streaming ? 'ring-2 ring-[#0071e3]/10' : ''}`}>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{message.text}</p>
                {message.streaming && (
                  <span className={`mt-2 block h-1 w-8 animate-pulse rounded-full ${message.role === 'user' ? 'bg-white/45' : 'bg-[#0071e3]/35'}`} />
                )}
              </div>
            </motion.div>
          ))}

          {phase === 'thinking' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-[#f2f2f7] px-5 py-3">
                {[0, 1, 2].map(index => (
                  <motion.span
                    key={index}
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ repeat: Infinity, duration: 0.9, delay: index * 0.15 }}
                    className="h-2 w-2 rounded-full bg-[#86868b]"
                  />
                ))}
              </div>
            </motion.div>
          )}

          {phase === 'connecting' && (
            <div className="flex justify-center py-10">
              <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[12px] font-medium text-[#6e6e73] shadow-sm ring-1 ring-black/[0.05]">
                <HiOutlineArrowPath className="h-4 w-4 animate-spin text-[#0071e3]" />
                正在建立实时语音会话…
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </main>

      <AnimatePresence>
        {errorMessage && phase === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-4 mb-3"
          >
            <div className="mx-auto max-w-lg rounded-2xl border border-red-200/70 bg-[#fff0ef] px-4 py-3">
              <div className="flex items-start gap-2">
                <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#c9342f]" />
                <p className="text-[12px] leading-5 text-[#a22d29]">{errorMessage}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={startInterview} className="rounded-full bg-[#c9342f] px-4 py-1.5 text-[12px] font-semibold text-white">
                  重新连接
                </button>
                <button type="button" onClick={() => setErrorMessage('')} className="rounded-full bg-white px-4 py-1.5 text-[12px] font-semibold text-[#6e6e73]">
                  关闭提示
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="shrink-0 px-5 pb-6 pt-2">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
          <p className={`text-[13px] font-medium ${phase === 'speaking' ? 'text-[#7c3aed]' : phase === 'listening' ? 'text-[#0071e3]' : 'text-[#86868b]'}`}>
            {phaseHint(phase)}
          </p>

          <motion.button
            type="button"
            disabled={phase === 'checking' || phase === 'connecting' || phase === 'thinking' || phase === 'speaking' || phase === 'ending'}
            onClick={isConnected ? toggleMute : startInterview}
            whileTap={{ scale: 0.94 }}
            className={`relative flex h-[76px] w-[76px] items-center justify-center rounded-full shadow-xl transition-all ${
              phase === 'muted'
                ? 'bg-[#1d1d1f] shadow-black/15'
                : isConnected
                  ? 'bg-[#0071e3] shadow-blue-400/25'
                  : canStart
                    ? 'bg-[#0071e3] shadow-blue-400/20 hover:scale-[1.03] hover:bg-[#0069d9]'
                    : 'cursor-not-allowed bg-[#d2d2d7] shadow-black/5'
            }`}
            aria-label={isConnected ? (isMuted ? '打开麦克风' : '关闭麦克风') : '开始实时面签'}
          >
            {phase === 'connecting' || phase === 'ending'
              ? <HiOutlineArrowPath className="h-7 w-7 animate-spin text-white" />
              : phase === 'muted'
                ? <HiMiniStop className="h-7 w-7 text-white" />
                : <HiMiniMicrophone className="h-8 w-8 text-white" />}

            {phase === 'listening' && micLevel > 0.03 && (
              <motion.span
                animate={{ scale: 1 + micLevel * 0.65, opacity: 0.34 - micLevel * 0.12 }}
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#0071e3]"
              />
            )}
          </motion.button>

          <div className="flex items-center gap-1.5 text-center text-[10px] leading-4 text-[#a1a1a6]">
            <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0" />
            API Key 只保存在服务端；通话音频仅用于实时处理
          </div>
        </div>
      </footer>

    </div>
  )
}

function providerErrorMessage(event: DoubaoRealtimeEvent) {
  const nested = typeof event.error === 'object' && event.error
    ? event.error as Record<string, unknown>
    : null
  const detail = event.message || nested?.message || event.error
  const publicDetail = detail
    ? String(detail).replace(/豆包|doubao|bytedance|volcengine|openspeech/gi, '实时语音服务')
    : ''
  return publicDetail ? `实时语音服务返回错误：${publicDetail}` : '实时语音服务暂时不可用，请重新连接。'
}

function phaseStatus(phase: Phase) {
  switch (phase) {
    case 'checking':
      return { label: '检查配置', className: 'bg-[#f5f5f7] text-[#86868b]', dotClassName: '', spin: true }
    case 'connecting':
      return { label: '连接服务', className: 'bg-[#eaf4ff] text-[#0071e3]', dotClassName: '', spin: true }
    case 'thinking':
      return { label: 'AI 思考中', className: 'bg-[#f5f5f7] text-[#86868b]', dotClassName: '', spin: true }
    case 'speaking':
      return { label: '面签官回复中', className: 'bg-[#f5f0ff] text-[#7c3aed]', dotClassName: 'bg-[#7c3aed] animate-pulse', spin: false }
    case 'muted':
      return { label: '麦克风已关闭', className: 'bg-[#f5f5f7] text-[#6e6e73]', dotClassName: 'bg-[#86868b]', spin: false }
    case 'listening':
      return { label: 'AI 实时通话中', className: 'bg-[#eaf8f2] text-[#147a58]', dotClassName: 'bg-[#147a58] animate-pulse', spin: false }
    case 'error':
      return { label: '连接异常', className: 'bg-[#fff0ef] text-[#c9342f]', dotClassName: 'bg-[#c9342f]', spin: false }
    case 'ending':
      return { label: '正在结束', className: 'bg-[#f5f5f7] text-[#86868b]', dotClassName: '', spin: true }
    case 'ended':
      return { label: '通话已结束', className: 'bg-[#f5f5f7] text-[#86868b]', dotClassName: 'bg-[#86868b]', spin: false }
    default:
      return { label: '准备就绪', className: 'bg-[#eaf4ff] text-[#0071e3]', dotClassName: 'bg-[#0071e3]', spin: false }
  }
}

function phaseHint(phase: Phase) {
  switch (phase) {
    case 'checking': return '正在检查本地配置…'
    case 'ready': return '点击开始，进入 AI 实时语音面签'
    case 'connecting': return '正在建立安全的本地实时连接…'
    case 'listening': return '自然回答即可 · 面签官说话时可直接开口打断'
    case 'thinking': return '正在理解你的回答…'
    case 'speaking': return '面签官正在回复 · 你可以随时开口'
    case 'muted': return '麦克风已关闭 · 点击按钮恢复通话'
    case 'ending': return '正在安全结束实时会话…'
    case 'ended': return '本次面签已结束'
    case 'error': return '连接未成功，请查看上方提示'
  }
}
