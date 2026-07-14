import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary] Unhandled render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-6 py-12">
        <section className="w-full max-w-lg rounded-[28px] border border-black/[0.07] bg-white p-7 text-center shadow-xl shadow-black/[0.05] sm:p-9">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b53a34]">Page recovery</p>
          <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.04em] text-[#1d1d1f]">页面运行出现异常</h1>
          <p className="mt-3 text-[13px] leading-6 text-[#6e6e73]">
            为保护隐私，本次面签内容没有长期保存。当前练习无法继续，请重新开始一场面签；我们已在浏览器中记录本次错误用于排查。
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="app-button-primary flex-1" onClick={() => window.location.assign('/voice')}>
              重新开始面签
            </button>
            <button type="button" className="app-button-secondary flex-1" onClick={() => window.location.assign('/')}>
              返回首页
            </button>
          </div>
        </section>
      </main>
    )
  }
}
