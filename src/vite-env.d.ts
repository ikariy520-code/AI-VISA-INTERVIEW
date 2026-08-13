/// <reference types="vite/client" />

type DesktopVoiceProvider = 'doubao' | 'gemini' | 'openai'
type DesktopReportProvider = 'deepseek' | 'openai' | 'custom'

interface DesktopPublicConfig {
  version: number
  isConfigured: boolean
  voice: {
    provider: DesktopVoiceProvider
    model: string
    voice: string
    doubaoEndpoint: string
  }
  report: {
    provider: DesktopReportProvider
    apiBaseUrl: string
    model: string
    supportsJsonMode: boolean
    supportsReasoningOptions: boolean
  }
  credentials: {
    hasDoubaoAppId: boolean
    hasDoubaoAccessKey: boolean
    hasGeminiApiKey: boolean
    hasOpenAIApiKey: boolean
    hasReportApiKey: boolean
  }
}

interface DesktopConfigInput {
  voice: DesktopPublicConfig['voice']
  report: DesktopPublicConfig['report']
  secrets: {
    doubaoAppId?: string
    doubaoAccessKey?: string
    geminiApiKey?: string
    openaiApiKey?: string
    reportApiKey?: string
  }
}

interface DesktopBridge {
  platform: string
  getConfig: () => Promise<DesktopPublicConfig>
  saveConfig: (config: DesktopConfigInput) => Promise<DesktopPublicConfig>
  resetConfig: () => Promise<boolean>
  onOpenSettings: (callback: () => void) => () => void
}

interface Window {
  desktopBridge?: DesktopBridge
}
