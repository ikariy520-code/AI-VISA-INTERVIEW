import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineLockClosed,
  HiOutlinePencilSquare,
  HiOutlineShieldCheck,
} from 'react-icons/hi2'
import type {
  B2CurrentStatus,
  B2Purpose,
  BudgetRange,
  CurrentStatus,
  DegreeLevel,
  FundingSource,
  HomeTie,
  MonthlyIncomeRange,
  PostGraduationPlan,
  PreviousUsStayRange,
  TravelBudget,
  TravelCompanion,
  TravelFunding,
  TravelRegion,
  TripStyle,
  UserContext,
  VisaType,
} from '../types'

interface Props {
  visaType: VisaType
  onSubmit: (context: UserContext) => void
  onBack: () => void
}

type FormState = Omit<UserContext, 'visaType'>

const visaTypeLabel: Record<VisaType, string> = {
  B2: 'B2 · 旅游签证',
  B1: 'B1 · 商务签证',
  F1: 'F1 · 学术签证',
  H1B: 'H1B · 工作签证',
  L1: 'L1 · 跨国经理',
}

const degreeLabels: Record<DegreeLevel, string> = {
  bachelor: '本科',
  master: '硕士',
  phd: '博士',
  language: '语言或预科项目',
  other: '其他项目',
}

const statusLabels: Record<CurrentStatus, string> = {
  student: '在读学生',
  'new-graduate': '应届毕业生',
  employed: '在职',
  unemployed: '待业',
  gap: '间隔期',
}

const fundingLabels: Record<FundingSource, string> = {
  parents: '父母资助',
  self: '本人承担',
  scholarship: '奖学金',
  relatives: '亲属资助',
  combined: '组合资助',
  other: '其他',
}

const budgetLabels: Record<BudgetRange, string> = {
  'under-30k': '每年 3 万美元以内',
  '30k-50k': '每年 3–5 万美元',
  '50k-80k': '每年 5–8 万美元',
  '80k-plus': '每年 8 万美元以上',
  'not-sure': '暂不确定',
}

const planLabels: Record<PostGraduationPlan, string> = {
  'return-work': '回国就业',
  'further-study': '继续深造',
  'family-business': '回国参与家庭事业',
  undecided: '暂未确定',
  other: '其他计划',
}

const tieLabels: Record<HomeTie, string> = {
  career: '工作或事业',
  study: '在读学业',
  'spouse-children': '配偶或子女',
  'family-responsibility': '父母或家庭责任',
  property: '房产或长期住所',
  business: '企业或长期经营安排',
  other: '其他长期安排',
}

const b2PurposeLabels: Record<B2Purpose, string> = {
  tourism: '旅游',
  'family-visit': '探亲',
  'friend-visit': '访友',
  'other-short-visit': '其他短期访问',
}

const b2StatusLabels: Record<B2CurrentStatus, string> = {
  employed: '在职',
  'self-employed': '自雇或经营企业',
  student: '在读学生',
  retired: '已退休',
  unemployed: '待业',
  other: '其他',
}

const travelFundingLabels: Record<TravelFunding, string> = {
  self: '本人承担',
  'spouse-parents': '配偶或父母承担',
  'us-contact': '美国亲友承担',
  shared: '共同承担',
  other: '其他',
}

const tripStyleLabels: Record<TripStyle, string> = {
  independent: '自由行',
  'group-tour': '跟团旅行',
  'with-family-friends': '与亲友共同安排行程',
}

const companionLabels: Record<TravelCompanion, string> = {
  alone: '独自出行',
  spouse: '与配偶同行',
  parents: '与父母同行',
  children: '与子女同行',
  friends: '与朋友同行',
  colleagues: '与同事同行',
  relatives: '与其他亲属同行',
}

const travelBudgetLabels: Record<TravelBudget, string> = {
  'under-3k': '总预算 3,000 美元以内',
  '3k-6k': '总预算 3,000–6,000 美元',
  '6k-10k': '总预算 6,000–10,000 美元',
  '10k-plus': '总预算 10,000 美元以上',
  'not-sure': '暂不确定',
}

const travelRegionLabels: Record<TravelRegion, string> = {
  asia: '亚洲其他国家或地区',
  europe: '欧洲',
  oceania: '澳大利亚或新西兰',
  'north-america': '加拿大或墨西哥',
  other: '其他国家或地区',
}

const monthlyIncomeLabels: Record<MonthlyIncomeRange, string> = {
  'under-5k-cny': '每月人民币 5,000 元以内',
  '5k-10k-cny': '每月人民币 5,000–10,000 元',
  '10k-20k-cny': '每月人民币 10,000–20,000 元',
  '20k-50k-cny': '每月人民币 20,000–50,000 元',
  '50k-plus-cny': '每月人民币 50,000 元以上',
  'not-disclosed': '不愿提供',
}

