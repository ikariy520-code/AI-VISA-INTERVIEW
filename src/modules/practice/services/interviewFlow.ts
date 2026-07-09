// ========================================
// F1 面签状态机引擎
//
// 管理面签全流程：
//   1. 按阶段推进（7 个主阶段）
//   2. 每阶段选什么问题（required → normal → optional）
//   3. 何时追问、何时插入材料请求
//   4. 答案风险评估
//   5. 目标 8-14 题结束
//
// 入口：createInterviewFlow() → 工厂函数
//   nextTurn(answer?) → { text, emotion, isClosing }
// ========================================

import type {
  InterviewStage, InterviewState, OfficerTurn,
  Question, OfficerEmotion, UserContext,
} from '../types'
import {
  questionBank,
  STAGE_ORDER, INSERTABLE_STAGES,
  MIN_QUESTIONS, MAX_QUESTIONS,
  MAX_CONSECUTIVE_SAME_CATEGORY,
  SHORT_ANSWER_THRESHOLD, MAX_SHORT_ANSWERS_BEFORE_PROBE,
  DOCUMENT_PROBABILITIES,
  FALLBACK_FOLLOWUP_MAP,
} from '../data/questionBank'

// ---- 情绪分配 ----

const EMOTIONS: Record<InterviewStage, OfficerEmotion> = {
  START: 'friendly',
  BASIC_INFO: 'friendly',
  SCHOOL_AND_MAJOR: 'neutral',
  ACADEMIC_PLAN: 'curious',
  CURRENT_STATUS: 'neutral',
  FUNDING_CHECK: 'stern',
  FAMILY_AND_TIES: 'neutral',
  FUTURE_PLAN: 'thoughtful',
  TRAVEL_HISTORY: 'curious',
  SECURITY_AND_DS160: 'stern',
  DOCUMENT_CHECK: 'neutral',
  END: 'reassuring',
}

// ---- 已用问题跟踪 ----

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---- 工厂 ----

