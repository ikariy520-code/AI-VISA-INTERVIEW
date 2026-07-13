import type { IncomingMessage, ServerResponse } from 'node:http'
import { gzipSync, gunzipSync } from 'node:zlib'
import type { Plugin, ViteDevServer } from 'vite'
import WebSocket, { WebSocketServer } from 'ws'

const ASR_BROWSER_PATH = '/api/speech/asr'
const TTS_PATH = '/api/speech/tts'
const HEALTH_PATH = '/api/speech/health'
const DEFAULT_ASR_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'
const DEFAULT_TTS_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const DEFAULT_ASR_RESOURCE_ID = 'volc.bigasr.sauc.duration'
const DEFAULT_TTS_RESOURCE_ID = 'seed-tts-2.0'
const DEFAULT_TTS_SPEAKER = 'zh_female_vv_uranus_bigtts'
const MAX_TTS_TEXT_LENGTH = 600
const MAX_BROWSER_AUDIO_BYTES = 4 * 1024 * 1024
const MAX_ASR_CONNECTIONS = 2

interface DoubaoSpeechBridgeOptions {
  apiKey: string
  asrUrl?: string
  asrResourceId?: string
  ttsUrl?: string
  ttsResourceId?: string
  ttsSpeaker?: string
}

interface AsrResultPayload {
  result?: {
    text?: string
    utterances?: Array<{ text?: string; definite?: boolean }>
  }
  code?: number
  message?: string
}

function jsonResponse(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(payload))
}

function sameLocalOrigin(request: IncomingMessage): boolean {
  const host = String(request.headers.host || '')
  const origin = String(request.headers.origin || '')
  if (!origin) return true
  try {
    const hostUrl = new URL(`http://${host}`)
    const originUrl = new URL(origin)
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostUrl.hostname)
      && originUrl.host === hostUrl.host
  } catch {
    return false
  }
}

function validProviderUrl(value: string, protocol: 'https:' | 'wss:', pathnamePrefix: string, fallback: string) {
  try {
    const parsed = new URL(value)
    if (
      parsed.protocol === protocol
      && parsed.hostname === 'openspeech.bytedance.com'
      && parsed.pathname.startsWith(pathnamePrefix)
    ) return value
  } catch {
    // Fall through to the pinned official endpoint.
  }
  return fallback
}

function readJsonBody(request: IncomingMessage, maxBytes = 8_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('REQUEST_TOO_LARGE'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('INVALID_JSON'))
      }
    })
    request.on('error', reject)
  })
}

function makeProtocolHeader(messageType: number, flags: number, serialization: number, compression: number) {
  return Buffer.from([0x11, (messageType << 4) | flags, (serialization << 4) | compression, 0x00])
}

function withSizedPayload(header: Buffer, payload: Buffer) {
  const size = Buffer.allocUnsafe(4)
  size.writeUInt32BE(payload.length)
  return Buffer.concat([header, size, payload])
}

function makeAsrFullRequest(requestId: string) {
  const payload = Buffer.from(JSON.stringify({
    user: { uid: `visa-ai-${requestId.slice(0, 8)}` },
    audio: {
      format: 'pcm',
      codec: 'raw',
      rate: 16_000,
      bits: 16,
      channel: 1,
    },
    request: {
      model_name: 'bigmodel',
      enable_itn: true,
      enable_punc: true,
      enable_ddc: false,
      show_utterances: true,
      enable_nonstream: true,
      end_window_size: 800,
      result_type: 'full',
    },
  }))
  const compressed = gzipSync(payload)
  return withSizedPayload(makeProtocolHeader(0x1, 0x0, 0x1, 0x1), compressed)
}

function makeAsrAudioRequest(audio: Buffer, isLast: boolean) {
  const compressed = gzipSync(audio)
  return withSizedPayload(makeProtocolHeader(0x2, isLast ? 0x2 : 0x0, 0x0, 0x1), compressed)
}

