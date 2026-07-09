import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ========================================
// 面签官姓名出场动画
//
// 进入面试室时：
//   1. 屏幕中央大字展示面签官姓名
//   2. 停留约 1.5 秒
//   3. 流畅缩小并向左上角移动
//   4. 背景消隐 → 面试开始
// ========================================

interface Props {
  name: string
  onComplete: () => void
}

export default function OfficerNameIntro({ name, onComplete }: Props) {
  const [phase, setPhase] = useState<'show' | 'move' | 'exit'>('show')

  useEffect(() => {
    // 停留在中央
    const t1 = setTimeout(() => setPhase('move'), 1600)
    // 移动 + 淡出完成后通知父组件
    const t2 = setTimeout(() => {
      setPhase('exit')
      // 等 exit 动画播完再回调
      setTimeout(onComplete, 400)
    }, 2800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onComplete])

  return (
    <AnimatePresence>
      {phase !== 'exit' && (
        <>
          {/* 背景层 — 随移动阶段淡出 */}
          <motion.div
            className="fixed inset-0 z-50 pointer-events-none"
            animate={{
              backgroundColor:
                phase === 'show' ? 'rgba(248, 250, 252, 1)' : 'rgba(248, 250, 252, 0)',
            }}
            transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
          />

          {/* 姓名文字 — 从中央缩小移至左上角 */}
          <motion.div
            className="fixed z-50 pointer-events-none flex items-baseline gap-2"
            animate={{
              // 中央 → 左上角
              top: phase === 'show' ? '50%' : '16px',
              left: phase === 'show' ? '50%' : '60px',
              x: phase === 'show' ? '-50%' : '0%',
              y: phase === 'show' ? '-50%' : '0%',
              // 缩放
              scale: phase === 'show' ? 1 : 0.45,
              // 文字颜色微调
              opacity: phase === 'show' ? 1 : 0.85,
            }}
            transition={{
              duration: 1.0,
              ease: [0.32, 0.72, 0, 1], // 自定义缓动：先慢后快再慢
            }}
            style={{ transformOrigin: 'center center' }}
          >
            {/* 名字 */}
            <span className="text-[42px] sm:text-[56px] font-bold text-slate-900 tracking-tight whitespace-nowrap leading-none">
              {name}
            </span>
            {/* "面签官" 后缀 */}
            <span className="text-[24px] sm:text-[32px] font-light text-slate-400 whitespace-nowrap leading-none">
              面签官
            </span>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
