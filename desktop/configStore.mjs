import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const CONFIG_VERSION = 1
const DEFAULT_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  voice: {
    provider: 'doubao',
    model: '',
    voice: 'zh_female_vv_jupiter_bigtts',
    doubaoEndpoint: '',
  },
  report: {
    provider: 'deepseek',
    apiBaseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    supportsJsonMode: true,
    supportsReasoningOptions: true,
  },
  secrets: {},
})

function configPath() {
  return join(app.getPath('userData'), 'desktop-config.json')
}

function text(value, maximum = 512) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, maximum)
    : ''
}

function voiceProvider(value) {
  return ['doubao', 'gemini', 'openai'].includes(value) ? value : 'doubao'
}

function reportProvider(value) {
  return ['deepseek', 'openai', 'custom'].includes(value) ? value : 'deepseek'
}

function validReportBaseUrl(value, fallback) {
  const candidate = text(value, 1_024) || fallback
  try {
    const url = new URL(candidate)
    const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !localHttp) {
      throw new Error('报告模型 API 地址必须使用 HTTPS；本机 localhost 接口可使用 HTTP。')
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    if (!candidate || candidate === fallback) return fallback
    throw new Error('报告模型 API 地址无效；远程接口请填写 HTTPS 地址。')
  }
}

function validRealtimeEndpoint(value) {
  const candidate = text(value, 1_024)
  if (!candidate) return ''
  try {
    const url = new URL(candidate)
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.replace(/^\[|\]$/g, ''))
    if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) {
      throw new Error('INVALID_REALTIME_PROTOCOL')
    }
    return url.toString()
  } catch {
    throw new Error('豆包实时语音地址无效；远程接口请填写 WSS 地址，本机接口可使用 WS。')
  }
}

function decrypt(value) {
  if (typeof value !== 'string' || !value) return ''
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

function encrypt(value) {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows 系统加密存储当前不可用，密钥没有保存。')
  }
  return safeStorage.encryptString(value).toString('base64')
}

function normalizeStoredConfig(raw = {}) {
  const voice = raw.voice && typeof raw.voice === 'object' ? raw.voice : {}
  const report = raw.report && typeof raw.report === 'object' ? raw.report : {}
  const secrets = raw.secrets && typeof raw.secrets === 'object' ? raw.secrets : {}
  const provider = voiceProvider(text(voice.provider, 32).toLowerCase())
  const reportKind = reportProvider(text(report.provider, 32).toLowerCase())
  const reportFallback = reportKind === 'openai' ? 'https://api.openai.com/v1' : 'https://api.deepseek.com'

  return {
    version: CONFIG_VERSION,
    voice: {
      provider,
      model: text(voice.model, 160),
      voice: text(voice.voice, 80) || (provider === 'doubao'
        ? 'zh_female_vv_jupiter_bigtts'
        : provider === 'gemini' ? 'Kore' : 'marin'),
      doubaoEndpoint: validRealtimeEndpoint(voice.doubaoEndpoint),
    },
    report: {
      provider: reportKind,
      apiBaseUrl: validReportBaseUrl(report.apiBaseUrl, reportFallback),
      model: text(report.model, 160),
      supportsJsonMode: report.supportsJsonMode !== false,
      supportsReasoningOptions: report.supportsReasoningOptions === true,
    },
    secrets: {
      doubaoAppId: text(secrets.doubaoAppId, 8_192),
      doubaoAccessKey: text(secrets.doubaoAccessKey, 8_192),
      geminiApiKey: text(secrets.geminiApiKey, 8_192),
      openaiApiKey: text(secrets.openaiApiKey, 8_192),
      reportApiKey: text(secrets.reportApiKey, 8_192),
    },
  }
}

async function readStoredConfig() {
  try {
    const payload = JSON.parse(await readFile(configPath(), 'utf8'))
    return normalizeStoredConfig(payload)
  } catch {
    return normalizeStoredConfig(DEFAULT_CONFIG)
  }
}

function revealSecrets(config) {
  return {
    ...config,
    secrets: Object.fromEntries(
      Object.entries(config.secrets).map(([key, value]) => [key, decrypt(value)]),
    ),
  }
}

function providerCredentialsComplete(config) {
  if (config.voice.provider === 'doubao') {
    return Boolean(config.secrets.doubaoAppId && config.secrets.doubaoAccessKey)
  }
  if (config.voice.provider === 'gemini') return Boolean(config.secrets.geminiApiKey)
  return Boolean(config.secrets.openaiApiKey)
}

function reportCredentialsComplete(config) {
  if (!config.report.model || !config.report.apiBaseUrl) return false
  const url = new URL(config.report.apiBaseUrl)
  const loopback = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  return loopback || Boolean(config.secrets.reportApiKey)
}

