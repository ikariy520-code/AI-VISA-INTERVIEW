import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  HiOutlineArrowTrendingUp,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineChevronDown,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineFlag,
  HiOutlineLightBulb,
  HiOutlineQuestionMarkCircle,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
} from 'react-icons/hi2'
import type { FeedbackReport, QuestionReview, ReportDimension } from '../reportViewModel'

const scoreTone = (score: number) => {
  if (score >= 80) return { text: 'text-[#147a58]', bar: 'bg-[#158f65]', panel: 'bg-[#eaf8f2]' }
  if (score >= 65) return { text: 'text-[#8a5818]', bar: 'bg-[#d58a20]', panel: 'bg-[#fff6e6]' }
  return { text: 'text-[#b53a34]', bar: 'bg-[#d84a43]', panel: 'bg-[#fff0ef]' }
}

function DimensionCard({ dimension }: { dimension: ReportDimension }) {
  const tone = scoreTone(dimension.score)

  return (
    <article className="rounded-[22px] border border-black/[0.07] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold text-[#1d1d1f]">{dimension.label}</p>
          <p className={`mt-1 text-[11px] font-semibold ${tone.text}`}>{dimension.status}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums ${tone.panel} ${tone.text}`}>
          {dimension.score}
        </span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#ececf0]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${dimension.score}%` }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0, 1] }}
          className={`h-full rounded-full ${tone.bar}`}
        />
      </div>
      <p className="mt-4 text-[13px] font-medium leading-6 text-[#424245]">{dimension.summary}</p>
      <p className="mt-2 text-[12px] leading-5 text-[#86868b]">{dimension.evidence}</p>
    </article>
  )
}

