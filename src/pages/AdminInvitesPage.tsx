import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface InviteRow {
  id: string
  code_hint: string
  batch_name: string
  status: 'active' | 'disabled' | 'exhausted'
  max_devices: number
  activation_count: number
  max_interviews: number
  interviews_used: number
  access_days: number
  access_expires_at: string | null
  code_expires_at: string | null
  created_at: string
}

interface GenerateResult {
  codes: string[]
  batchName: string
  maxDevices: number
  maxInterviews: number
  accessDays: number
  codeValidityDays: number
}

const TOKEN_STORAGE_KEY = 'visa_admin_api_token'

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value.endsWith('Z') ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function downloadCsv(result: GenerateResult) {
  const rows = [
    ['邀请码', '批次', '设备上限', '面签次数', '激活后有效天数', '未激活有效天数'],
    ...result.codes.map((code) => [
      code,
      result.batchName,
      String(result.maxDevices),
      String(result.maxInterviews),
      String(result.accessDays),
      String(result.codeValidityDays),
    ]),
  ]
  const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `邀请码-${result.batchName}-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function AdminInvitesPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '')
  const [batchName, setBatchName] = useState(`销售批次-${new Date().toISOString().slice(0, 10)}`)
  const [count, setCount] = useState(10)
  const [maxDevices, setMaxDevices] = useState(2)
  const [maxInterviews, setMaxInterviews] = useState(10)
  const [accessDays, setAccessDays] = useState(30)
  const [codeValidityDays, setCodeValidityDays] = useState(365)
  const [codes, setCodes] = useState<InviteRow[]>([])
  const [generated, setGenerated] = useState<GenerateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const adminHeaders = useMemo<Record<string, string>>(() => {
    const value = token.trim()
    return (value ? { 'X-Admin-Token': value } : {}) as Record<string, string>
  }, [token])

  const loadCodes = useCallback(async () => {
    setError('')
    const response = await fetch('/api/admin/invites', { headers: adminHeaders, credentials: 'include' })
    const data = await response.json().catch(() => ({})) as { codes?: InviteRow[] }
    if (!response.ok) {
      if (response.status === 401) throw new Error('管理员验证失败，请检查管理密钥。')
      throw new Error('邀请码列表读取失败。')
    }
    setCodes(Array.isArray(data.codes) ? data.codes : [])
  }, [adminHeaders])

  useEffect(() => {
    if (!token) return
    void loadCodes().catch((reason) => setError(reason instanceof Error ? reason.message : '读取失败'))
  }, []) // 仅在进入页面时尝试恢复本次浏览器会话

  const saveTokenAndLoad = async () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token.trim())
    setLoading(true)
    try {
      await loadCodes()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '验证失败')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setGenerated(null)
    try {
      const response = await fetch('/api/admin/invites/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...adminHeaders },
        body: JSON.stringify({ batchName, count, maxDevices, maxInterviews, accessDays, codeValidityDays }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(response.status === 401 ? '管理员验证失败。' : '邀请码生成失败。')
      setGenerated(data as GenerateResult)
      await loadCodes()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '邀请码生成失败。')
    } finally {
      setLoading(false)
    }
  }

  const updateCode = async (id: string, action: 'disable' | 'activate' | 'reset_activations') => {
    if (action === 'reset_activations' && !window.confirm('确认清除这个邀请码绑定的全部浏览器？该操作会让已激活用户失去访问权限。')) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/invites/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...adminHeaders },
        body: JSON.stringify({ action }),
      })
      if (!response.ok) throw new Error('操作失败，请重新验证管理员身份。')
      await loadCodes()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button onClick={() => navigate('/')} className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">← 返回网站</button>
          <div className="text-right">
            <p className="text-[14px] font-semibold">邀请码管理</p>
            <p className="text-[11px] text-slate-400">仅管理员可访问</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-[17px] font-semibold">管理员验证</h1>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">管理密钥只保存在当前标签页，不会写入网站代码或长期保存在浏览器中。</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="输入管理员密钥"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-[13px] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
            <button disabled={loading} onClick={saveTokenAndLoad} className="rounded-xl bg-slate-900 px-5 py-3 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50">验证并读取</button>
          </div>
        </section>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-[17px] font-semibold">批量生成邀请码</h2>
            <p className="mt-1 text-[12px] text-slate-500">原始邀请码只在生成成功时显示一次。数据库只保存加密摘要，无法反查原码。</p>
          </div>
          <form onSubmit={handleGenerate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-[12px] font-medium text-slate-600 sm:col-span-2 lg:col-span-1">批次名称
              <input required maxLength={80} value={batchName} onChange={(event) => setBatchName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[13px] outline-none focus:border-blue-400" />
            </label>
            {[
              ['生成数量', count, setCount, 1, 200],
              ['每码可激活设备', maxDevices, setMaxDevices, 1, 10],
              ['每码面签次数', maxInterviews, setMaxInterviews, 1, 1000],
              ['激活后有效天数', accessDays, setAccessDays, 1, 3650],
              ['邀请码未激活有效天数', codeValidityDays, setCodeValidityDays, 1, 3650],
            ].map(([label, value, setter, min, max]) => (
              <label key={String(label)} className="text-[12px] font-medium text-slate-600">{String(label)}
                <input type="number" min={Number(min)} max={Number(max)} required value={Number(value)} onChange={(event) => (setter as (value: number) => void)(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[13px] outline-none focus:border-blue-400" />
              </label>
            ))}
            <button disabled={loading} className="rounded-xl bg-blue-500 px-5 py-3 text-[13px] font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-600 disabled:opacity-50 sm:col-span-2 lg:col-span-3">{loading ? '处理中…' : '生成邀请码'}</button>
          </form>
        </section>

        {generated && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-amber-900">请立即下载并妥善保存</h2>
                <p className="mt-1 text-[12px] leading-5 text-amber-700">关闭或刷新本页面后，以下完整邀请码无法从服务器恢复。</p>
              </div>
              <button onClick={() => downloadCsv(generated)} className="rounded-xl bg-amber-700 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-amber-800">下载 CSV</button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {generated.codes.map((code) => <code key={code} className="rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-800">{code}</code>)}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold">已生成邀请码</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">仅显示部分字符，共 {codes.length} 条</p>
            </div>
            <button disabled={loading} onClick={() => void saveTokenAndLoad()} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">刷新</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[12px]">
              <thead className="bg-slate-50 text-slate-500"><tr>{['邀请码', '批次', '状态', '设备', '面签次数', '有效期', '操作'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {codes.map((code) => (
                  <tr key={code.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono font-semibold">{code.code_hint}</td>
                    <td className="px-4 py-3 text-slate-600">{code.batch_name}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${code.status === 'active' ? 'bg-emerald-50 text-emerald-700' : code.status === 'disabled' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{code.status === 'active' ? '可用' : code.status === 'disabled' ? '已停用' : '已用完'}</span></td>
                    <td className="px-4 py-3">{code.activation_count}/{code.max_devices}</td>
                    <td className="px-4 py-3">{code.interviews_used}/{code.max_interviews}</td>
                    <td className="px-4 py-3 text-slate-500"><div>激活后：{code.access_days} 天</div><div className="mt-0.5">当前至：{formatDate(code.access_expires_at)}</div></td>
                    <td className="px-4 py-3"><div className="flex gap-2">
                      <button onClick={() => void updateCode(code.id, code.status === 'disabled' ? 'activate' : 'disable')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50">{code.status === 'disabled' ? '启用' : '停用'}</button>
                      <button onClick={() => void updateCode(code.id, 'reset_activations')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50">清设备</button>
                    </div></td>
                  </tr>
                ))}
                {codes.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">验证管理员身份后，这里会显示邀请码。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
