import { useEffect, useRef } from 'react'

// ========================================
// 明亮渐变光球背景
// 柔和的蓝白调，不抢眼，营造开放感
// ========================================

interface Orb {
  x: number; y: number; vx: number; vy: number
  radius: number; r: number; g: number; b: number; a: number
}

const ORB_DEFS = [
  { r: 59,  g: 130, b: 246, a: 0.06 },  // 自信蓝
  { r: 16,  g: 185, b: 129, a: 0.04 },  // 通过绿
  { r: 245, g: 158, b: 11,  a: 0.03 },  // 温暖金
]

export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let orbs: Orb[] = []

    function createOrbs() {
      orbs = ORB_DEFS.map(d => ({
        x: Math.random() * canvas!.width,
        y: Math.random() * canvas!.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        radius: Math.min(canvas!.width, canvas!.height) * (0.35 + Math.random() * 0.35),
        ...d,
      }))
    }

    function resize() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
      createOrbs()
    }

    resize()
    window.addEventListener('resize', resize)

    function animate() {
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const orb of orbs) {
        orb.x += orb.vx
        orb.y += orb.vy
        const pad = orb.radius * 0.4
        if (orb.x < -pad || orb.x > canvas.width + pad) orb.vx *= -1
        if (orb.y < -pad || orb.y > canvas.height + pad) orb.vy *= -1

        const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius)
        const { r, g, b, a } = orb
        grad.addColorStop(0, `rgba(${r},${g},${b},${a})`)
        grad.addColorStop(0.6, `rgba(${r},${g},${b},${a * 0.3})`)
        grad.addColorStop(1, 'transparent')

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      animationId = requestAnimationFrame(animate)
    }

    animate()
    return () => { cancelAnimationFrame(animationId); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ pointerEvents: 'none' }}
    />
  )
}
