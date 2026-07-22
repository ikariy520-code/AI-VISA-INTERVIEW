import Background from '../shared/components/Background'
import Navbar from '../shared/components/Navbar'
import HeroSection from '../shared/components/HeroSection'
import FeatureGrid from '../shared/components/FeatureGrid'
import MobileHomePage from './MobileHomePage'

// ========================================
// 首页
// ========================================

export default function HomePage() {
  return (
    <>
      <div className="sm:hidden">
        <MobileHomePage />
      </div>

      <div className="relative hidden min-h-[100dvh] overflow-hidden bg-[#f5f5f7] sm:block">
        {/* 柔和光球背景 */}
        <Background />

        {/* 内容层 */}
        <div className="relative z-10 flex min-h-[100dvh] flex-col">
          <Navbar />

          <main className="flex-1">
            <HeroSection />
            <FeatureGrid />
          </main>

          {/* 底部 */}
          <footer className="relative z-10 border-t border-black/[0.06] px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-7 text-center">
            <p className="text-[11px] font-medium tracking-[0.08em] text-[#86868b]">
              面签 AI Coach · 让准备变成可以看见的进步
            </p>
          </footer>
        </div>
      </div>
    </>
  )
}