function decodeAsrResponse(data: Buffer): { payload?: AsrResultPayload; error?: string; isLast: boolean } {
  if (data.length < 8) return { error: 'ASR_INVALID_PACKET', isLast: false }
  const headerSize = (data[0] & 0x0f) * 4
  const messageType = data[1] >> 4
  const flags = data[1] & 0x0f
  const compression = data[2] & 0x0f
  let offset = headerSize

  if (messageType === 0xf) {
    if (data.length < offset + 8) return { error: 'ASR_PROVIDER_ERROR', isLast: true }
    const code = data.readUInt32BE(offset)
    offset += 4
    const messageSize = data.readUInt32BE(offset)
    offset += 4
    const message = data.subarray(offset, offset + messageSize).toString('utf8')
    return { error: `ASR_${code}: ${message.slice(0, 160)}`, isLast: true }
  }

  if (messageType !== 0x9) return { isLast: Boolean(flags & 0x2) }
  if (flags & 0x1) offset += 4
  if (data.length < offset + 4) return { error: 'ASR_INVALID_RESPONSE', isLast: false }
  const payloadSize = data.readUInt32BE(offset)
  offset += 4
  let payloadBytes = data.subarray(offset, offset + payloadSize)
  if (compression === 0x1) payloadBytes = gunzipSync(payloadBytes)
  try {
    return {
      payload: JSON.parse(payloadBytes.toString('utf8')),
      isLast: Boolean(flags & 0x2),
    }
  } catch {
    return { error: 'ASR_INVALID_JSON', isLast: Boolean(flags & 0x2) }
  }
}

function parseJsonObjects(text: string): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = []
  let depth = 0
  let start = -1
  let quoted = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        try {
          objects.push(JSON.parse(text.slice(start, index + 1)))
        } catch {
          // Ignore incomplete transport fragments; a later complete object may still be usable.
        }
        start = -1
      }
    }
  }
  return objects
}

function collectTtsAudio(text: string): Buffer {
  const objects = parseJsonObjects(text.replace(/^data:\s*/gm, ''))
  const chunks: Buffer[] = []
  let providerError = ''
  for (const item of objects) {
    const code = Number(item.code ?? 0)
    if (code !== 0) providerError = String(item.message ?? item.error ?? `TTS_${code}`)
    const data = typeof item.data === 'string'
      ? item.data
      : typeof item.audio === 'string'
        ? item.audio
        : ''
    if (data) chunks.push(Buffer.from(data, 'base64'))
  }
  if (chunks.length === 0) throw new Error(providerError || 'TTS_EMPTY_AUDIO')
  return Buffer.concat(chunks)
}

async function handleTts(
  request: IncomingMessage,
  response: ServerResponse,
  options: Required<Pick<DoubaoSpeechBridgeOptions, 'apiKey' | 'ttsUrl' | 'ttsResourceId' | 'ttsSpeaker'>>,
) {
  if (!sameLocalOrigin(request)) {
    jsonResponse(response, 403, { error: 'FORBIDDEN_ORIGIN' })
    return
  }
  if (!options.apiKey) {
    jsonResponse(response, 503, { error: 'DOUBAO_SPEECH_NOT_CONFIGURED' })
    return
  }
  let body: Record<string, unknown>
  try {
    body = await readJsonBody(request)
  } catch (error) {
    jsonResponse(response, error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
      error: error instanceof Error ? error.message : 'INVALID_REQUEST',
    })
    return
  }
  const text = String(body.text ?? '').trim()
  if (!text || text.length > MAX_TTS_TEXT_LENGTH) {
    jsonResponse(response, 400, { error: 'INVALID_TTS_TEXT' })
    return
  }
  const speaker = String(body.speaker ?? options.ttsSpeaker).trim() || options.ttsSpeaker
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const upstream = await fetch(options.ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': options.apiKey,
        'X-Api-Resource-Id': options.ttsResourceId,
        'X-Api-Request-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        user: { uid: 'visa-ai-local' },
        req_params: {
          text,
          speaker,
          audio_params: {
            format: 'mp3',
            sample_rate: 24_000,
          },
        },
      }),
      signal: controller.signal,
    })
    const upstreamText = await upstream.text()
    if (!upstream.ok) throw new Error(`TTS_HTTP_${upstream.status}`)
    const audio = collectTtsAudio(upstreamText)
    response.statusCode = 200
    response.setHeader('Content-Type', 'audio/mpeg')
    response.setHeader('Content-Length', audio.length)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(audio)
  } catch (error) {
    console.error('[Speech] TTS request failed', error instanceof Error ? error.message : error)
    jsonResponse(response, 502, { error: 'DOUBAO_TTS_UNAVAILABLE' })
  } finally {
    clearTimeout(timer)
  }
}

