import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import dotenv from 'dotenv'
import WebSocket from 'ws'

dotenv.config({ path: '.env.local', quiet: true })

const appId = process.env.DOUBAO_APP_ID?.trim()
const accessKey = process.env.DOUBAO_ACCESS_KEY?.trim()
const upstreamUrl = (
  process.env.DOUBAO_REALTIME_URL ||
  'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'
).trim()

if (!appId || !accessKey) throw new Error('Realtime App ID or Access Token is not configured')

const secrets = [appId, accessKey]
const safeMessage = (value) => {
  let message = String(value instanceof Error ? value.message : value)
  for (const secret of secrets) message = message.split(secret).join('[redacted]')
  return message
}

function createFrame(event, payload = {}, sessionId) {
  const payloadBytes = gzipSync(Buffer.from(JSON.stringify(payload)))
  const sessionBytes = sessionId ? Buffer.from(sessionId) : Buffer.alloc(0)
  const frame = Buffer.alloc(4 + 4 + (sessionId ? 4 + sessionBytes.length : 0) + 4 + payloadBytes.length)
  frame[0] = 0x11
  frame[1] = 0x14
  frame[2] = 0x11
  frame[3] = 0
  let offset = 4
  frame.writeUInt32BE(event, offset)
  offset += 4
  if (sessionId) {
    frame.writeUInt32BE(sessionBytes.length, offset)
    offset += 4
    sessionBytes.copy(frame, offset)
    offset += sessionBytes.length
  }
  frame.writeUInt32BE(payloadBytes.length, offset)
  offset += 4
  payloadBytes.copy(frame, offset)
  return frame
}

function parseFrame(data) {
  const bytes = Buffer.from(data)
  const messageType = bytes[1] >> 4
  const flags = bytes[1] & 0x0f
  const serialization = bytes[2] >> 4
  const compression = bytes[2] & 0x0f
  let offset = (bytes[0] & 0x0f) * 4
  let event
  let code

  if (messageType === 0x0f) {
    code = bytes.readUInt32BE(offset)
    offset += 4
  } else {
    if (flags & 0x02) offset += 4
    if (flags & 0x04) {
      event = bytes.readUInt32BE(offset)
      offset += 4
    }
    const sessionIdSize = bytes.readInt32BE(offset)
    offset += 4 + sessionIdSize
  }

  const payloadSize = bytes.readUInt32BE(offset)
  offset += 4
  let payload = bytes.subarray(offset, offset + payloadSize)
  if (compression === 1) payload = gunzipSync(payload)
  const json = serialization === 1 && payload.length
    ? JSON.parse(payload.toString('utf8'))
    : undefined
  return { messageType, event, code, payload, json }
}

const socket = new WebSocket(upstreamUrl, {
  headers: {
    'X-Api-App-ID': appId,
    'X-Api-Access-Key': accessKey,
    'X-Api-Resource-Id': 'volc.speech.dialog',
    'X-Api-App-Key': 'PlgvMymc7f3tQnJ6',
    'X-Api-Connect-Id': randomUUID(),
  },
  handshakeTimeout: 12_000,
  perMessageDeflate: false,
})

const queuedFrames = []
let pendingFrame = null
let openResolve
let openReject
const opened = new Promise((resolve, reject) => {
  openResolve = resolve
  openReject = reject
})

socket.on('open', openResolve)
socket.on('message', (data, isBinary) => {
  if (!isBinary) return
  const frame = parseFrame(data)
  if (pendingFrame?.events.includes(frame.event) || frame.code !== undefined) {
    const pending = pendingFrame
    pendingFrame = null
    clearTimeout(pending.timeout)
    pending.resolve(frame)
  } else {
    queuedFrames.push(frame)
  }
})
socket.on('unexpected-response', (_request, response) => {
  openReject(new Error(`Provider handshake failed with HTTP ${response.statusCode}`))
})
socket.on('error', (error) => openReject(new Error(safeMessage(error))))

function waitForEvent(events, timeoutMs = 15_000) {
  const queuedIndex = queuedFrames.findIndex(frame => events.includes(frame.event) || frame.code !== undefined)
  if (queuedIndex >= 0) return Promise.resolve(queuedFrames.splice(queuedIndex, 1)[0])

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingFrame = null
      reject(new Error(`Timed out waiting for event ${events.join('/')}`))
    }, timeoutMs)
    pendingFrame = { events, resolve, reject, timeout }
  })
}

function assertFrame(frame, label) {
  if (frame.code !== undefined) {
    throw new Error(`${label} failed (${frame.code}): ${safeMessage(frame.json?.error || frame.payload.toString())}`)
  }
}

try {
  await opened
  console.log('realtime-smoke=websocket-open')

  socket.send(createFrame(1))
  const connection = await waitForEvent([50, 51])
  assertFrame(connection, 'StartConnection')
  if (connection.event !== 50) throw new Error(`StartConnection failed: ${safeMessage(connection.json?.error)}`)
  console.log('realtime-smoke=connection-started')

  const sessionId = randomUUID()
  socket.send(createFrame(100, {
    asr: { extra: { end_smooth_window_ms: 900, enable_custom_vad: true } },
    tts: {
      speaker: 'en_female_dacey_uranus_bigtts',
      audio_config: { channel: 1, format: 'pcm_s16le', sample_rate: 24000 },
      extra: {},
    },
    dialog: {
      bot_name: 'U.S. Visa Officer',
      system_role: 'You are a professional U.S. consular officer conducting a realistic visa interview in English.',
      speaking_style: 'Speak naturally, calmly, and concisely. Ask one question at a time.',
      extra: {
        strict_audit: true,
        input_mod: 'keep_alive',
        enable_music: false,
        enable_loudness_norm: true,
        model: '1.2.1.1',
      },
    },
  }, sessionId))
  const session = await waitForEvent([150, 153])
  assertFrame(session, 'StartSession')
  if (session.event !== 150) throw new Error(`StartSession failed: ${safeMessage(session.json?.error)}`)
  console.log('realtime-smoke=session-started')

  socket.send(createFrame(300, {
    content: 'Good morning. May I see your passport, please?',
  }, sessionId))

  let greetingStarted = false
  while (true) {
    const frame = await waitForEvent([350, 352, 359, 599], 20_000)
    assertFrame(frame, 'SayHello')
    if (frame.event === 599) throw new Error(`SayHello failed: ${safeMessage(frame.json?.message)}`)
    if (frame.event === 350 || frame.event === 352) greetingStarted = true
    if (frame.event === 359) break
  }
  if (!greetingStarted) throw new Error('SayHello ended without greeting audio')
  console.log('realtime-smoke=opening-greeting-complete')

  socket.send(createFrame(102, {}, sessionId))
  await waitForEvent([152, 153], 5_000)
  socket.send(createFrame(2))
  await waitForEvent([52], 5_000)
  socket.close(1000, 'smoke test complete')
  console.log('realtime-smoke=passed')
} catch (error) {
  socket.terminate()
  throw new Error(safeMessage(error))
}
