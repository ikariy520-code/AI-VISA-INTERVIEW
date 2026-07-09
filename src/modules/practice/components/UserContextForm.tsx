import { useState } from 'react'
import { motion } from 'framer-motion'
import type { VisaType, UserContext } from '../types'

// ========================================
// Step 2: 用户背景信息
// 简单的表单，帮助 AI 制定面签策略
// ========================================

interface Props {
  visaType: VisaType
  onSubmit: (context: UserContext) => void
  onBack: () => void
}

const visaTypeLabel: Record<VisaType, string> = {
  B2: 'B2 · 旅游签证',
  B1: 'B1 · 商务签证',
  F1: 'F1 · 学生签证',
  H1B: 'H1B · 工作签证',
  L1: 'L1 · 跨国经理',
}

export default function UserContextForm({ visaType, onSubmit, onBack }: Props) {
  const [form, setForm] = useState({
    purpose: '',
    destination: '',
    duration: '',
    previousVisa: false,
    occupation: '',
    notes: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ visaType, ...form })
  }

  const update = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto">
      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[11px] font-semibold text-emerald-600 uppercase tracking-wider mb-4">
          Step 2
        </div>
        <h1 className="text-[26px] font-semibold text-slate-900 mb-1 tracking-tight">
          完善背景信息
        </h1>
        <p className="text-[13px] text-slate-500 font-normal">
          帮助 AI 面签官更好地了解你的情况 · <span className="font-medium text-slate-700">{visaTypeLabel[visaType]}</span>
        </p>
      </motion.div>

      {/* 表单 */}
      <motion.form
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        onSubmit={handleSubmit}
        className="w-full space-y-4"
      >
        {/* 出行目的 */}
        <div>
          <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
            出行目的 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            placeholder={
              visaType === 'B2' ? '例如：洛杉矶旅游、探亲' :
              visaType === 'B1' ? '例如：参加CES展会、客户拜访' :
              visaType === 'F1' ? '例如：攻读计算机硕士' :
              '简要描述你的出行目的'
            }
            value={form.purpose}
            onChange={e => update('purpose', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-900
              placeholder:text-slate-400 outline-none transition-all duration-200
              focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* 目的地 + 时长 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
              目的地城市
            </label>
            <input
              type="text"
              placeholder="例如：New York"
              value={form.destination}
              onChange={e => update('destination', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-900
                placeholder:text-slate-400 outline-none transition-all duration-200
                focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
              计划停留
            </label>
            <input
              type="text"
              placeholder="例如：2周"
              value={form.duration}
              onChange={e => update('duration', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-900
                placeholder:text-slate-400 outline-none transition-all duration-200
                focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* 职业 */}
        <div>
          <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
            当前职业 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="例如：软件工程师 / 学生 / 企业主"
            value={form.occupation}
            onChange={e => update('occupation', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-900
              placeholder:text-slate-400 outline-none transition-all duration-200
              focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* 是否有过美签 */}
        <label className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer
          hover:border-blue-200 transition-colors">
          <input
            type="checkbox"
            checked={form.previousVisa}
            onChange={e => update('previousVisa', e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-200"
          />
          <span className="text-[13px] text-slate-700 font-normal">曾经持有美国签证</span>
        </label>

        {/* 补充说明 */}
        <div>
          <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
            补充说明 <span className="text-slate-400 font-normal">（选填）</span>
          </label>
          <textarea
            rows={2}
            placeholder="任何你想让 AI 面签官提前了解的信息..."
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-900
              placeholder:text-slate-400 outline-none resize-none transition-all duration-200
              focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* 按钮 */}
        <div className="flex gap-3 pt-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={onBack}
            className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-600
              hover:border-slate-300 hover:text-slate-800 transition-all duration-200"
          >
            ← 返回
          </motion.button>
          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            className="flex-1 px-5 py-2.5 rounded-xl bg-blue-500 text-[14px] font-semibold text-white
              hover:bg-blue-600 transition-all duration-200 shadow-sm shadow-blue-500/20"
          >
            开始 AI 分析
          </motion.button>
        </div>
      </motion.form>
    </div>
  )
}
