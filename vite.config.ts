import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { doubaoRealtimeBridge } from './local/doubaoRealtimeBridge'
import { doubaoTextBridge } from './local/doubaoTextBridge'

// ========================================
// Vite 配置
//
// 本地开发模式（npm run dev）：
//   - 前端静态页面 + HMR
//   - /api/realtime-voice → 全双工实时语音（本地桥接注入 key）
//   - /api/ai-report → 面试结束后一次性生成整场报告
// ========================================

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configuredSpeechApiKey = env.DOUBAO_SPEECH_API_KEY || ''
  const arkKeyDetected = [configuredSpeechApiKey, env.ARK_API_KEY || '']
    .some(key => key.startsWith('ark-'))
  const doubaoApiKey = configuredSpeechApiKey.startsWith('ark-')
    ? ''
    : configuredSpeechApiKey
  const textApiKey = env.ARK_API_KEY || ''
  const textModel = env.ARK_TEXT_MODEL || env.DOUBAO_TEXT_MODEL || ''
  const isLocalDev = command === 'serve'

  return {
    plugins: [
      react(),
      ...(isLocalDev ? [doubaoTextBridge({
        apiKey: textApiKey,
        model: textModel,
        endpoint: env.ARK_API_BASE,
      })] : []),
      ...(isLocalDev ? [doubaoRealtimeBridge({
        apiKey: doubaoApiKey,
        upstreamUrl: env.DOUBAO_REALTIME_URL,
        configurationError: !doubaoApiKey && arkKeyDetected
          ? '当前填写的 Key 与实时语音接口不匹配，请填写端到端实时语音 API Key。'
          : undefined,
      })] : []),
    ],
    server: {
      host: '127.0.0.1',
      port: Number(env.VITE_DEV_PORT) || 5173,
    },
  }
})
