// ========================================
// 共享类型 — 各模块通过此接口对接
// ========================================

/** 面签功能卡片 */
export interface FeatureCardData {
  id: string
  title: string
  description: string
  route: string
  icon: React.ReactNode
  accentClass: string     // 图标区渐变背景
  shadowClass: string     // 图标区阴影
}
