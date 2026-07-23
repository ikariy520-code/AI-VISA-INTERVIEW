import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { OfficerType } from '../types'
import type { ChatMessage, UserContext } from '../../practice/types'
import VoiceInterviewRoom from './VoiceInterviewRoom'
import InterviewComplete from '../../practice/components/InterviewComplete'
import { isOfficerType } from '../data/officerTypes'
import {
  loadInterviewRecovery,
  saveCompletedInterview,
  saveLiveInterviewProgress,
  type LiveInterviewProgress,
} from '../../shared/store/interviewRecovery'

/**
 * /voice/live 路由包装器
 *
 * 从路由 state 中提取 officerType 和 userContext，
 * 传给 VoiceInterviewRoom。缺少 officerType 时跳回选择页。
 * 缺少 userContext 时跳回 /practice 填写背景。
 */
export default function VoiceInterviewRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const recovery = useMemo(() => loadInterviewRecovery(), [])
  const [completedInterview, setCompletedInterview] = useState<{
    messages: ChatMessage[]
    duration: string
  } | null>(() => recovery?.completed ?? null)
  const state = location.state as {
    officerType?: OfficerType
    userContext?: UserContext
    attemptId?: string
  } | null

  const officerType = state?.officerType
    ?? recovery?.officerType
    ?? (sessionStorage.getItem('visa_officer_type') as OfficerType | null)
  const userContext = state?.userContext ?? recovery?.userContext
  const attemptId = state?.attemptId ?? recovery?.attemptId

  if (!isOfficerType(officerType) || officerType === 'random') {
    navigate('/voice', { replace: true })
    return null
  }

  if (!userContext || !attemptId) {
    navigate('/practice', { replace: true, state: { officerType } })
    return null
  }

  const handleComplete = useCallback((messages: ChatMessage[], duration: string) => {
    const completed = { messages, duration }
    saveCompletedInterview(completed)
    setCompletedInterview(completed)
  }, [])

  const handleProgress = useCallback((progress: LiveInterviewProgress) => {
    saveLiveInterviewProgress(progress)
  }, [])

  if (completedInterview) {
    return (
      <InterviewComplete
        messages={completedInterview.messages}
        context={userContext}
        duration={completedInterview.duration}
        officerType={officerType}
        attemptId={attemptId}
      />
    )
  }

  return (
    <VoiceInterviewRoom
      context={userContext}
      attemptId={attemptId}
      initialProgress={recovery?.progress}
      officerType={officerType}
      onComplete={handleComplete}
      onProgress={handleProgress}
    />
  )
}
