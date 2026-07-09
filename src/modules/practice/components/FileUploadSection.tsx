import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DocumentParseResult, DocumentType, ParseStatus } from '../types'
import { parseDocument } from '../services/documentParser'

// ========================================
// 文件上传区域
//
// 支持拖拽 / 点击上传 DS-160 和 I-20 PDF 文件
// 上传后自动解析 PDF 文本，提取结构化字段
// 仅 F1 签证类型显示
//
// 视觉风格对齐项目现有组件：
//   · rounded-2xl + border-2 + bg-white
//   · text-[13px] / text-[14px]
//   · focus:border-blue-400 focus:ring-2
// ========================================

interface UploadSlotProps {
  type: DocumentType
  label: string
  description: string
  icon: string
  status: ParseStatus
  fileName: string
  error: string
  onFile: (file: File) => void
}

// ---- 单个上传槽位 ----

function UploadSlot({
  type, label, description, icon,
  status, fileName, error,
  onFile,
}: UploadSlotProps) {
  const [dragover, setDragover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    if (!file.type && !file.name.toLowerCase().endsWith('.pdf')) {
      return
    }
    onFile(file)
  }, [onFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragover(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    if (inputRef.current) inputRef.current.value = ''
  }, [processFile])

  const id = `upload-${type}`
  const isActive = status === 'loading'

  return (
    <div className="flex-1 min-w-0">
      {/* 标签 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-[13px] font-semibold text-slate-700">{label}</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-2.5">{description}</p>

      {/* 上传区域 */}
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
        onDragLeave={() => setDragover(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center gap-2
          min-h-[80px] px-4 py-3 rounded-xl border-2 border-dashed
          cursor-pointer transition-all duration-200
          ${dragover
            ? 'border-blue-400 bg-blue-50/60'
            : status === 'success'
              ? 'border-emerald-300 bg-emerald-50/40'
              : status === 'error'
                ? 'border-red-300 bg-red-50/40'
                : 'border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-slate-50'
          }
          ${isActive ? 'pointer-events-none' : ''}
        `}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept=".pdf,application/pdf"
          onChange={onChange}
          disabled={isActive}
          className="sr-only"
        />

        <AnimatePresence mode="wait">
          {status === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-[12px] text-slate-500"
            >
              <svg className="animate-spin w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="font-medium">正在解析 PDF...</span>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-0.5"
            >
              <div className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="text-emerald-500"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-[12px] font-semibold text-emerald-600">解析完成</span>
              </div>
              <span className="text-[11px] text-emerald-500 truncate max-w-full">{fileName}</span>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-0.5"
            >
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="text-red-400"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span className="text-[12px] font-medium text-red-500">
                  {error || '解析失败'}
                </span>
              </div>
              <span className="text-[11px] text-red-400">点击重新上传</span>
            </motion.div>
          )}

          {(status === 'idle') && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="text-slate-300"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-[12px] text-slate-400 font-medium">
                拖拽 PDF 到此处，或点击选择文件
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </label>
    </div>
  )
}

// ---- 主组件 ----

interface Props {
  onParseComplete: (result: DocumentParseResult) => void
}

export default function FileUploadSection({ onParseComplete }: Props) {
  const [slots, setSlots] = useState<Record<DocumentType, { status: ParseStatus; fileName: string; error: string }>>({
    ds160: { status: 'idle', fileName: '', error: '' },
    i20: { status: 'idle', fileName: '', error: '' },
  })

  /** 处理文件上传：设置 loading → 解析 → 通知父组件 */
  const handleFile = useCallback((type: DocumentType) => async (file: File) => {
    setSlots(prev => ({ ...prev, [type]: { status: 'loading', fileName: '', error: '' } }))
    try {
      const result = await parseDocument(file, type)
      setSlots(prev => ({ ...prev, [type]: { status: 'success', fileName: result.fileName, error: '' } }))
      onParseComplete(result)
    } catch (err: any) {
      const msg = err?.message ?? '解析失败，请检查文件是否为有效的 PDF'
      setSlots(prev => ({ ...prev, [type]: { status: 'error', fileName: '', error: msg } }))
    }
  }, [onParseComplete])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.35 }}
      className="w-full max-w-lg mx-auto mb-6"
    >
      {/* 分区标题 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-5 rounded-full bg-emerald-400" />
        <span className="text-[13px] font-semibold text-slate-600">
          📄 上传文件自动填表（可选）
        </span>
      </div>

      {/* 两个上传槽位并排 */}
      <div className="flex gap-3">
        <UploadSlot
          type="ds160"
          label="DS-160 确认页"
          description="上传 DS-160 表确认页 PDF"
          icon="📋"
          status={slots.ds160.status}
          fileName={slots.ds160.fileName}
          error={slots.ds160.error}
          onFile={handleFile('ds160')}
        />
        <UploadSlot
          type="i20"
          label="I-20 表格"
          description="上传 I-20 表格 PDF"
          icon="🎓"
          status={slots.i20.status}
          fileName={slots.i20.fileName}
          error={slots.i20.error}
          onFile={handleFile('i20')}
        />
      </div>

      {/* 底部提示 */}
      <p className="text-[11px] text-slate-400 mt-2 text-center">
        DS-160 和 I-20 各上传一份即可，AI 将自动识别并填写基本信息
      </p>
    </motion.div>
  )
}
