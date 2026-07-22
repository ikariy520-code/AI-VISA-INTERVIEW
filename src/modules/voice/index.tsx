import { useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineCheck,
  HiOutlineChevronRight,
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineSpeakerWave,
  HiOutlineXMark,
} from 'react-icons/hi2'
import type { OfficerType } from './types'
import { officerTypes, resolveOfficerType } from './data/officerTypes'
import OfficerIcon from './OfficerIcon'

const presetTypes = officerTypes.filter(o => o.id !== 'custom')
const customType = officerTypes.find(o => o.id === 'custom')!

function speakDemo(text: string, config: import('./types').OfficerTypeConfig) {
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = config.voiceProfile.rate
  utterance.pitch = config.voiceProfile.pitch
  const voices = window.speechSynthesis.getVoices()
  const genderKeywords = config.voiceProfile.gender === 'female'
    ? ['female', 'woman', 'samantha', 'google uk female', 'microsoft zira']
    : ['male', 'guy', 'daniel', 'google uk male', 'microsoft david']
  utterance.voice = voices.find(v => v.lang.startsWith('en') && genderKeywords.some(k => v.name.toLowerCase().includes(k)))
    ?? voices.find(v => v.lang.startsWith('en-US'))
    ?? voices.find(v => v.lang.startsWith('en'))
    ?? null
  window.speechSynthesis.speak(utterance)
}

const cardMotion = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: 0.08 + index * 0.07, duration: 0.48, ease: [0.28, 0.11, 0.32, 1] },
  }),
}

