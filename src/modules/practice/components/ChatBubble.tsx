import { motion } from 'framer-motion'
import type { ChatMessage } from '../types'
import OfficerAvatar from './OfficerAvatar'

// ========================================
// 对话气泡
// Officer 消息：头像 + 蓝色气泡 + 情绪
// User 消息：右对齐白色气泡
// System 消息：居中灰色文字
// ========================================

interface Props {
  message: ChatMessage
}

export default function ChatBubble({ message }: Props) {
  // System 消息
  if (message.role === 'system') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex justify-center py-2"
      >
        <span className="text-[11px] text-slate-400 font-medium bg-slate-50 px-3 py-1 rounded-full">
          {message.text}
        </span>
      </motion.div>
    )
  }

  // User 消息
  if (message.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0, 1] }}
        className="flex justify-end gap-3 mb-4"
      >
        <div className="flex-1 max-w-[75%]">
          <p className="text-[14px] text-slate-700 leading-relaxed bg-white border border-slate-200
            rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
            {message.text}
          </p>
        </div>
        {/* 用户头像 */}
        <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-slate-500 text-[11px] font-bold">你</span>
        </div>
      </motion.div>
    )
  }

  // Officer 消息
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0, 1] }}
      className="flex gap-3 mb-4"
    >
      {/* Officer 头像 */}
      <OfficerAvatar
        emotion={message.emotion ?? 'neutral'}
        isSpeaking={false}
        size="sm"
      />

      <div className="flex-1 max-w-[80%]">
        {/* 文字气泡 */}
        <p className="text-[14px] text-slate-800 leading-relaxed bg-blue-50/70
          rounded-2xl rounded-tl-sm px-4 py-2.5">
          {message.text}
        </p>

        {/* 时间戳 */}
        <span className="text-[10px] text-slate-400 ml-1 mt-1 block">
          {message.timestamp}
        </span>
      </div>
    </motion.div>
  )
}
