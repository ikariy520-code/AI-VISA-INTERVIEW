import { lookup } from 'node:dns/promises'
import tls from 'node:tls'

const targets = {
  doubao: { host: 'openspeech.bytedance.com', port: 443 },
  gemini: { host: 'generativelanguage.googleapis.com', port: 443 },
  openai: { host: 'api.openai.com', port: 443 },
}

const providerArgument = process.argv.find((value, index) => process.argv[index - 1] === '--provider') || 'all'
const selected = providerArgument === 'all'
  ? Object.entries(targets)
  : targets[providerArgument]
    ? [[providerArgument, targets[providerArgument]]]
    : []

if (!selected.length) {
  console.error(`Unknown provider: ${providerArgument}. Use doubao, gemini, openai, or all.`)
  process.exitCode = 2
} else {
  const results = await Promise.all(selected.map(async ([provider, target]) => {
    const startedAt = Date.now()
    let addresses
    try {
      addresses = await lookup(target.host, { all: true })
    } catch (error) {
      return {
        provider,
        status: 'DNS_UNREACHABLE',
        host: target.host,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    try {
      const connection = await new Promise((resolve, reject) => {
        const socket = tls.connect({
          host: target.host,
          port: target.port,
          servername: target.host,
          rejectUnauthorized: true,
          autoSelectFamily: true,
          autoSelectFamilyAttemptTimeout: 300,
        })
        const timeout = setTimeout(() => socket.destroy(new Error('TLS connection timed out')), 8_000)
        socket.once('secureConnect', () => {
          clearTimeout(timeout)
          const certificate = socket.getPeerCertificate()
          const protocol = socket.getProtocol()
          socket.end()
          resolve({ certificateExpires: certificate.valid_to, protocol })
        })
        socket.once('error', error => {
          clearTimeout(timeout)
          reject(error)
        })
      })
      return {
        provider,
        status: 'NETWORK_REACHABLE_AUTH_NOT_TESTED',
        host: target.host,
        addresses: addresses.map(address => address.address),
        latencyMs: Date.now() - startedAt,
        ...connection,
      }
    } catch (error) {
      return {
        provider,
        status: 'DNS_REACHABLE_TLS_UNREACHABLE',
        host: target.host,
        addresses: addresses.map(address => address.address),
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }))

  for (const result of results) console.log(JSON.stringify(result))
  console.log('This check uses no API key and incurs no model usage. It does not verify authentication, model access, quota, or audio round trips.')
  if (results.some(result => result.status !== 'NETWORK_REACHABLE_AUTH_NOT_TESTED')) process.exitCode = 1
}
