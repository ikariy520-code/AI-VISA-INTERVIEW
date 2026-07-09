import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

// ========================================
// 自定义面签官 — 二级配置页面
//
// 用户在此描述想要的类型 + 通过可拖拽滑块设置难度
// 确认后 → sessionStorage → 跳转 /practice
// ========================================

// ---- 难度等级定义 ----

const DIFFICULTY_LABELS = ['', '轻松入门', '偏易', '标准', '偏难', '地狱难度']
const DIFFICULTY_DESCRIPTIONS: Record<number, string> = {
  1: '面签官会非常耐心友好，给你充足时间思考和回答',
  2: '面签官态度温和，问题清晰，氛围轻松舒适',
  3: '标准面签节奏，专业中性，不刻意施压也不特别友好',
  4: '面签官会追问细节，提出质疑，需要你给出具体证据',
  5: '面试官咄咄逼人，频繁打断追问，压力拉满',
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

  // 滑块位置百分比
  const thumbPercent = ((value - 1) / 4) * 100

  return (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      className="relative flex items-center w-full h-14
        bg-white/70 backdrop-blur-2xl
        border border-slate-200/60
        rounded-full px-4
        shadow-sm shadow-slate-200/50
        cursor-pointer select-none
        transition-all duration-300"
    >
      {/* 左侧标签：轻松 */}
      <span className="text-[12px] text-slate-400 font-medium flex-shrink-0 select-none mr-3">
        轻松
      </span>

      {/* 轨道 */}
      <div className="relative flex-1 h-2 mx-1">
        {/* 背景线 */}
        <div className="absolute inset-y-0 left-0 right-0 my-auto h-1.5 rounded-full bg-slate-200" />

        {/* 已填充线 */}
        <div
          className="absolute inset-y-0 left-0 my-auto h-1.5 rounded-full
            bg-gradient-to-r from-purple-400 to-pink-500 transition-all duration-150"
          style={{ width: `${thumbPercent}%` }}
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
                      ? 'w-3 h-3 bg-white border-2 border-purple-500 shadow-sm shadow-purple-500/30'
                      : isActive
                        ? 'w-2 h-2 bg-purple-400'
                        : 'w-2 h-2 bg-slate-300'
                    }`}
                />
              </div>
            )
          })}
        </div>

        {/* 拖拽拇指 */}
        <div
          onPointerDown={handlePointerDown}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2
            w-7 h-7 rounded-full
            bg-gradient-to-br from-purple-500 to-pink-600
            shadow-lg shadow-purple-500/30
            border-2 border-white
            cursor-grab active:cursor-grabbing
            flex items-center justify-center
            transition-shadow duration-200
            hover:shadow-xl hover:shadow-purple-500/40
            z-10"
          style={{ left: `${thumbPercent}%`, touchAction: 'none' }}
        >
          {/* 拇指上的数字 */}
          <span className="text-[10px] font-bold text-white select-none">
            {value}
          </span>
        </div>
      </div>

      {/* 右侧标签：困难 */}
      <span className="text-[12px] text-slate-400 font-medium flex-shrink-0 select-none ml-3">
        困难
      </span>
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
    <motion.div {...pageTransition} className="min-h-screen bg-[#F8FAFC]">
      {/* ---- 顶栏 ---- */}
      <header className="flex items-center px-4 py-3">
        <button
          onClick={() => navigate('/voice')}
          className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400
            hover:text-slate-700 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回
        </button>
        <span className="flex-1 text-center text-[14px] font-semibold text-slate-700 mr-8">
          自定义面签官
        </span>
      </header>

      {/* ---- 内容 ---- */}
      <div className="max-w-xl mx-auto px-4 pb-24">
        {/* 简介 */}
        <div className="mb-8">
          <p className="text-[15px] text-slate-500 leading-relaxed">
            描述你理想中的面签官，AI 将根据你的描述和难度设定，为你定制专属的面签练习体验。
          </p>
        </div>

        {/* 描述输入区 */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-slate-800 mb-3">
            ✏️ 描述你想要的类型
          </h2>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="例如：一位温和但严谨的华裔女性面签官，喜欢追问家庭细节和工作情况，偶尔会用中文确认关键信息。说话不快但每句话都很有分量…"
            rows={4}
            className="w-full px-4 py-3.5 rounded-2xl border border-slate-200
              bg-white text-[14px] text-slate-700 placeholder-slate-400
              outline-none transition-all duration-200
              focus:border-purple-300 focus:ring-4 focus:ring-purple-50
              resize-none leading-relaxed
              shadow-sm"
          />

          {/* 字符计数/提示 */}
          <div className="flex items-center justify-between mt-2">
            <p className="text-[12px] text-slate-400">
              描述越具体，AI 扮演的角色越贴合你的预期
            </p>
            <span className="text-[12px] text-slate-400 tabular-nums">
              {description.length}
            </span>
          </div>
        </section>

        {/* 难度选择区 */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-slate-800 mb-3">
            🎚️ 练习难度
          </h2>

          {/* 当前难度标签 */}
          <div className="flex items-center gap-2 mb-4">
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold
              ${difficulty <= 2
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : difficulty === 3
                  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {DIFFICULTY_LABELS[difficulty]}
            </span>
            <span className="text-[13px] text-slate-500">
              {DIFFICULTY_DESCRIPTIONS[difficulty]}
            </span>
          </div>

          {/* 可拖拽滑块 */}
          <DifficultySlider value={difficulty} onChange={setDifficulty} />

          {/* 难度档位速查 */}
          <div className="flex justify-between mt-3 px-1">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setDifficulty(level)}
                className={`text-[11px] font-medium transition-colors duration-200
                  ${level === difficulty
                    ? 'text-purple-600'
                    : 'text-slate-400 hover:text-slate-600'
                  }`}
              >
                {level}
              </button>
            ))}
          </div>
        </section>

        {/* 预览区 */}
        {description.trim().length > 0 && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
            className="mb-8 overflow-hidden"
          >
            <h2 className="text-[15px] font-semibold text-slate-800 mb-3">
              👁️ 效果预览
            </h2>
            <div className="p-4 rounded-2xl bg-slate-800/90 border border-slate-700/50">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                AI System Prompt 预览
              </p>
              <pre className="text-[12px] text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                {buildCustomSystemPrompt(description, difficulty)}
              </pre>
            </div>
          </motion.section>
        )}
      </div>

      {/* ---- 底部确认栏 ---- */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0, 1] }}
        className="fixed bottom-0 left-0 right-0 z-50"
      >
        <div className="h-12 bg-gradient-to-t from-[#F8FAFC] to-transparent" />
        <div className="bg-white/80 backdrop-blur-2xl border-t border-slate-200/60
          px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <div className="max-w-xl mx-auto flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-slate-500 font-normal">
                自定义面签官
              </p>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600
                  flex items-center justify-center text-sm"
                >
                  ✨
                </span>
                <span className="text-[14px] font-semibold text-slate-700 truncate">
                  {description
                    ? description.slice(0, 30) + (description.length > 30 ? '…' : '')
                    : '未填写描述'
                  }
                </span>
              </div>
            </div>
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className={`flex-shrink-0 px-8 py-3 rounded-2xl text-[15px] font-semibold
                text-white shadow-lg transition-all duration-300
                bg-gradient-to-r from-purple-500 to-pink-600
                hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]
                shadow-purple-400/25
                ${!isValid ? 'opacity-50 cursor-not-allowed hover:scale-100' : ''}`}
            >
              开始练习
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
