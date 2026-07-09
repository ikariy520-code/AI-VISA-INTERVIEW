import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { InterviewSession } from './types'
import { getSavedSessions, deleteSession } from '../shared/store/interviewStore'
import SessionSidebar from './components/SessionSidebar'
import SessionDetail from './components/SessionDetail'
import ConfirmDialog from './components/ConfirmDialog'

// ========================================
// 反馈总结模块 (独立模块，可单独拆分)
//
// 布局：左上角返回 → 玻璃胶囊(搜索+目录) → 左目录 + 右详情
// 左侧对标 Claude / ChatGPT / DeepSeek 对话列表
// 右侧展示面签逐轮对话 + 教练多维点评
//
// 响应式：
//   手机 (< 768px)：侧边栏默认隐藏，汉堡按钮唤起 overlay 抽屉
//   桌面 (≥ 768px)：侧边栏可折叠，折叠后主内容区占满
// ========================================

// ---- 搜索辅助 ----
function sessionMatchesQuery(session: InterviewSession, query: string): boolean {
  const q = query.toLowerCase()
  // 标题匹配
  if (session.title.toLowerCase().includes(q)) return true
  // 对话内容匹配（问题 + 回答）
  return session.transcript.some(
    t =>
      t.question.toLowerCase().includes(q) ||
      t.answer.toLowerCase().includes(q)
  )
}

