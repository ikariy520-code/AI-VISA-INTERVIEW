import { isIP } from 'node:net'
import net from 'node:net'
import tls from 'node:tls'

const DEFAULT_VOICE_ENDPOINTS = Object.freeze({
  doubao: 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue',
  gemini: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com',
})

function normalizedHost(url) {
  return url.hostname.replace(/^\[|\]$/g, '')
}

function safeEndpoint(value, label) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error('UNSUPPORTED_PROTOCOL')
    const host = normalizedHost(url)
    const loopback = ['127.0.0.1', '::1', 'localhost'].includes(host)
    if (['http:', 'ws:'].includes(url.protocol) && !loopback) throw new Error('INSECURE_REMOTE_ENDPOINT')
    return { label, url }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    throw new Error(code === 'INSECURE_REMOTE_ENDPOINT'
      ? `${label}的远程地址必须使用 HTTPS 或 WSS。`
      : `${label}地址无效。`)
  }
}

export function resolveDiagnosticTargets(input = {}) {
  const voice = input.voice && typeof input.voice === 'object' ? input.voice : {}
  const report = input.report && typeof input.report === 'object' ? input.report : {}
  const provider = ['doubao', 'gemini', 'openai'].includes(voice.provider) ? voice.provider : 'doubao'
  const voiceEndpoint = provider === 'doubao' && String(voice.doubaoEndpoint || '').trim()
    ? voice.doubaoEndpoint
    : DEFAULT_VOICE_ENDPOINTS[provider]

  return [
    { id: 'voice', provider, ...safeEndpoint(voiceEndpoint, '实时语音服务') },
    { id: 'report', provider: String(report.provider || 'custom'), ...safeEndpoint(report.apiBaseUrl, '报告模型服务') },
  ]
}

function failureMessage(error) {
  const code = error && typeof error === 'object' ? String(error.code || error.message || '') : ''
  if (code.includes('TIMEOUT')) return '连接超时，请检查网络、代理或防火墙。'
  if (code.includes('ENOTFOUND') || code.includes('EAI_AGAIN')) return '域名无法解析，请检查 DNS 或网络。'
  if (code.includes('ECONNREFUSED')) return '目标地址拒绝连接，请确认服务已启动且端口正确。'
  if (code.includes('CERT_')) return 'TLS 证书校验失败，请检查系统时间或代理证书。'
  return '无法建立网络连接，请检查地址、网络或防火墙。'
}

export async function diagnoseEndpoint(target, timeoutMs = 6_000) {
  const startedAt = Date.now()
  const secure = target.url.protocol === 'https:' || target.url.protocol === 'wss:'
  const host = normalizedHost(target.url)
  const port = Number(target.url.port) || (secure ? 443 : 80)

  try {
    await new Promise((resolve, reject) => {
      let settled = false
      const finish = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.removeAllListeners()
        socket.destroy()
        if (error) reject(error)
        else resolve()
      }
      const options = secure
        ? { host, port, rejectUnauthorized: true, ...(isIP(host) ? {} : { servername: host }) }
        : { host, port }
      const socket = secure ? tls.connect(options) : net.connect(options)
      const readyEvent = secure ? 'secureConnect' : 'connect'
      const timer = setTimeout(() => finish(Object.assign(new Error('NETWORK_TIMEOUT'), { code: 'NETWORK_TIMEOUT' })), timeoutMs)
      socket.once(readyEvent, () => finish())
      socket.once('error', finish)
    })
    return {
      id: target.id,
      provider: target.provider,
      label: target.label,
      host,
      reachable: true,
      latencyMs: Date.now() - startedAt,
      message: '网络可达；此检查不验证 API Key、模型权限或余额。',
    }
  } catch (error) {
    return {
      id: target.id,
      provider: target.provider,
      label: target.label,
      host,
      reachable: false,
      latencyMs: Date.now() - startedAt,
      message: failureMessage(error),
    }
  }
}

export async function testDesktopNetwork(input) {
  const targets = resolveDiagnosticTargets(input)
  const results = await Promise.all(targets.map(target => diagnoseEndpoint(target)))
  return {
    checkedAt: new Date().toISOString(),
    ok: results.every(result => result.reachable),
    results,
  }
}
