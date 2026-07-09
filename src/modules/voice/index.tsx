import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { OfficerType } from './types'
import { officerTypes } from './data/officerTypes'

// ========================================
// 声音选择模块
//
// 四种预设面签官类型 + 自定义入口
//   - 预设类型可选中，仅特朗普支持试音
//   - 所有卡片统一结构，2×2 网格整齐对齐
//   - 试音展开内容在网格外渲染，不破坏布局
//   - 自定义入口 → 跳转到二级页面 /voice/custom
// 选择结果通过 react-router state + sessionStorage 传递
// ========================================

// 预设类型（不含自定义）
const presetTypes = officerTypes.filter(o => o.id !== 'custom')
const customType = officerTypes.find(o => o.id === 'custom')!

// ---- 试音播放器（Web Speech API） ----
function speakDemo(text: string, config: import('./types').OfficerTypeConfig) {
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  const { voiceProfile } = config
  utterance.rate = voiceProfile.rate
  utterance.pitch = voiceProfile.pitch
  const voices = window.speechSynthesis.getVoices()
  const genderKeywords = voiceProfile.gender === 'female'
    ? ['female', 'woman', 'samantha', 'google uk female', 'microsoft zira']
    : ['male', 'guy', 'daniel', 'google uk male', 'microsoft david']
  const enVoice =
    voices.find(v => v.lang.startsWith('en') && genderKeywords.some(k => v.name.toLowerCase().includes(k)))
    ?? voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'))
    ?? voices.find(v => v.lang.startsWith('en-US'))
    ?? voices.find(v => v.lang.startsWith('en'))
  if (enVoice) utterance.voice = enVoice
  window.speechSynthesis.speak(utterance)
}

// ---- 页面容器动画 ----
const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.3, ease: [0.25, 0.1, 0, 1] as const },
}

const stagger = {
  initial: { opacity: 0, y: 20 },
  animate: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: [0.25, 0.1, 0, 1] },
  }),
}

