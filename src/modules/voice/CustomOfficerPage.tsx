import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineEye,
  HiOutlinePencilSquare,
} from 'react-icons/hi2'
import OfficerIcon from './OfficerIcon'

// ========================================
// 自定义面签官 — 二级配置页面
//
// 用户在此描述想要的类型 + 通过可拖拽滑块设置难度
// 确认后 → sessionStorage → 跳转 /practice
// ========================================

// ---- 难度等级定义 ----

const DIFFICULTY_LABELS = ['', '轻松', '偏易', '标准', '偏难', '高压']
const DIFFICULTY_DESCRIPTIONS: Record<number, string> = {
  1: '慢速提问，耐心等待',
  2: '语气友好，轻度追问',
  3: '真实节奏，正常追问',
  4: '连续追问，要求细节',
  5: '高压节奏，频繁质疑',
}

const DIFFICULTY_THEMES: Record<number, {
  accent: string
  soft: string
  border: string
  text: string
  shadow: string
}> = {
  1: { accent: '#24966d', soft: '#edf8f3', border: '#cfeadd', text: '#167252', shadow: 'rgba(36, 150, 109, 0.24)' },
  2: { accent: '#159d9a', soft: '#ebf8f7', border: '#c9e9e7', text: '#087775', shadow: 'rgba(21, 157, 154, 0.24)' },
  3: { accent: '#0071e3', soft: '#eef6ff', border: '#cfe5fb', text: '#0062c3', shadow: 'rgba(0, 113, 227, 0.24)' },
  4: { accent: '#e78319', soft: '#fff6eb', border: '#f3ddbf', text: '#a95908', shadow: 'rgba(231, 131, 25, 0.24)' },
  5: { accent: '#d94b45', soft: '#fff1f0', border: '#f1d1cf', text: '#b3322d', shadow: 'rgba(217, 75, 69, 0.24)' },
}

const DIFFICULTY_GUIDES: Record<number, string> = {
  1: 'Be very gentle and patient. Speak slowly and clearly. Give the applicant plenty of time to think. Be encouraging and forgiving — never interrupt or pressure them.',
  2: 'Be friendly and supportive. Ask clear, well-structured questions. Help the applicant feel comfortable and at ease. Push back only lightly.',
  3: 'Be professional and neutral. Standard interview pace — not too fast, not too slow. Evaluate objectively without being aggressive or overly friendly.',
  4: 'Be challenging and skeptical. Ask rapid follow-up questions. Push for specific details and concrete evidence. Show visible doubt when answers are vague.',
  5: 'Be extremely tough and intimidating. Interrupt frequently with sharp follow-ups. Demand precise, detailed answers under time pressure. Dismiss vague or evasive responses immediately. Your goal is to stress-test every claim the applicant makes.',
}

function buildCustomSystemPrompt(description: string, difficulty: number): string {
  const guide = DIFFICULTY_GUIDES[difficulty] ?? DIFFICULTY_GUIDES[3]
  return `You are a US visa officer with the following personality and style:
${description}

Difficulty level: ${difficulty}/5 — ${DIFFICULTY_LABELS[difficulty]}
Behavior guidelines: ${guide}

- Keep responses to 1-3 sentences
- Ask one question at a time, wait for the answer
- Focus on: ties to home country, purpose of travel, financial ability, travel history
- Respond in the same language the applicant uses`
}

// ---- 页面动画 ----

const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.3, ease: [0.25, 0.1, 0, 1] as const },
}

// ---- 可拖拽难度滑块组件 ----

