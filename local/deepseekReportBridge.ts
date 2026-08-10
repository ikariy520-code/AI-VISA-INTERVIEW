import type { Plugin, ViteDevServer } from 'vite'
import { createReportHandler } from '../server/reportApi.mjs'

interface DeepSeekReportBridgeOptions {
  apiKey: string
  model: string
  baseUrl?: string
  provider?: string
  supportsJsonMode?: boolean
  supportsReasoningOptions?: boolean
}

export function deepseekReportBridge(options: DeepSeekReportBridgeOptions): Plugin {
  const handleReport = createReportHandler(options)

  return {
    name: 'model-neutral-final-report-local-bridge',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request, response, next) => {
        try {
          if (await handleReport(request, response)) return
          next()
        } catch (error) {
          next(error as Error)
        }
      })
      server.config.logger.info('模型无关最终报告桥接已启用：/api/ai-report')
    },
  }
}
