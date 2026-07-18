import { redactPotentialIdentifiers } from './shared/doubaoReport.mjs'
import {
  FEEDBACK_POLICY_VERSION,
  buildFeedbackMessages,
} from './prompts/feedbackPolicy.mjs'

const MAX_BODY_BYTES = 220 * 1024
const REQUEST_TIMEOUT_MS = 120_000
const RATE_WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 6
const MAX_ACTIVE_REQUESTS = 4

const F1_DIMENSIONS = [
  ['eligibility', '身份资格', 15],
  ['authenticity', '学习真实性', 20],
  ['academic', '学术匹配', 15],
  ['funding', '资金能力', 20],
  ['ties', '回国计划', 20],
  ['risk', '风险与一致性', 10],
]

const B2_DIMENSIONS = [
  ['purpose', '出行目的', 20],
  ['plan', '行程计划', 15],
  ['funding', '资金能力', 20],
  ['ties', '回国约束', 20],
  ['consistency', '信息一致性', 15],
  ['delivery', '表达效率', 10],
]

const OFFICER_LABELS = {
  pressure: '压力型面签官',
  standard: '标准型面签官',
  friendly: '友好型面签官',
  trump: '特殊角色面签官',
  custom: '自定义面签官',
}

function json(res, statusCode, payload, extraHeaders = {}) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value)
  res.end(JSON.stringify(payload))
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeText(value, fallback = '', maxLength = 2_000) {
  if (typeof value === 'string') return value.trim().slice(0, maxLength) || fallback
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).slice(0, maxLength)
  return fallback
}

function safeNumber(value, fallback, min = 0, max = 100) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

function safeArray(value, maxItems, maxLength = 500) {
  if (!Array.isArray(value)) return []
  return value.map(item => safeText(item, '', maxLength)).filter(Boolean).slice(0, maxItems)
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || req.socket.remoteAddress || 'unknown'
}

function isSameOrigin(req) {
  const origin = String(req.headers.origin || '')
  const host = String(req.headers.host || '')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let finished = false

    req.on('data', chunk => {
      if (finished) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        finished = true
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (finished) return
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 }))
      }
    })
    req.on('error', reject)
  })
}

function sanitizeContext(value) {
  if (!isRecord(value)) return {}
  const allowedFields = new Set([
    'visaType', 'purpose', 'destination', 'duration', 'previousVisa', 'occupation', 'notes',
    'major', 'degreeLevel', 'enrollmentDate', 'currentStatus', 'schoolReason', 'majorReason',
    'fundingSource', 'budgetRange', 'hasUsRelatives', 'usRelativeType', 'previousVisaDenied',
    'refusalReason', 'hasStudyGap', 'gapExplanation', 'postGraduationPlan', 'homeTies',
    'b2Purpose', 'travelMonth', 'b2CurrentStatus', 'travelFunding', 'tripStyle',
    'travelCompanion', 'usContactRelation', 'contactProvidesStay', 'contactPaysExpenses',
    'hasMetContact', 'workTenureRange', 'travelBudget', 'travelHistoryRegions', 'hadOverstay',
    'returnReason', 'previousVisaAnswer',
  ])
  const result = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!allowedFields.has(key)) continue
    if (typeof raw === 'string') {
      result[key] = redactPotentialIdentifiers(raw.trim()).slice(0, key === 'notes' ? 2_000 : 1_000)
    } else if (typeof raw === 'boolean' || typeof raw === 'number') {
      result[key] = raw
    } else if (Array.isArray(raw)) {
      result[key] = raw
        .filter(item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
        .map(item => typeof item === 'string' ? redactPotentialIdentifiers(item).slice(0, 300) : item)
        .slice(0, 20)
    }
  }
  return result
}