export function doubaoSpeechBridge(options: DoubaoSpeechBridgeOptions): Plugin {
  const apiKey = options.apiKey.trim()
  const asrUrl = validProviderUrl(
    options.asrUrl?.trim() || DEFAULT_ASR_URL,
    'wss:',
    '/api/v3/sauc/',
    DEFAULT_ASR_URL,
  )
  const ttsUrl = validProviderUrl(
    options.ttsUrl?.trim() || DEFAULT_TTS_URL,
    'https:',
    '/api/v3/tts/',
    DEFAULT_TTS_URL,
  )
  const asrResourceId = options.asrResourceId?.trim() || DEFAULT_ASR_RESOURCE_ID
  const ttsResourceId = options.ttsResourceId?.trim() || DEFAULT_TTS_RESOURCE_ID
  const ttsSpeaker = options.ttsSpeaker?.trim() || DEFAULT_TTS_SPEAKER
  let activeAsrConnections = 0

  return {
    name: 'doubao-split-speech-local-bridge',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0]
        if (pathname === HEALTH_PATH && request.method === 'GET') {
          jsonResponse(response, apiKey ? 200 : 503, {
            ok: Boolean(apiKey),
            provider: 'doubao-speech',
            architecture: 'asr-decision-tts',
            asrResourceId,
            ttsResourceId,
            ttsSpeaker,
          })
          return
        }
        if (pathname === TTS_PATH && request.method === 'POST') {
          void handleTts(request, response, { apiKey, ttsUrl, ttsResourceId, ttsSpeaker })
          return
        }
        next()
      })

      const httpServer = server.httpServer
      if (!httpServer) return
      const browserServer = new WebSocketServer({ noServer: true, maxPayload: MAX_BROWSER_AUDIO_BYTES })

      const handleUpgrade = (request: IncomingMessage, socket: any, head: Buffer) => {
        const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
        if (pathname !== ASR_BROWSER_PATH) return
        if (!sameLocalOrigin(request)) {
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
        if (!apiKey) {
          browserSocket.send(JSON.stringify({ type: 'error', code: 'DOUBAO_SPEECH_NOT_CONFIGURED' }))
          browserSocket.close(1011, 'speech key missing')
          return
        }
        if (activeAsrConnections >= MAX_ASR_CONNECTIONS) {
          browserSocket.close(1013, 'too many ASR connections')
          return
        }
        activeAsrConnections += 1
        let released = false
        const release = () => {
          if (released) return
          released = true
          activeAsrConnections = Math.max(0, activeAsrConnections - 1)
        }
        let upstream: WebSocket | null = null
        let started = false
        let upstreamReady = false
        let ending = false
        let audioBytes = 0
        const pendingAudio: Buffer[] = []
        const requestId = crypto.randomUUID()

        const sendBrowser = (payload: unknown) => {
          if (browserSocket.readyState === WebSocket.OPEN) browserSocket.send(JSON.stringify(payload))
        }
        const closeUpstream = () => {
          if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) {
            upstream.terminate()
          }
        }
        const sendAudio = (audio: Buffer, isLast = false) => {
          if (!upstream || upstream.readyState !== WebSocket.OPEN) return
          upstream.send(makeAsrAudioRequest(audio, isLast))
        }

        browserSocket.on('message', (data, isBinary) => {
          if (isBinary) {
            if (!started || ending) return
            const audio = Buffer.from(data as Buffer)
            audioBytes += audio.length
            if (audioBytes > MAX_BROWSER_AUDIO_BYTES) {
              browserSocket.close(1009, 'audio too large')
              return
            }
            if (upstreamReady) sendAudio(audio)
            else pendingAudio.push(audio)
            return
          }

          let event: { type?: string }
          try {
            event = JSON.parse(data.toString())
          } catch {
            browserSocket.close(1007, 'invalid control message')
            return
          }
          if (event.type === 'start' && !started) {
            started = true
            upstream = new WebSocket(asrUrl, {
              headers: {
                'X-Api-Key': apiKey,
                'X-Api-Resource-Id': asrResourceId,
                'X-Api-Request-Id': requestId,
                'X-Api-Connect-Id': requestId,
                'X-Api-Sequence': '-1',
              },
              handshakeTimeout: 12_000,
              maxPayload: 8 * 1024 * 1024,
              perMessageDeflate: false,
            })
            upstream.on('open', () => {
              upstreamReady = true
              upstream?.send(makeAsrFullRequest(requestId))
              for (const chunk of pendingAudio.splice(0)) sendAudio(chunk)
              if (ending) sendAudio(Buffer.alloc(0), true)
              sendBrowser({ type: 'ready' })
            })
            upstream.on('message', (upstreamData) => {
              try {
                const decoded = decodeAsrResponse(Buffer.from(upstreamData as Buffer))
                if (decoded.error) {
                  console.error('[Speech] ASR provider error', decoded.error)
                  sendBrowser({ type: 'error', code: 'DOUBAO_ASR_PROVIDER_ERROR' })
                  return
                }
                const text = decoded.payload?.result?.text?.trim()
                  || decoded.payload?.result?.utterances?.map(item => item.text).filter(Boolean).join(' ').trim()
                const isDefinite = Boolean(decoded.payload?.result?.utterances?.some(item => item.definite))
                if (text) sendBrowser({ type: 'transcript', text, final: decoded.isLast || isDefinite })
                if (decoded.isLast) {
                  sendBrowser({ type: 'ended' })
                  setTimeout(() => browserSocket.close(1000, 'ASR completed'), 50)
                }
              } catch (error) {
                console.error('[Speech] ASR response parse failed', error)
                sendBrowser({ type: 'error', code: 'DOUBAO_ASR_INVALID_RESPONSE' })
              }
            })
            upstream.on('unexpected-response', (_req, providerResponse) => {
              console.error('[Speech] ASR handshake rejected', providerResponse.statusCode)
              providerResponse.resume()
              sendBrowser({ type: 'error', code: 'DOUBAO_ASR_HANDSHAKE_REJECTED' })
              browserSocket.close(1011, 'ASR handshake rejected')
            })
            upstream.on('error', (error) => {
              console.error('[Speech] ASR connection error', error.message)
              sendBrowser({ type: 'error', code: 'DOUBAO_ASR_UNAVAILABLE' })
            })
            upstream.on('close', () => {
              upstreamReady = false
              if (browserSocket.readyState === WebSocket.OPEN && !ending) {
                browserSocket.close(1011, 'ASR provider closed')
              }
            })
          } else if (event.type === 'stop' && started && !ending) {
            ending = true
            if (upstreamReady) sendAudio(Buffer.alloc(0), true)
            setTimeout(() => {
              sendBrowser({ type: 'ended' })
              if (browserSocket.readyState === WebSocket.OPEN) browserSocket.close(1000, 'ASR stop timeout')
            }, 5_000).unref?.()
          } else if (event.type === 'cancel') {
            ending = true
            browserSocket.close(1000, 'ASR cancelled')
          }
        })

        browserSocket.on('close', () => {
          release()
          closeUpstream()
        })
        browserSocket.on('error', () => {
          release()
          closeUpstream()
        })
      })

      server.config.logger.info('豆包拆分语音桥接已启用：ASR /api/speech/asr，TTS /api/speech/tts')
    },
  }
}
