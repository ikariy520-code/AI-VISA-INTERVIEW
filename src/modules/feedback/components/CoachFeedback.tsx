import type { AnswerFeedback } from '../types'
import DimensionBadge from './DimensionBadge'
import {
  HiOutlineCheckCircle,
  HiOutlineDocumentText,
  HiOutlineLightBulb,
  HiOutlineMicrophone,
  HiOutlineMinusCircle,
  HiOutlineXCircle,
} from 'react-icons/hi2'

// ========================================
// 教练反馈卡片
// 双栏分析：语音分析 (Voice) + 内容分析 (Content)
// ========================================

const verdictConfig = {
  favorable:   { label: '表达有效', color: 'text-[#147a58] bg-[#eaf8f2] border-emerald-200/70', icon: HiOutlineCheckCircle },
  neutral:     { label: '表达一般', color: 'text-[#8a5818] bg-[#fff6e6] border-amber-200/70', icon: HiOutlineMinusCircle },
  unfavorable: { label: '需要调整', color: 'text-[#b53a34] bg-[#fff0ef] border-red-200/70', icon: HiOutlineXCircle },
}

const emotionLabel: Record<string, string> = {
  calm: '冷静', nervous: '紧张', confident: '自信',
  hesitant: '犹豫', tense: '紧绷', natural: '自然',
}

export default function CoachFeedback({ feedback }: { feedback: AnswerFeedback }) {
  const v = verdictConfig[feedback.verdict]
  const VerdictIcon = v.icon
  const { voice, content } = feedback
  const { metrics, emotion: voiceEmotion } = voice

  return (
    <div className="mt-3 overflow-hidden rounded-[20px] border border-black/[0.07] bg-white shadow-sm">
      {/* ---- 判决栏 ---- */}
      <div className="flex flex-col gap-2 border-b border-black/[0.06] bg-[#fbfbfd] px-5 py-4 sm:flex-row sm:items-center sm:gap-3">
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${v.color}`}>
          <VerdictIcon className="h-3.5 w-3.5" /> {v.label}
        </span>
        <p className="text-[13px] font-medium leading-6 text-[#424245]">
          {content.summary}
        </p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {/* ====== A. 语音分析 ====== */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HiOutlineMicrophone className="h-[17px] w-[17px] text-[#0071e3]" />
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6e6e73]">
              表达节奏
            </h4>
            <span className="text-[10px] text-[#a1a1a6]">基于本次转写与时长估算</span>
          </div>

          {/* 语音指标行 */}
          <div className="flex flex-wrap gap-2 mb-3">
            <DimensionBadge label="语速" score={metrics.wordsPerMinute} mode="numeric" suffix=" WPM" variant="slate" />
            <DimensionBadge label="最长停顿" score={metrics.longestPause} mode="numeric" suffix="s" variant={metrics.longestPause > 2 ? 'red' : metrics.longestPause > 1 ? 'amber' : 'emerald'} />
            <DimensionBadge label="填充词" score={metrics.fillerCount} mode="numeric" suffix="个" variant={metrics.fillerCount > 2 ? 'red' : metrics.fillerCount > 0 ? 'amber' : 'emerald'} />
            <DimensionBadge label="音量稳定" score={metrics.volumeStability} variant="slate" />
            <DimensionBadge label="语速稳定" score={metrics.paceStability} variant="slate" />
          </div>

          {/* 填充词明细 */}
          {metrics.fillers.length > 0 && (
            <div className="mb-3 text-[12px] text-slate-500">
              <span className="font-medium text-slate-600">填充词明细：</span>
              {metrics.fillers.map((f, i) => (
                <code key={i} className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-red-500 font-mono text-[11px]">
                  "{f}"
                </code>
              ))}
            </div>
          )}

          {/* 情绪检测 */}
          <div className="flex items-start gap-3 rounded-2xl border border-black/[0.06] bg-[#f5f5f7] p-3.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
              voiceEmotion.primary === 'confident' || voiceEmotion.primary === 'natural' || voiceEmotion.primary === 'calm'
                ? 'bg-emerald-100 text-emerald-700'
                : voiceEmotion.primary === 'hesitant' || voiceEmotion.primary === 'tense'
                ? 'bg-red-100 text-red-600'
                : 'bg-amber-100 text-amber-700'
            }`}>
              情绪：{emotionLabel[voiceEmotion.primary] ?? voiceEmotion.primary}
            </span>
            <p className="text-[12px] text-slate-600 leading-relaxed flex-1">
              {voiceEmotion.description}
            </p>
          </div>
        </section>

        {/* 分割线 */}
        <div className="w-full h-[1px] bg-slate-100" />

        {/* ====== B. 内容分析 ====== */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HiOutlineDocumentText className="h-[17px] w-[17px] text-[#6554c0]" />
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6e6e73]">
              内容分析
            </h4>
            <span className="text-[10px] text-[#a1a1a6]">基于回答内容评估</span>
          </div>

          {/* 内容维度评分 */}
          <div className="flex flex-wrap gap-2 mb-3">
            {content.dimensions.map(d => (
              <DimensionBadge key={d.label} label={d.label} score={d.score} />
            ))}
          </div>

          {/* 维度详细点评 */}
          <div className="space-y-2 mb-3">
            {content.dimensions.map(d => (
              <div key={d.label} className="flex gap-3 text-[12px]">
                <span className="font-semibold text-slate-700 min-w-[3rem]">{d.label}</span>
                <span className="text-slate-500 leading-relaxed">{d.comment}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 分割线 */}
        <div className="w-full h-[1px] bg-slate-100" />

        {/* ====== C. 改进建议 ====== */}
        <section>
          <h4 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6e6e73]">
            <HiOutlineLightBulb className="h-[17px] w-[17px] text-[#9a5f12]" /> 改进建议
          </h4>
          <ul className="space-y-1.5">
            {content.suggestions.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-slate-700 leading-relaxed">
                <span className="text-blue-500 font-bold flex-shrink-0 mt-0.5">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
