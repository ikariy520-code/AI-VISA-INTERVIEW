import type { Plugin, ViteDevServer } from 'vite'
import WebSocket, { WebSocketServer } from 'ws'

const LOCAL_WS_PATH = '/api/realtime-voice'
const HEALTH_PATH = '/api/realtime-health'
const DEFAULT_UPSTREAM_URL = 'wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue'
const MAX_CLIENT_MESSAGE_BYTES = 2 * 1024 * 1024
const MAX_LOCAL_CONNECTIONS = 2
const MAX_SESSION_DURATION_MS = 45 * 60 * 1000

interface DoubaoRealtimeBridgeOptions {
  apiKey: string
  upstreamUrl?: string
  configurationError?: string
}

function sendJson(socket: WebSocket, payload: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function redact(message: string, secret: string) {
  const withoutSecret = secret ? message.split(secret).join('[redacted]') : message
  return withoutSecret.replace(/doubao|bytedance|volcengine|openspeech/gi, 'realtime-service')
}

function closeUpstream(socket: WebSocket | null) {
  if (!socket) return
  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'session.close' }))
    } catch {
      // The connection is already on its way down.
    }
    const timer = setTimeout(() => socket.close(1000, 'local client closed'), 250)
    timer.unref?.()
    return
  }
  if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
}

