// ========================================
// WebSocket proxy: browser → Doubao real-time voice API
// Ported from local/doubaoRealtimeBridge.ts
// ========================================

import { WebSocketServer, WebSocket } from 'ws'

const DEFAULT_UPSTREAM_URL = 'wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue'
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024 // 2 MB
const DEFAULT_MAX_CONNECTIONS = 30
const DEFAULT_MAX_SESSION_MS = 45 * 60 * 1000 // 45 minutes

// ── helpers ──────────────────────────────────────────────

function sendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function redact(message, secret) {
  const withoutSecret = secret ? message.split(secret).join('[redacted]') : message
  return withoutSecret.replace(/doubao|bytedance|volcengine|openspeech/gi, 'realtime-service')
}

function closeUpstream(socket) {
  if (!socket) return
  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'session.close' }))
    } catch {
      // connection already going down
    }
    const timer = setTimeout(() => socket.close(1000, 'server closing'), 250)
    timer.unref?.()
    return
  }
  if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
}

// ── main export ──────────────────────────────────────────

/**
 * Attach a WebSocket proxy to an http.Server instance.
 *
 * @param {import('node:http').Server} httpServer
 * @param {object} options
 * @param {string} options.apiKey           - DOUBAO_SPEECH_API_KEY
 * @param {string} [options.upstreamUrl]    - Doubao realtime WS endpoint
 * @param {number} [options.maxConnections] - default 30
 * @param {number} [options.maxSessionMs]   - default 45 min
 * @returns {{ close: () => void }}
 */
export function createWSProxy(httpServer, options) {
  const apiKey = options.apiKey?.trim() || ''
  const upstreamUrl = options.upstreamUrl?.trim() || DEFAULT_UPSTREAM_URL
  const maxConnections = options.maxConnections ?? DEFAULT_MAX_CONNECTIONS
  const maxSessionMs = options.maxSessionMs ?? DEFAULT_MAX_SESSION_MS

  // Sanitise upstream URL — only allow known host
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
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
    if (pathname !== '/api/realtime-voice') return

    browserServer.handleUpgrade(request, socket, head, (browserSocket) => {
      browserServer.emit('connection', browserSocket, request)
    })
  }

  browserServer.on('connection', (browserSocket) => {
    // ── connection limiting ──
    if (activeConnections >= maxConnections) {
      browserSocket.close(1013, 'server busy — please try again later')
      return
    }
    activeConnections += 1
    let countedConnection = true
    const releaseConnection = () => {
      if (!countedConnection) return
      countedConnection = false
      activeConnections = Math.max(0, activeConnections - 1)
    }

    // ── missing key ──
    if (!apiKey) {
      sendJson(browserSocket, {
        type: 'local.error',
        code: 'REALTIME_NOT_CONFIGURED',
        message: 'Server real-time voice API key is not configured.',
      })
      browserSocket.close(1011, 'realtime api key missing')
      releaseConnection()
      return
    }

    let upstreamSocket = null
    let browserClosed = false

    // ── session time limit ──
    const sessionLimitTimer = setTimeout(() => {
      sendJson(browserSocket, {
        type: 'local.error',
        code: 'SESSION_LIMIT',
        message: 'Interview session has reached the 45-minute limit.',
      })
      browserSocket.close(1000, 'session duration limit')
    }, maxSessionMs)
    sessionLimitTimer.unref?.()

    // ── tell browser we're connecting ──
    sendJson(browserSocket, { type: 'local.connecting' })

    // ── open upstream to Doubao ──
    try {
      upstreamSocket = new WebSocket(resolvedUpstreamUrl, {
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

    // ── upstream → browser ──
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

    // ── browser → upstream ──
    browserSocket.on('message', (data, isBinary) => {
      if (isBinary) {
        browserSocket.close(1003, 'text frames only')
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

    // ── browser disconnect ──
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

  // ── attach to HTTP server ──
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
