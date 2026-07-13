import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { doubaoRealtimeBridge } from './local/doubaoRealtimeBridge'

// ========================================
// Vite 配置
//
// 本地开发模式（npm run dev）：
//   - 前端静态页面 + HMR
//   - /api/realtime-voice → 全双工实时语音（本地桥接注入 key）
//   - /api/ai-chat、/api/ai-score 保留给原有文本练习流程
//
// Cloudflare 模式（仅 npm run dev:cloudflare 或显式 --mode cloudflare）：
//   - 使用 @cloudflare/vite-plugin 启动完整 Worker 环境
// ========================================

export default defineConfig(({ command, mode }) => {
  // 加载 .env.local 中的所有变量（第三个参数 '' = 不过滤前缀）
  const env = loadEnv(mode, process.cwd(), '')
  const legacyApiKey = env.AI_API_KEY || ''
  const configuredSpeechApiKey = env.DOUBAO_API_KEY || env.SPEECH_API_KEY || ''
  const arkKeyDetected = [configuredSpeechApiKey, env.ARK_API_KEY || '', legacyApiKey]
    .some(key => key.startsWith('ark-'))
  const doubaoApiKey = configuredSpeechApiKey.startsWith('ark-')
    ? ''
    : configuredSpeechApiKey
  const textApiKey = env.TEXT_AI_API_KEY
    || (!legacyApiKey.startsWith('ark-') ? legacyApiKey : '')
  const isLocalDev = command === 'serve' && mode !== 'cloudflare'

  return {
    plugins: [
      react(),
      ...(isLocalDev ? [doubaoRealtimeBridge({
        apiKey: doubaoApiKey,
        upstreamUrl: env.DOUBAO_REALTIME_URL,
        configurationError: !doubaoApiKey && arkKeyDetected
          ? '当前填写的 Key 与实时语音接口不匹配，请填写端到端实时语音 API Key。'
          : undefined,
      })] : []),
      ...(mode === 'cloudflare' ? [cloudflare()] : []),
    ],
    server: {
      // 本地测试阶段只监听本机，避免把携带密钥的开发代理暴露到局域网。
      host: '127.0.0.1',
      port: Number(env.VITE_DEV_PORT) || 5173,
      // 本地开发代理：前端直接 fetch /api/ai-chat，Vite 转发到 DeepSeek 并注入 key
      proxy: textApiKey ? {
        '/api/ai-chat': {
          target: env.AI_API_BASE || 'https://api.deepseek.com/v1/chat/completions',
          changeOrigin: true,
          rewrite: () => '/v1/chat/completions',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${textApiKey}`)
            })
          },
        },
        '/api/ai-score': {
          target: env.AI_API_BASE || 'https://api.deepseek.com/v1/chat/completions',
          changeOrigin: true,
          rewrite: () => '/v1/chat/completions',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${textApiKey}`)
            })
          },
        },
      } : undefined,
    },
  }
})
