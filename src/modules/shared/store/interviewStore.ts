// ========================================
// 面签记录持久化存储
//
// 使用 localStorage 存储 InterviewSession[]
// 第二阶段练习完成 → 自动保存 → 第三阶段反馈页读取
//
// 结构简单，便于后续迁移到 IndexedDB 或服务端
// ========================================

import type { InterviewSession } from '../../feedback/types'

const STORAGE_KEY = 'visa_interview_sessions'
const MAX_SESSIONS = 50 // 最多保存 50 条记录

/** 读取所有已保存的面签记录 */
export function getSavedSessions(): InterviewSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as InterviewSession[]
  } catch {
    // 数据损坏时静默回退
    return []
  }
}

/** 保存一条面签记录（新记录插入最前面） */
export function saveSession(session: InterviewSession): void {
  try {
    const sessions = getSavedSessions()

    // 去重：如果已存在相同 ID 的记录，替换
    const existingIdx = sessions.findIndex(s => s.id === session.id)
    if (existingIdx >= 0) {
      sessions.splice(existingIdx, 1)
    }

    // 新记录插在最前面
    sessions.unshift(session)

    // 保留最近 N 条
    const trimmed = sessions.slice(0, MAX_SESSIONS)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage 满或不可用时静默失败
    console.warn('[InterviewStore] Failed to save session — localStorage may be full')
  }
}

/** 删除指定记录 */
export function deleteSession(sessionId: string): void {
  try {
    const sessions = getSavedSessions()
    const filtered = sessions.filter(s => s.id !== sessionId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch {
    // 静默失败
  }
}

/** 清空所有记录 */
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 静默失败
  }
}

/** 获取记录总数 */
export function getSessionCount(): number {
  return getSavedSessions().length
}

/**
 * 生成记录 ID
 * 格式：local-{timestamp}，与 mock 数据 session-1/2/3 区分
 */
export function generateSessionId(): string {
  return crypto.randomUUID()
}

/**
 * 获取当前日期和时间（本地格式）
 */
export function getNowFormatted(): { date: string; time: string } {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return { date, time }
}
