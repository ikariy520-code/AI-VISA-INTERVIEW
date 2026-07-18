import { motion, useReducedMotion } from 'framer-motion'

export type VoiceOrbPhase =
  | 'checking'
  | 'ready'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'ending'
  | 'ended'
  | 'error'

interface Props {
  phase: VoiceOrbPhase
  micLevel: number
}

const phaseLabel: Record<VoiceOrbPhase, string> = {
  checking: '正在准备',
  ready: '等待开始',
  connecting: '正在连接',
  listening: '正在聆听你',
  thinking: '正在理解',
  speaking: '面签官正在说话',
  muted: '麦克风已关闭',
  ending: '正在结束',
  ended: '面签已结束',
  error: '连接异常',
}

const palette: Record<VoiceOrbPhase, { primary: string; secondary: string; glow: string }> = {
  checking: { primary: '#9ca3af', secondary: '#d1d5db', glow: 'rgba(148,163,184,.25)' },
  ready: { primary: '#3588e8', secondary: '#74c7f5', glow: 'rgba(48,132,225,.30)' },
  connecting: { primary: '#3288e8', secondary: '#8b9cff', glow: 'rgba(62,128,235,.32)' },
  listening: { primary: '#087bea', secondary: '#43d3f4', glow: 'rgba(0,113,227,.38)' },
  thinking: { primary: '#6371df', secondary: '#9c7df0', glow: 'rgba(101,84,192,.32)' },
  speaking: { primary: '#6754d9', secondary: '#d06ae8', glow: 'rgba(124,58,237,.40)' },
  muted: { primary: '#777b83', secondary: '#b5b8bf', glow: 'rgba(110,110,115,.22)' },
  ending: { primary: '#747b8c', secondary: '#b0b5c0', glow: 'rgba(110,110,115,.22)' },
  ended: { primary: '#8b8f97', secondary: '#c4c6cb', glow: 'rgba(110,110,115,.18)' },
  error: { primary: '#c9342f', secondary: '#ee8c82', glow: 'rgba(201,52,47,.28)' },
}

export default function RealtimeVoiceOrb({ phase, micLevel }: Props) {
  const reduceMotion = useReducedMotion()
  const colors = palette[phase]
  const listeningActivity = phase === 'listening' ? Math.min(1, Math.max(0, micLevel) * 2.4) : 0
  const activity = phase === 'speaking'
    ? 0.78
    : phase === 'thinking' || phase === 'connecting'
      ? 0.34
      : listeningActivity
  const reactiveScale = 1 + activity * 0.11
  const isAlive = ['listening', 'thinking', 'speaking', 'connecting'].includes(phase)

  return (
    <div className="flex flex-col items-center" aria-label={phaseLabel[phase]} role="img">
      <div className="relative flex h-[230px] w-[230px] items-center justify-center sm:h-[270px] sm:w-[270px]">
        <motion.div
          animate={reduceMotion ? { scale: 1, opacity: 0.35 } : {
            scale: isAlive ? [1, 1.08 + activity * 0.08, 0.98, 1] : 1,
            opacity: isAlive ? [0.28, 0.48, 0.3, 0.28] : 0.2,
          }}
          transition={{ repeat: isAlive && !reduceMotion ? Infinity : 0, duration: phase === 'speaking' ? 1.45 : 2.8, ease: 'easeInOut' }}
          className="absolute inset-[7%] rounded-full blur-2xl"
          style={{ background: colors.glow }}
        />

        <motion.div
          animate={{ scale: reduceMotion ? 1 : reactiveScale }}
          transition={{ duration: phase === 'listening' ? 0.09 : 0.35, ease: 'easeOut' }}
          className="absolute inset-[15%] overflow-hidden rounded-full border border-white/60 shadow-[inset_0_0_34px_rgba(255,255,255,0.42),0_30px_70px_rgba(24,67,120,0.16)]"
          style={{
            background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,.88), transparent 21%), linear-gradient(145deg, ${colors.secondary}, ${colors.primary})`,
          }}
        >
          <motion.div
            animate={reduceMotion ? undefined : {
              x: isAlive ? ['-12%', '18%', '-4%', '-12%'] : '-8%',
              y: isAlive ? ['-8%', '12%', '20%', '-8%'] : '0%',
              rotate: isAlive ? [0, 110, 240, 360] : 0,
              scale: isAlive ? [1, 1.18, 0.92, 1] : 1,
            }}
            transition={{ repeat: isAlive ? Infinity : 0, duration: phase === 'speaking' ? 2.4 : 4.8, ease: 'easeInOut' }}
            className="absolute -left-[12%] -top-[10%] h-[78%] w-[78%] rounded-[44%_56%_62%_38%/50%_42%_58%_50%] bg-white/45 blur-xl"
          />
          <motion.div
            animate={reduceMotion ? undefined : {
              x: isAlive ? ['8%', '-18%', '10%', '8%'] : '5%',
              y: isAlive ? ['10%', '-12%', '-4%', '10%'] : '8%',
              rotate: isAlive ? [360, 230, 90, 0] : 0,
              scale: isAlive ? [0.96, 1.12, 1.02, 0.96] : 1,
            }}
            transition={{ repeat: isAlive ? Infinity : 0, duration: phase === 'speaking' ? 2.05 : 4.2, ease: 'easeInOut' }}
            className="absolute -bottom-[18%] -right-[12%] h-[82%] w-[82%] rounded-[58%_42%_38%_62%/46%_60%_40%_54%] bg-[#fff]/25 blur-2xl"
          />
          <motion.div
            animate={reduceMotion ? undefined : {
              scale: isAlive ? [0.7, 1.08 + activity * 0.14, 0.78, 0.7] : 0.72,
              opacity: isAlive ? [0.34, 0.68, 0.38, 0.34] : 0.3,
            }}
            transition={{ repeat: isAlive ? Infinity : 0, duration: phase === 'speaking' ? 1.15 : 2.6, ease: 'easeInOut' }}
            className="absolute inset-[27%] rounded-full bg-white blur-xl"
          />
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_68%_74%,rgba(19,31,93,.18),transparent_34%)]" />
        </motion.div>

        <motion.div
          animate={reduceMotion ? { rotate: 0 } : { rotate: isAlive ? 360 : 0 }}
          transition={{ repeat: isAlive ? Infinity : 0, duration: 8, ease: 'linear' }}
          className="absolute inset-[12%] rounded-full border border-white/30"
          style={{ borderTopColor: `${colors.secondary}88`, borderRightColor: 'transparent' }}
        />
      </div>

      <div className="mt-1 flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/75 px-3.5 py-2 shadow-sm backdrop-blur-xl">
        <motion.span
          animate={isAlive && !reduceMotion ? { scale: [0.75, 1.15, 0.75], opacity: [0.5, 1, 0.5] } : { scale: 1, opacity: 0.65 }}
          transition={{ repeat: isAlive && !reduceMotion ? Infinity : 0, duration: 1.2 }}
          className="h-2 w-2 rounded-full"
          style={{ background: colors.primary }}
        />
        <span className="text-[12px] font-semibold text-[#424245]" aria-live="polite">{phaseLabel[phase]}</span>
      </div>
      <p className="mt-2 text-[10px] text-[#a1a1a6]">字幕已隐藏 · 对话仍会用于本次反馈</p>
    </div>
  )
}