function isRepeatRequest(text) {
  return /^(pardon|pardon me|sorry|sorry\?|could you repeat|please repeat|what|i didn'?t (hear|understand)|can you say that again)[?.!\s]*$/i.test(text.trim())
}

function buildPairs(rawTranscript) {
  if (!Array.isArray(rawTranscript)) return []
  const turns = rawTranscript
    .slice(0, 80)
    .map(item => {
      if (!isRecord(item)) return null
      const role = item.role === 'officer' ? 'officer' : item.role === 'user' ? 'user' : null
      const text = redactPotentialIdentifiers(safeText(item.text, '', 4_000))
      if (!role || !text) return null
      return { role, text, timestamp: safeText(item.timestamp, '00:00', 20) }
    })
    .filter(Boolean)

  const pairs = []
  let currentQuestion = null
  for (const turn of turns) {
    if (turn.role === 'officer') {
      currentQuestion = turn
      continue
    }
    if (!currentQuestion || isRepeatRequest(turn.text)) continue
    pairs.push({
      questionIndex: pairs.length + 1,
      question: currentQuestion.text,
      answer: turn.text,
      timestamp: turn.timestamp,
    })
    currentQuestion = null
    if (pairs.length >= 30) break
  }
  return pairs
}

export function sanitizeFeedbackRequest(value) {
  if (!isRecord(value)) return null
  const visaType = value.visaType === 'F1' ? 'F1' : value.visaType === 'B2' ? 'B2' : null
  if (!visaType) return null

  const pairs = buildPairs(value.transcript)
  if (pairs.length === 0) return null

  const officerType = ['pressure', 'standard', 'friendly', 'trump', 'custom'].includes(value.officerType)
    ? value.officerType
    : 'standard'

  return {
    id: safeText(value.id, `report-${Date.now()}`, 120),
    date: safeText(value.date, '本次练习', 40),
    time: safeText(value.time, '', 40),
    duration: safeText(value.duration, '00:00', 20),
    visaType,
    officerType,
    context: sanitizeContext(value.userContext),
    pairs,
  }
}

function parseJsonContent(content) {
  const trimmed = safeText(content, '', 200_000)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  if (!trimmed) throw Object.assign(new Error('Empty model response.'), { code: 'EMPTY_RESPONSE' })
  try {
    return JSON.parse(trimmed)
  } catch {
    throw Object.assign(new Error('Invalid model JSON.'), { code: 'INVALID_JSON' })
  }
}

function statusForScore(score) {
  if (score >= 80) return '稳固'
  if (score >= 65) return '需补充'
  return '优先改进'
}

function normalizeInsight(value, fallbackTitle, fallbackDetail) {
  const record = isRecord(value) ? value : {}
  return {
    title: safeText(record.title, fallbackTitle, 100),
    detail: safeText(record.detail, fallbackDetail, 600),
  }
}

export function normalizeDeepSeekReport(input, raw) {
  if (!isRecord(raw)) throw Object.assign(new Error('Invalid report payload.'), { code: 'INVALID_REPORT' })
  const specs = input.visaType === 'F1' ? F1_DIMENSIONS : B2_DIMENSIONS
  const rawDimensions = Array.isArray(raw.dimensions) ? raw.dimensions : []

  const dimensions = specs.map(([id, label, weight]) => {
    const source = rawDimensions.find(item => isRecord(item) && item.id === id) || {}
    const score = Math.round(safeNumber(source.score, 50))
    return {
      id,
      label,
      score,
      status: statusForScore(score),
      summary: safeText(source.summary, '本次对话证据不足，建议在下一轮覆盖此项。', 600),
      evidence: safeText(source.evidence, '本次对话证据不足', 800),
      weight,
    }
  })

  const weightedScore = Math.round(dimensions.reduce((total, item) => total + item.score * item.weight, 0) / 100)
  const publicDimensions = dimensions.map(({ weight: _weight, ...item }) => item)
  const sorted = [...publicDimensions].sort((a, b) => b.score - a.score)
  const rawStrengths = Array.isArray(raw.strengths) ? raw.strengths : []
  const rawPriorities = Array.isArray(raw.priorities) ? raw.priorities : []

  const strengths = (rawStrengths.length > 0 ? rawStrengths : sorted.slice(0, 2).map(item => ({
    title: item.label,
    detail: item.evidence,
  }))).slice(0, 3).map((item, index) => normalizeInsight(
    item,
    sorted[index]?.label || '相对稳定项',
    sorted[index]?.evidence || '本次对话证据不足',
  ))

  const weakest = [...sorted].reverse()
  const priorities = (rawPriorities.length > 0 ? rawPriorities : weakest.slice(0, 2).map(item => ({
    title: item.label,
    detail: item.summary,
  }))).slice(0, 3).map((item, index) => normalizeInsight(
    item,
    weakest[index]?.label || '优先改进项',
    weakest[index]?.summary || '下一轮需要补充更具体的真实信息。',
  ))

  const rawReviews = Array.isArray(raw.questionReviews) ? raw.questionReviews : []
  const questionReviews = input.pairs.map(pair => {
    const source = rawReviews.find(item => isRecord(item) && Math.round(Number(item.questionIndex)) === pair.questionIndex) || {}
    const score = Math.round(safeNumber(source.score, 55))
    const verdict = ['回答有效', '基本回答', '需要重答'].includes(source.verdict)
      ? source.verdict
      : score >= 80 ? '回答有效' : score >= 60 ? '基本回答' : '需要重答'
    const didWell = safeArray(source.didWell, 3)
    const improve = safeArray(source.improve, 4)
    return {
      id: `q${pair.questionIndex}`,
      question: pair.question,
      answer: pair.answer,
      score,
      verdict,
      summary: safeText(source.summary, '本次回答需要结合真实信息进一步具体化。', 700),
      didWell: didWell.length > 0 ? didWell : ['已经回应了面签官提出的问题。'],
      improve: improve.length > 0 ? improve : ['补充一个可核验的真实细节，并保持与申请材料一致。'],
      betterAnswer: safeText(
        source.betterAnswer,
        'Please reorganize this answer using your real information: give the direct answer first, then add one or two verifiable details.',
        1_500,
      ),
    }
  })

  const rawPlan = Array.isArray(raw.actionPlan) ? raw.actionPlan : []
  const planFallbacks = [
    { label: '今天', title: `补齐「${weakest[0]?.label || '薄弱项'}」的事实`, detail: '整理真实的名称、时间、金额或计划，避免使用泛化表述。' },
    { label: '下一轮', title: '重答低分问题', detail: '先给直接结论，再补充一到两个可核验细节。' },
    { label: '面签前', title: '复核材料一致性', detail: '对照申请表与支持材料检查名称、日期、金额和计划。' },
  ]
  const actionPlan = planFallbacks.map((fallback, index) => {
    const source = isRecord(rawPlan[index]) ? rawPlan[index] : {}
    return {
      label: safeText(source.label, fallback.label, 30),
      title: safeText(source.title, fallback.title, 120),
      detail: safeText(source.detail, fallback.detail, 500),
    }
  })

  const visaTitle = input.visaType === 'F1' ? 'F-1 学生签证' : 'B-2 旅游签证'
  const officerLabel = OFFICER_LABELS[input.officerType] || OFFICER_LABELS.standard

  return {
    id: input.id,
    source: 'deepseek',
    title: visaTitle,
    subtitle: 'AI 模拟面签表现报告',
    date: input.date,
    time: input.time,
    duration: input.duration,
    questionCount: input.pairs.length,
    profile: officerLabel,
    evaluationLabel: input.visaType === 'F1' ? 'F-1 evaluation' : 'B-2 evaluation',
    dimensionIntro: input.visaType === 'F1'
      ? '依据本次回答检查身份、学习、学术、资金、回国计划与风险一致性。'
      : '依据本次回答检查出行目的、计划、资金、回国约束、信息一致性与表达效率。',
    overallScore: weightedScore,
    readiness: weightedScore >= 80 ? '整体稳定' : weightedScore >= 65 ? '接近就绪' : '需要补强',
    headline: safeText(raw.headline, '本次报告已完成，请按优先项继续练习。', 300),
    summary: safeText(raw.summary, '报告只评估本次模拟中的回答表现，不预测真实签证结果。', 1_000),
    dimensions: publicDimensions,
    strengths,
    priorities,
    questionReviews,
    actionPlan,
    policyVersion: FEEDBACK_POLICY_VERSION,
  }
}

async function callDeepSeek({ apiKey, baseUrl, model, input }) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: buildFeedbackMessages({
            visaType: input.visaType,
            officerType: input.officerType,
            applicantContext: input.context,
            questionAnswerPairs: input.pairs,
          }),
          response_format: { type: 'json_object' },
          thinking: { type: 'enabled' },
          reasoning_effort: 'high',
          max_tokens: 12_000,
          stream: false,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = Object.assign(new Error(`DeepSeek request failed with ${response.status}.`), {
          code: 'UPSTREAM_ERROR',
          upstreamStatus: response.status,
        })
        if (response.status < 500 && response.status !== 429) throw error
        lastError = error
        continue
      }

      const payload = await response.json()
      const content = payload?.choices?.[0]?.message?.content
      return normalizeDeepSeekReport(input, parseJsonContent(content))
    } catch (error) {
      lastError = error
      if (error?.name === 'AbortError') throw error
      if (error?.code === 'UPSTREAM_ERROR' && error?.upstreamStatus < 500 && error?.upstreamStatus !== 429) throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError || new Error('DeepSeek request failed.')
}

