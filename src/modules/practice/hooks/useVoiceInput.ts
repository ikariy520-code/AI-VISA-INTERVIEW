// ========================================
// 语音输入 Hook
//
// 封装 Web Speech API (SpeechRecognition)
// 支持浏览器原生语音识别，无需后端
//
// 用法：
//   const { start, stop, transcript, isRecording, duration, error, isSupported }
//     = useVoiceInput({ onResult: (text) => { ... } })
//
// 流程：
//   点击麦克风 → start() → 说话 → stop() → onResult(text) 回调
// ========================================

import { useState, useRef, useCallback, useEffect } from 'react'

interface UseVoiceInputOptions {
  /** 识别结果回调（用户说完了） */
  onResult?: (text: string) => void
  /** 识别语言 */
  lang?: string
}

interface UseVoiceInputReturn {
  /** 开始录音 */
  start: () => void
  /** 停止录音并提交识别结果 */
  stop: () => void
  /** 取消录音（不提交） */
  cancel: () => void
  /** 当前实时识别文本（说话过程中更新） */
  partialTranscript: string
  /** 是否正在录音 */
  isRecording: boolean
  /** 录音时长（秒） */
  duration: number
  /** 错误信息 */
  error: string | null
  /** 浏览器是否支持语音识别 */
  isSupported: boolean
}

// SpeechRecognition 类型（浏览器原生 API）
const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function useVoiceInput({
  onResult,
  lang = 'en-US',
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [partialTranscript, setPartialTranscript] = useState('')
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState(true)

  const recognitionRef = useRef<any>(null)
  const finalTextRef = useRef('')
  const durationTimerRef = useRef<ReturnType<typeof setInterval>>()
  const durationRef = useRef(0)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  // ---- 初始化 SpeechRecognition ----

  const initRecognition = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setIsSupported(false)
      setError('浏览器不支持语音识别，请使用 Chrome 或 Edge')
      return null
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsRecording(true)
      setError(null)
      setPartialTranscript('')
      finalTextRef.current = ''
      durationRef.current = 0
      setDuration(0)
      // 开始计时
      durationTimerRef.current = setInterval(() => {
        durationRef.current++
        setDuration(durationRef.current)
      }, 1000)
    }

    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTextRef.current += ' ' + result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      setPartialTranscript(finalTextRef.current + ' ' + interim)
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // 静音不算错误，继续等待
        return
      }
      if (event.error === 'aborted') {
        return
      }
      setError(`语音识别错误: ${event.error}`)
    }

    recognition.onend = () => {
      setIsRecording(false)
      clearInterval(durationTimerRef.current)
    }

    return recognition
  }, [lang])

  // ---- 开始录音 ----

  const start = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
    }

    const recognition = initRecognition()
    if (!recognition) return

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (err: any) {
      setError(err?.message ?? '无法启动语音识别')
      setIsRecording(false)
    }
  }, [initRecognition])

  // ---- 停止录音并提交 ----

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    clearInterval(durationTimerRef.current)
    setIsRecording(false)

    try {
      recognition.stop()
    } catch {}

    // 延迟提交，等待 final result 落盘
    setTimeout(() => {
      const final = finalTextRef.current.trim()
      if (final && onResultRef.current) {
        // 去掉多余空格
        const cleaned = final.replace(/\s+/g, ' ').trim()
        setPartialTranscript('')
        onResultRef.current(cleaned)
      } else if (!final && onResultRef.current) {
        // 没有识别到内容，也通知上游（可让用户重试）
        setError('未识别到语音内容，请重试')
      }
    }, 300)
  }, [])

  // ---- 取消录音 ----

  const cancel = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    clearInterval(durationTimerRef.current)
    setIsRecording(false)
    setPartialTranscript('')
    finalTextRef.current = ''

    try {
      recognition.abort()
    } catch {}
  }, [])

  // ---- 清理 ----

  useEffect(() => {
    return () => {
      clearInterval(durationTimerRef.current)
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch {}
      }
    }
  }, [])

  return {
    start,
    stop,
    cancel,
    partialTranscript,
    isRecording,
    duration,
    error,
    isSupported,
  }
}

/** 格式化录音时长 mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