function QuestionReviewCard({ review, index }: { review: QuestionReview; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const tone = scoreTone(review.score)

  return (
    <article className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-sm print:break-inside-avoid">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-start gap-4 p-5 text-left sm:p-6"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[13px] bg-[#eaf4ff] text-[12px] font-bold text-[#0071e3]">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-6 text-[#1d1d1f]">{review.question}</span>
          <span className="mt-1.5 block text-[12px] leading-5 text-[#6e6e73]">{review.summary}</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-2">
          <span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${tone.panel} ${tone.text}`}>
            {review.verdict} · {review.score}
          </span>
          <HiOutlineChevronDown className={`h-4 w-4 text-[#86868b] transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <motion.div
        initial={false}
        animate={open ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="overflow-hidden print:!h-auto print:!overflow-visible print:!opacity-100"
        aria-hidden={!open}
      >
            <div className="border-t border-black/[0.06] px-5 py-5 sm:px-6 sm:py-6">
              <div className="rounded-[18px] bg-[#f5f5f7] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">你的回答</p>
                <p className="mt-2 text-[13px] leading-6 text-[#424245]">{review.answer}</p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[18px] border border-emerald-200/60 bg-[#f5fbf8] p-4">
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-[#147a58]"><HiOutlineCheckCircle className="h-4 w-4" />做得好的地方</p>
                  <ul className="mt-3 space-y-2">
                    {review.didWell.map(item => <li key={item} className="text-[12px] leading-5 text-[#426b5d]">• {item}</li>)}
                  </ul>
                </div>
                <div className="rounded-[18px] border border-amber-200/60 bg-[#fffbf2] p-4">
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-[#8a5818]"><HiOutlineLightBulb className="h-4 w-4" />下一次这样改</p>
                  <ul className="mt-3 space-y-2">
                    {review.improve.map(item => <li key={item} className="text-[12px] leading-5 text-[#755f3b]">• {item}</li>)}
                  </ul>
                </div>
              </div>

              <div className="mt-4 rounded-[18px] border border-blue-200/60 bg-[#f4f8ff] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3574b8]">参考表达</p>
                <p className="mt-2 text-[13px] leading-6 text-[#315575]">{review.betterAnswer}</p>
                <p className="mt-2 text-[10px] leading-4 text-[#7892aa]">请替换为你的真实信息，不要背诵或编造样例中的事实。</p>
              </div>
            </div>
      </motion.div>
    </article>
  )
}

export default function FeedbackReportView({ report }: { report: FeedbackReport }) {
  const tone = scoreTone(report.overallScore)

  return (
    <div className="space-y-5">
      {report.source === 'sample' && (
        <div className="print:hidden flex items-start gap-3 rounded-[18px] border border-blue-200/70 bg-[#eef6ff] px-4 py-3 text-[#315f8d]">
          <HiOutlineSparkles className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-[12px] leading-5"><span className="font-semibold">这是反馈页面样例。</span> 其中分数和内容均为演示数据，用来确认信息层级与操作方式，不代表你的真实评估。</p>
        </div>
      )}

      <section className="app-card overflow-hidden print:border-0 print:shadow-none">
        <div className="grid gap-0 lg:grid-cols-[1fr_270px]">
          <div className="px-5 py-7 sm:px-8 sm:py-9">
            <div className="flex flex-wrap items-center gap-2">
              <span className="app-segment">{report.subtitle}</span>
              <span className="rounded-full bg-[#f5f5f7] px-3 py-1.5 text-[11px] font-semibold text-[#6e6e73]">{report.profile}</span>
            </div>
            <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.045em] text-[#1d1d1f] sm:text-[34px]">{report.title}</h1>
            <p className="mt-4 max-w-2xl text-[18px] font-semibold leading-8 tracking-[-0.02em] text-[#1d1d1f]">{report.headline}</p>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#6e6e73]">{report.summary}</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-[#86868b]">
              <span className="inline-flex items-center gap-1.5"><HiOutlineCalendarDays className="h-4 w-4" />{report.date} · {report.time}</span>
              <span className="inline-flex items-center gap-1.5"><HiOutlineClock className="h-4 w-4" />{report.duration}</span>
              <span className="inline-flex items-center gap-1.5"><HiOutlineQuestionMarkCircle className="h-4 w-4" />{report.questionCount} 轮有效问答</span>
            </div>
          </div>

          <div className={`flex flex-col justify-between border-t border-black/[0.06] p-6 lg:border-l lg:border-t-0 ${tone.panel}`}>
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.13em] ${tone.text}`}>本次准备度</p>
              <div className="mt-2 flex items-end gap-2">
                <span className={`text-[58px] font-semibold leading-none tracking-[-0.07em] tabular-nums ${tone.text}`}>{report.overallScore}</span>
                <span className={`mb-1 text-[13px] font-semibold ${tone.text}`}>/ 100</span>
              </div>
            </div>
            <div className="mt-7">
              <p className={`text-[15px] font-semibold ${tone.text}`}>{report.readiness}</p>
              <p className={`mt-1 text-[11px] leading-5 opacity-75 ${tone.text}`}>分数用于安排练习优先级，不代表签证结果。</p>
            </div>
          </div>
        </div>
      </section>

      <nav className="print:hidden sticky top-[76px] z-20 flex gap-1 overflow-x-auto rounded-full border border-black/[0.08] bg-white/90 p-1.5 shadow-sm backdrop-blur-xl">
        {[
          ['#report-overview', '表现总览'],
          ['#report-dimensions', '六项能力'],
          ['#report-questions', '逐题复盘'],
          ['#report-plan', '练习计划'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="min-w-max flex-1 rounded-full px-4 py-2 text-center text-[12px] font-semibold text-[#6e6e73] transition-colors hover:bg-[#f5f5f7] hover:text-[#1d1d1f]">{label}</a>
        ))}
      </nav>

      <section id="report-overview" className="scroll-mt-32 grid gap-5 md:grid-cols-2">
        <div className="app-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[#1d1d1f]"><HiOutlineShieldCheck className="h-5 w-5 text-[#158f65]" />这次做得好的地方</h2>
          <div className="mt-5 space-y-5">
            {report.strengths.map((item, index) => (
              <div key={item.title} className="flex gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#eaf8f2] text-[11px] font-bold text-[#158f65]">{index + 1}</span>
                <div><p className="text-[13px] font-semibold text-[#1d1d1f]">{item.title}</p><p className="mt-1 text-[12px] leading-5 text-[#6e6e73]">{item.detail}</p></div>
              </div>
            ))}
          </div>
        </div>

        <div className="app-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[#1d1d1f]"><HiOutlineExclamationTriangle className="h-5 w-5 text-[#c47a16]" />最该优先改的地方</h2>
          <div className="mt-5 space-y-5">
            {report.priorities.map((item, index) => (
              <div key={item.title} className="flex gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#fff6e6] text-[11px] font-bold text-[#a96813]">{index + 1}</span>
                <div><p className="text-[13px] font-semibold text-[#1d1d1f]">{item.title}</p><p className="mt-1 text-[12px] leading-5 text-[#6e6e73]">{item.detail}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="report-dimensions" className="scroll-mt-32 pt-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0071e3]">{report.evaluationLabel}</p><h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#1d1d1f]">六项核心能力</h2></div>
          <p className="max-w-md text-[11px] leading-5 text-[#86868b]">{report.dimensionIntro}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {report.dimensions.map(dimension => <DimensionCard key={dimension.id} dimension={dimension} />)}
        </div>
      </section>

      <section id="report-questions" className="scroll-mt-32 pt-6">
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0071e3]">Question review</p>
          <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#1d1d1f]">逐题复盘</h2>
          <p className="mt-2 text-[12px] leading-5 text-[#6e6e73]">先看问题在哪，再用自己的真实信息完成重答。点击每题展开。</p>
        </div>
        <div className="space-y-3">
          {report.questionReviews.map((review, index) => <QuestionReviewCard key={review.id} review={review} index={index} />)}
        </div>
      </section>

      <section id="report-plan" className="scroll-mt-32 pt-6">
        <div className="app-card overflow-hidden">
          <div className="border-b border-black/[0.06] bg-[#fbfbfd] px-5 py-5 sm:px-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0071e3]">Next practice</p>
            <h2 className="mt-2 flex items-center gap-2 text-[22px] font-semibold tracking-[-0.04em] text-[#1d1d1f]"><HiOutlineFlag className="h-5 w-5 text-[#0071e3]" />下一轮练习计划</h2>
          </div>
          <div className="grid gap-0 md:grid-cols-3">
            {report.actionPlan.map((step, index) => (
              <div key={step.title} className={`p-5 sm:p-6 ${index > 0 ? 'border-t border-black/[0.06] md:border-l md:border-t-0' : ''}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0071e3]">{step.label}</p>
                <p className="mt-2 text-[14px] font-semibold text-[#1d1d1f]">{step.title}</p>
                <p className="mt-2 text-[12px] leading-5 text-[#6e6e73]">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-[18px] border border-black/[0.07] bg-white px-4 py-4 text-[#6e6e73]">
        <HiOutlineArrowTrendingUp className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#0071e3]" />
        <p className="text-[11px] leading-5">本报告是练习辅助，不构成法律建议，也不预测真实签证结果。系统不会长期保存本次报告；离开前请保存为 PDF。</p>
      </div>
    </div>
  )
}
