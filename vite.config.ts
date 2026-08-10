import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { doubaoRealtimeBridge } from './local/doubaoRealtimeBridge'
import { deepseekReportBridge } from './local/deepseekReportBridge'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const doubaoAppId = env.DOUBAO_APP_ID || ''
  const doubaoAccessKey = env.DOUBAO_ACCESS_KEY || ''
  const reportProvider = env.REPORT_PROVIDER || 'deepseek'
  const reportApiKey = env.REPORT_API_KEY || env.DEEPSEEK_API_KEY || ''
  const reportModel = env.REPORT_MODEL || env.DEEPSEEK_MODEL || 'deepseek-v4-pro'
  const isLocalDev = command === 'serve'

  return {
    plugins: [
      react(),
      ...(isLocalDev ? [deepseekReportBridge({
        apiKey: reportApiKey,
        model: reportModel,
        baseUrl: env.REPORT_BASE_URL || env.DEEPSEEK_BASE_URL,
        provider: reportProvider,
        supportsJsonMode: env.REPORT_SUPPORTS_JSON_MODE !== 'false',
        supportsReasoningOptions: env.REPORT_SUPPORTS_REASONING_OPTIONS
          ? env.REPORT_SUPPORTS_REASONING_OPTIONS !== 'false'
          : reportProvider === 'deepseek',
      })] : []),
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
