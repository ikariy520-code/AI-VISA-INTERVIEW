// ========================================
// 面签官随机姓名池
//
// 20 个美式面签官姓名，每次进入第二部分时随机抽取
// 格式："XXXXX 面签官"，例如 "Michael Thompson 面签官"
// ========================================

export const OFFICER_NAMES = [
  'Michael Thompson',
  'Robert Chen',
  'James Walker',
  'David Miller',
  'William Baker',
  'Sarah O\'Connor',
  'Elizabeth Morgan',
  'Jennifer Brooks',
  'Patricia Sullivan',
  'Linda Foster',
  'Richard Blake',
  'Thomas Reed',
  'Christopher Powell',
  'Daniel Hartman',
  'Matthew Collins',
  'Jessica Turner',
  'Amanda Phillips',
  'Katherine Hayes',
  'Margaret Dunn',
  'Brian Connelly',
] as const

/** 随机获取一个面签官姓名 */
export function getRandomOfficerName(): string {
  return OFFICER_NAMES[Math.floor(Math.random() * OFFICER_NAMES.length)]
}
