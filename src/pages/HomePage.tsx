import Background from '../shared/components/Background'
import Navbar from '../shared/components/Navbar'
import HeroSection from '../shared/components/HeroSection'
import FeatureGrid from '../shared/components/FeatureGrid'

// ========================================
// 首页
// ========================================

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F8FAFC]">
      {/* 柔和光球背景 */}
      <Background />

      {/* 内容层 */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />

        <main className="flex-1 flex flex-col justify-center">
          <HeroSection />

          {/* 卡片与标题之间的呼吸空间 */}
          <div className="h-10 sm:h-14" />

          <FeatureGrid />
        </main>

        {/* 底部 */}
        <footer className="relative z-10 text-center pb-8">
          <div className="w-8 h-[1px] bg-slate-300 mx-auto mb-3" />
          <p className="text-[12px] text-slate-400 font-normal tracking-wide">
            面签AI Coach · Practice with Confidence
          </p>
        </footer>
      </div>
    </div>
  )
}
