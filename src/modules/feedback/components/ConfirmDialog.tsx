import { motion, AnimatePresence } from 'framer-motion'

// ========================================
// 确认删除弹窗
// 对标 DeepSeek 对话记录删除确认小窗口
// ========================================

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '删除',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* 半透明遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/40"
          />

          {/* 弹窗卡片 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0, 1] }}
            className="relative z-10 mx-4 w-full max-w-[340px]
              bg-white rounded-2xl shadow-2xl shadow-black/15
              border border-slate-200/60
              p-6"
          >
            {/* 标题 */}
            <h3 className="text-[16px] font-semibold text-slate-900 mb-2">
              {title}
            </h3>

            {/* 描述 */}
            <p className="text-[13px] text-slate-500 leading-relaxed mb-6">
              {message}
            </p>

            {/* 按钮区 */}
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-[13px] font-medium
                  text-slate-600 bg-slate-100 hover:bg-slate-200
                  transition-colors duration-200"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 rounded-xl text-[13px] font-medium
                  text-white bg-red-500 hover:bg-red-600
                  transition-colors duration-200
                  shadow-sm shadow-red-500/20"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
