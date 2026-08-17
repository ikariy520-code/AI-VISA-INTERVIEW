// ========================================
// AI Visa Interview — Production Server
//
// Responsibilities:
//   1. Serve Vite-built static files (dist/) with SPA fallback
//   2. WebSocket proxy  /api/realtime-voice → Doubao
//   3. Final report     /api/ai-report → model-neutral constrained evaluator
//   4. Health checks    /api/realtime-health, /api/report-health
// ========================================

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import { createWSProxy } from './wsProxy.mjs'
import { createReportHandler } from './reportApi.mjs'
import { createRealtimeSessionHandler } from './realtimeSessionApi.mjs'

// ── config ───────────────────────────────────────────────

dotenv.config({
  path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
})

const requestedPort = Number(process.env.PORT)
const PORT = Number.isInteger(requestedPort) && requestedPort >= 0 ? requestedPort : 3000
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0')
const DIST_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'dist')

const DOUBAO_APP_ID = process.env.DOUBAO_APP_ID || ''
const DOUBAO_ACCESS_KEY = process.env.DOUBAO_ACCESS_KEY || ''
const UPSTREAM_URL = process.env.DOUBAO_REALTIME_URL || undefined
const WS_MAX_CONNECTIONS = Number(process.env.WS_MAX_CONNECTIONS) || 30
const VOICE_PROVIDER = String(process.env.VOICE_PROVIDER || 'doubao').trim().toLowerCase()
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'
const GEMINI_LIVE_VOICE = process.env.GEMINI_LIVE_VOICE || 'Kore'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1'
const OPENAI_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin'

const REPORT_PROVIDER = process.env.REPORT_PROVIDER || 'deepseek'
const REPORT_API_KEY = process.env.REPORT_API_KEY || process.env.DEEPSEEK_API_KEY || ''
const REPORT_MODEL = process.env.REPORT_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro'
const REPORT_BASE_URL = process.env.REPORT_BASE_URL || process.env.DEEPSEEK_BASE_URL || ''
const REPORT_SUPPORTS_JSON_MODE = process.env.REPORT_SUPPORTS_JSON_MODE !== 'false'
const REPORT_SUPPORTS_REASONING_OPTIONS = process.env.REPORT_SUPPORTS_REASONING_OPTIONS
  ? process.env.REPORT_SUPPORTS_REASONING_OPTIONS !== 'false'
  : REPORT_PROVIDER === 'deepseek'

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

function handleHealth(_req, res, realtimeSessionHandler) {
  const ok = realtimeSessionHandler.configured
  res.statusCode = ok ? 200 : 503
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(
    JSON.stringify({
      ok,
      provider: VOICE_PROVIDER,
      ...(ok ? {} : {
        code: 'REALTIME_NOT_CONFIGURED',
        message: VOICE_PROVIDER === 'doubao'
          ? '请配置豆包 App ID 和 Access Token。'
          : VOICE_PROVIDER === 'gemini'
            ? '请配置 Gemini API Key。'
            : VOICE_PROVIDER === 'openai'
              ? '请配置 OpenAI API Key。'
              : 'VOICE_PROVIDER 必须是 doubao、gemini 或 openai。',
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

  const reportHandler = createReportHandler({
    apiKey: REPORT_API_KEY,
    model: REPORT_MODEL,
    baseUrl: REPORT_BASE_URL,
    provider: REPORT_PROVIDER,
    supportsJsonMode: REPORT_SUPPORTS_JSON_MODE,
    supportsReasoningOptions: REPORT_SUPPORTS_REASONING_OPTIONS,
  })
  const realtimeSessionHandler = createRealtimeSessionHandler({
    provider: VOICE_PROVIDER,
    doubaoAppId: DOUBAO_APP_ID,
    doubaoAccessKey: DOUBAO_ACCESS_KEY,
    geminiApiKey: GEMINI_API_KEY,
    geminiModel: GEMINI_LIVE_MODEL,
    geminiVoice: GEMINI_LIVE_VOICE,
    openaiApiKey: OPENAI_API_KEY,
    openaiModel: OPENAI_REALTIME_MODEL,
    openaiVoice: OPENAI_REALTIME_VOICE,
  })

  const server = createServer(async (req, res) => {
    try {
      const pathname = req.url?.split('?')[0] ?? ''
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')

      // ── API routes ──
      if (pathname === '/api/realtime-health' && (req.method === 'GET' || req.method === 'HEAD')) {
        return handleHealth(req, res, realtimeSessionHandler)
      }

      if (await realtimeSessionHandler(req, res)) return
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
  const wsProxy = VOICE_PROVIDER === 'doubao' ? createWSProxy(server, {
    appId: DOUBAO_APP_ID,
    accessKey: DOUBAO_ACCESS_KEY,
    upstreamUrl: UPSTREAM_URL,
    maxConnections: WS_MAX_CONNECTIONS,
  }) : { close() {} }

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
    const address = server.address()
    const activePort = typeof address === 'object' && address ? address.port : PORT
    console.log(`[server] AI Visa Interview running at http://${HOST}:${activePort}`)
    console.log(`[server] Static files: ${DIST_DIR}`)
    console.log(`[server] WebSocket   : ws://${HOST}:${activePort}/api/realtime-voice (max ${WS_MAX_CONNECTIONS} connections)`)
    console.log(`[server] Health      : http://${HOST}:${activePort}/api/realtime-health`)
    console.log(`[server] AI report   : ${reportHandler.configured ? `${reportHandler.provider} ${reportHandler.model}` : 'NOT CONFIGURED'} at /api/ai-report`)
    const readyMessage = { type: 'server-ready', port: activePort }
    process.send?.(readyMessage)
    process.parentPort?.postMessage?.(readyMessage)
  })
}

main().catch((err) => {
  console.error('[server] Fatal:', err)
  process.exit(1)
})