export async function generateDeepSeekFeedback(options, rawInput) {
  const input = sanitizeFeedbackRequest(rawInput)
  if (!input) throw Object.assign(new Error('Invalid feedback input.'), { code: 'INVALID_FEEDBACK_INPUT' })
  const apiKey = safeText(options?.apiKey, '', 500)
  if (!apiKey) throw Object.assign(new Error('DeepSeek API key is missing.'), { code: 'DEEPSEEK_NOT_CONFIGURED' })
  return await callDeepSeek({
    apiKey,
    baseUrl: safeText(options?.baseUrl, 'https://api.deepseek.com', 500),
    model: safeText(options?.model, 'deepseek-v4-flash', 100),
    input,
  })
}

export function createDeepSeekFeedbackApi(options = {}) {
  const apiKey = safeText(options.apiKey, '', 500)
  const baseUrl = safeText(options.baseUrl, 'https://api.deepseek.com', 500)
  const model = safeText(options.model, 'deepseek-v4-flash', 100)
  const configured = Boolean(apiKey)
  const requestWindows = new Map()
  let activeRequests = 0

  function takeRateSlot(ip) {
    const now = Date.now()
    const current = requestWindows.get(ip)
    if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
      requestWindows.set(ip, { count: 1, startedAt: now })
      return { allowed: true }
    }
    if (current.count >= MAX_REQUESTS_PER_WINDOW) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1_000)) }
    }
    current.count += 1
    return { allowed: true }
  }

  async function handleRequest(req, res, pathname) {
    if (pathname === '/api/feedback-health' && (req.method === 'GET' || req.method === 'HEAD')) {
      json(res, configured ? 200 : 503, {
        ok: configured,
        provider: 'deepseek-feedback',
        model,
        policyVersion: FEEDBACK_POLICY_VERSION,
        ...(configured ? {} : { code: 'DEEPSEEK_NOT_CONFIGURED' }),
      })
      return true
    }

    if (pathname !== '/api/feedback-report') return false
    if (req.method !== 'POST') {
      json(res, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' })
      return true
    }
    if (!configured) {
      json(res, 503, { code: 'DEEPSEEK_NOT_CONFIGURED', message: '反馈分析服务尚未配置。' })
      return true
    }
    if (!isSameOrigin(req)) {
      json(res, 403, { code: 'INVALID_ORIGIN', message: '请求来源无效。' })
      return true
    }

    const rate = takeRateSlot(clientIp(req))
    if (!rate.allowed) {
      json(res, 429, { code: 'RATE_LIMITED', message: '反馈生成次数过多，请稍后再试。' }, { 'Retry-After': String(rate.retryAfter) })
      return true
    }
    if (activeRequests >= MAX_ACTIVE_REQUESTS) {
      json(res, 503, { code: 'FEEDBACK_BUSY', message: '反馈服务正在处理其他报告，请稍后再试。' })
      return true
    }

    let countedActiveRequest = false
    try {
      const raw = await readJson(req)
      const input = sanitizeFeedbackRequest(raw)
      if (!input) {
        json(res, 400, { code: 'INVALID_FEEDBACK_INPUT', message: '本次面签记录不足，无法生成反馈。' })
        return true
      }

      activeRequests += 1
      countedActiveRequest = true
      const report = await callDeepSeek({ apiKey, baseUrl, model, input })
      json(res, 200, { report })
    } catch (error) {
      const timeout = error?.name === 'AbortError'
      const upstreamStatus = Number(error?.upstreamStatus)
      console.error('[feedback] DeepSeek report failed:', error?.code || error?.name || 'UNKNOWN')
      json(res, timeout ? 504 : upstreamStatus === 429 ? 429 : Number(error?.statusCode) || 502, {
        code: timeout ? 'FEEDBACK_TIMEOUT' : upstreamStatus === 429 ? 'RATE_LIMITED' : 'FEEDBACK_GENERATION_FAILED',
        message: timeout ? '反馈分析超时，请稍后再试。' : '反馈分析暂时失败，请稍后再试。',
      })
    } finally {
      if (countedActiveRequest && activeRequests > 0) activeRequests -= 1
    }
    return true
  }

  return { configured, handleRequest, model }
}
