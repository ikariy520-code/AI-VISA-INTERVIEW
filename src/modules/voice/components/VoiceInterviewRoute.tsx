import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { OfficerType } from '../types'
import type { ChatMessage, UserContext } from '../../practice/types'
import VoiceInterviewRoom from './VoiceInterviewRoom'
import InterviewComplete from '../../practice/components/InterviewComplete'

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
  const [completedInterview, setCompletedInterview] = useState<{
    messages: ChatMessage[]
    duration: string
  } | null>(null)
  const state = location.state as {
    officerType?: OfficerType
    userContext?: UserContext
  } | null

  const officerType = state?.officerType
    ?? (sessionStorage.getItem('visa_officer_type') as OfficerType | null)

  if (!officerType || !['pressure', 'standard', 'friendly', 'trump', 'custom'].includes(officerType)) {
    navigate('/voice', { replace: true })
    return null
  }

  if (!state?.userContext) {
    navigate('/practice', { replace: true, state: { officerType } })
    return null
  }

  const handleComplete = (messages: ChatMessage[], duration: string) => {
    setCompletedInterview({ messages, duration })
  }

  if (completedInterview) {
    return (
      <InterviewComplete
        messages={completedInterview.messages}
        context={state.userContext}
        duration={completedInterview.duration}
      />
    )
  }

  return (
    <VoiceInterviewRoom
      context={state.userContext}
      officerType={officerType}
      onComplete={handleComplete}
    />
  )
}
