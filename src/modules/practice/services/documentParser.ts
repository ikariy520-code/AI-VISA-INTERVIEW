// ========================================
// 文档解析服务
//
// 通用 PDF 文本提取 + DS-160 / I-20 字段解析
//
// 依赖 pdfjs-dist 在浏览器端提取 PDF 文本
// 架构：通用协调层 + 特定格式 adapter
//   未来新增文件类型只需加 adapter，不改已有代码
// ========================================

import * as pdfjsLib from 'pdfjs-dist'
import type { DS160Data, I20Data, DocumentParseResult, DocumentType } from '../types'

// ---- pdf.js Worker 配置 ----

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// ============================================================
// PDF 文本提取
// ============================================================

/**
 * 从 PDF File 中提取全部文本内容
 * 逐页拼接，页间用换行分隔
 */
async function extractPDFText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => item.str ?? item.hasEOL ? ' ' : '')
      .join('')
    pages.push(pageText)
  }

  return pages.join('\n')
}

// ============================================================
// DS-160 确认页解析
//
// DS-160 确认页为美领馆标准表格，字段名固定
// 以下正则以字段标签为锚点，提取其后相邻的内容
// ============================================================

/**
 * 在文本中查找标签后的值
 * 匹配模式：标签名 + 可选冒号/空格 + 目标值
 * 值通常为下一行或同行冒号后的内容
 */
function extractAfter(label: string, text: string): string | undefined {
  // 模式1: "Label: Value" 同行
  const inlineRx = new RegExp(
    `${escapeRx(label)}[\\s:：]+([^\\n]{1,60})`,
    'i',
  )
  const inlineMatch = text.match(inlineRx)
  if (inlineMatch) return inlineMatch[1].trim()

  // 模式2: "Label\nValue" 下一行
  const nextLineRx = new RegExp(
    `${escapeRx(label)}\\s*\\n\\s*([^\\n]{1,60})`,
    'i',
  )
  const nextLineMatch = text.match(nextLineRx)
  if (nextLineMatch) return nextLineMatch[1].trim()

  return undefined
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseDS160(text: string): DS160Data {
  return {
    fullName: extractAfter('Full Name', text)
      ?? extractAfter('Surname', text)
      ?? extractAfter('Name', text),
    passportNumber: extractAfter('Passport Number', text)
      ?? extractAfter('Passport/Travel Document Number', text)
      ?? extractAfter('Travel Document', text),
    nationality: extractAfter('Nationality', text)
      ?? extractAfter('Country of Citizenship', text)
      ?? extractAfter('Citizenship', text),
    destination: extractAfter('Address Where You Will Stay', text)
      ?? extractAfter('U\\.S\\. Address', text)
      ?? extractAfter('Destination', text),
    purposeOfTrip: extractAfter('Purpose of Trip', text)
      ?? extractAfter('Purpose of Travel', text)
      ?? extractAfter('Primary Purpose', text),
  }
}

// ============================================================
// I-20 表格解析
//
// I-20 为 DHS 标准表格 (Form I-20, Certificate of Eligibility)
// SEVIS ID 格式: N00 + 9 位数字
// 学校名、专业名、日期等字段有固定表格式标签
// ============================================================

export function parseI20(text: string): I20Data {
  const uniName = extractAfter('School Name', text)
    ?? extractAfter('Institution', text)
    ?? extractAfter('University', text)

  const major = extractAfter('Program of Study', text)
    ?? extractAfter('Major', text)
    ?? extractAfter('Field of Study', text)
    ?? extractAfter('Education Level', text)

  const startDate = extractAfter('Program Start Date', text)
    ?? extractAfter('Start of Classes', text)
    ?? extractAfter('Report Date', text)

  const endDate = extractAfter('Program End Date', text)
    ?? extractAfter('Program End', text)
    ?? extractAfter('Completion Date', text)

  // 尝试计算时长
  let duration: string | undefined
  if (startDate && endDate) {
    const start = parseDate(startDate)
    const end = parseDate(endDate)
    if (start && end) {
      const months = monthDiff(start, end)
      duration = `${months} 个月`
    }
  }

  // SEVIS ID 通常以 N00 开头
  const sevisMatch = text.match(/\b(N00\d{9,10})\b/i)
    ?? text.match(/\b(SEVIS[:\s]*ID[:\s]*)?(N00\d{9,10})\b/i)

  return {
    sevisId: sevisMatch ? sevisMatch[0].replace(/SEVIS.*?ID/i, '').trim() : undefined,
    universityName: uniName,
    major,
    programStartDate: startDate,
    programEndDate: endDate,
    duration,
  }
}

// ---- 日期解析辅助 ----

function parseDate(str: string): Date | null {
  if (!str) return null

  // 格式: "MM/DD/YYYY" / "DD-MON-YYYY" / "Month DD, YYYY"
  const slashMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashMatch) {
    return new Date(+slashMatch[3], +slashMatch[1] - 1, +slashMatch[2])
  }

  const dashMatch = str.match(/(\d{1,2})-(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{4})/i)
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  }
  if (dashMatch) {
    const mon = months[dashMatch[1].toUpperCase()]
    return mon !== undefined ? new Date(+dashMatch[2], mon, +dashMatch[0]) : null
  }

  // Fallback to native Date parsing
  const parsed = new Date(str)
  return isNaN(parsed.getTime()) ? null : parsed
}

function monthDiff(a: Date, b: Date): number {
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  return Math.max(0, months)
}

// ============================================================
// 主入口
// ============================================================

/**
 * 解析上传的文件，返回结构化数据
 *
 * @param file  用户上传的 PDF 文件
 * @param type  文档类型（DS-160 或 I-20）
 * @returns     解析结果，含原始文本和结构化字段
 */
export async function parseDocument(
  file: File,
  type: DocumentType,
): Promise<DocumentParseResult> {
  const rawText = await extractPDFText(file)

  const result: DocumentParseResult = {
    type,
    fileName: file.name,
    rawText,
  }

  if (type === 'ds160') {
    result.ds160 = parseDS160(rawText)
  } else if (type === 'i20') {
    result.i20 = parseI20(rawText)
  }

  return result
}

export { extractPDFText }
