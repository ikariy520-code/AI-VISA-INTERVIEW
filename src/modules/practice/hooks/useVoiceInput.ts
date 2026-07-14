import { useCallback, useEffect, useRef, useState } from 'react'
import { DoubaoAsrSession, isDoubaoAsrSupported } from '../services/doubaoSpeech'

interface UseVoiceInputOptions {
  onResult?: (text: string) => void
  onNoSpeech?: () => void
  lang?: string
}

interface UseVoiceInputReturn {
  start: () => void
  stop: () => void
  cancel: () => void
  partialTranscript: string
  isRecording: boolean
  duration: number
  error: string | null
  isSupported: boolean
}

const BrowserSpeechRecognition = typeof window !== 'undefined'
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : undefined

export function useVoiceInput({
  onResult,
  onNoSpeech,
  lang = 'en-US',
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [partialTranscript, setPartialTranscript] = useState('')
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const onResultRef = useRef(onResult)
  const onNoSpeechRef = useRef(onNoSpeech)
  const durationRef = useRef(0)
  const durationTimerRef = useRef<ReturnType<typeof setInterval>>()
  const cloudSessionRef = useRef<DoubaoAsrSession | null>(null)
  const browserRecognitionRef = useRef<any>(null)
  const finalTextRef = useRef('')
  const cancelledRef = useRef(false)
  const submittedRef = useRef(false)
  onResultRef.current = onResult
  onNoSpeechRef.current = onNoSpeech

  const isSupported = isDoubaoAsrSupported() || Boolean(BrowserSpeechRecognition)

  const stopTimer = useCallback(() => {
    clearInterval(durationTimerRef.current)
    durationTimerRef.current = undefined
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    durationRef.current = 0
    setDuration(0)
    durationTimerRef.current = setInterval(() => {
      durationRef.current += 1
      setDuration(durationRef.current)
    }, 1000)
  }, [stopTimer])

  const submitFinalText = useCallback(() => {
    if (cancelledRef.current || submittedRef.current) return
    const cleaned = finalTextRef.current.replace(/\s+/g, ' ').trim()
    if (!cleaned) {
      submittedRef.current = true
      setError('No speech was recognized. Please try again.')
      onNoSpeechRef.current?.()
      return
    }
    submittedRef.current = true
    setPartialTranscript('')
    onResultRef.current?.(cleaned)
  }, [])

  const startBrowserFallback = useCallback(() => {
    if (!BrowserSpeechRecognition) {
      setError('Cloud speech recognition is unavailable and this browser has no fallback recognition.')
      return
    }
    const recognition = new BrowserSpeechRecognition()
    browserRecognitionRef.current = recognition
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1
    recognition.onstart = () => {
      setError('Cloud recognition is unavailable; browser recognition is being used for this answer.')
      setIsRecording(true)
      startTimer()
    }
    recognition.onresult = (event: any) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) finalTextRef.current += ` ${result[0].transcript}`
        else interim += result[0].transcript
      }
      setPartialTranscript(`${finalTextRef.current} ${interim}`.replace(/\s+/g, ' ').trim())
    }
    recognition.onerror = (event: any) => {
      if (!['no-speech', 'aborted'].includes(event.error)) setError(`Speech recognition error: ${event.error}`)
    }
    recognition.onend = () => {
      setIsRecording(false)
      stopTimer()
    }
    try {
      recognition.start()
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to start speech recognition.')
      setIsRecording(false)
    }
  }, [lang, startTimer, stopTimer])

  const start = useCallback(() => {
    cancelledRef.current = false
    submittedRef.current = false
    finalTextRef.current = ''
    setPartialTranscript('')
    setError(null)

    if (!isDoubaoAsrSupported()) {
      startBrowserFallback()
      return
    }

    const session = new DoubaoAsrSession({
      onReady: () => {
        setIsRecording(true)
        setError(null)
        startTimer()
      },
      onPartial: (text) => {
        finalTextRef.current = text
        setPartialTranscript(text)
      },
      onFinal: (text) => {
        finalTextRef.current = text
      },
      onError: (message) => setError(message),
      onStopped: () => {
        setIsRecording(false)
        stopTimer()
        submitFinalText()
      },
    })
    cloudSessionRef.current = session
    void session.start().catch((startError) => {
      cloudSessionRef.current = null
      setIsRecording(false)
      stopTimer()
      if (startError instanceof DOMException && startError.name === 'NotAllowedError') {
        setError('Microphone permission was denied. Please allow microphone access and try again.')
        return
      }
      startBrowserFallback()
    })
  }, [startBrowserFallback, startTimer, stopTimer, submitFinalText])

  const stop = useCallback(() => {
    stopTimer()
    setIsRecording(false)
    if (cloudSessionRef.current) {
      cloudSessionRef.current.stop()
      return
    }
    const recognition = browserRecognitionRef.current
    if (!recognition) return
    try { recognition.stop() } catch {}
    window.setTimeout(submitFinalText, 350)
  }, [stopTimer, submitFinalText])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    stopTimer()
    setIsRecording(false)
    setPartialTranscript('')
    finalTextRef.current = ''
    cloudSessionRef.current?.cancel()
    cloudSessionRef.current = null
    try { browserRecognitionRef.current?.abort() } catch {}
    browserRecognitionRef.current = null
  }, [stopTimer])

  useEffect(() => cancel, [cancel])

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

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
}
