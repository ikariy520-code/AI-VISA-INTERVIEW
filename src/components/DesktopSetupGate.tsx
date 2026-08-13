import { useEffect, useMemo, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { HiCheck, HiOutlineAdjustmentsHorizontal, HiOutlineArrowPath, HiOutlineLockClosed } from 'react-icons/hi2'

interface Props {
  children: ReactNode
}

const VOICE_DEFAULTS: Record<DesktopVoiceProvider, { model: string; voice: string }> = {
  doubao: { model: '', voice: 'zh_female_vv_jupiter_bigtts' },
  gemini: { model: 'gemini-3.1-flash-live-preview', voice: 'Kore' },
  openai: { model: 'gpt-realtime-2.1', voice: 'marin' },
}

const REPORT_DEFAULTS: Record<DesktopReportProvider, { model: string; apiBaseUrl: string; reasoning: boolean }> = {
  deepseek: { model: 'deepseek-v4-pro', apiBaseUrl: 'https://api.deepseek.com', reasoning: true },
  openai: { model: 'gpt-5.4', apiBaseUrl: 'https://api.openai.com/v1', reasoning: false },
  custom: { model: '', apiBaseUrl: 'http://127.0.0.1:11434/v1', reasoning: false },
}

const PROVIDERS: Array<{ id: DesktopVoiceProvider; name: string; note: string; tone: string }> = [
  { id: 'doubao', name: '豆包端到端', note: 'WebSocket 原生语音', tone: 'bg-[#eaf4ff] text-[#0067c5]' },
  { id: 'gemini', name: 'Gemini Live', note: '原生音频实时对话', tone: 'bg-[#f2edff] text-[#6b46c1]' },
  { id: 'openai', name: 'OpenAI Realtime', note: 'WebRTC 实时语音', tone: 'bg-[#eaf8f2] text-[#16785b]' },
]

const REPORT_PROVIDERS: Array<{ id: DesktopReportProvider; name: string; note: string }> = [
  { id: 'deepseek', name: 'DeepSeek', note: '推荐用于详细分析' },
  { id: 'openai', name: 'OpenAI', note: 'Chat Completions' },
  { id: 'custom', name: '兼容接口', note: 'OpenAI 格式或本地模型' },
]

function Field({ label, hint, ...props }: {
  label: string
  hint?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold text-[#353539]">{label}</span>
      <input
        {...props}
        className="h-12 w-full rounded-[14px] border border-black/[0.12] bg-[#fbfbfd] px-4 text-[15px] text-[#1d1d1f] outline-none transition placeholder:text-[#a1a1a6] focus:border-[#0071e3] focus:bg-white focus:ring-4 focus:ring-[#0071e3]/10"
      />
      {hint && <span className="mt-1.5 block text-[12px] leading-5 text-[#77777c]">{hint}</span>}
    </label>
  )
}

function savedPlaceholder(saved: boolean, plain: string) {
  return saved ? '已安全保存；留空则保持不变' : plain
}

function SetupPanel({ config, onSaved, onCancel }: {
  config: DesktopPublicConfig
  onSaved: (config: DesktopPublicConfig) => void
  onCancel?: () => void
}) {
  const [voice, setVoice] = useState(config.voice)
  const [report, setReport] = useState(config.report)
  const [secrets, setSecrets] = useState<DesktopConfigInput['secrets']>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reset = async () => {
    if (!window.desktopBridge || saving) return
    if (!window.confirm('确定清除这台电脑上已保存的模型配置和密钥吗？')) return
    setSaving(true)
    setError('')
    try {
      await window.desktopBridge.resetConfig()
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : '清除配置失败。')
      setSaving(false)
    }
  }

  const selectedProvider = useMemo(
    () => PROVIDERS.find(provider => provider.id === voice.provider) ?? PROVIDERS[0],
    [voice.provider],
  )

  const chooseVoiceProvider = (provider: DesktopVoiceProvider) => {
    const defaults = VOICE_DEFAULTS[provider]
    setVoice(current => ({ ...current, provider, model: defaults.model, voice: defaults.voice }))
  }

  const chooseReportProvider = (provider: DesktopReportProvider) => {
    const defaults = REPORT_DEFAULTS[provider]
    setReport(current => ({
      ...current,
      provider,
      model: defaults.model,
      apiBaseUrl: defaults.apiBaseUrl,
      supportsJsonMode: true,
      supportsReasoningOptions: defaults.reasoning,
    }))
  }

  const updateSecret = (key: keyof DesktopConfigInput['secrets'], value: string) => {
    setSecrets(current => ({ ...current, [key]: value }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || !window.desktopBridge) return
    setSaving(true)
    setError('')
    try {
      const saved = await window.desktopBridge.saveConfig({ voice, report, secrets })
      onSaved(saved)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '配置保存失败，请检查填写内容。')
      setSaving(false)
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#f5f5f7] px-6 py-10 text-[#1d1d1f]">
      <form onSubmit={submit} className="mx-auto max-w-[1080px]">
        <header className="mb-8 flex items-end justify-between gap-8 border-b border-black/[0.09] pb-7">
          <div>
            <div className="mb-4 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[#0071e3]">
              <span className="h-2 w-2 rounded-full bg-[#0071e3]" />
              本地模型设置
            </div>
            <h1 className="text-[38px] font-semibold tracking-[-0.045em]">连接你的两套 AI</h1>
            <p className="mt-3 max-w-[650px] text-[15px] leading-7 text-[#69696e]">
              一套模型负责实时语音面签，一套模型负责完整反馈报告。密钥只保存在这台 Windows 电脑的加密存储中。
            </p>
          </div>
          <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-white text-[#0071e3] shadow-[0_12px_38px_rgba(0,0,0,0.08)] sm:flex">
            <HiOutlineAdjustmentsHorizontal className="h-8 w-8" />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.06fr_0.94fr]">
          <section className="rounded-[24px] border border-black/[0.07] bg-white p-6 shadow-[0_14px_45px_rgba(0,0,0,0.045)] sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1d1d1f] text-[13px] font-bold text-white">1</span>
              <div>
                <h2 className="text-[21px] font-semibold">实时语音面签模型</h2>
                <p className="mt-0.5 text-[13px] text-[#77777c]">三种接口共用同一套面签规则与结束机制</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {PROVIDERS.map(provider => {
                const active = provider.id === voice.provider
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => chooseVoiceProvider(provider.id)}
                    aria-pressed={active}
                    className={`relative min-h-[112px] rounded-[18px] border p-4 text-left transition ${active ? 'border-[#0071e3] bg-[#f6faff] shadow-[0_0_0_3px_rgba(0,113,227,0.09)]' : 'border-black/[0.09] bg-[#fbfbfd] hover:border-black/[0.18]'}`}
                  >
                    {active && <HiCheck className="absolute right-3 top-3 h-5 w-5 text-[#0071e3]" />}
                    <span className={`mb-3 inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${provider.tone}`}>Voice</span>
                    <span className="block pr-4 text-[15px] font-semibold">{provider.name}</span>
                    <span className="mt-1 block text-[11px] text-[#77777c]">{provider.note}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 rounded-[18px] bg-[#f7f7f9] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold">{selectedProvider.name} 鉴权</h3>
                <span className="flex items-center gap-1 text-[11px] font-medium text-[#16785b]"><HiOutlineLockClosed /> 本机加密</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {voice.provider === 'doubao' && (
                  <>
                    <Field
                      label="App ID"
                      type="password"
                      value={secrets.doubaoAppId ?? ''}
                      onChange={event => updateSecret('doubaoAppId', event.target.value)}
                      placeholder={savedPlaceholder(config.credentials.hasDoubaoAppId, '填写豆包 App ID')}
                      autoComplete="off"
                    />
                    <Field
                      label="Access Token / Access Key"
                      type="password"
                      value={secrets.doubaoAccessKey ?? ''}
                      onChange={event => updateSecret('doubaoAccessKey', event.target.value)}
                      placeholder={savedPlaceholder(config.credentials.hasDoubaoAccessKey, '填写豆包 Access Token 或 Access Key')}
                      hint="对应火山引擎端到端实时语音服务的鉴权值，不是报告模型 Key。"
                      autoComplete="off"
                    />
                  </>
                )}
                {voice.provider === 'gemini' && (
                  <Field
                    label="Gemini API Key"
                    type="password"
                    value={secrets.geminiApiKey ?? ''}
                    onChange={event => updateSecret('geminiApiKey', event.target.value)}
                    placeholder={savedPlaceholder(config.credentials.hasGeminiApiKey, '填写 Gemini API Key')}
                    autoComplete="off"
                  />
                )}
                {voice.provider === 'openai' && (
                  <Field
                    label="OpenAI API Key"
                    type="password"
                    value={secrets.openaiApiKey ?? ''}
                    onChange={event => updateSecret('openaiApiKey', event.target.value)}
                    placeholder={savedPlaceholder(config.credentials.hasOpenAIApiKey, '填写 OpenAI API Key')}
                    autoComplete="off"
                  />
                )}
                {voice.provider !== 'doubao' && (
                  <Field label="实时模型" value={voice.model} onChange={event => setVoice(current => ({ ...current, model: event.target.value }))} />
                )}
                {voice.provider !== 'doubao' && (
                  <Field label="音色" value={voice.voice} onChange={event => setVoice(current => ({ ...current, voice: event.target.value }))} />
                )}
                {voice.provider === 'doubao' && (
                  <Field
                    label="自定义服务地址（可选）"
                    value={voice.doubaoEndpoint}
                    onChange={event => setVoice(current => ({ ...current, doubaoEndpoint: event.target.value }))}
                    placeholder="留空使用官方地址"
                  />
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-black/[0.07] bg-white p-6 shadow-[0_14px_45px_rgba(0,0,0,0.045)] sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1d1d1f] text-[13px] font-bold text-white">2</span>
              <div>
                <h2 className="text-[21px] font-semibold">反馈报告模型</h2>
                <p className="mt-0.5 text-[13px] text-[#77777c]">负责证据提取、资格判断和逐题改进</p>
              </div>
            </div>

            <div className="space-y-2">
              {REPORT_PROVIDERS.map(provider => {
                const active = report.provider === provider.id
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => chooseReportProvider(provider.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center justify-between rounded-[15px] border px-4 py-3 text-left transition ${active ? 'border-[#0071e3] bg-[#f6faff]' : 'border-black/[0.08] hover:border-black/[0.16]'}`}
                  >
                    <span>
                      <span className="block text-[14px] font-semibold">{provider.name}</span>
                      <span className="mt-0.5 block text-[11px] text-[#77777c]">{provider.note}</span>
                    </span>
                    <span className={`h-4 w-4 rounded-full border-[5px] ${active ? 'border-[#0071e3]' : 'border-[#d2d2d7]'}`} />
                  </button>
                )
              })}
            </div>

            <div className="mt-5 grid gap-4">
              <Field
                label="报告模型 API Key"
                type="password"
                value={secrets.reportApiKey ?? ''}
                onChange={event => updateSecret('reportApiKey', event.target.value)}
                placeholder={savedPlaceholder(config.credentials.hasReportApiKey, '填写报告模型 API Key')}
                autoComplete="off"
              />
              <Field label="模型名称" value={report.model} onChange={event => setReport(current => ({ ...current, model: event.target.value }))} />
              <Field
                label="API Base URL"
                value={report.apiBaseUrl}
                onChange={event => setReport(current => ({ ...current, apiBaseUrl: event.target.value }))}
                hint="兼容接口需支持 OpenAI Chat Completions 格式；本机 HTTP 仅允许 localhost。"
              />
              {report.provider === 'custom' && (
                <div className="grid gap-2 rounded-[14px] border border-black/[0.08] bg-[#fbfbfd] p-4 text-[13px] text-[#535357] sm:grid-cols-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={report.supportsJsonMode} onChange={event => setReport(current => ({ ...current, supportsJsonMode: event.target.checked }))} />
                    支持 JSON mode
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={report.supportsReasoningOptions} onChange={event => setReport(current => ({ ...current, supportsReasoningOptions: event.target.checked }))} />
                    支持推理参数
                  </label>
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="mt-6 flex flex-col items-center justify-between gap-4 rounded-[20px] border border-black/[0.07] bg-white px-6 py-5 sm:flex-row">
          <div className="min-h-5 text-[13px] text-[#c9342f]" aria-live="polite">{error}</div>
          <div className="flex w-full gap-3 sm:w-auto">
            {config.isConfigured && (
              <button type="button" onClick={reset} disabled={saving} className="rounded-[14px] px-3 py-3 text-[13px] font-semibold text-[#c9342f] transition hover:bg-[#fff0ef] disabled:opacity-50">
                清除密钥
              </button>
            )}
            {onCancel && (
              <button type="button" onClick={onCancel} className="flex-1 rounded-[14px] border border-black/[0.12] px-5 py-3 text-[14px] font-semibold text-[#424245] transition hover:bg-[#f5f5f7] sm:flex-none">
                取消
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#0071e3] px-6 py-3 text-[14px] font-semibold text-white shadow-[0_9px_25px_rgba(0,113,227,0.22)] transition hover:bg-[#0068d1] active:scale-[0.985] disabled:opacity-60 sm:flex-none"
            >
              {saving ? <><HiOutlineArrowPath className="h-4 w-4 animate-spin" /> 正在保存并重启</> : '保存并进入应用'}
            </button>
          </div>
        </footer>
      </form>
    </main>
  )
}

export default function DesktopSetupGate({ children }: Props) {
  const bridge = window.desktopBridge
  const [config, setConfig] = useState<DesktopPublicConfig | null>(null)
  const [loadError, setLoadError] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (!bridge) return
    bridge.getConfig().then(setConfig).catch(error => {
      setLoadError(error instanceof Error ? error.message : '无法读取本地配置。')
    })
    return bridge.onOpenSettings(() => setShowSettings(true))
  }, [bridge])

  if (!bridge) return children
  if (loadError) {
    return <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5f7] p-8 text-[#c9342f]">{loadError}</main>
  }
  if (!config) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5f7]" role="status">
        <HiOutlineArrowPath className="h-7 w-7 animate-spin text-[#0071e3]" />
      </main>
    )
  }
  if (!config.isConfigured || showSettings) {
    return <SetupPanel config={config} onSaved={setConfig} onCancel={config.isConfigured ? () => setShowSettings(false) : undefined} />
  }

  return (
    <>
      {children}
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        className="fixed bottom-5 left-5 z-[100] flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/90 px-4 py-2.5 text-[12px] font-semibold text-[#535357] shadow-[0_10px_30px_rgba(0,0,0,0.1)] backdrop-blur-xl transition hover:text-[#0071e3]"
      >
        <HiOutlineAdjustmentsHorizontal className="h-4 w-4" /> 模型设置
      </button>
    </>
  )
}
