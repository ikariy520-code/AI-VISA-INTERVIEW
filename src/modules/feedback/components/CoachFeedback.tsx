import type { AnswerFeedback } from '../types'
import DimensionBadge from './DimensionBadge'

// ========================================
// 教练反馈卡片
// 双栏分析：语音分析 (Voice) + 内容分析 (Content)
// ========================================

const verdictConfig = {
  favorable:   { label: '✓ 有利于通过', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  neutral:     { label: '△ 中性',       color: 'text-amber-600 bg-amber-50 border-amber-200' },
  unfavorable: { label: '✗ 不利于通过', color: 'text-red-600 bg-red-50 border-red-200' },
}

const emotionLabel: Record<string, string> = {
  calm: '冷静', nervous: '紧张', confident: '自信',
  hesitant: '犹豫', tense: '紧绷', natural: '自然',
}

export default function CoachFeedback({ feedback }: { feedback: AnswerFeedback }) {
  const v = verdictConfig[feedback.verdict]
  const { voice, content } = feedback
  const { metrics, emotion: voiceEmotion } = voice

  return (
    <div className="mt-3 rounded-2xl bg-white border border-slate-200 overflow-hidden">
      {/* ---- 判决栏 ---- */}
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold border ${v.color}`}>
          {v.label}
        </span>
        <p className="text-[13px] text-slate-600 font-medium">
          {content.summary}
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* ====== A. 语音分析 ====== */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <h4 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider">
              语音分析
            </h4>
            <span className="text-[11px] text-slate-400">— 从录音中提取</span>
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
          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h4 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider">
              内容分析
            </h4>
            <span className="text-[11px] text-slate-400">— 从转写文字中评估</span>
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
          <h4 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
            改进建议
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