export function doubaoRealtimeBridge(options: DoubaoRealtimeBridgeOptions): Plugin {
  const apiKey = options.apiKey.trim()
  const configurationError = options.configurationError?.trim()
  const configuredUpstreamUrl = options.upstreamUrl?.trim() || DEFAULT_UPSTREAM_URL
  const parsedUpstreamUrl = new URL(configuredUpstreamUrl)
  const upstreamUrl = parsedUpstreamUrl.protocol === 'wss:'
    && parsedUpstreamUrl.hostname === 'openspeech.bytedance.com'
    ? configuredUpstreamUrl
    : DEFAULT_UPSTREAM_URL
  let activeLocalConnections = 0

  return {
    name: 'doubao-realtime-local-bridge',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0]
        if (pathname !== HEALTH_PATH) {
          next()
          return
        }

        response.statusCode = apiKey ? 200 : 503
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify({
          ok: Boolean(apiKey),
          provider: 'realtime-voice',
          mode: 'local-only',
          ...(!apiKey ? {
            code: configurationError ? 'REALTIME_KEY_REQUIRED' : 'REALTIME_NOT_CONFIGURED',
            message: configurationError || '尚未配置端到端实时语音 API Key。',
          } : {}),
        }))
      })

      const httpServer = server.httpServer
      if (!httpServer) return

      const browserServer = new WebSocketServer({
        noServer: true,
        maxPayload: MAX_CLIENT_MESSAGE_BYTES,
        perMessageDeflate: false,
      })

      const handleUpgrade = (request: any, socket: any, head: Buffer) => {
        const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
        if (pathname !== LOCAL_WS_PATH) return

        const host = String(request.headers.host || '')
        const origin = String(request.headers.origin || '')
        let originAllowed = false
        try {
          const hostUrl = new URL(`http://${host}`)
          const originUrl = new URL(origin)
          const isLoopback = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostUrl.hostname)
          originAllowed = isLoopback && originUrl.host === hostUrl.host
        } catch {
          originAllowed = false
        }

        if (!originAllowed) {
          socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }

        browserServer.handleUpgrade(request, socket, head, (browserSocket) => {
          browserServer.emit('connection', browserSocket, request)
        })
      }

      httpServer.on('upgrade', handleUpgrade)
      httpServer.once('close', () => {
        httpServer.off('upgrade', handleUpgrade)
        browserServer.close()
      })

      browserServer.on('connection', (browserSocket) => {
        if (activeLocalConnections >= MAX_LOCAL_CONNECTIONS) {
          browserSocket.close(1013, 'too many local realtime connections')
          return
        }
        activeLocalConnections += 1
        let countedConnection = true
        const releaseConnection = () => {
          if (!countedConnection) return
          countedConnection = false
          activeLocalConnections = Math.max(0, activeLocalConnections - 1)
        }

        if (!apiKey) {
          sendJson(browserSocket, {
            type: 'local.error',
            code: configurationError ? 'REALTIME_KEY_REQUIRED' : 'REALTIME_NOT_CONFIGURED',
            message: configurationError || '本地未配置端到端实时语音 API Key，请检查 .env.local。',
          })
          browserSocket.close(1011, 'realtime api key is missing')
          releaseConnection()
          return
        }

        let upstreamSocket: WebSocket | null = null
        let browserClosed = false
        const sessionLimitTimer = setTimeout(() => {
          sendJson(browserSocket, {
            type: 'local.error',
            code: 'LOCAL_SESSION_LIMIT',
            message: '单次本地实时面签已达到 45 分钟，请结束后重新开始。',
          })
          browserSocket.close(1000, 'local session duration limit')
        }, MAX_SESSION_DURATION_MS)
        sessionLimitTimer.unref?.()

        sendJson(browserSocket, { type: 'local.connecting' })

        try {
          upstreamSocket = new WebSocket(upstreamUrl, {
            headers: { 'X-Api-Key': apiKey },
            handshakeTimeout: 12_000,
            maxPayload: 8 * 1024 * 1024,
            perMessageDeflate: false,
          })
        } catch (error) {
          sendJson(browserSocket, {
            type: 'local.error',
            code: 'UPSTREAM_CONNECT_FAILED',
            message: redact(error instanceof Error ? error.message : String(error), apiKey),
          })
          browserSocket.close(1011, 'upstream connection failed')
          clearTimeout(sessionLimitTimer)
          releaseConnection()
          return
        }

        upstreamSocket.on('open', () => {
          sendJson(browserSocket, { type: 'local.connected' })
        })

        upstreamSocket.on('message', (data, isBinary) => {
          if (browserSocket.readyState !== WebSocket.OPEN) return
          browserSocket.send(data, { binary: isBinary })
        })

        upstreamSocket.on('unexpected-response', (_request, response) => {
          sendJson(browserSocket, {
            type: 'local.error',
            code: 'UPSTREAM_HANDSHAKE_REJECTED',
            status: response.statusCode,
            message: `实时语音服务拒绝了连接（HTTP ${response.statusCode ?? 'unknown'}）。`,
          })
          response.resume()
          upstreamSocket?.terminate()
          if (browserSocket.readyState === WebSocket.OPEN) {
            browserSocket.close(1011, 'realtime handshake rejected')
          }
        })

        upstreamSocket.on('error', (error) => {
          sendJson(browserSocket, {
            type: 'local.error',
            code: 'UPSTREAM_ERROR',
            message: redact(error.message, apiKey),
          })
        })

        upstreamSocket.on('close', (code, reason) => {
          sendJson(browserSocket, {
            type: 'local.closed',
            code,
            reason: redact(reason.toString(), apiKey),
          })
          if (!browserClosed && browserSocket.readyState === WebSocket.OPEN) {
            browserSocket.close(code === 1000 ? 1000 : 1011, 'realtime connection closed')
          }
        })

        browserSocket.on('message', (data, isBinary) => {
          if (isBinary) {
            browserSocket.close(1003, 'text frames only')
            return
          }
          if (data.byteLength > MAX_CLIENT_MESSAGE_BYTES) {
            browserSocket.close(1009, 'message too large')
            return
          }
          if (!upstreamSocket || upstreamSocket.readyState !== WebSocket.OPEN) {
            sendJson(browserSocket, {
              type: 'local.error',
              code: 'UPSTREAM_NOT_READY',
              message: '实时语音连接尚未就绪。',
            })
            return
          }

          const text = data.toString('utf8')
          try {
            const event = JSON.parse(text)
            if (!event || typeof event.type !== 'string' || event.type.startsWith('local.')) {
              throw new Error('invalid realtime event')
            }
          } catch {
            browserSocket.close(1007, 'invalid json event')
            return
          }
          upstreamSocket.send(text)
        })

        browserSocket.on('close', () => {
          browserClosed = true
          clearTimeout(sessionLimitTimer)
          releaseConnection()
          closeUpstream(upstreamSocket)
        })

        browserSocket.on('error', () => {
          browserClosed = true
          clearTimeout(sessionLimitTimer)
          releaseConnection()
          closeUpstream(upstreamSocket)
        })
      })

      server.config.logger.info('实时语音本地桥接已启用：/api/realtime-voice')
    },
  }
}
