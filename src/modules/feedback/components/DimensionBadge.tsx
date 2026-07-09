// ========================================
// 评分标签
// 支持内容维度 + 语音指标两种模式
// ========================================

interface DimensionBadgeProps {
  label: string
  score: number       // 1-5 或具体数值
  /** 'score' = 显示圆点 / 'numeric' = 显示数字 / 'text' = 只显示文字 */
  mode?: 'score' | 'numeric' | 'text'
  /** 自定义颜色覆盖 */
  variant?: 'emerald' | 'amber' | 'red' | 'slate'
  suffix?: string      // 数值单位
}

function scoreVariant(score: number) {
  if (score >= 4) return 'emerald' as const
  if (score >= 3) return 'amber' as const
  return 'red' as const
}

const variantColors = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  red:     'bg-red-50 text-red-600 border-red-200',
  slate:   'bg-slate-50 text-slate-600 border-slate-200',
}

const scoreDots = (score: number) =>
  Array.from({ length: 5 }, (_, i) => (
    <span
      key={i}
      className={`inline-block w-1.5 h-1.5 rounded-full ${
        i < score ? 'bg-current' : 'bg-current opacity-20'
      }`}
    />
  ))

export default function DimensionBadge({
  label, score, mode = 'score', variant, suffix,
}: DimensionBadgeProps) {
  const v = variant ?? scoreVariant(score)
  const colors = variantColors[v]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-medium ${colors}`}>
      <span>{label}</span>
      {mode === 'score' && <span className="flex gap-0.5">{scoreDots(score)}</span>}
      {mode === 'numeric' && (
        <span className="tabular-nums">{score}{suffix ?? ''}</span>
      )}
    </span>
  )
}
