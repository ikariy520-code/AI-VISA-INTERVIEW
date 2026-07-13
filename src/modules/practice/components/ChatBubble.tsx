import { motion } from 'framer-motion'
import { HiOutlineInformationCircle, HiOutlineUser } from 'react-icons/hi2'
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-3 py-1.5 text-[10px] font-medium text-[#86868b]">
          <HiOutlineInformationCircle className="h-3.5 w-3.5" /> {message.text}
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
        className="mb-5 flex justify-end gap-3"
      >
        <div className="max-w-[82%] sm:max-w-[75%]">
          <p className="rounded-[20px] rounded-tr-md bg-[#1d1d1f] px-4 py-3 text-[14px] leading-6 text-white shadow-sm">
            {message.text}
          </p>
        </div>
        {/* 用户头像 */}
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[13px] bg-[#eef0f3] text-[#6e6e73]">
          <HiOutlineUser className="h-[17px] w-[17px]" />
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
      className="mb-5 flex gap-3"
    >
      {/* Officer 头像 */}
      <OfficerAvatar
        emotion={message.emotion ?? 'neutral'}
        isSpeaking={false}
        size="sm"
      />

      <div className="max-w-[82%] flex-1 sm:max-w-[78%]">
        {/* 文字气泡 */}
        <p className="rounded-[20px] rounded-tl-md border border-black/[0.06] bg-white px-4 py-3 text-[14px] leading-6 text-[#424245] shadow-sm">
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
