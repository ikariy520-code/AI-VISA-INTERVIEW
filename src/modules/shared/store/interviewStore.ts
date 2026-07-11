// 本文件只生成本次页面内反馈需要的临时标识和时间。
// 不写入 localStorage、数据库或任何个人面签记录。

/**
 * 生成记录 ID
 * 仅用于本次内存中的反馈对象，刷新页面后不会恢复。
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
