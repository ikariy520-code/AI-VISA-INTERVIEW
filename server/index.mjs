// ========================================
// AI Visa Interview — Production Server
//
// Responsibilities:
//   1. Serve Vite-built static files (dist/) with SPA fallback
//   2. WebSocket proxy  /api/realtime-voice → Doubao
//   3. Final report     /api/ai-report → DeepSeek constrained evaluator
//   4. Health checks    /api/realtime-health, /api/report-health
// ========================================

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import { createWSProxy } from './wsProxy.mjs'
import { createInviteAuth } from './inviteAuth.mjs'
import { createReportHandler } from './reportApi.mjs'

// ── config ───────────────────────────────────────────────

dotenv.config({
  path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
})

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0')
const DIST_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'dist')

const DOUBAO_APP_ID = process.env.DOUBAO_APP_ID || ''
const DOUBAO_ACCESS_KEY = process.env.DOUBAO_ACCESS_KEY || ''
const UPSTREAM_URL = process.env.DOUBAO_REALTIME_URL || undefined
const WS_MAX_CONNECTIONS = Number(process.env.WS_MAX_CONNECTIONS) || 30

const INVITE_CODES = process.env.INVITE_CODES || ''
const INVITE_SESSION_SECRET = process.env.INVITE_SESSION_SECRET || ''

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || ''

// ── MIME map ─────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

function mimeType(filepath) {
  return MIME[extname(filepath).toLowerCase()] || 'application/octet-stream'
}

// ── static file serving ──────────────────────────────────

const ASSETS_PREFIX = '/assets/'

async function serveStatic(req, res) {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname
  // Only handle GET / HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') return false

  // Normalise away path traversal
  const safePath = normalize(pathname).replace(/^\/+/, '')
  const filePath = join(DIST_DIR, safePath)

  // Don't serve outside dist/
  if (!filePath.startsWith(DIST_DIR)) return false

  try {
    const st = await stat(filePath)
    if (!st.isFile()) return false

    const isAsset = pathname.startsWith(ASSETS_PREFIX)
    res.statusCode = 200
    res.setHeader('Content-Type', mimeType(filePath))
    res.setHeader(
      'Cache-Control',
      isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    )

    if (req.method === 'HEAD') {
      res.end()
      return true
    }

    const stream = createReadStream(filePath)
    stream.pipe(res)
    stream.on('error', () => {
      if (!res.headersSent) {
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    })
    return true
  } catch {
    return false // not found / not a file — fall through to SPA fallback
  }
}

async function serveIndexFallback(res) {
  try {
    const html = await readFile(join(DIST_DIR, 'index.html'), 'utf8')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(html)
  } catch {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain')
    res.end('Missing dist/index.html — run "npm run build" first.\n')
  }
}

// ── health endpoint ──────────────────────────────────────

function handleHealth(_req, res) {
  const ok = Boolean(DOUBAO_APP_ID && DOUBAO_ACCESS_KEY)
  res.statusCode = ok ? 200 : 503
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(
    JSON.stringify({
      ok,
      provider: 'realtime-voice',
      ...(ok ? {} : {
        code: 'REALTIME_NOT_CONFIGURED',
        message: 'Realtime voice App ID or Access Token is not configured.',
      }),
    }),
  )
}

// ── main ─────────────────────────────────────────────────

async function main() {
  // Validate build exists
  try {
    await stat(join(DIST_DIR, 'index.html'))
  } catch {
    console.error('[server] ❌ dist/index.html not found. Run "npm run build" first.')
    process.exit(1)
  }

  const inviteAuth = createInviteAuth({
    codes: INVITE_CODES,
    sessionSecret: INVITE_SESSION_SECRET,
    secureCookies: process.env.NODE_ENV === 'production',
  })
  const reportHandler = createReportHandler({
    apiKey: DEEPSEEK_API_KEY,
    model: DEEPSEEK_MODEL,
    baseUrl: DEEPSEEK_BASE_URL,
  })

  const server = createServer(async (req, res) => {
    try {
      const pathname = req.url?.split('?')[0] ?? ''
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')

      const authHandled = await inviteAuth.handleRequest(req, res, pathname)
      if (authHandled) return

      // ── API routes ──
      if (pathname.startsWith('/api/') && !inviteAuth.isAuthorized(req)) {
        return inviteAuth.unauthorized(res)
      }

      if (pathname === '/api/realtime-health' && (req.method === 'GET' || req.method === 'HEAD')) {
        return handleHealth(req, res)
      }

      if (await reportHandler(req, res)) return

      // ── Static files + SPA fallback ──
      const served = await serveStatic(req, res)
      if (served) return

      // SPA fallback for everything else (GET/HEAD only)
      if (req.method === 'GET' || req.method === 'HEAD') {
        return await serveIndexFallback(res)
      }

      // Unhandled
      res.statusCode = 405
      res.setHeader('Content-Type', 'text/plain')
      res.end('Method Not Allowed\n')
    } catch (error) {
      console.error('[server] request error:', error)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'text/plain')
        res.end('Internal Server Error\n')
      }
    }
  })

  // ── WebSocket proxy ──
  const wsProxy = createWSProxy(server, {
    appId: DOUBAO_APP_ID,
    accessKey: DOUBAO_ACCESS_KEY,
    upstreamUrl: UPSTREAM_URL,
    maxConnections: WS_MAX_CONNECTIONS,
    isAuthorized: inviteAuth.isAuthorized,
  })

  // ── graceful shutdown ──
  function shutdown() {
    console.log('\n[server] Shutting down…')
    wsProxy.close()
    server.close(() => {
      console.log('[server] Closed.')
      process.exit(0)
    })
    setTimeout(() => {
      console.error('[server] Forced exit after timeout.')
      process.exit(1)
    }, 10_000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // ── listen ──
  server.listen(PORT, HOST, () => {
    console.log(`[server] AI Visa Interview running at http://${HOST}:${PORT}`)
    console.log(`[server] Static files: ${DIST_DIR}`)
    console.log(`[server] WebSocket   : ws://${HOST}:${PORT}/api/realtime-voice (max ${WS_MAX_CONNECTIONS} connections)`)
    console.log(`[server] Health      : http://${HOST}:${PORT}/api/realtime-health`)
    console.log(`[server] AI report   : ${reportHandler.configured ? `DeepSeek ${reportHandler.model}` : 'NOT CONFIGURED'} at /api/ai-report`)
    console.log(`[server] Invite gate : ${inviteAuth.configured ? 'enabled' : 'NOT CONFIGURED'}`)
  })
}

main().catch((err) => {
  console.error('[server] Fatal:', err)
  process.exit(1)
})
