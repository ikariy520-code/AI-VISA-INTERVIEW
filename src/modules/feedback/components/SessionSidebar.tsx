import type { InterviewSession } from '../types'
import { HiOutlineMagnifyingGlass, HiOutlineTrash, HiOutlineXMark } from 'react-icons/hi2'

// ========================================
// 对话目录侧边栏
// 对标 Claude / ChatGPT / DeepSeek 的左侧会话列表
//
// 支持 onClose — 手机端 overlay 模式下显示关闭按钮
// ========================================

interface SessionSidebarProps {
  sessions: InterviewSession[]
  activeId: string | null
  onSelect: (session: InterviewSession) => void
  onDelete?: (session: InterviewSession) => void
  onClose?: () => void
  searchQuery?: string
}

function scoreBar(score: number) {
  const pct = (score / 5) * 100
  const color = score >= 4 ? 'bg-emerald-500' : score >= 3 ? 'bg-amber-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[11px] font-semibold ${
        score >= 4 ? 'text-emerald-600' : score >= 3 ? 'text-amber-600' : 'text-red-500'
      }`}>
        {score.toFixed(1)}
      </span>
    </div>
  )
}

export default function SessionSidebar({ sessions, activeId, onSelect, onDelete, onClose, searchQuery }: SessionSidebarProps) {
  const isSearching = !!searchQuery?.trim()

  return (
    <aside className="w-[280px] min-w-[280px] h-full overflow-y-auto
      bg-white border-r border-slate-200 flex flex-col">
      {/* 顶部标题 */}
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">
            {isSearching ? '搜索结果' : '面签记录'}
          </h2>
          <p className="text-[12px] text-slate-400 font-normal">
            {isSearching
              ? `找到 ${sessions.length} 条匹配`
              : `${sessions.length} 次练习`
            }
          </p>
        </div>
        {/* 关闭按钮 — 手机端可见 */}
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center
              transition-colors duration-200 md:hidden"
            title="收起面签记录"
          >
            <HiOutlineXMark className="h-4 w-4 text-slate-500" />
          </button>
        )}
      </div>

      {/* 分割线 */}
      <div className="mx-4 h-[1px] bg-slate-100" />

      {/* Session 列表 */}
      <nav className="flex-1 px-3 py-3 space-y-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <HiOutlineMagnifyingGlass className="h-4 w-4 text-slate-300" />
            </div>
            <p className="text-[13px] text-slate-400 font-normal">未找到匹配的记录</p>
            <p className="text-[11px] text-slate-300 mt-1">尝试其他关键词</p>
          </div>
        ) : (
          sessions.map(s => {
            const isActive = s.id === activeId
            return (
              <div
                key={s.id}
                className={`group relative w-full rounded-xl transition-all duration-200
                  ${isActive
                    ? 'bg-blue-50 border border-blue-200 shadow-sm'
                    : 'hover:bg-slate-50 border border-transparent'
                  }`}
              >
                <button
                  onClick={() => onSelect(s)}
                  className="w-full text-left px-3 py-3"
                >
                  {/* 标题 */}
                  <p className={`text-[14px] font-medium leading-snug mb-1.5 truncate pr-6
                    ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                    {s.title}
                  </p>

                  {/* 日期 + 时长 */}
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-normal mb-2">
                    <span>{s.date}</span>
                    <span>{s.time}</span>
                    <span className="text-slate-300">·</span>
                    <span>{s.duration}</span>
                  </div>

                  {/* 综合评分条 */}
                  {scoreBar(s.overallScore)}
                </button>

                {/* 删除按钮 — 鼠标悬浮时显示，悬停变红 */}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(s)
                    }}
                    className="absolute top-2.5 right-2.5 w-6 h-6 rounded-lg
                      text-slate-300 hover:text-red-500 hover:bg-red-50
                      opacity-0 group-hover:opacity-100
                      transition-all duration-200
                      flex items-center justify-center"
                    title="删除此记录"
                  >
                    <HiOutlineTrash className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })
        )}
      </nav>

      {/* 底部 */}
      <div className="px-5 py-4 border-t border-slate-100">
        <p className="text-[11px] text-slate-400 font-normal leading-relaxed">
          点击每条记录查看详细对话与教练点评
        </p>
      </div>
    </aside>
  )
}
