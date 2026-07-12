import { useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import type { VisaType, UserContext, DocumentParseResult, DS160Data, I20Data } from '../types'
import FileUploadSection from './FileUploadSection'

// ========================================
// Step 2: 用户背景信息
//
// F1 签证类型额外提供 DS-160 / I-20 上传功能
// 上传后自动解析并填入对应表单字段
// ========================================

interface Props {
  visaType: VisaType
  onSubmit: (context: UserContext) => void
  onBack: () => void
}

const visaTypeLabel: Record<VisaType, string> = {
  B2: 'B2 · 旅游签证',
  B1: 'B1 · 商务签证',
  F1: 'F1 · 学术签证',
  H1B: 'H1B · 工作签证',
  L1: 'L1 · 跨国经理',
}

export default function UserContextForm({ visaType, onSubmit, onBack }: Props) {
  const isF1 = visaType === 'F1'

  const [form, setForm] = useState({
    purpose: '',
    destination: '',
    duration: '',
    previousVisa: false,
    occupation: '',
    notes: '',
    major: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const context: UserContext = { visaType, ...form }
    if (!isF1) delete context.major
    onSubmit(context)
  }

  // 文档解析结果累积（用 ref 避免多余渲染）
  const docDataRef = useRef<{ ds160: DS160Data | null; i20: I20Data | null }>({
    ds160: null,
    i20: null,
  })

  // 处理文件解析完成 → 自动填入表单字段（仅填空字段，不覆盖已有内容）
  const handleParseComplete = useCallback((result: DocumentParseResult) => {
    if (result.type === 'ds160' && result.ds160) {
      docDataRef.current.ds160 = result.ds160
      const d = result.ds160
      setForm(prev => ({
        ...prev,
        destination: prev.destination || d.destination || '',
      }))
    }
    if (result.type === 'i20' && result.i20) {
      docDataRef.current.i20 = result.i20
      const d = result.i20
      setForm(prev => ({
        ...prev,
        purpose: prev.purpose || d.universityName || '',
        destination: prev.destination || d.universityName || '',
        major: prev.major || d.major || '',
        occupation: prev.occupation || '学生',
      }))
    }
    // 更新补充说明：合并所有解析信息
    const { ds160, i20 } = docDataRef.current
    const parts: string[] = []
    if (ds160) {
      const ds160Info = [
        ds160.fullName && `姓名: ${ds160.fullName}`,
        ds160.passportNumber && `护照号: ${ds160.passportNumber}`,
        ds160.nationality && `国籍: ${ds160.nationality}`,
      ].filter(Boolean).join(' | ')
      if (ds160Info) parts.push(`[DS-160] ${ds160Info}`)
    }
    if (i20) {
      const i20Info = [
        i20.sevisId && `SEVIS: ${i20.sevisId}`,
        i20.universityName && `学校: ${i20.universityName}`,
        i20.major && `专业: ${i20.major}`,
        i20.programStartDate && `开学: ${i20.programStartDate}`,
        i20.programEndDate && `结束: ${i20.programEndDate}`,
      ].filter(Boolean).join(' | ')
      if (i20Info) parts.push(`[I-20] ${i20Info}`)
    }
    const note = parts.join('\n')
    if (note) {
      setForm(prev => ({
        ...prev,
        notes: prev.notes ? `${prev.notes}\n\n${note}` : note,
      }))
    }
  }, [])

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

      {/* ---- F1 签证：文件上传自动填表 ---- */}
      {visaType === 'F1' && (
        <FileUploadSection onParseComplete={handleParseComplete} />
      )}

      {/* 表单 */}
      <motion.form
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        onSubmit={handleSubmit}
        className="w-full space-y-4"
      >
        {/* ---- F1 签证专用字段 ---- */}
        {isF1 ? (
          <>
            {/* 学校 */}
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                学校 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="例如：University of Southern California"
                value={form.purpose}
                onChange={e => update('purpose', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-900
                  placeholder:text-slate-400 outline-none transition-all duration-200
                  focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* 城市 + 专业 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  城市
                </label>
                <input
                  type="text"
                  placeholder="例如：Los Angeles"
                  value={form.destination}
                  onChange={e => update('destination', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-900
                    placeholder:text-slate-400 outline-none transition-all duration-200
                    focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  专业
                </label>
                <input
                  type="text"
                  placeholder="例如：Computer Science"
                  value={form.major}
                  onChange={e => update('major', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-900
                    placeholder:text-slate-400 outline-none transition-all duration-200
                    focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* 当前职业 */}
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                当前职业
              </label>
              <input
                type="text"
                placeholder="例如：学生 / 在职软件工程师"
                value={form.occupation}
                onChange={e => update('occupation', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-slate-900
                  placeholder:text-slate-400 outline-none transition-all duration-200
                  focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </>
        ) : (
          <>
            {/* ---- 非 F1：通用字段 ---- */}

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
          </>
        )}

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