export default function FeedbackPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // 从 localStorage 读取已保存的面签记录（用 state 以便删除后刷新）
  const [allSessions, setAllSessions] = useState<InterviewSession[]>(() => getSavedSessions())

  // 删除确认弹窗状态
  const [deleteTarget, setDeleteTarget] = useState<InterviewSession | null>(null)

  // 如果从练习页跳转过来，高亮刚保存的记录
  const highlightId = (location.state as any)?.highlightSessionId as string | undefined

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(
    // 优先选高亮记录 → 最新本地记录 → 第一条 mock
    (highlightId ? allSessions.find(s => s.id === highlightId) : null)
    ?? allSessions[0]
    ?? null
  )

  // 清除 location state（避免重复高亮）
  useEffect(() => {
    if (highlightId && allSessions.some(s => s.id === highlightId)) {
      // 自动打开侧边栏展示新记录
      setSidebarOpen(true)
    }
  }, [highlightId, allSessions])
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 搜索结果过滤
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return allSessions
    return allSessions.filter(s => sessionMatchesQuery(s, searchQuery))
  }, [searchQuery, allSessions])

  // 展开搜索时自动聚焦
  useEffect(() => {
    if (searchExpanded && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [searchExpanded])

  const handleSelect = useCallback((session: InterviewSession) => {
    setActiveSession(session)
    setSidebarOpen(false)
  }, [])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  // 请求删除 — 打开确认弹窗
  const handleDeleteRequest = useCallback((session: InterviewSession) => {
    setDeleteTarget(session)
  }, [])

  // 确认删除
  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return
    deleteSession(deleteTarget.id)
    // 刷新列表
    const updated = getSavedSessions()
    setAllSessions(updated)
    // 如果删的是当前激活的记录，切换到下一条
    if (activeSession?.id === deleteTarget.id) {
      setActiveSession(updated[0] ?? null)
    }
    setDeleteTarget(null)
  }, [deleteTarget, activeSession])

  // 取消删除
  const handleCancelDelete = useCallback(() => {
    setDeleteTarget(null)
  }, [])

  const toggleSearch = useCallback(() => {
    setSearchExpanded(v => {
      if (!v) {
        // 展开搜索时自动打开侧边栏以展示结果
        setSidebarOpen(true)
      }
      return !v
    })
    setSearchQuery('')
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchExpanded(false)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC]">
      {/* 顶栏 — 仅保留左上角返回箭头 */}
      <header className="relative flex items-center px-4 py-2.5 border-b border-slate-200 bg-white flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="w-8 h-8 rounded-lg flex items-center justify-center
            text-slate-400 hover:text-slate-600 hover:bg-slate-100
            transition-all duration-200"
          title="返回首页"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </header>

      {/* 玻璃胶囊：搜索 + 目录切换 */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
        <div className="inline-flex items-center gap-0
          bg-white/70 backdrop-blur-2xl
          border border-slate-200/60
          rounded-full px-1.5 py-1
          shadow-sm shadow-slate-200/50
          transition-all duration-300"
        >
          {/* 搜索按钮 */}
          <button
            onClick={toggleSearch}
            className={`w-8 h-8 rounded-full flex items-center justify-center
              transition-all duration-200
              ${searchExpanded
                ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/25'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            title="搜索面签记录"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {/* 分割线 */}
          <div className="w-[1px] h-5 bg-slate-200/80 mx-1" />

          {/* 面签记录切换按钮 */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full
              transition-all duration-200
              ${sidebarOpen
                ? 'text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
              }`}
            title={sidebarOpen ? '收起记录' : '面签记录'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <span className="text-[13px] font-medium">反馈总结</span>
            {allSessions.length > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px]
                rounded-full text-[10px] font-bold px-1
                transition-colors duration-200
                ${sidebarOpen
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-slate-100 text-slate-500'
                }`}>
                {searchQuery ? filteredSessions.length : allSessions.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 搜索输入条 — 玻璃胶囊下方展开 */}
      <AnimatePresence>
        {searchExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0, 1] }}
            className="px-4 overflow-hidden flex-shrink-0"
          >
            <div className="pt-2 pb-1">
              <div className="inline-flex items-center gap-1.5
                bg-white/80 backdrop-blur-xl
                border border-slate-200/60
                rounded-full px-3 py-1.5
                shadow-sm shadow-slate-200/40
                max-w-[320px]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="text-slate-400 flex-shrink-0"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜索标题或对话内容…"
                  className="bg-transparent text-[13px] text-slate-700 placeholder-slate-400
                    outline-none border-none w-[140px] sm:w-[180px]"
                />
                {searchQuery && (
                  <span className="text-[10px] text-slate-400 flex-shrink-0 tabular-nums">
                    {filteredSessions.length}条
                  </span>
                )}
                <button
                  onClick={clearSearch}
                  className="w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300
                    flex items-center justify-center flex-shrink-0
                    transition-colors duration-150"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    className="text-slate-500"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 主体：左侧目录 + 右侧详情 */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ---- 桌面端：可折叠侧边栏 ---- */}
        <div className="hidden md:block">
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0, 1] }}
                className="overflow-hidden flex-shrink-0"
              >
                <SessionSidebar
                  sessions={filteredSessions}
                  activeId={activeSession?.id ?? null}
                  onSelect={handleSelect}
                  onDelete={handleDeleteRequest}
                  onClose={closeSidebar}
                  searchQuery={searchQuery}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---- 手机端：overlay 抽屉 ---- */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={closeSidebar}
                className="fixed inset-0 bg-black/40 z-30 md:hidden"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0, 1] }}
                className="fixed top-0 left-0 bottom-0 z-40 w-[280px] max-w-[85vw] md:hidden"
              >
                <SessionSidebar
                  sessions={filteredSessions}
                  activeId={activeSession?.id ?? null}
                  onSelect={handleSelect}
                  onDelete={handleDeleteRequest}
                  onClose={closeSidebar}
                  searchQuery={searchQuery}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* 右侧内容区 */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {activeSession ? (
            <SessionDetail session={activeSession} />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex items-center justify-center text-center px-6"
            >
              <div>
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className="text-slate-300">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <p className="text-slate-400 text-[15px] font-normal">
                  点击上方
                  <span className="text-blue-500 font-medium"> ☰ 反馈总结 </span>
                  选择一条记录查看详情
                </p>
              </div>
            </motion.div>
          )}
        </main>
      </div>

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除面签记录"
        message={`确定要删除「${deleteTarget?.title ?? ''}」吗？删除后无法恢复。`}
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  )
}
