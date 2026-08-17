import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

const DEFAULT_UPSTREAM_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_CONNECTIONS = 30
const DEFAULT_MAX_SESSION_MS = 45 * 60 * 1000
const KEEPALIVE_INTERVAL_MS = 25_000

function sendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

function redact(message, secrets) {
  let safe = String(message)
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join('[redacted]')
  }
  return safe.replace(/doubao|bytedance|volcengine|openspeech/gi, 'realtime-service')
}

function closeUpstream(socket) {
  if (!socket) return
  if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'browser closed')
  if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
}

function isSameOrigin(request) {
  const host = String(request.headers.host || '')
  const origin = String(request.headers.origin || '')
  if (!host || !origin) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function createWSProxy(httpServer, options) {
  const appId = options.appId?.trim() || ''
  const accessKey = options.accessKey?.trim() || ''
  const upstreamUrl = options.upstreamUrl?.trim() || DEFAULT_UPSTREAM_URL
  const maxConnections = options.maxConnections ?? DEFAULT_MAX_CONNECTIONS
  const maxSessionMs = options.maxSessionMs ?? DEFAULT_MAX_SESSION_MS
  const secrets = [appId, accessKey]
  let resolvedUpstreamUrl = upstreamUrl
  try {
    const parsed = new URL(upstreamUrl)
    if (parsed.protocol !== 'wss:' || parsed.hostname !== 'openspeech.bytedance.com') {
      resolvedUpstreamUrl = DEFAULT_UPSTREAM_URL
    }
  } catch {
    resolvedUpstreamUrl = DEFAULT_UPSTREAM_URL
  }

  let activeConnections = 0
  let started = false
  const browserServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  })

  function handleUpgrade(request, socket, head) {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
    const pathname = requestUrl.pathname
    if (pathname !== '/api/realtime-voice') return

    if (!isSameOrigin(request)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    browserServer.handleUpgrade(request, socket, head, (browserSocket) => {
      browserServer.emit('connection', browserSocket, request)
    })
  }

  browserServer.on('connection', (browserSocket) => {
    if (activeConnections >= maxConnections) {
      browserSocket.close(1013, 'server busy - please try again later')
      return
    }
    activeConnections += 1
    const connectionStartedAt = Date.now()
    let countedConnection = true
    const releaseConnection = () => {
      if (!countedConnection) return
      countedConnection = false
      activeConnections = Math.max(0, activeConnections - 1)
    }

    if (!appId || !accessKey) {
      sendJson(browserSocket, {
        type: 'local.error',
        code: 'REALTIME_NOT_CONFIGURED',
        message: 'Server real-time voice App ID or Access Token is not configured.',
      })
      browserSocket.close(1011, 'realtime credentials missing')
      releaseConnection()
      return
    }

    let upstreamSocket = null
    let browserClosed = false
    let browserAlive = true
    let upstreamAlive = true
    let keepaliveTimer = null
    const sessionLimitTimer = setTimeout(() => {
      sendJson(browserSocket, {
        type: 'local.error',
        code: 'SESSION_LIMIT',
        message: 'Interview session has reached the 45-minute limit.',
      })
      browserSocket.close(1000, 'session duration limit')
    }, maxSessionMs)
    sessionLimitTimer.unref?.()

    sendJson(browserSocket, { type: 'local.connecting' })

    try {
      upstreamSocket = new WebSocket(resolvedUpstreamUrl, {
        headers: {
          'X-Api-App-ID': appId,
          'X-Api-Access-Key': accessKey,
          'X-Api-Resource-Id': 'volc.speech.dialog',
          'X-Api-App-Key': 'PlgvMymc7f3tQnJ6',
          'X-Api-Connect-Id': randomUUID(),
        },
        handshakeTimeout: 12_000,
        maxPayload: 8 * 1024 * 1024,
        perMessageDeflate: false,
      })
    } catch (error) {
      sendJson(browserSocket, {
        type: 'local.error',
        code: 'UPSTREAM_CONNECT_FAILED',
        message: redact(error instanceof Error ? error.message : error, secrets),
      })
      browserSocket.close(1011, 'upstream connection failed')
      clearTimeout(sessionLimitTimer)
      releaseConnection()
      return
    }

    upstreamSocket.on('open', () => {
      sendJson(browserSocket, { type: 'local.connected' })

      browserSocket.on('pong', () => { browserAlive = true })
      upstreamSocket.on('pong', () => { upstreamAlive = true })
      keepaliveTimer = setInterval(() => {
        if (browserSocket.readyState === WebSocket.OPEN) {
          if (!browserAlive) browserSocket.terminate()
          else {
            browserAlive = false
            browserSocket.ping()
          }
        }
        if (upstreamSocket?.readyState === WebSocket.OPEN) {
          if (!upstreamAlive) upstreamSocket.terminate()
          else {
            upstreamAlive = false
            upstreamSocket.ping()
          }
        }
      }, KEEPALIVE_INTERVAL_MS)
      keepaliveTimer.unref?.()
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
        message: `Realtime voice service rejected connection (HTTP ${response.statusCode ?? 'unknown'}).`,
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
        message: redact(error.message, secrets),
      })
    })

    upstreamSocket.on('close', (code, reason) => {
      if (keepaliveTimer) clearInterval(keepaliveTimer)
      console.warn(`[wsProxy] upstream closed code=${code} durationMs=${Date.now() - connectionStartedAt} reason=${redact(reason.toString(), secrets) || 'none'}`)
      sendJson(browserSocket, {
        type: 'local.closed',
        code,
        reason: redact(reason.toString(), secrets),
      })
      if (!browserClosed && browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.close(code === 1000 ? 1000 : 1011, 'realtime connection closed')
      }
    })

    browserSocket.on('message', (data, isBinary) => {
      if (!isBinary) {
        browserSocket.close(1003, 'binary frames only')
        return
      }
      if (data.byteLength > MAX_MESSAGE_BYTES) {
        browserSocket.close(1009, 'message too large')
        return
      }
      if (!upstreamSocket || upstreamSocket.readyState !== WebSocket.OPEN) {
        sendJson(browserSocket, {
          type: 'local.error',
          code: 'UPSTREAM_NOT_READY',
          message: 'Realtime voice connection is not ready yet.',
        })
        return
      }
      upstreamSocket.send(data, { binary: true })
    })

    browserSocket.on('close', (code, reason) => {
      browserClosed = true
      clearTimeout(sessionLimitTimer)
      if (keepaliveTimer) clearInterval(keepaliveTimer)
      releaseConnection()
      closeUpstream(upstreamSocket)
      if (code !== 1000) {
        console.warn(`[wsProxy] browser closed code=${code} durationMs=${Date.now() - connectionStartedAt} reason=${redact(reason.toString(), secrets) || 'none'}`)
      }
    })

    browserSocket.on('error', () => {
      browserClosed = true
      clearTimeout(sessionLimitTimer)
      if (keepaliveTimer) clearInterval(keepaliveTimer)
      releaseConnection()
      closeUpstream(upstreamSocket)
    })
  })

  httpServer.on('upgrade', handleUpgrade)
  httpServer.once('close', () => {
    httpServer.off('upgrade', handleUpgrade)
    browserServer.close()
  })

  started = true
  console.log('[wsProxy] WebSocket proxy ready: /api/realtime-voice')

  return {
    close() {
      if (!started) return
      httpServer.off('upgrade', handleUpgrade)
      browserServer.close()
      started = false
    },
  }
}