const previousUsStayLabels: Record<PreviousUsStayRange, string> = {
  'under-2-weeks': '两周以内',
  '2-weeks-1-month': '两周至一个月',
  '1-3-months': '一至三个月',
  '3-months-plus': '三个月以上',
}

const contactRelationLabels: Record<string, string> = {
  parent: '父母',
  child: '子女',
  sibling: '兄弟姐妹',
  spouse: '配偶',
  extended: '其他亲属',
  friend: '朋友',
  other: '其他关系',
}

const relationLabels: Record<string, string> = {
  parent: '父母',
  sibling: '兄弟姐妹',
  spouse: '配偶',
  extended: '其他亲属',
  other: '其他关系',
}

const refusalLabels: Record<string, string> = {
  '214b': '214(b) 或未证明足够约束力',
  documents: '材料或信息问题',
  administrative: '行政审查',
  unknown: '不清楚原因',
  other: '其他原因',
}

const fieldClass = 'app-field'

function detectSensitiveInformation(text: string): string | null {
  if (/\bN00\d{9,10}\b/i.test(text)) return 'SEVIS ID'
  if (/\b[EG]\d{8}\b/i.test(text)) return '护照号码'
  if (/\b1[3-9]\d{9}\b/.test(text)) return '手机号码'
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return '电子邮箱'
  if (/\b\d{8,}\b/.test(text)) return '较长的证件或账户号码'
  return null
}

function formatEnrollmentDate(value?: string) {
  if (!value) return ''
  const [year, month] = value.split('-')
  return `${year} 年 ${Number(month)} 月`
}