function DifficultySlider({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const theme = DIFFICULTY_THEMES[value] ?? DIFFICULTY_THEMES[3]

  // 将 clientX 映射为难度值 1-5
  const clientXToValue = useCallback((clientX: number): number => {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * 4) + 1
  }, [value])

  // 鼠标/触摸拖拽
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
    const newVal = clientXToValue(e.clientX)
    onChange(newVal)
  }, [clientXToValue, onChange])

  useEffect(() => {
    if (!dragging) return

    const handlePointerMove = (e: PointerEvent) => {
      const newVal = clientXToValue(e.clientX)
      onChange(newVal)
    }
    const handlePointerUp = () => setDragging(false)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragging, clientXToValue, onChange])

  // 点击轨道跳转
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (dragging) return
    const newVal = clientXToValue(e.clientX)
    onChange(newVal)
  }, [dragging, clientXToValue, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(Math.min(5, value + 1))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.max(1, value - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(1)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(5)
    }
  }, [onChange, value])

  // 滑块位置百分比
  const thumbPercent = ((value - 1) / 4) * 100

  return (
    <div>
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="练习难度"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={value}
        aria-valuetext={DIFFICULTY_LABELS[value]}
        className="relative flex h-16 w-full cursor-pointer select-none items-center rounded-[20px] border px-6 outline-none transition-all duration-300 focus-visible:ring-4 focus-visible:ring-black/10"
        style={{
          backgroundColor: theme.soft,
          borderColor: theme.border,
          boxShadow: dragging ? `0 12px 30px ${theme.shadow}` : undefined,
        }}
      >
        {/* 轨道 */}
        <div className="relative h-2.5 flex-1">
        {/* 背景线 */}
        <div className="absolute inset-y-0 left-0 right-0 my-auto h-2 rounded-full bg-white/90 shadow-inner" />

        {/* 已填充线 */}
        <div
          className="absolute inset-y-0 left-0 my-auto h-2 rounded-full transition-all duration-300"
          style={{
            width: `${thumbPercent}%`,
            backgroundColor: theme.accent,
            boxShadow: `0 3px 12px ${theme.shadow}`,
          }}
        />

        {/* 刻度点 */}
        <div className="absolute inset-0 flex items-center">
          {[1, 2, 3, 4, 5].map(level => {
            const dotPercent = ((level - 1) / 4) * 100
            const isActive = level <= value
            return (
              <div
                key={level}
                className="absolute"
                style={{ left: `${dotPercent}%`, transform: 'translateX(-50%)' }}
              >
                <div
                  className={`rounded-full transition-all duration-200
                    ${level === value
                      ? 'h-3.5 w-3.5 border-[3px] bg-white'
                      : isActive
                        ? 'h-2.5 w-2.5'
                        : 'h-2.5 w-2.5 bg-[#d2d2d7]'
                    }`}
                  style={level === value
                    ? { borderColor: theme.accent, boxShadow: `0 2px 8px ${theme.shadow}` }
                    : isActive ? { backgroundColor: theme.accent } : undefined}
                />
              </div>
            )
          })}
        </div>

        {/* 拖拽拇指 */}
        <div
          onPointerDown={handlePointerDown}
          className="absolute top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full
            border-[3px] border-white
            cursor-grab active:cursor-grabbing
            flex items-center justify-center
            transition-all duration-300
            z-10"
          style={{
            left: `${thumbPercent}%`,
            touchAction: 'none',
            backgroundColor: theme.accent,
            boxShadow: `0 8px 22px ${theme.shadow}`,
            transform: `translate(-50%, -50%) scale(${dragging ? 1.08 : 1})`,
          }}
        >
          {/* 拇指上的数字 */}
          <span className="select-none text-[11px] font-bold text-white">
            {value}
          </span>
        </div>
      </div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map(level => {
          const isSelected = level === value
          const levelTheme = DIFFICULTY_THEMES[level]
          return (
            <button
              type="button"
              key={level}
              onClick={() => onChange(level)}
              aria-label={`难度 ${level}：${DIFFICULTY_LABELS[level]}`}
              className="min-h-11 rounded-[14px] border px-1.5 py-2 text-center transition-all duration-200"
              style={isSelected
                ? { backgroundColor: levelTheme.soft, borderColor: levelTheme.border, color: levelTheme.text, outlineColor: levelTheme.accent }
                : { backgroundColor: '#ffffff', borderColor: 'rgba(29,29,31,0.07)', color: '#86868b', outlineColor: levelTheme.accent }}
            >
              <span className="block text-[10px] font-semibold tabular-nums">0{level}</span>
              <span className="mt-0.5 block text-[11px] font-semibold">{DIFFICULTY_LABELS[level]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---- 主页面 ----

export default function CustomOfficerPage() {
  const navigate = useNavigate()
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState(3)

  const handleConfirm = useCallback(() => {
    const prompt = buildCustomSystemPrompt(
      description || 'A professional visa officer.',
      difficulty,
    )
    sessionStorage.setItem('visa_officer_type', 'custom')
    sessionStorage.setItem('visa_custom_system_prompt', prompt)
    sessionStorage.setItem('visa_custom_difficulty', String(difficulty))
    sessionStorage.setItem('visa_custom_description', description)
    navigate('/practice', { state: { officerType: 'custom' as const } })
  }, [description, difficulty, navigate])

  const isValid = description.trim().length > 0

  return (
    <motion.div {...pageTransition} className="app-page pb-32">
      {/* ---- 顶栏 ---- */}
      <header className="app-topbar">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <button onClick={() => navigate('/voice')} className="app-icon-button" aria-label="返回面签官选择">
            <HiOutlineArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-[#1d1d1f]">自定义角色</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#86868b]">Personal setup</p>
          </div>
          <span className="w-10" />
        </div>
      </header>

      {/* ---- 内容 ---- */}
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        {/* 简介 */}
        <div className="mb-9">
          <span className="app-eyebrow">Custom officer</span>
          <h1 className="app-title mt-5">练你最担心的场景。</h1>
          <p className="app-subtitle">写下角色风格，再选难度。</p>
        </div>

        {/* 描述输入区 */}
        <section className="app-card mb-4 p-6 sm:p-7">
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f]">
            <HiOutlinePencilSquare className="h-[18px] w-[18px] text-[#0071e3]" />
            描述你想要的类型
          </h2>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="例如：温和但严谨，语速较慢，重点追问资金与回国计划。"
            rows={4}
            className="app-field min-h-32 resize-none leading-7"
          />

          {/* 字符计数/提示 */}
          <div className="flex items-center justify-between mt-2">
            <p className="text-[12px] text-slate-400">
              建议写清性格、语速和追问重点
            </p>
            <span className="text-[12px] text-slate-400 tabular-nums">
              {description.length}
            </span>
          </div>
        </section>

        {/* 难度选择区 */}
        <section className="app-card mb-4 p-6 sm:p-7">
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f]">
            <HiOutlineAdjustmentsHorizontal
              className="h-[18px] w-[18px] transition-colors duration-300"
              style={{ color: DIFFICULTY_THEMES[difficulty].accent }}
            />
            练习难度
          </h2>

          {/* 当前难度标签 */}
          <AnimatePresence mode="wait">
            <motion.div
              key={difficulty}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="mb-4 flex items-center justify-between rounded-[18px] border px-4 py-3"
              style={{
                backgroundColor: DIFFICULTY_THEMES[difficulty].soft,
                borderColor: DIFFICULTY_THEMES[difficulty].border,
              }}
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: DIFFICULTY_THEMES[difficulty].text }}>
                  Level 0{difficulty}
                </p>
                <p className="mt-0.5 text-[15px] font-semibold" style={{ color: DIFFICULTY_THEMES[difficulty].text }}>
                  {DIFFICULTY_LABELS[difficulty]}
                </p>
              </div>
              <p className="text-right text-[13px] font-medium text-[#6e6e73]">
                {DIFFICULTY_DESCRIPTIONS[difficulty]}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* 可拖拽滑块 */}
          <DifficultySlider value={difficulty} onChange={setDifficulty} />

        </section>

        {/* 预览区 */}
        {description.trim().length > 0 && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
            className="app-card mb-4 overflow-hidden p-6 sm:p-7"
          >
            <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f]">
              <HiOutlineEye className="h-[18px] w-[18px] text-[#0071e3]" />
              效果预览
            </h2>
            <div className="rounded-2xl bg-[#1d1d1f] p-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                AI System Prompt 预览
              </p>
              <pre className="text-[12px] text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                {buildCustomSystemPrompt(description, difficulty)}
              </pre>
            </div>
          </motion.section>
        )}
      </main>

      {/* ---- 底部确认栏 ---- */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0, 1] }}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-black/[0.07] bg-white/82 px-5 py-4 backdrop-blur-2xl sm:px-8"
      >
          <div className="mx-auto flex max-w-2xl items-center gap-4">
            <OfficerIcon type="custom" className="h-10 w-10 flex-shrink-0 rounded-[14px]" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">
                自定义角色
              </p>
                <span className="block truncate text-[14px] font-semibold text-[#1d1d1f]">
                  {description
                    ? description.slice(0, 30) + (description.length > 30 ? '…' : '')
                    : '未填写描述'
                  }
                </span>
            </div>
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className="app-button-primary flex-shrink-0"
            >
              开始练习
              <HiOutlineArrowRight className="h-4 w-4" />
            </button>
          </div>
      </motion.div>
    </motion.div>
  )
}
