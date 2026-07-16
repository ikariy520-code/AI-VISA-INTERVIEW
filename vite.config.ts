import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { doubaoRealtimeBridge } from './local/doubaoRealtimeBridge'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const doubaoAppId = env.DOUBAO_APP_ID || ''
  const doubaoAccessKey = env.DOUBAO_ACCESS_KEY || ''
  const isLocalDev = command === 'serve'

  return {
    plugins: [
      react(),
      ...(isLocalDev ? [doubaoRealtimeBridge({
        appId: doubaoAppId,
        accessKey: doubaoAccessKey,
        upstreamUrl: env.DOUBAO_REALTIME_URL,
        configurationError: !doubaoAppId || !doubaoAccessKey
          ? '请配置端到端实时语音的 App ID 和 Access Token。'
          : undefined,
      })] : []),
    ],
    server: {
      host: '127.0.0.1',
      port: Number(env.VITE_DEV_PORT) || 5173,
    },
  }
})
