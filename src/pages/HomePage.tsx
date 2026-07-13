import Background from '../shared/components/Background'
import Navbar from '../shared/components/Navbar'
import HeroSection from '../shared/components/HeroSection'
import FeatureGrid from '../shared/components/FeatureGrid'

// ========================================
// 首页
// ========================================

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f5f7]">
      {/* 柔和光球背景 */}
      <Background />

      {/* 内容层 */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />

        <main className="flex-1">
          <HeroSection />
          <FeatureGrid />
        </main>

        {/* 底部 */}
        <footer className="relative z-10 border-t border-black/[0.06] px-5 py-7 text-center">
          <p className="text-[11px] font-medium tracking-[0.08em] text-[#86868b]">
            面签 AI Coach · 让准备变成可以看见的进步
          </p>
        </footer>
      </div>
    </div>
  )
}