export default function UserContextForm({ visaType, onSubmit, onBack }: Props) {
  const isF1 = visaType === 'F1'
  const [reviewing, setReviewing] = useState(false)
  const [form, setForm] = useState<FormState>({
    purpose: '',
    destination: '',
    duration: '',
    previousVisa: false,
    occupation: '',
    notes: '',
    major: '',
    degreeLevel: undefined,
    enrollmentDate: '',
    currentStatus: undefined,
    schoolReason: '',
    majorReason: '',
    fundingSource: '',
    budgetRange: '',
    hasUsRelatives: false,
    usRelativeType: '',
    previousVisaDenied: false,
    refusalReason: '',
    hasStudyGap: false,
    gapExplanation: '',
    postGraduationPlan: '',
    homeTies: [],
    b2Purpose: undefined,
    travelMonth: '',
    b2CurrentStatus: undefined,
    travelFunding: undefined,
    tripStyle: undefined,
    travelCompanion: undefined,
    usContactRelation: '',
    contactProvidesStay: false,
    contactPaysExpenses: false,
    hasMetContact: false,
    workTenureRange: '',
    travelBudget: '',
    travelHistoryRegions: [],
    hadOverstay: false,
    returnReason: '',
    previousVisaAnswer: undefined,
    tripPlanSummary: '',
    leaveArrangement: '',
    monthlyIncomeRange: '',
    previousUsStayRange: '',
  })

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const userEnteredText = [
    form.purpose,
    form.destination,
    form.duration,
    form.occupation,
    form.major,
    form.schoolReason,
    form.majorReason,
    form.gapExplanation,
    form.usContactRelation,
    form.returnReason,
    form.tripPlanSummary,
    form.leaveArrangement,
    form.notes,
  ].filter(Boolean).join(' ')
  const privacyWarning = useMemo(() => detectSensitiveInformation(userEnteredText), [userEnteredText])
  const missingHomeTie = !isF1 && (form.homeTies?.length ?? 0) === 0

  const handlePrepareReview = (event: React.FormEvent) => {
    event.preventDefault()
    if (privacyWarning || missingHomeTie) return
    setReviewing(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleConfirm = () => {
    const context: UserContext = {
      visaType,
      ...form,
      occupation: isF1 && form.currentStatus
        ? statusLabels[form.currentStatus]
        : form.b2CurrentStatus
          ? b2StatusLabels[form.b2CurrentStatus]
          : form.occupation,
      purpose: isF1
        ? form.purpose
        : form.b2Purpose
          ? b2PurposeLabels[form.b2Purpose]
          : form.purpose,
      previousVisa: isF1 ? form.previousVisa : form.previousVisaAnswer === 'yes',
    }
    if (!isF1) {
      delete context.major
      delete context.degreeLevel
      delete context.enrollmentDate
      delete context.currentStatus
      delete context.schoolReason
      delete context.majorReason
      delete context.fundingSource
      delete context.budgetRange
      delete context.hasUsRelatives
      delete context.usRelativeType
      delete context.hasStudyGap
      delete context.gapExplanation
      delete context.postGraduationPlan
    } else {
      delete context.b2Purpose
      delete context.travelMonth
      delete context.b2CurrentStatus
      delete context.travelFunding
      delete context.tripStyle
      delete context.travelCompanion
      delete context.usContactRelation
      delete context.contactProvidesStay
      delete context.contactPaysExpenses
      delete context.hasMetContact
      delete context.workTenureRange
      delete context.travelBudget
      delete context.travelHistoryRegions
      delete context.hadOverstay
      delete context.returnReason
      delete context.previousVisaAnswer
      delete context.tripPlanSummary
      delete context.leaveArrangement
      delete context.monthlyIncomeRange
      delete context.previousUsStayRange
    }
    onSubmit(context)
  }

  const toggleHomeTie = (tie: HomeTie) => {
    const current = form.homeTies ?? []
    update('homeTies', current.includes(tie)
      ? current.filter(item => item !== tie)
      : [...current, tie])
  }

  const toggleTravelRegion = (region: TravelRegion) => {
    const current = form.travelHistoryRegions ?? []
    update('travelHistoryRegions', current.includes(region)
      ? current.filter(item => item !== region)
      : [...current, region])
  }

  const reviewItems = useMemo(() => {
    const items: Array<[string, string]> = [['签证类型', visaTypeLabel[visaType]]]
    if (isF1) {
      items.push(
        ['学校名称或简称', form.purpose],
        ['学位阶段', form.degreeLevel ? degreeLabels[form.degreeLevel] : ''],
        ['专业方向', form.major ?? ''],
        ['预计入学', formatEnrollmentDate(form.enrollmentDate)],
        ['项目时长', form.duration],
        ['当前状态', form.currentStatus ? statusLabels[form.currentStatus] : ''],
      )
      if (form.schoolReason) items.push(['选择学校原因', form.schoolReason])
      if (form.majorReason) items.push(['选择专业原因', form.majorReason])
      if (form.fundingSource) items.push(['资金来源', fundingLabels[form.fundingSource]])
      if (form.budgetRange) items.push(['预算区间', budgetLabels[form.budgetRange]])
      items.push(['美国亲属', form.hasUsRelatives ? relationLabels[form.usRelativeType ?? ''] || '有' : '无'])
      items.push(['美国拒签经历', form.previousVisaDenied ? refusalLabels[form.refusalReason ?? ''] || '有' : '无'])
      if (form.hasStudyGap) items.push(['学习或工作空档', form.gapExplanation || '有'])
      if (form.postGraduationPlan) items.push(['毕业后计划', planLabels[form.postGraduationPlan]])
      if (form.homeTies?.length) items.push(['国内约束力', form.homeTies.map(tie => tieLabels[tie]).join('、')])
      if (form.notes) items.push(['重点担心的问题', form.notes])
    } else {
      items.push(
        ['访美目的', form.b2Purpose ? b2PurposeLabels[form.b2Purpose] : ''],
        ['预计出发', formatEnrollmentDate(form.travelMonth)],
        ['计划停留', form.duration],
        ['主要目的地', form.destination],
        ['行程概况', form.tripPlanSummary ?? ''],
        ['当前状态', form.b2CurrentStatus ? b2StatusLabels[form.b2CurrentStatus] : ''],
        ['费用承担', form.travelFunding ? travelFundingLabels[form.travelFunding] : ''],
        ['国内约束力', form.homeTies?.map(tie => tieLabels[tie]).join('、') ?? ''],
      )
      if (form.previousVisaAnswer) items.push(['曾持有美国签证', form.previousVisaAnswer === 'yes' ? '是' : '否'])
      if (form.b2Purpose === 'tourism') {
        if (form.tripStyle) items.push(['旅行方式', tripStyleLabels[form.tripStyle]])
        if (form.travelCompanion) items.push(['同行情况', companionLabels[form.travelCompanion]])
      }
      if (form.b2Purpose === 'family-visit' || form.b2Purpose === 'friend-visit') {
        items.push(
          ['美国联系人关系', contactRelationLabels[form.usContactRelation ?? ''] || '未填写'],
          ['联系人提供住宿', form.contactProvidesStay ? '是' : '否'],
          ['联系人承担费用', form.contactPaysExpenses ? '是' : '否'],
          ['是否曾经见面', form.hasMetContact ? '是' : '否'],
        )
      }
      if (form.workTenureRange) items.push(['当前状态持续时间', form.workTenureRange])
      if (form.leaveArrangement) items.push(['工作或学习安排', form.leaveArrangement])
      if (form.monthlyIncomeRange) items.push(['月收入范围', monthlyIncomeLabels[form.monthlyIncomeRange]])
      if (form.travelBudget) items.push(['旅行总预算', travelBudgetLabels[form.travelBudget]])
      if (form.travelHistoryRegions?.length) items.push(['近五年出境地区', form.travelHistoryRegions.map(region => travelRegionLabels[region]).join('、')])
      if (form.previousVisaDenied) items.push(['美国拒签经历', refusalLabels[form.refusalReason ?? ''] || '有'])
      if (form.previousVisaAnswer === 'yes' && form.previousUsStayRange) items.push(['以往赴美最长停留', previousUsStayLabels[form.previousUsStayRange]])
      if (form.hadOverstay) items.push(['曾有较长停留或逾期', '是'])
      if (form.returnReason) items.push(['按时回国原因', form.returnReason])
      if (form.notes) items.push(['重点担心的问题', form.notes])
    }
    return items.filter(([, value]) => value)
  }, [form, isF1, visaType])

  if (reviewing) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full">
          <div className="text-center">
            <div className="app-eyebrow mb-5"><HiOutlineShieldCheck className="h-4 w-4" /> Privacy Check</div>
            <h1 className="text-[32px] font-semibold tracking-[-0.045em] text-[#1d1d1f]">确认本次模拟使用的信息</h1>
            <p className="mx-auto mt-3 max-w-lg text-[13px] leading-6 text-[#6e6e73]">请确认以下内容不包含姓名、证件号码、联系方式或详细地址。</p>
          </div>

          <div className="app-card mt-8 overflow-hidden">
            <div className="flex items-start gap-3 border-b border-black/[0.06] bg-[#eaf8f2] px-5 py-4 sm:px-6">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[13px] bg-white text-[#158f65] shadow-sm"><HiOutlineLockClosed className="h-[17px] w-[17px]" /></span>
              <div><p className="text-[13px] font-semibold text-[#146c50]">只发送本次面签需要的背景摘要</p>
              <p className="mt-1 text-[11px] leading-5 text-[#347861]">{isF1
                ? '不包含 DS-160、I-20、护照号或 SEVIS ID，网站不会长期保存这份背景资料。'
                : '不包含护照、银行流水、联系人身份信息、详细地址或行程订单，网站不会长期保存这份背景资料。'} 开始模拟后，你的语音仅用于实时识别和生成面签官语音；脱敏背景与面签转写仅用于本次模拟和反馈。</p></div>
            </div>
            <dl className="divide-y divide-black/[0.06] px-5 sm:px-6">
              {reviewItems.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[8rem_1fr] gap-4 py-3.5 text-[13px]">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="break-words font-medium leading-5 text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
            <button type="button" onClick={() => setReviewing(false)} className="app-button-secondary">
              <HiOutlinePencilSquare className="h-4 w-4" /> 修改信息
            </button>
            <button type="button" onClick={handleConfirm} className="app-button-primary flex-1">
              确认并开始准备 <HiOutlineArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <div className="app-eyebrow mb-5">Background setup</div>
        <h1 className="text-[32px] font-semibold tracking-[-0.045em] text-[#1d1d1f]">建立面签背景</h1>
        <p className="mt-3 text-[13px] font-normal text-[#6e6e73]">只填写会影响面签问题的信息 · <span className="font-semibold text-[#424245]">{visaTypeLabel[visaType]}</span></p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 w-full rounded-[20px] border border-emerald-200/70 bg-[#eaf8f2] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] bg-white text-[#158f65] shadow-sm"><HiOutlineCheckCircle className="h-5 w-5" /></div>
          <div>
            <p className="text-[13px] font-semibold text-emerald-900">{isF1 ? '无需上传 DS-160 或 I-20' : '无需上传护照、流水或行程订单'}</p>
            <p className="mt-1 text-[12px] leading-5 text-emerald-700">{isF1
              ? '我们不需要姓名、护照号、SEVIS ID、联系方式或详细地址。提交前你可以查看本次模拟将使用的全部信息。'
              : '我们不需要真实姓名、联系人姓名、护照号、酒店地址、航班号或银行信息。提交前你可以查看本次模拟将使用的全部信息。'}</p>
          </div>
        </div>
      </motion.div>

      <motion.form initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} onSubmit={handlePrepareReview} className="app-card w-full space-y-5 p-5 sm:p-7">
        {isF1 ? (
          <>
            <div>
              <label htmlFor="school-name" className="mb-1.5 block text-[13px] font-medium text-slate-700">学校名称或简称 <span className="text-red-400">*</span></label>
              <input id="school-name" required maxLength={100} value={form.purpose} onChange={event => update('purpose', event.target.value)} placeholder="例如：USC，也可以只填写学校简称" className={fieldClass} />
              <p className="mt-1.5 text-[11px] text-slate-400">不希望透露完整学校名称时，可以使用简称或学校类型。</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="degree-level" className="mb-1.5 block text-[13px] font-medium text-slate-700">学位阶段 <span className="text-red-400">*</span></label>
                <select id="degree-level" required value={form.degreeLevel ?? ''} onChange={event => update('degreeLevel', event.target.value as DegreeLevel)} className={fieldClass}>
                  <option value="">请选择</option>
                  {Object.entries(degreeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="major" className="mb-1.5 block text-[13px] font-medium text-slate-700">专业方向 <span className="text-red-400">*</span></label>
                <input id="major" required maxLength={100} value={form.major ?? ''} onChange={event => update('major', event.target.value)} placeholder="例如：Computer Science" className={fieldClass} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="enrollment-date" className="mb-1.5 block text-[13px] font-medium text-slate-700">预计入学时间 <span className="text-red-400">*</span></label>
                <input id="enrollment-date" type="month" required value={form.enrollmentDate ?? ''} onChange={event => update('enrollmentDate', event.target.value)} className={fieldClass} />
              </div>
              <div>
                <label htmlFor="program-duration" className="mb-1.5 block text-[13px] font-medium text-slate-700">项目预计时长 <span className="text-red-400">*</span></label>
                <select id="program-duration" required value={form.duration} onChange={event => update('duration', event.target.value)} className={fieldClass}>
                  <option value="">请选择</option>
                  {['1 年以内', '1 年', '2 年', '3 年', '4 年', '5 年及以上'].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="current-status" className="mb-1.5 block text-[13px] font-medium text-slate-700">当前状态 <span className="text-red-400">*</span></label>
              <select id="current-status" required value={form.currentStatus ?? ''} onChange={event => update('currentStatus', event.target.value as CurrentStatus)} className={fieldClass}>
                <option value="">请选择</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <details className="group rounded-2xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-[13px] font-semibold text-slate-700">
                <span>完善个性化信息 <span className="font-normal text-slate-400">（选填，让追问更有针对性）</span></span>
                <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
              </summary>
              <div className="space-y-4 border-t border-slate-100 px-4 py-4">
                <div>
                  <label htmlFor="school-reason" className="mb-1.5 block text-[12px] font-medium text-slate-600">为什么选择这所学校</label>
                  <textarea id="school-reason" rows={2} maxLength={160} value={form.schoolReason ?? ''} onChange={event => update('schoolReason', event.target.value)} placeholder="例如：课程方向、师资、项目资源或职业规划匹配" className={`${fieldClass} resize-none`} />
                </div>
                <div>
                  <label htmlFor="major-reason" className="mb-1.5 block text-[12px] font-medium text-slate-600">为什么选择这个专业</label>
                  <textarea id="major-reason" rows={2} maxLength={160} value={form.majorReason ?? ''} onChange={event => update('majorReason', event.target.value)} placeholder="说明它与你的学习或职业背景有什么联系" className={`${fieldClass} resize-none`} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="funding-source" className="mb-1.5 block text-[12px] font-medium text-slate-600">主要资金来源</label>
                    <select id="funding-source" value={form.fundingSource ?? ''} onChange={event => update('fundingSource', event.target.value as FundingSource | '')} className={fieldClass}>
                      <option value="">暂不填写</option>
                      {Object.entries(fundingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="budget-range" className="mb-1.5 block text-[12px] font-medium text-slate-600">每年预算区间</label>
                    <select id="budget-range" value={form.budgetRange ?? ''} onChange={event => update('budgetRange', event.target.value as BudgetRange | '')} className={fieldClass}>
                      <option value="">暂不填写</option>
                      {Object.entries(budgetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-[12px] text-slate-700">
                    <input type="checkbox" checked={form.hasUsRelatives ?? false} onChange={event => update('hasUsRelatives', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                    在美国有亲属
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-[12px] text-slate-700">
                    <input type="checkbox" checked={form.previousVisaDenied ?? false} onChange={event => update('previousVisaDenied', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                    曾被美国拒签
                  </label>
                </div>

                {(form.hasUsRelatives || form.previousVisaDenied) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {form.hasUsRelatives && (
                      <div>
                        <label htmlFor="relative-type" className="mb-1.5 block text-[12px] font-medium text-slate-600">关系类型</label>
                        <select id="relative-type" value={form.usRelativeType ?? ''} onChange={event => update('usRelativeType', event.target.value)} className={fieldClass}>
                          <option value="">请选择</option>
                          {Object.entries(relationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                    )}
                    {form.previousVisaDenied && (
                      <div>
                        <label htmlFor="refusal-reason" className="mb-1.5 block text-[12px] font-medium text-slate-600">拒签原因类别</label>
                        <select id="refusal-reason" value={form.refusalReason ?? ''} onChange={event => update('refusalReason', event.target.value)} className={fieldClass}>
                          <option value="">请选择</option>
                          {Object.entries(refusalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-[12px] text-slate-700">
                  <input type="checkbox" checked={form.hasStudyGap ?? false} onChange={event => update('hasStudyGap', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                  存在学习、工作空档期或较大的专业变化
                </label>
                {form.hasStudyGap && (
                  <textarea rows={2} maxLength={160} value={form.gapExplanation ?? ''} onChange={event => update('gapExplanation', event.target.value)} placeholder="只说明时间长度和原因类别，不需要填写公司或个人名称" className={`${fieldClass} resize-none`} />
                )}

                <div>
                  <label htmlFor="graduation-plan" className="mb-1.5 block text-[12px] font-medium text-slate-600">毕业后主要计划</label>
                  <select id="graduation-plan" value={form.postGraduationPlan ?? ''} onChange={event => update('postGraduationPlan', event.target.value as PostGraduationPlan | '')} className={fieldClass}>
                    <option value="">暂不填写</option>
                    {Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>

                <fieldset>
                  <legend className="mb-2 text-[12px] font-medium text-slate-600">国内约束力（可多选）</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.entries(tieLabels) as Array<[HomeTie, string]>).map(([value, label]) => (
                      <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                        <input type="checkbox" checked={form.homeTies?.includes(value) ?? false} onChange={() => toggleHomeTie(value)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="special-concern" className="mb-1.5 block text-[12px] font-medium text-slate-600">最担心被问到的情况</label>
                  <textarea id="special-concern" rows={3} maxLength={240} value={form.notes} onChange={event => update('notes', event.target.value)} placeholder="请勿填写姓名、证件号码、联系方式、详细地址或银行账户信息" className={`${fieldClass} resize-none`} />
                </div>
              </div>
            </details>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="b2-purpose" className="mb-1.5 block text-[13px] font-medium text-slate-700">访美目的 <span className="text-red-400">*</span></label>
              <select id="b2-purpose" required value={form.b2Purpose ?? ''} onChange={event => update('b2Purpose', event.target.value as B2Purpose)} className={fieldClass}>
                <option value="">请选择</option>
                {Object.entries(b2PurposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="travel-month" className="mb-1.5 block text-[13px] font-medium text-slate-700">预计出发月份 <span className="text-red-400">*</span></label>
                <input id="travel-month" type="month" required value={form.travelMonth ?? ''} onChange={event => update('travelMonth', event.target.value)} className={fieldClass} />
              </div>
              <div>
                <label htmlFor="travel-duration" className="mb-1.5 block text-[13px] font-medium text-slate-700">预计停留时长 <span className="text-red-400">*</span></label>
                <select id="travel-duration" required value={form.duration} onChange={event => update('duration', event.target.value)} className={fieldClass}>
                  <option value="">请选择</option>
                  {['7 天以内', '8–14 天', '15–30 天', '1–3 个月', '3 个月以上'].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="b2-destinations" className="mb-1.5 block text-[13px] font-medium text-slate-700">主要目的地 <span className="text-red-400">*</span></label>
              <input id="b2-destinations" required maxLength={80} value={form.destination} onChange={event => update('destination', event.target.value)} placeholder="例如：Los Angeles、San Francisco（最多三个城市或州）" className={fieldClass} />
              <p className="mt-1.5 text-[11px] text-slate-400">请勿填写酒店名称、详细地址、航班号或订单号。</p>
            </div>

            <div>
              <label htmlFor="b2-trip-plan" className="mb-1.5 block text-[13px] font-medium text-slate-700">行程概况 <span className="text-red-400">*</span></label>
              <textarea id="b2-trip-plan" required rows={2} maxLength={180} value={form.tripPlanSummary ?? ''} onChange={event => update('tripPlanSummary', event.target.value)} placeholder="例如：在洛杉矶游览三天，再前往旧金山四天；只写大致安排，不填写订单和详细地址" className={`${fieldClass} resize-none`} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="b2-current-status" className="mb-1.5 block text-[13px] font-medium text-slate-700">当前状态 <span className="text-red-400">*</span></label>
                <select id="b2-current-status" required value={form.b2CurrentStatus ?? ''} onChange={event => update('b2CurrentStatus', event.target.value as B2CurrentStatus)} className={fieldClass}>
                  <option value="">请选择</option>
                  {Object.entries(b2StatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="travel-funding" className="mb-1.5 block text-[13px] font-medium text-slate-700">旅行费用承担方式 <span className="text-red-400">*</span></label>
                <select id="travel-funding" required value={form.travelFunding ?? ''} onChange={event => update('travelFunding', event.target.value as TravelFunding)} className={fieldClass}>
                  <option value="">请选择</option>
                  {Object.entries(travelFundingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>

            {form.b2Purpose === 'tourism' && (
              <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="trip-style" className="mb-1.5 block text-[12px] font-medium text-slate-700">旅行方式 <span className="text-red-400">*</span></label>
                  <select id="trip-style" required value={form.tripStyle ?? ''} onChange={event => update('tripStyle', event.target.value as TripStyle)} className={fieldClass}>
                    <option value="">请选择</option>
                    {Object.entries(tripStyleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="travel-companion" className="mb-1.5 block text-[12px] font-medium text-slate-700">同行情况 <span className="text-red-400">*</span></label>
                  <select id="travel-companion" required value={form.travelCompanion ?? ''} onChange={event => update('travelCompanion', event.target.value as TravelCompanion)} className={fieldClass}>
                    <option value="">请选择</option>
                    {Object.entries(companionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {(form.b2Purpose === 'family-visit' || form.b2Purpose === 'friend-visit') && (
              <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <div>
                  <label htmlFor="us-contact-relation" className="mb-1.5 block text-[12px] font-medium text-slate-700">与美国联系人的关系 <span className="text-red-400">*</span></label>
                  <select id="us-contact-relation" required value={form.usContactRelation ?? ''} onChange={event => update('usContactRelation', event.target.value)} className={fieldClass}>
                    <option value="">请选择关系类型</option>
                    {Object.entries(contactRelationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-3 text-[12px] text-slate-700">
                    <input type="checkbox" checked={form.contactProvidesStay ?? false} onChange={event => update('contactProvidesStay', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                    对方提供住宿
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-3 text-[12px] text-slate-700">
                    <input type="checkbox" checked={form.contactPaysExpenses ?? false} onChange={event => update('contactPaysExpenses', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                    对方承担费用
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-3 text-[12px] text-slate-700">
                    <input type="checkbox" checked={form.hasMetContact ?? false} onChange={event => update('hasMetContact', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                    以前见过面
                  </label>
                </div>
                <p className="text-[11px] leading-5 text-blue-600">只填写关系类型，不需要联系人姓名、电话、证件状态或详细住址。</p>
              </div>
            )}

            <fieldset className={`rounded-2xl border bg-white p-4 ${missingHomeTie ? 'border-amber-200' : 'border-slate-200'}`}>
              <legend className="px-1 text-[13px] font-semibold text-slate-700">国内约束力（至少选择一项） <span className="text-red-400">*</span></legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(Object.entries(tieLabels) as Array<[HomeTie, string]>).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[12px] text-slate-600">
                    <input type="checkbox" checked={form.homeTies?.includes(value) ?? false} onChange={() => toggleHomeTie(value)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                    {label}
                  </label>
                ))}
              </div>
              {missingHomeTie && <p className="mt-2 text-[11px] text-amber-700">请选择至少一项，用于生成回国约束力相关问题。</p>}
            </fieldset>

            <details className="group rounded-2xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-[13px] font-semibold text-slate-700">
                <span>完善个性化信息 <span className="font-normal text-slate-400">（选填，让追问和评分更准确）</span></span>
                <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
              </summary>
              <div className="space-y-4 border-t border-slate-100 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="work-tenure" className="mb-1.5 block text-[12px] font-medium text-slate-600">当前状态持续时间</label>
                    <select id="work-tenure" value={form.workTenureRange ?? ''} onChange={event => update('workTenureRange', event.target.value)} className={fieldClass}>
                      <option value="">暂不填写</option>
                      {['1 年以内', '1–3 年', '3–5 年', '5–10 年', '10 年以上'].map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="travel-budget" className="mb-1.5 block text-[12px] font-medium text-slate-600">本次旅行总预算</label>
                    <select id="travel-budget" value={form.travelBudget ?? ''} onChange={event => update('travelBudget', event.target.value as TravelBudget | '')} className={fieldClass}>
                      <option value="">暂不填写</option>
                      {Object.entries(travelBudgetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="monthly-income" className="mb-1.5 block text-[12px] font-medium text-slate-600">本人月收入范围</label>
                    <select id="monthly-income" value={form.monthlyIncomeRange ?? ''} onChange={event => update('monthlyIncomeRange', event.target.value as MonthlyIncomeRange | '')} className={fieldClass}>
                      <option value="">暂不填写</option>
                      {Object.entries(monthlyIncomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="leave-arrangement" className="mb-1.5 block text-[12px] font-medium text-slate-600">旅行期间的工作或学习安排</label>
                    <input id="leave-arrangement" maxLength={100} value={form.leaveArrangement ?? ''} onChange={event => update('leaveArrangement', event.target.value)} placeholder="例如：已安排十天年假；不填写单位名称" className={fieldClass} />
                  </div>
                </div>

                <fieldset>
                  <legend className="mb-2 text-[12px] font-medium text-slate-600">近五年出境旅行地区（可多选）</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.entries(travelRegionLabels) as Array<[TravelRegion, string]>).map(([value, label]) => (
                      <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                        <input type="checkbox" checked={form.travelHistoryRegions?.includes(value) ?? false} onChange={() => toggleTravelRegion(value)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <label htmlFor="previous-us-visa" className="mb-1.5 block text-[12px] font-medium text-slate-600">曾持美国签证</label>
                    <select id="previous-us-visa" value={form.previousVisaAnswer ?? ''} onChange={event => update('previousVisaAnswer', event.target.value ? event.target.value as 'yes' | 'no' : undefined)} className={fieldClass}>
                      <option value="">暂不填写</option>
                      <option value="yes">是</option>
                      <option value="no">否</option>
                    </select>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-[12px] text-slate-700">
                    <input type="checkbox" checked={form.previousVisaDenied ?? false} onChange={event => update('previousVisaDenied', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                    曾被美国拒签
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-[12px] text-slate-700">
                    <input type="checkbox" checked={form.hadOverstay ?? false} onChange={event => update('hadOverstay', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-500" />
                    曾较长停留或逾期
                  </label>
                </div>

                {form.previousVisaAnswer === 'yes' && (
                  <div>
                    <label htmlFor="previous-us-stay" className="mb-1.5 block text-[12px] font-medium text-slate-600">以往赴美最长停留时间</label>
                    <select id="previous-us-stay" value={form.previousUsStayRange ?? ''} onChange={event => update('previousUsStayRange', event.target.value as PreviousUsStayRange | '')} className={fieldClass}>
                      <option value="">暂不填写</option>
                      {Object.entries(previousUsStayLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                )}

                {form.previousVisaDenied && (
                  <div>
                    <label htmlFor="b2-refusal-reason" className="mb-1.5 block text-[12px] font-medium text-slate-600">拒签原因类别</label>
                    <select id="b2-refusal-reason" value={form.refusalReason ?? ''} onChange={event => update('refusalReason', event.target.value)} className={fieldClass}>
                      <option value="">请选择</option>
                      {Object.entries(refusalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="return-reason" className="mb-1.5 block text-[12px] font-medium text-slate-600">为什么会按时回国</label>
                  <textarea id="return-reason" rows={2} maxLength={160} value={form.returnReason ?? ''} onChange={event => update('returnReason', event.target.value)} placeholder="说明工作、学业或家庭安排即可，不填写公司和个人姓名" className={`${fieldClass} resize-none`} />
                </div>

                <div>
                  <label htmlFor="b2-special-concern" className="mb-1.5 block text-[12px] font-medium text-slate-600">最担心被问到的情况</label>
                  <textarea id="b2-special-concern" rows={3} maxLength={240} value={form.notes} onChange={event => update('notes', event.target.value)} placeholder="请勿填写姓名、证件号码、联系方式、详细地址或银行账户信息" className={`${fieldClass} resize-none`} />
                </div>
              </div>
            </details>
          </>
        )}

        {privacyWarning && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-5 text-red-700">
            检测到可能包含{privacyWarning}。请删除敏感信息后再继续。
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
          <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onBack} className="app-button-secondary"><HiOutlineArrowLeft className="h-4 w-4" /> 返回</motion.button>
          <motion.button type="submit" whileTap={{ scale: privacyWarning || missingHomeTie ? 1 : 0.985 }} disabled={Boolean(privacyWarning || missingHomeTie)} className="app-button-primary flex-1">
            查看并确认信息 <HiOutlineArrowRight className="h-4 w-4" />
          </motion.button>
        </div>
      </motion.form>
    </div>
  )
}