export default function VoicePage() {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<OfficerType | null>(null)
  const [previewId, setPreviewId] = useState<OfficerType | null>(null)
  const [playing, setPlaying] = useState(false)

  const selectedConfig = presetTypes.find(o => o.id === selectedId) ?? null
  const previewConfig = previewId ? officerTypes.find(o => o.id === previewId) ?? null : null

  const handlePreview = useCallback((id: OfficerType) => {
    const config = officerTypes.find(o => o.id === id)!
    if (previewId === id) {
      setPreviewId(null)
      setPlaying(false)
      window.speechSynthesis.cancel()
      return
    }
    setPreviewId(id)
    if (!config.demoTextEn) return
    setPlaying(true)
    speakDemo(config.demoTextEn, config)
    const estimatedDuration = config.demoTextEn.split(' ').length / 2 * 1000
    window.setTimeout(() => setPlaying(false), Math.max(estimatedDuration, 2000))
  }, [previewId])

  const handleConfirm = useCallback(() => {
    if (!selectedId) return
    const resolvedId = resolveOfficerType(selectedId)
    sessionStorage.setItem('visa_officer_type', resolvedId)
    navigate('/practice', { state: { officerType: resolvedId } })
  }, [navigate, selectedId])

  return (
    <div className="app-page pb-32">
      <header className="app-topbar">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
          <button type="button" onClick={() => navigate('/')} className="app-icon-button" aria-label="返回首页">
            <HiOutlineArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-[#1d1d1f]">选择面签官</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#86868b]">Step 1 of 3</p>
          </div>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-9 sm:px-8 sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.28, 0.11, 0.32, 1] }}
          className="max-w-2xl"
        >
          <span className="app-eyebrow">Interview style</span>
          <h1 className="app-title mt-4 sm:mt-5">选择今天要练习的节奏。</h1>
          <p className="app-subtitle">不同风格会改变语速、追问强度和表达压力。第一次练习，建议从标准型开始。</p>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:gap-4 md:mt-9 md:grid-cols-2">
          {presetTypes.map((officer, index) => {
            const isSelected = selectedId === officer.id
            const isPreview = previewId === officer.id
            return (
              <motion.div
                key={officer.id}
                custom={index}
                variants={cardMotion}
                initial="hidden"
                animate="visible"
                className={`relative overflow-hidden rounded-[24px] border bg-white transition-all duration-300 active:scale-[0.985] ${
                  isSelected
                    ? 'border-[#0071e3] shadow-[0_0_0_4px_rgba(0,113,227,0.09),0_24px_64px_rgba(0,0,0,0.08)]'
                    : 'border-black/[0.08] shadow-[0_14px_50px_rgba(0,0,0,0.045)] hover:-translate-y-0.5 hover:border-black/[0.14] hover:shadow-[0_20px_60px_rgba(0,0,0,0.075)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(current => current === officer.id ? null : officer.id)}
                  className="w-full p-5 text-left sm:p-7"
                >
                  <div className="flex items-start gap-4">
                    <OfficerIcon type={officer.id} className="h-12 w-12 flex-shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#1d1d1f]">{officer.label}</h2>
                          <p className="mt-1 text-[12px] font-medium text-[#86868b]">{officer.subtitle}</p>
                        </div>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
                          isSelected ? 'border-[#0071e3] bg-[#0071e3] text-white' : 'border-black/[0.12] text-transparent'
                        }`}>
                          <HiOutlineCheck className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <p className="mt-4 text-[13px] leading-6 text-[#6e6e73]">{officer.description}</p>
                    </div>
                  </div>
                </button>

                {officer.demoTextEn && (
                  <div className="border-t border-black/[0.06] px-6 py-3 sm:px-7">
                    <button
                      type="button"
                      onClick={() => handlePreview(officer.id)}
                      className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#6e6e73] transition-colors hover:text-[#0071e3]"
                    >
                      {isPreview ? <HiOutlinePause className="h-4 w-4" /> : <HiOutlinePlay className="h-4 w-4" />}
                      {isPreview && playing ? '正在试音' : isPreview ? '停止试音' : '试听说话节奏'}
                    </button>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>

        <motion.button
          type="button"
          custom={4}
          variants={cardMotion}
          initial="hidden"
          animate="visible"
          onClick={() => navigate('/voice/custom')}
          className="app-card-interactive group mt-1 flex w-full items-center gap-4 p-5 text-left active:scale-[0.985] sm:mt-4 sm:p-7"
        >
          <OfficerIcon type="custom" className="h-12 w-12 flex-shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold tracking-[-0.025em] text-[#1d1d1f]">{customType.label}</p>
            <p className="mt-1 text-[13px] leading-6 text-[#6e6e73]">自己设定性格、追问方式与练习难度。</p>
          </div>
          <HiOutlineChevronRight className="h-5 w-5 flex-shrink-0 text-[#a1a1a6] transition-transform group-hover:translate-x-0.5" />
        </motion.button>

        <AnimatePresence>
          {previewConfig?.demoTextEn && (
            <motion.section
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.32, ease: [0.28, 0.11, 0.32, 1] }}
              className="overflow-hidden"
            >
              <div className="app-soft-panel mt-4 p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1d1d1f] text-white">
                    <HiOutlineSpeakerWave className="h-[17px] w-[17px]" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-[#1d1d1f]">{previewConfig.label} · 语气参考</p>
                    <p className="text-[11px] text-[#86868b]">已接入实时 AI 声线，面签中会保持同一角色音色。</p>
                  </div>
                  <button type="button" onClick={() => handlePreview(previewConfig.id)} className="app-icon-button ml-auto h-8 w-8" aria-label="关闭试音">
                    <HiOutlineXMark className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.06]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#86868b]">中文参考</p>
                    <p className="mt-2 text-[13px] leading-6 text-[#424245]">{previewConfig.demoText}</p>
                  </div>
                  <div className="rounded-2xl bg-[#1d1d1f] p-4 text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Actual script</p>
                    <p className="mt-2 text-[13px] leading-6 text-white/85">{previewConfig.demoTextEn}</p>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {selectedConfig && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.28, 0.11, 0.32, 1] }}
            className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-black/[0.07] bg-white/88 px-4 pt-3 shadow-[0_-12px_36px_rgba(0,0,0,0.06)] backdrop-blur-2xl sm:px-8 sm:py-4"
          >
            <div className="mx-auto flex max-w-5xl items-center gap-3 sm:gap-4">
              <OfficerIcon type={selectedConfig.id} className="h-10 w-10 flex-shrink-0 rounded-[14px]" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">本次角色</p>
                <p className="truncate text-[14px] font-semibold text-[#1d1d1f]">{selectedConfig.label}</p>
              </div>
              <button type="button" onClick={handleConfirm} className="app-button-primary flex-shrink-0 active:scale-[0.97]">
                选择签证类型
                <HiOutlineArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