export function createInterviewFlow(userContext: UserContext) {
  const askedIds = new Set<string>()
  const askedDocIds = new Set<string>()

  const state: InterviewState = {
    stage: 'START',
    stageIndex: 0,
    askedQuestionIds: askedIds,
    totalQuestions: 0,
    consecutiveCategoryCount: {},
    pendingFollowUp: null,
    askedDocumentQuestions: askedDocIds,
    userShortAnswerCount: 0,
    riskFlags: [],
  }

  const isF1 = userContext.visaType === 'F1'

  // ---- 工具 ----

  function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length
  }

  function hasUncertainLanguage(text: string): boolean {
    const lower = text.toLowerCase()
    const patterns = [
      'not sure', 'i don\'t know', 'don\'t know', 'maybe',
      'probably', 'i guess', 'kind of', 'sort of',
      'i think so', 'not really', 'i\'m not', 'not certain',
      'haven\'t thought', 'whatever',
    ]
    return patterns.some(p => lower.includes(p))
  }

  // ---- 问题选择 ----

  /** 从指定类别中选一个未问过的问题 */
  function pickQuestion(stage: InterviewStage, preferPriority?: string): Question | null {
    const pool = questionBank[stage]
    if (!pool || pool.length === 0) return null

    // 过滤已问过的
    const candidates = pool.filter(q => !state.askedQuestionIds.has(q.id))
    if (candidates.length === 0) return null

    // 按优先级排序
    if (preferPriority) {
      const match = candidates.filter(q => q.priority === preferPriority)
      if (match.length > 0) {
        return match[Math.floor(Math.random() * match.length)]
      }
    }

    // required → normal → optional
    const required = candidates.filter(q => q.priority === 'required')
    if (required.length > 0) return required[Math.floor(Math.random() * required.length)]

    const normal = candidates.filter(q => q.priority === 'normal')
    if (normal.length > 0) return normal[Math.floor(Math.random() * normal.length)]

    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  /** 从题库中按 ID 查找问题 */
  function findQuestionById(id: string): Question | null {
    for (const stage of Object.values(questionBank)) {
      const found = stage.find(q => q.id === id)
      if (found) return found
    }
    return null
  }

  // ---- 追问逻辑 ----

  function shouldFollowUp(answer: string, question: Question): boolean {
    if (!answer) return false
    const lower = answer.toLowerCase()

    // 1. 回答太短
    if (countWords(answer) < SHORT_ANSWER_THRESHOLD) return true

    // 2. 不确定语言
    if (hasUncertainLanguage(answer)) return true

    // 3. 问题自带的 trigger 命中
    if (question.followUpTriggers.length > 0) {
      for (const trigger of question.followUpTriggers) {
        if (lower.includes(trigger.toLowerCase())) return true
      }
    }

    return false
  }

  function pickFollowUp(question: Question): Question | null {
    // 用 possibleFollowUps 的文本匹配题库中的问题
    if (question.possibleFollowUps.length > 0) {
      // 随机选一条追问文本，直接作为面签官的话
      const text = question.possibleFollowUps[Math.floor(Math.random() * question.possibleFollowUps.length)]
      return {
        id: `followup_${question.id}_${Date.now()}`,
        category: question.category,
        text,
        priority: 'normal',
        riskTags: question.riskTags,
        followUpTriggers: [],
        possibleFollowUps: [],
      }
    }
    return null
  }

  // ---- 材料请求 ----

  function shouldRequestDocument(): boolean {
    if (state.askedDocumentQuestions.size >= 3) return false
    // 概率随问题数增长
    const baseChance = 0.12 + state.totalQuestions * 0.02
    return Math.random() < baseChance
  }

  function pickDocumentQuestion(): Question | null {
    const pool = questionBank.DOCUMENT_CHECK.filter(
      q => !state.askedDocumentQuestions.has(q.id)
    )
    if (pool.length === 0) return null

    // 按概率加权选择
    const weighted = pool.flatMap(q => {
      const prob = DOCUMENT_PROBABILITIES[q.id] ?? 0.3
      const count = Math.round(prob * 10)
      return Array(count).fill(q)
    })
    if (weighted.length === 0) return null

    return weighted[Math.floor(Math.random() * weighted.length)]
  }

  // ---- 阶段推进 ----

  function advanceStage(): InterviewStage {
    // 当前阶段还有 required 未问，继续
    if (state.stage !== 'START' && state.stage !== 'END') {
      const pool = questionBank[state.stage] ?? []
      const hasRequired = pool.some(
        q => q.priority === 'required' && !state.askedQuestionIds.has(q.id)
      )
      if (hasRequired) return state.stage
    }

    // 当前阶段还有 normal 未问（最多再问 1 个）
    if (state.stage !== 'START' && state.stage !== 'END') {
      const pool = questionBank[state.stage] ?? []
      const hasUnasked = pool.some(q => !state.askedQuestionIds.has(q.id))
      const consecutive = state.consecutiveCategoryCount[state.stage] ?? 0
      if (hasUnasked && consecutive < MAX_CONSECUTIVE_SAME_CATEGORY && Math.random() < 0.4) {
        return state.stage
      }
    }

    // 随机插入可选类别
    if (state.totalQuestions >= 3 && state.totalQuestions <= MAX_QUESTIONS - 2) {
      if (Math.random() < 0.2) {
        const insertable = shuffle(INSERTABLE_STAGES).find(
          s => {
            const pool = questionBank[s]
            return pool && pool.some(q => !state.askedQuestionIds.has(q.id))
          }
        )
        if (insertable) return insertable
      }
    }

    // 进入下一个主阶段
    const currentIdx = STAGE_ORDER.indexOf(state.stage as any)
    const nextIdx = currentIdx + 1

    if (nextIdx >= STAGE_ORDER.length) return 'END'

    return STAGE_ORDER[nextIdx]
  }

  // ---- 主入口：生成下一轮面签官的话 ----

  function nextTurn(lastUserAnswer?: string): OfficerTurn {
    // 1. 如果有待处理的追问
    if (state.pendingFollowUp) {
      const followUp = state.pendingFollowUp
      state.pendingFollowUp = null
      state.askedQuestionIds.add(followUp.id)
      state.totalQuestions++
      state.consecutiveCategoryCount[followUp.category] =
        (state.consecutiveCategoryCount[followUp.category] ?? 0) + 1
      return {
        text: followUp.text,
        emotion: 'stern',
        isDocumentRequest: false,
      }
    }

    // 2. 检查是否到了结束条件
    if (state.totalQuestions >= MAX_QUESTIONS || (state.totalQuestions >= MIN_QUESTIONS && state.stage === 'END')) {
      return makeClosing()
    }
    if (state.totalQuestions >= MIN_QUESTIONS && state.stageIndex >= STAGE_ORDER.length) {
      return makeClosing()
    }

    // 3. 评估上一次回答 → 决定是否追问
    if (lastUserAnswer && state.stage !== 'START') {
      // 找到刚才问的问题（最近一个已问的）
      if (state.userShortAnswerCount >= MAX_SHORT_ANSWERS_BEFORE_PROBE) {
        state.userShortAnswerCount = 0
        // 生成追问
        const fallbackIds = FALLBACK_FOLLOWUP_MAP[state.stage]
        if (fallbackIds) {
          const fbQuestion = shuffle(fallbackIds.map(id => findQuestionById(id)).filter(Boolean) as Question[])[0]
          if (fbQuestion && !state.askedQuestionIds.has(fbQuestion.id)) {
            state.pendingFollowUp = null
            state.askedQuestionIds.add(fbQuestion.id)
            state.totalQuestions++
            state.consecutiveCategoryCount[fbQuestion.category] =
              (state.consecutiveCategoryCount[fbQuestion.category] ?? 0) + 1
            return { text: fbQuestion.text, emotion: 'stern', isDocumentRequest: false }
          }
        }
      }
    }

    // 4. 材料请求概率插入
    if (shouldRequestDocument()) {
      const docQ = pickDocumentQuestion()
      if (docQ) {
        state.askedDocumentQuestions.add(docQ.id)
        state.askedQuestionIds.add(docQ.id)
        state.totalQuestions++
        state.consecutiveCategoryCount['DOCUMENT_CHECK'] =
          (state.consecutiveCategoryCount['DOCUMENT_CHECK'] ?? 0) + 1
        return { text: docQ.text, emotion: 'neutral', isDocumentRequest: true }
      }
    }

    // 5. 推进阶段
    const prevStage = state.stage
    state.stage = advanceStage()

    if (state.stage === 'END') return makeClosing()

    if (state.stage !== prevStage) {
      state.stageIndex++
      state.consecutiveCategoryCount[prevStage] = 0
    }

    // 6. 选问题
    const question = pickQuestion(state.stage, 'required')
    if (!question) {
      // 当前阶段没问题了，强制推进
      state.stage = advanceStage()
      if (state.stage === 'END') return makeClosing()
      const nextQ = pickQuestion(state.stage)
      if (!nextQ) return makeClosing()

      state.askedQuestionIds.add(nextQ.id)
      state.totalQuestions++
      state.consecutiveCategoryCount[nextQ.category] =
        (state.consecutiveCategoryCount[nextQ.category] ?? 0) + 1
      return {
        text: nextQ.text,
        emotion: EMOTIONS[state.stage] ?? 'neutral',
        isDocumentRequest: nextQ.category === 'DOCUMENT_CHECK',
      }
    }

    state.askedQuestionIds.add(question.id)
    state.totalQuestions++
    state.consecutiveCategoryCount[question.category] =
      (state.consecutiveCategoryCount[question.category] ?? 0) + 1

    return {
      text: question.text,
      emotion: EMOTIONS[state.stage] ?? 'neutral',
      isDocumentRequest: question.category === 'DOCUMENT_CHECK',
    }
  }

  // ---- 评估并记录上一次回答 ----

  function evaluateAnswer(answer: string, lastQuestion: Question | null) {
    if (!answer) return

    const lower = answer.toLowerCase()

    // 短回答
    if (countWords(answer) < SHORT_ANSWER_THRESHOLD) {
      state.userShortAnswerCount++
    } else {
      state.userShortAnswerCount = 0
    }

    // 风险标签命中
    if (lastQuestion) {
      for (const tag of lastQuestion.riskTags) {
        if (tag === 'immigrant_intent') {
          const immigrantKeywords = ['stay', 'live', 'work', 'green card', 'immigrate', 'permanent', 'citizen']
          if (immigrantKeywords.some(k => lower.includes(k))) {
            state.riskFlags.push('immigrant_intent')
          }
        }
        if (tag === 'funding') {
          const fundingKeywords = ['loan', 'borrow', 'not enough', 'just enough', 'barely', 'part time job', 'work']
          if (fundingKeywords.some(k => lower.includes(k))) {
            state.riskFlags.push('funding_concern')
          }
        }
      }
    }

    // 不确定语言
    if (hasUncertainLanguage(answer) && lastQuestion) {
      state.riskFlags.push('uncertain_answer')
    }

    // 是否触发追问
    if (lastQuestion && shouldFollowUp(answer, lastQuestion)) {
      const followUp = pickFollowUp(lastQuestion)
      if (followUp) {
        state.pendingFollowUp = followUp
      }
    }
  }

  // ---- 结束语 ----

  function makeClosing(): OfficerTurn {
    const hasRisks = state.riskFlags.length > 0
    const hasImmigrantIntent = state.riskFlags.includes('immigrant_intent')
    const hasFundingConcern = state.riskFlags.includes('funding_concern')
    const uncertainCount = state.riskFlags.filter(f => f === 'uncertain_answer').length

    let text: string
    if (hasImmigrantIntent && hasFundingConcern) {
      text = "Alright, that's all for now. I have some concerns about your funding and your plans after graduation. We'll review your application and let you know. Do you have any other documents you'd like to submit?"
    } else if (hasImmigrantIntent) {
      text = "OK, I've noted your answers. I want you to think carefully about your plans after graduation — the F-1 visa requires non-immigrant intent. We'll process your application. You'll be notified of the result."
    } else if (hasFundingConcern || uncertainCount >= 2) {
      text = "Thank you. I need to review your financial situation more carefully. We have your documents, and you'll hear from us. That's all for today."
    } else if (hasRisks) {
      text = "Alright, I've completed my questions. We'll review everything and you'll be notified. Make sure your contact information is correct. Thank you."
    } else {
      text = "Alright, everything looks fine. We'll process your visa. You should receive your passport within a few days. Have a good trip and good luck with your studies!"
    }

    state.stage = 'END'
    return { text, emotion: 'reassuring', isClosing: true }
  }

  // ---- 对外接口 ----

  return {
    /** 生成面签官下一句话 */
    nextTurn,
    /** 评估用户回答并记录状态 */
    evaluateAnswer,
    /** 当前状态快照 */
    getState: (): InterviewState => state,
    /** 是否已结束 */
    isEnded: () => state.stage === 'END',
  }
}
