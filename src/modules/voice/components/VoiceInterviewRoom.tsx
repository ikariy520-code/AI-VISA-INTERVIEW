import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  HiMiniMicrophone,
  HiMiniStop,
  HiOutlineArrowPath,
  HiOutlineEye,
  HiOutlineEyeSlash,
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
  F1_INTERVIEW_CLOSING_LINE,
  F1_INTERVIEW_HARD_LIMIT_SECONDS,
  F1_INTERVIEW_MAX_TOTAL_QUESTIONS,
  isF1InterviewClosingLine,
} from '../../practice/data/f1InterviewStandard'
import {
  buildRealtimeOpeningLine,
  buildRealtimeInterviewPrompt,
  buildRealtimeSpeakingStyle,
  findB2ModelBoundaryViolation,
  findF1ModelBoundaryViolation,
  isExactRealtimeClosingLine,
  isSafeF1RealtimeOfficerTurn,
  resolveRealtimeOfficerType,
  resolveRealtimeResumeOpeningLine,
  resolveRealtimeVoice,
} from '../../practice/services/realtimeInterviewPrompt'
import { resolveInterviewModePolicy } from '../../practice/services/interviewModePolicy'
import {
  createF1InterviewState,
  type F1InterviewState,
} from '../../practice/services/f1InterviewController'
import {
  B2_INTERVIEW_CLOSING_LINE,
  B2_INTERVIEW_HARD_LIMIT_SECONDS,
  B2_INTERVIEW_MAX_TOTAL_QUESTIONS,
  isB2InterviewClosingLine,
} from '../../practice/data/b2InterviewStandard'
import {
  approvedB2QuestionIds,
  createB2InterviewState,
  isApprovedB2OfficerText,
  type B2InterviewState,
} from '../../practice/services/b2InterviewController'
import { createRealtimeClient } from '../services/createRealtimeClient'
import {
  isRealtimeVoiceProviderId,
  realtimeEventText,
  type RealtimeVoiceClient,
  type RealtimeVoiceEvent,
  type RealtimeVoiceProviderId,
} from '../services/realtimeProvider'
import RealtimeVoiceOrb from './RealtimeVoiceOrb'
import { useOrderAccess } from '../../../shared/orderAccess'
import type { LiveInterviewProgress } from '../../shared/store/interviewRecovery'
import { consumeControlledAnswer } from '../services/controlledTurnGuard'

interface RealtimeChatMessage extends ChatMessage {
  streaming?: boolean
}