function publicConfig(config) {
  return {
    version: CONFIG_VERSION,
    isConfigured: providerCredentialsComplete(config)
      && reportCredentialsComplete(config),
    voice: config.voice,
    report: config.report,
    credentials: {
      hasDoubaoAppId: Boolean(config.secrets.doubaoAppId),
      hasDoubaoAccessKey: Boolean(config.secrets.doubaoAccessKey),
      hasGeminiApiKey: Boolean(config.secrets.geminiApiKey),
      hasOpenAIApiKey: Boolean(config.secrets.openaiApiKey),
      hasReportApiKey: Boolean(config.secrets.reportApiKey),
    },
  }
}

export async function getDesktopConfig() {
  return publicConfig(revealSecrets(await readStoredConfig()))
}

export async function getDesktopRuntimeEnv() {
  const config = revealSecrets(await readStoredConfig())
  return {
    LOCAL_DESKTOP_MODE: 'true',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '0',
    VOICE_PROVIDER: config.voice.provider,
    DOUBAO_APP_ID: config.secrets.doubaoAppId,
    DOUBAO_ACCESS_KEY: config.secrets.doubaoAccessKey,
    DOUBAO_REALTIME_URL: config.voice.doubaoEndpoint,
    GEMINI_API_KEY: config.secrets.geminiApiKey,
    GEMINI_LIVE_MODEL: config.voice.provider === 'gemini' ? config.voice.model : '',
    GEMINI_LIVE_VOICE: config.voice.provider === 'gemini' ? config.voice.voice : '',
    OPENAI_API_KEY: config.secrets.openaiApiKey,
    OPENAI_REALTIME_MODEL: config.voice.provider === 'openai' ? config.voice.model : '',
    OPENAI_REALTIME_VOICE: config.voice.provider === 'openai' ? config.voice.voice : '',
    REPORT_PROVIDER: config.report.provider,
    REPORT_API_KEY: config.secrets.reportApiKey,
    REPORT_MODEL: config.report.model,
    REPORT_BASE_URL: config.report.apiBaseUrl,
    REPORT_SUPPORTS_JSON_MODE: String(config.report.supportsJsonMode),
    REPORT_SUPPORTS_REASONING_OPTIONS: String(config.report.supportsReasoningOptions),
  }
}

export async function saveDesktopConfig(input = {}) {
  const stored = await readStoredConfig()
  const current = revealSecrets(stored)
  const voice = input.voice && typeof input.voice === 'object' ? input.voice : {}
  const report = input.report && typeof input.report === 'object' ? input.report : {}
  const suppliedSecrets = input.secrets && typeof input.secrets === 'object' ? input.secrets : {}
  const provider = voiceProvider(text(voice.provider, 32).toLowerCase())
  const reportKind = reportProvider(text(report.provider, 32).toLowerCase())
  const fallbackUrl = reportKind === 'openai' ? 'https://api.openai.com/v1' : 'https://api.deepseek.com'

  const keepOrReplace = key => text(suppliedSecrets[key], 8_192) || current.secrets[key] || ''
  const nextPlain = {
    version: CONFIG_VERSION,
    voice: {
      provider,
      model: text(voice.model, 160),
      voice: text(voice.voice, 80) || (provider === 'doubao'
        ? 'zh_female_vv_jupiter_bigtts'
        : provider === 'gemini' ? 'Kore' : 'marin'),
      doubaoEndpoint: validRealtimeEndpoint(voice.doubaoEndpoint),
    },
    report: {
      provider: reportKind,
      apiBaseUrl: validReportBaseUrl(report.apiBaseUrl, fallbackUrl),
      model: text(report.model, 160),
      supportsJsonMode: report.supportsJsonMode !== false,
      supportsReasoningOptions: report.supportsReasoningOptions === true,
    },
    secrets: {
      doubaoAppId: keepOrReplace('doubaoAppId'),
      doubaoAccessKey: keepOrReplace('doubaoAccessKey'),
      geminiApiKey: keepOrReplace('geminiApiKey'),
      openaiApiKey: keepOrReplace('openaiApiKey'),
      reportApiKey: keepOrReplace('reportApiKey'),
    },
  }

  if (!providerCredentialsComplete(nextPlain)) {
    throw new Error('请完整填写当前语音供应商所需的鉴权信息。')
  }
  if (!reportCredentialsComplete(nextPlain)) {
    throw new Error('请完整填写报告模型的模型名、API 地址；远程接口还需要 API Key。')
  }

  const payload = {
    ...nextPlain,
    secrets: Object.fromEntries(
      Object.entries(nextPlain.secrets).map(([key, value]) => [key, encrypt(value)]),
    ),
  }
  const target = configPath()
  const temporary = `${target}.tmp`
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, target)
  return publicConfig(nextPlain)
}

export async function removeDesktopConfig() {
  const target = configPath()
  try {
    await unlink(target)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}