export default function VoicePage() {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<OfficerType | null>(null)
  const [previewId, setPreviewId] = useState<OfficerType | null>(null)
  const [playing, setPlaying] = useState(false)

  const selectedConfig = presetTypes.find(o => o.id === selectedId) ?? null
  const previewConfig = previewId ? officerTypes.find(o => o.id === previewId) ?? null : null
  const isPlayingPreview = previewId != null && playing

  // 点击试音
  const handlePreview = useCallback((id: OfficerType) => {
    const config = officerTypes.find(o => o.id === id)!
    if (previewId === id) {
      // 再次点击同一个 → 关闭试音
      setPreviewId(null)
      setPlaying(false)
      window.speechSynthesis.cancel()
      return
    }
    setPreviewId(id)
    if (config.demoTextEn) {
      setPlaying(true)
      speakDemo(config.demoTextEn, config)
      const estimatedDuration = config.demoTextEn.split(' ').length / 2.0 * 1000
      setTimeout(() => setPlaying(false), Math.max(estimatedDuration, 2000))
    }
  }, [previewId])

  // 确定选择（仅预设类型）
  const handleConfirm = useCallback(() => {
    if (!selectedId) return
    sessionStorage.setItem('visa_officer_type', selectedId)
    navigate('/practice', { state: { officerType: selectedId } })
  }, [selectedId, navigate])

  return (
    <motion.div {...pageTransition} className="min-h-screen bg-[#F8FAFC]">
      {/* ---- 顶栏 ---- */}
      <header className="flex items-center px-4 py-3">
        <button
          onClick={() => navigate('/')}
          className="w-8 h-8 rounded-lg flex items-center justify-center
            text-slate-400 hover:text-slate-600 hover:bg-slate-100
            transition-all duration-200 flex-shrink-0"
          title="返回首页"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </header>

      {/* ---- 内容 ---- */}
      <div className="max-w-2xl mx-auto px-4 pb-24">
        {/* 标题 */}
        <div className="mb-8">
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight">
            选择面签官类型
          </h1>
          <p className="text-[15px] text-slate-500 mt-1.5 font-normal">
            选择一种面签风格，AI 将以此人设进行模拟练习。也可以自定义你想要的类型
          </p>
        </div>

        {/* ---- 预设卡片 2×2 网格 ---- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {presetTypes.map((officer, i) => {
            const isSelected = selectedId === officer.id
            const isPreview = previewId === officer.id
            const hasDemo = !!officer.demoTextEn

            return (
              <motion.div
                key={officer.id}
                custom={i}
                variants={stagger}
                initial="initial"
                animate="animate"
                className="flex"
              >
                {/* ---- 卡片主体 ---- */}
                <button
                  onClick={() => setSelectedId(prev => prev === officer.id ? null : officer.id)}
                  className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-300
                    bg-white flex flex-col
                    ${isSelected
                      ? `border-transparent ${officer.ringColor} ring-2 ring-offset-2 shadow-lg shadow-slate-200/50`
                      : 'border-slate-100 hover:border-slate-200 hover:shadow-md hover:shadow-slate-100/50'
                    }`}
                >
                  {/* 头像 + 标题 */}
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${officer.gradient}
                      flex items-center justify-center text-2xl flex-shrink-0
                      shadow-sm ${isSelected ? 'shadow-md' : ''}`}
                    >
                      <span>{officer.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[16px] font-semibold text-slate-900 mb-0.5">
                        {officer.label}
                      </h3>
                      <p className="text-[12px] text-slate-400 font-normal">
                        {officer.subtitle}
                      </p>
                    </div>
                    {/* 选中标记 */}
                    {isSelected && (
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${officer.gradient}
                        flex items-center justify-center flex-shrink-0`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* 描述 */}
                  <p className="mt-3 text-[13px] text-slate-500 leading-relaxed flex-1">
                    {officer.description}
                  </p>

                  {/* 底部操作区 — 所有卡片统一高度，无 demo 的卡片保留空位 */}
                  <div className="mt-4" style={{ minHeight: '30px' }}>
                    {hasDemo ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePreview(officer.id)
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                          text-[12px] font-medium cursor-pointer
                          transition-all duration-200
                          ${isPlayingPreview && isPreview
                            ? 'bg-red-50 text-red-500 border border-red-200'
                            : isPreview
                              ? 'bg-slate-800 text-white border border-slate-800'
                              : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                          }`}
                      >
                        {isPlayingPreview && isPreview ? (
                          <>
                            <span className="flex items-end gap-[1.5px] h-3">
                              {[0.6, 1, 0.4, 0.8, 0.5].map((h, j) => (
                                <span
                                  key={j}
                                  className="w-[2px] bg-current rounded-full animate-pulse"
                                  style={{ height: `${h * 100}%`, animationDelay: `${j * 0.12}s` }}
                                />
                              ))}
                            </span>
                            正在试音…
                          </>
                        ) : isPreview ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="6" y="4" width="4" height="16" rx="1" />
                              <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                            停止试音
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            试音
                          </>
                        )}
                      </span>
                    ) : null}
                  </div>
                </button>
              </motion.div>
            )
          })}
        </div>

        {/* ---- 试音内容展开（网格外渲染，不破坏 2×2 布局） ---- */}
        <AnimatePresence>
          {previewConfig && previewConfig.demoTextEn && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-white/60">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-5 h-5 rounded-md bg-gradient-to-br ${previewConfig.gradient}
                    flex items-center justify-center text-[10px]`}
                  >
                    {previewConfig.icon}
                  </span>
                  <span className="text-[13px] font-semibold text-slate-700">
                    {previewConfig.label} · 试音
                  </span>
                  <button
                    onClick={() => {
                      setPreviewId(null)
                      setPlaying(false)
                      window.speechSynthesis.cancel()
                    }}
                    className="ml-auto text-[12px] text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    收起
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      中文参考
                    </p>
                    <div className="p-3 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-100">
                      <p className="text-[13px] text-slate-700 leading-relaxed">
                        {previewConfig.demoText}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      英文试音（实际朗读）
                    </p>
                    <div className="p-3 rounded-xl bg-slate-800/90 backdrop-blur-sm">
                      <p className="text-[13px] text-white/90 leading-relaxed font-normal">
                        {previewConfig.demoTextEn}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- 自定义入口卡片（全宽） ---- */}
        <motion.div
          custom={4}
          variants={stagger}
          initial="initial"
          animate="animate"
          className="mt-4"
        >
          <button
            onClick={() => navigate('/voice/custom')}
            className="w-full text-left p-5 rounded-2xl border-2 border-dashed
              border-purple-200 hover:border-purple-300
              bg-gradient-to-r from-purple-50/50 to-pink-50/50
              hover:from-purple-50 hover:to-pink-50
              transition-all duration-300
              hover:shadow-md hover:shadow-purple-100/30
              group"
          >
            <div className="flex items-center gap-4">
              {/* 图标 */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${customType.gradient}
                flex items-center justify-center text-2xl flex-shrink-0
                shadow-sm group-hover:shadow-md transition-shadow duration-300`}
              >
                <span>{customType.icon}</span>
              </div>

              {/* 文字 */}
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-semibold text-slate-900 mb-0.5">
                  {customType.label}
                </h3>
                <p className="text-[12px] text-slate-400 font-normal">
                  {customType.subtitle}
                </p>
                <p className="mt-2 text-[13px] text-slate-500 leading-relaxed">
                  {customType.description}
                </p>
              </div>

              {/* 箭头 */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-slate-200
                flex items-center justify-center
                group-hover:bg-purple-50 group-hover:border-purple-200
                transition-all duration-300 group-hover:translate-x-0.5"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="text-slate-400 group-hover:text-purple-500 transition-colors"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          </button>
        </motion.div>
      </div>

      {/* ---- 底部确定栏（仅预设类型） ---- */}
      <AnimatePresence>
        {selectedConfig && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0, 1] }}
            className="fixed bottom-0 left-0 right-0 z-50"
          >
            <div className="h-12 bg-gradient-to-t from-[#F8FAFC] to-transparent" />
            <div className="bg-white/80 backdrop-blur-2xl border-t border-slate-200/60
              px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            >
              <div className="max-w-2xl mx-auto flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-slate-500 font-normal">
                    已选择
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg bg-gradient-to-br ${selectedConfig.gradient}
                      flex items-center justify-center text-sm`}
                    >
                      {selectedConfig.icon}
                    </span>
                    <span className="text-[15px] font-semibold text-slate-900">
                      {selectedConfig.label}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleConfirm}
                  className={`flex-shrink-0 px-8 py-3 rounded-2xl text-[15px] font-semibold
                    text-white shadow-lg transition-all duration-300
                    bg-gradient-to-r ${selectedConfig.gradient}
                    hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]
                    shadow-slate-400/25`}
                >
                  确定选择
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