interface Props {
  context: UserContext
  officerType: OfficerType
  attemptId: string
  initialProgress?: LiveInterviewProgress
  onComplete: (messages: ChatMessage[], duration: string) => void
  onProgress?: (progress: LiveInterviewProgress) => void
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
const nextMessageId = () => `realtime-message-${++messageSequence}-${Date.now()}`
const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

const normalizeOfficerTurn = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const normalizeB2OfficerTurn = (text: string) => text
  .toLowerCase()
  .replace(/[\s，。！？、；：,.!?;:""''‘’()（）\-_…～~·]+/g, '')
  .trim()

const normalizeQuestionTurn = (visaType: UserContext['visaType'], text: string) =>
  visaType === 'B2' ? normalizeB2OfficerTurn(text) : normalizeOfficerTurn(text)

const summarizeQuestionTurns = (
  messages: readonly ChatMessage[],
  isClosingLine: (text: string) => boolean,
  normalize: (text: string) => string,
) => {
  let count = 0
  let previousOfficerTurn = ''
  for (const message of messages) {
    if (message.role !== 'officer' || isClosingLine(message.text)) continue
    const turn = normalize(message.text)
    if (!turn || turn === previousOfficerTurn) continue
    count += 1
    previousOfficerTurn = turn
  }
  return { count, previousOfficerTurn }
}

export default function VoiceInterviewRoom({
  context,
  officerType,
  attemptId,
  initialProgress,
  onComplete,
  onProgress,
}: Props) {
  const officerConfig = officerTypes.find(officer => officer.id === officerType)
    ?? officerTypes.find(officer => officer.id === 'standard')!
  const realtimeOfficerType = useMemo(() => resolveRealtimeOfficerType(officerType), [officerType])
  const { access, refreshAccess } = useOrderAccess()
  const hasQuota = access.unlimited || Number(access.remainingUses) > 0

  const [phase, setPhase] = useState<Phase>('checking')
  const [messages, setMessages] = useState<RealtimeChatMessage[]>(() => initialProgress?.messages ?? [])
  const [errorMessage, setErrorMessage] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [captionsVisible, setCaptionsVisible] = useState(true)
  const [elapsed, setElapsed] = useState(() => initialProgress?.elapsedSeconds ?? 0)
  const [officerName] = useState(() => getRandomOfficerName())

  const clientRef = useRef<RealtimeVoiceClient | null>(null)
  const providerRef = useRef<RealtimeVoiceProviderId>('doubao')
  const captionsScrollRef = useRef<HTMLElement>(null)
  const captionScrollFrameRef = useRef<number | null>(null)
  const lastCaptionToggleRef = useRef(0)
  const activeUserMessageRef = useRef<string | null>(null)
  const activeOfficerMessageRef = useRef<string | null>(null)
  const currentUserTextRef = useRef('')
  const currentOfficerTextRef = useRef('')
  const isRealtimeVisa = context.visaType === 'F1' || context.visaType === 'B2'
  const recoveredQuestionTurns = summarizeQuestionTurns(
    initialProgress?.messages ?? [],
    context.visaType === 'B2' ? isB2InterviewClosingLine : isF1InterviewClosingLine,
    text => normalizeQuestionTurn(context.visaType, text),
  )
  const substantiveQuestionCountRef = useRef(isRealtimeVisa ? recoveredQuestionTurns.count : 0)
  const lastCountedQuestionRef = useRef(isRealtimeVisa ? recoveredQuestionTurns.previousOfficerTurn : '')
  const connectedRef = useRef(false)
  const attemptStartedRef = useRef(Boolean(
    (initialProgress?.messages.length ?? 0) > 0 || (initialProgress?.elapsedSeconds ?? 0) > 0,
  ))
  const mutedRef = useRef(false)
  const endingRef = useRef(false)
  const endedRef = useRef(false)
  const autoEndAfterAudioRef = useRef(false)
  const awaitingAnswerRef = useRef(false)
  const pendingQuestionRef = useRef(initialProgress?.pendingQuestion || buildRealtimeOpeningLine(context))
  const elapsedRef = useRef(initialProgress?.elapsedSeconds ?? 0)
  const messagesRef = useRef<RealtimeChatMessage[]>(initialProgress?.messages ?? [])
  const f1StateRef = useRef<F1InterviewState | null>(
    initialProgress?.f1State
      ?? (context.visaType === 'F1' ? createF1InterviewState(context, { officerType: realtimeOfficerType }) : null),
  )
  const b2StateRef = useRef<B2InterviewState | null>(
    initialProgress?.b2State
      ?? (context.visaType === 'B2' ? createB2InterviewState(context, { officerType: realtimeOfficerType }) : null),
  )

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
      const next = index === -1
        ? [...current, { id, role, text, streaming, timestamp: formatElapsed(elapsedRef.current) }]
        : current.map((message, messageIndex) => messageIndex === index
          ? { ...message, text, streaming }
          : message)
      messagesRef.current = next
      return next
    })
  }, [])

  const finishOfficerMessage = useCallback((finalText = '') => {
    const id = activeOfficerMessageRef.current
    if (!id) return finalText.trim()
    if (finalText) currentOfficerTextRef.current = finalText
    const completedText = currentOfficerTextRef.current.trim()
    upsertMessage(id, 'officer', completedText, false)
    activeOfficerMessageRef.current = null
    currentOfficerTextRef.current = ''
    return completedText
  }, [upsertMessage])

  const endInterview = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    endedRef.current = true
    autoEndAfterAudioRef.current = false
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
      onComplete(completedMessages, formatElapsed(elapsedRef.current))
    }
  }, [onComplete])

  const handleRealtimeEvent = useCallback((event: RealtimeVoiceEvent) => {
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.started': {
        if ((context.visaType === 'F1' || context.visaType === 'B2') && !awaitingAnswerRef.current) break
        finishOfficerMessage()
        currentUserTextRef.current = ''
        const id = nextMessageId()
        activeUserMessageRef.current = id
        upsertMessage(id, 'user', '正在识别…', true)
        setPhase('listening')
        break
      }

      case 'conversation.item.input_audio_transcription.delta': {
        if ((context.visaType === 'F1' || context.visaType === 'B2') && !awaitingAnswerRef.current) break
        const delta = realtimeEventText(event)
        if (!delta) break
        currentUserTextRef.current += delta
        const id = activeUserMessageRef.current ?? nextMessageId()
        activeUserMessageRef.current = id
        upsertMessage(id, 'user', currentUserTextRef.current, true)
        break
      }

      case 'conversation.item.input_audio_transcription.result': {
        if ((context.visaType === 'F1' || context.visaType === 'B2') && !awaitingAnswerRef.current) break
        const text = realtimeEventText(event)
        if (!text) break
        currentUserTextRef.current = text
        const id = activeUserMessageRef.current ?? nextMessageId()
        activeUserMessageRef.current = id
        upsertMessage(id, 'user', text, true)
        break
      }

      case 'conversation.item.input_audio_transcription.completed': {
        let text = realtimeEventText(event) || currentUserTextRef.current
        const id = activeUserMessageRef.current
        if (context.visaType === 'F1' || context.visaType === 'B2') {
          const decision = consumeControlledAnswer(awaitingAnswerRef.current, text)
          awaitingAnswerRef.current = decision.awaitingAnswer
          text = decision.text
          if (!decision.accepted && !decision.awaitingAnswer) {
            if (id) setMessages(current => current.filter(message => message.id !== id))
            activeUserMessageRef.current = null
            currentUserTextRef.current = ''
            break
          }
        }
        if ((context.visaType === 'F1' || context.visaType === 'B2') && !text) {
          if (id) setMessages(current => current.filter(message => message.id !== id))
          activeUserMessageRef.current = null
          currentUserTextRef.current = ''
          returnToListening()
          break
        }
        if (id && text) upsertMessage(id, 'user', text, false)
        if (id && !text) {
          setMessages(current => current.filter(message => message.id !== id))
        }
        activeUserMessageRef.current = null
        currentUserTextRef.current = ''
        if (!text) {
          if (context.visaType === 'F1' || context.visaType === 'B2') awaitingAnswerRef.current = true
          returnToListening()
          break
        }
        setPhase('thinking')
        if (context.visaType === 'F1' || context.visaType === 'B2') {
          // The native end-to-end model now owns the next spoken turn. The app
          // supplies the role policy, review factors, and fail-safe only.
        }
        break
      }

      case 'controlled.speech.started': {
        if (context.visaType !== 'F1' && context.visaType !== 'B2') break
        const text = realtimeEventText(event)
        const approved = context.visaType === 'F1'
          ? Boolean(text && isSafeF1RealtimeOfficerTurn(text))
          : Boolean(text && isApprovedB2OfficerText(text))
        if (!approved) {
          setErrorMessage('The controlled interview blocked an unapproved officer question.')
          setPhase('error')
          break
        }
        awaitingAnswerRef.current = false
        pendingQuestionRef.current = text
        const lastMessage = messagesRef.current[messagesRef.current.length - 1]
        if (lastMessage?.role !== 'officer' || lastMessage.text.trim() !== text.trim()) {
          const id = nextMessageId()
          upsertMessage(id, 'officer', text, false)
          const isClosing = context.visaType === 'B2' ? isB2InterviewClosingLine(text) : isF1InterviewClosingLine(text)
          if ((context.visaType === 'F1' || context.visaType === 'B2') && !isClosing) {
            const normalized = normalizeQuestionTurn(context.visaType, text)
            if (normalized && normalized !== lastCountedQuestionRef.current) {
              substantiveQuestionCountRef.current += 1
              lastCountedQuestionRef.current = normalized
            }
          }
        }
        setPhase('speaking')
        break
      }

      case 'controlled.speech.done':
        if (context.visaType === 'F1' || context.visaType === 'B2') {
          if (autoEndAfterAudioRef.current) void endInterview()
          else {
            awaitingAnswerRef.current = true
            returnToListening()
          }
        }
        break

      case 'conversation.item.input_audio_transcription.failed':
        setErrorMessage('这句话没有听清，请靠近麦克风再说一次。')
        if (context.visaType === 'F1' || context.visaType === 'B2') awaitingAnswerRef.current = true
        returnToListening()
        break

      case 'response.output_text.delta': {
        const delta = realtimeEventText(event)
        if (!delta) break
        if (context.visaType === 'F1') {
          const violation = findF1ModelBoundaryViolation(currentOfficerTextRef.current + delta)
          if (violation) {
            clientRef.current?.blockCurrentModelResponse()
            const activeId = activeOfficerMessageRef.current
            if (activeId) setMessages(current => current.filter(message => message.id !== activeId))
            activeOfficerMessageRef.current = null
            currentOfficerTextRef.current = ''
            mutedRef.current = true
            setIsMuted(true)
            clientRef.current?.setMuted(true)
            setErrorMessage(`The realtime officer crossed the F-1 interview boundary (${violation}). The response was stopped.`)
            setPhase('error')
            break
          }
        } else if (context.visaType === 'B2') {
          const violation = findB2ModelBoundaryViolation(currentOfficerTextRef.current + delta)
          if (violation) {
            clientRef.current?.blockCurrentModelResponse()
            const activeId = activeOfficerMessageRef.current
            if (activeId) setMessages(current => current.filter(message => message.id !== activeId))
            activeOfficerMessageRef.current = null
            currentOfficerTextRef.current = ''
            mutedRef.current = true
            setIsMuted(true)
            clientRef.current?.setMuted(true)
            setErrorMessage(`实时语音面签官越过了 B-2 面签边界(${violation})，已停止回答。`)
            setPhase('error')
            break
          }
        }
        const id = activeOfficerMessageRef.current ?? nextMessageId()
        activeOfficerMessageRef.current = id
        currentOfficerTextRef.current += delta
        upsertMessage(id, 'officer', currentOfficerTextRef.current, true)
        setPhase('speaking')
        break
      }

      case 'response.output_text.done': {
        const activeOfficerId = activeOfficerMessageRef.current
        const completedText = finishOfficerMessage(realtimeEventText(event))
        const nativeVisa = context.visaType === 'F1' || context.visaType === 'B2'
        const closing = context.visaType === 'B2'
          ? isB2InterviewClosingLine(completedText)
          : isF1InterviewClosingLine(completedText)
        if (nativeVisa && completedText) {
          const maxTotalQuestions = context.visaType === 'B2'
            ? B2_INTERVIEW_MAX_TOTAL_QUESTIONS
            : F1_INTERVIEW_MAX_TOTAL_QUESTIONS
          if (substantiveQuestionCountRef.current >= maxTotalQuestions && !closing) {
            clientRef.current?.blockCurrentModelResponse()
            if (activeOfficerId) {
              const retained = messagesRef.current.filter(message => message.id !== activeOfficerId)
              messagesRef.current = retained
              setMessages(retained)
            }
            void endInterview()
            break
          }
          pendingQuestionRef.current = completedText
          if (!closing) {
            const normalized = normalizeQuestionTurn(context.visaType, completedText)
            if (normalized && normalized !== lastCountedQuestionRef.current) {
              substantiveQuestionCountRef.current += 1
              lastCountedQuestionRef.current = normalized
            }
          }
        }
        if (nativeVisa && closing) {
          autoEndAfterAudioRef.current = true
          mutedRef.current = true
          setIsMuted(true)
          clientRef.current?.setMuted(true)
        }
        break
      }

      case 'response.output_audio.started':
        if (context.visaType === 'F1' || context.visaType === 'B2') awaitingAnswerRef.current = false
        setPhase('speaking')
        break

      case 'response.output_audio.done':
        if (context.visaType === 'F1' || context.visaType === 'B2') awaitingAnswerRef.current = true
        returnToListening()
        if (autoEndAfterAudioRef.current) void endInterview()
        break

      case 'response.done':
        finishOfficerMessage()
        if (context.visaType === 'F1' || context.visaType === 'B2') awaitingAnswerRef.current = true
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
  }, [context.visaType, endInterview, finishOfficerMessage, realtimeOfficerType, returnToListening, upsertMessage])

  const startInterview = useCallback(async (resume = false) => {
    const resumable = resume && attemptStartedRef.current
    if (!hasQuota && !resumable) {
      setErrorMessage('该订单号的面签次数已经用完。')
      setPhase('error')
      return
    }
    clientRef.current?.destroy()
    setErrorMessage('')
    setMicLevel(0)
    if (!resumable) {
      attemptStartedRef.current = false
      setMessages([])
      setElapsed(0)
      elapsedRef.current = 0
      messagesRef.current = []
      f1StateRef.current = context.visaType === 'F1'
        ? createF1InterviewState(context, { officerType: realtimeOfficerType })
        : null
      b2StateRef.current = context.visaType === 'B2'
        ? createB2InterviewState(context, { officerType: realtimeOfficerType })
        : null
      pendingQuestionRef.current = buildRealtimeOpeningLine(context)
      substantiveQuestionCountRef.current = 0
      lastCountedQuestionRef.current = ''
      autoEndAfterAudioRef.current = false
    } else {
      const completedMessages = messagesRef.current.filter(message => !message.streaming && message.text.trim())
      messagesRef.current = completedMessages
      setMessages(completedMessages)
    }
    endedRef.current = false
    endingRef.current = false
    awaitingAnswerRef.current = false
    connectedRef.current = false
    activeUserMessageRef.current = null
    activeOfficerMessageRef.current = null
    currentUserTextRef.current = ''
    currentOfficerTextRef.current = ''
    setPhase('connecting')

    const openingLine = resumable
      ? resolveRealtimeResumeOpeningLine(context, messagesRef.current, pendingQuestionRef.current)
      : buildRealtimeOpeningLine(context)
    pendingQuestionRef.current = openingLine
    const resumeClosing = resumable && isExactRealtimeClosingLine(context, openingLine)
    autoEndAfterAudioRef.current = resumeClosing
    mutedRef.current = resumeClosing
    setIsMuted(resumeClosing)

    const client = createRealtimeClient(providerRef.current, {
      instructions: buildRealtimeInterviewPrompt(
        context,
        realtimeOfficerType,
        context.visaType === 'F1' || context.visaType === 'B2'
          ? {
              substantiveQuestionCount: substantiveQuestionCountRef.current,
              askedMainQuestionIds: context.visaType === 'B2'
                ? approvedB2QuestionIds(messagesRef.current)
                : [],
              recentOfficerQuestions: context.visaType === 'F1'
                ? messagesRef.current
                    .filter(message => message.role === 'officer' && !isF1InterviewClosingLine(message.text))
                    .map(message => message.text.trim())
                    .filter(Boolean)
                    .slice(-F1_INTERVIEW_MAX_TOTAL_QUESTIONS)
                : undefined,
              resuming: resumable,
            }
          : undefined,
      ),
      openingLine,
      attemptId,
      voice: resolveRealtimeVoice(officerConfig.voiceProfile.gender, context.visaType),
      speakingStyle: buildRealtimeSpeakingStyle(context, realtimeOfficerType),
      endOfTurnSilenceMs: resolveInterviewModePolicy(realtimeOfficerType).endOfTurnSilenceMs,
      speechRate: resolveInterviewModePolicy(realtimeOfficerType).speechRate,
      controlledQuestions: false,
      validateControlledText: undefined,
      onEvent: handleRealtimeEvent,
      onInputLevel: setMicLevel,
      onConnectionState: (state) => {
        if (state === 'connecting') setPhase('connecting')
        if (state === 'connected') {
          connectedRef.current = true
          attemptStartedRef.current = true
          void refreshAccess().catch(() => undefined)
        }
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
  }, [attemptId, context, handleRealtimeEvent, hasQuota, officerConfig.voiceProfile.gender, realtimeOfficerType, refreshAccess])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/realtime-health', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.ok) {
          const health = await response.json().catch(() => null) as { provider?: unknown } | null
          if (!isRealtimeVoiceProviderId(health?.provider)) {
            throw new Error('实时语音服务返回了不支持的模型类型。')
          }
          providerRef.current = health.provider
        }
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
    messagesRef.current = messages
    if (!captionsVisible) return
    if (captionScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(captionScrollFrameRef.current)
    }
    captionScrollFrameRef.current = window.requestAnimationFrame(() => {
      const container = captionsScrollRef.current
      if (container) container.scrollTop = container.scrollHeight
      captionScrollFrameRef.current = null
    })
    return () => {
      if (captionScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(captionScrollFrameRef.current)
        captionScrollFrameRef.current = null
      }
    }
  }, [captionsVisible, messages])

  useEffect(() => {
    if (!onProgress || endedRef.current) return
    onProgress({
      messages: messages
        .filter(message => !message.streaming && message.text.trim())
        .map(({ streaming: _streaming, ...message }) => message),
      elapsedSeconds: elapsed,
      f1State: f1StateRef.current,
      b2State: b2StateRef.current,
      pendingQuestion: pendingQuestionRef.current,
    })
  }, [elapsed, messages, onProgress])

  useEffect(() => {
    if (!connectedRef.current || phase === 'ending' || phase === 'ended') return
    const timer = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
      if (
        (context.visaType === 'F1' || context.visaType === 'B2')
        && elapsedRef.current >= (context.visaType === 'F1' ? F1_INTERVIEW_HARD_LIMIT_SECONDS : B2_INTERVIEW_HARD_LIMIT_SECONDS)
        && !endingRef.current
        && !autoEndAfterAudioRef.current
      ) {
        autoEndAfterAudioRef.current = true
        mutedRef.current = true
        setIsMuted(true)
        clientRef.current?.setMuted(true)
        const closingLine = context.visaType === 'F1' ? F1_INTERVIEW_CLOSING_LINE : B2_INTERVIEW_CLOSING_LINE
        pendingQuestionRef.current = closingLine
        void endInterview()
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [context.visaType, endInterview, phase])

  const toggleMute = useCallback(() => {
    if (!connectedRef.current || endingRef.current) return
    const nextMuted = !mutedRef.current
    mutedRef.current = nextMuted
    setIsMuted(nextMuted)
    clientRef.current?.setMuted(nextMuted)
    setMicLevel(0)
    setPhase(nextMuted ? 'muted' : 'listening')
  }, [])

  const toggleCaptions = useCallback(() => {
    const now = performance.now()
    if (now - lastCaptionToggleRef.current < 220) return
    lastCaptionToggleRef.current = now
    setCaptionsVisible(visible => !visible)
  }, [])

  const status = phaseStatus(phase)
  const isConnected = ['listening', 'thinking', 'speaking', 'muted'].includes(phase)
  const hasResumableProgress = attemptStartedRef.current
  const canStart = (hasQuota || hasResumableProgress) && (phase === 'ready' || phase === 'error' || phase === 'ended')

  return (
    <div className="live-room app-card relative mx-auto flex h-[calc(100dvh-112px)] max-w-3xl flex-col overflow-hidden">
      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 py-3.5 sm:px-5 sm:py-4">
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

      <section className={`flex shrink-0 flex-col items-center px-4 pt-1 transition-all sm:px-5 ${captionsVisible ? 'pb-3' : 'pb-1'}`}>
        <motion.div
          animate={phase === 'speaking' ? { scale: [1, 1.035, 1] } : { scale: 1 }}
          transition={{ repeat: phase === 'speaking' ? Infinity : 0, duration: 1.3 }}
          className="relative"
        >
          <OfficerIcon
            type={officerType}
            className={`${captionsVisible ? 'h-20 w-20 rounded-[26px]' : 'h-12 w-12 rounded-[17px]'} shadow-lg transition-all duration-300`}
          />
          {isConnected && (
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#147a58] text-white shadow-sm">
              <HiOutlineSignal className="h-3.5 w-3.5" />
            </span>
          )}
        </motion.div>
        <h1 className={`${captionsVisible ? 'mt-3 text-[17px]' : 'mt-2 text-[15px]'} font-semibold tracking-[-0.02em] text-[#1d1d1f] transition-all`}>
          {officerName}
        </h1>
        <p className="text-[12px] text-[#86868b]">
          {officerConfig.label} · AI Realtime
        </p>
        <p className={`mt-1 text-[11px] font-semibold ${hasQuota ? 'text-[#158f65]' : 'text-[#c9342f]'}`}>
          {access.unlimited
            ? '管理员 · 无限次面签'
            : `订单权益 · 剩余 ${access.remainingUses}/${access.totalUses} 次`}
        </p>
        <button
          type="button"
          onClick={toggleCaptions}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/85 px-3.5 py-2 text-[11px] font-semibold text-[#5f6368] shadow-sm transition hover:border-black/[0.14] hover:bg-white hover:text-[#1d1d1f]"
          aria-pressed={captionsVisible}
        >
          {captionsVisible ? <HiOutlineEyeSlash className="h-4 w-4" /> : <HiOutlineEye className="h-4 w-4" />}
          {captionsVisible ? '关闭对话字幕' : '开启对话字幕'}
        </button>
      </section>

      <main ref={captionsScrollRef} className={`min-h-0 flex-1 px-3 py-2 sm:px-4 sm:py-3 ${captionsVisible ? 'overflow-y-auto' : 'overflow-hidden'}`}>
          {captionsVisible ? (
          <div className="mx-auto flex max-w-lg flex-col gap-2.5">
          {messages.length === 0 && phase !== 'connecting' && (
            <div className="mx-auto mt-6 max-w-sm rounded-[24px] border border-black/[0.06] bg-white/80 px-6 py-6 text-center shadow-[0_18px_60px_rgba(0,0,0,0.05)] backdrop-blur-xl">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#eaf4ff] text-[#0071e3]">
                <HiOutlineSignal className="h-5 w-5" />
              </div>
              <p className="mt-4 text-[15px] font-semibold text-[#1d1d1f]">实时语音面签</p>
              <p className="mt-2 text-[12px] leading-5 text-[#6e6e73]">
                {context.visaType === 'B2'
                  ? '端到端语音模型负责实时识别和中文发音，并根据你的背景与回答主导提问节奏；本地只做安全边界校验。请听完问题后再回答。'
                  : '端到端语音模型负责实时识别和自然发音，并根据你的背景与回答主导提问节奏；本地只做安全边界校验。请听完问题后再回答。'}
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

          </div>
          ) : (
            <div className="flex h-full min-h-[270px] items-center justify-center">
              <RealtimeVoiceOrb phase={phase} micLevel={micLevel} />
            </div>
          )}
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
                <button type="button" onClick={() => void startInterview(hasResumableProgress)} disabled={!hasQuota && !hasResumableProgress} className="rounded-full bg-[#c9342f] px-4 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
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

      <footer className="shrink-0 px-4 pb-6 pt-2 sm:px-5">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
          <p className={`text-[13px] font-medium ${phase === 'speaking' ? 'text-[#7c3aed]' : phase === 'listening' ? 'text-[#0071e3]' : 'text-[#86868b]'}`}>
            {!isConnected && !hasQuota ? '订单次数已用完，仍可查看本次报告。' : phaseHint(phase)}
          </p>

          <motion.button
            type="button"
            disabled={!isConnected && !hasQuota && !hasResumableProgress || phase === 'checking' || phase === 'connecting' || phase === 'thinking' || phase === 'speaking' || phase === 'ending'}
            onClick={isConnected ? toggleMute : () => void startInterview(hasResumableProgress)}
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

function providerErrorMessage(event: RealtimeVoiceEvent) {
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
