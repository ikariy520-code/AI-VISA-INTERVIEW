import { readFileSync } from 'node:fs'
import WebSocket from 'ws'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!match || process.env[match[1]]) continue
  process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
}

const apiKey = process.env.DOUBAO_SPEECH_API_KEY || process.env.DOUBAO_API_KEY || process.env.SPEECH_API_KEY || ''
const ttsUrl = process.env.DOUBAO_TTS_URL || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const ttsResourceId = process.env.DOUBAO_TTS_RESOURCE_ID || 'seed-tts-2.0'
const ttsSpeaker = process.env.DOUBAO_TTS_SPEAKER || 'zh_female_vv_uranus_bigtts'
const port = Number(process.env.VITE_DEV_PORT) || 5173
const phrase = 'Good morning. I chose this university because its computer science program matches my academic goals.'

function parseJsonObjects(text) {
  const objects = []
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
    if (char === '"') quoted = true
    else if (char === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        objects.push(JSON.parse(text.slice(start, index + 1)))
        start = -1
      }
    }
  }
  return objects
}

async function synthesizePcm() {
  const response = await fetch(ttsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': ttsResourceId,
      'X-Api-Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify({
      user: { uid: 'visa-ai-speech-smoke' },
      req_params: {
        text: phrase,
        speaker: ttsSpeaker,
        audio_params: { format: 'pcm', sample_rate: 24_000 },
      },
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`TTS_HTTP_${response.status}`)
  const chunks = []
  let providerCode = 0
  for (const item of parseJsonObjects(text.replace(/^data:\s*/gm, ''))) {
    if (Number(item.code ?? 0) !== 0) providerCode = Number(item.code)
    if (typeof item.data === 'string' && item.data) chunks.push(Buffer.from(item.data, 'base64'))
  }
  if (chunks.length === 0) throw new Error(providerCode ? `TTS_PROVIDER_${providerCode}` : 'TTS_EMPTY_PCM')
  return Buffer.concat(chunks)
}

function resamplePcm16(input, sourceRate = 24_000, targetRate = 16_000) {
  const sourceLength = Math.floor(input.length / 2)
  const ratio = sourceRate / targetRate
  const outputLength = Math.max(1, Math.round(sourceLength / ratio))
  const output = Buffer.allocUnsafe(outputLength * 2)
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, sourceLength - 1)
    const weight = position - left
    const leftValue = input.readInt16LE(left * 2)
    const rightValue = input.readInt16LE(right * 2)
    output.writeInt16LE(Math.round(leftValue * (1 - weight) + rightValue * weight), index * 2)
  }
  return output
}

function recognizePcm(pcm) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/speech/asr`, {
      handshakeTimeout: 10_000,
    })
    let transcript = ''
    let providerError = ''
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.close()
      if (error) reject(error)
      else resolve({ transcript, providerError })
    }
    const timeout = setTimeout(() => finish(new Error('ASR_TIMEOUT')), 30_000)
    socket.on('open', () => socket.send(JSON.stringify({ type: 'start' })))
    socket.on('message', async (data, isBinary) => {
      if (isBinary) return
      const message = JSON.parse(data.toString())
      if (message.type === 'ready') {
        const chunkBytes = 6_400
        for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
          socket.send(pcm.subarray(offset, Math.min(offset + chunkBytes, pcm.length)))
          await new Promise((done) => setTimeout(done, 150))
        }
        socket.send(JSON.stringify({ type: 'stop' }))
      } else if (message.type === 'transcript') {
        transcript = message.text || transcript
      } else if (message.type === 'error') {
        providerError = message.code || 'UNKNOWN_PROVIDER_ERROR'
      } else if (message.type === 'ended') {
        finish()
      }
    })
    socket.on('error', (error) => finish(error))
    socket.on('close', () => {
      if (!settled && transcript) finish()
    })
  })
}

if (!apiKey) {
  console.error(JSON.stringify({ ok: false, stage: 'configuration', error: 'DOUBAO_SPEECH_API_KEY_MISSING' }))
  process.exitCode = 1
} else {
  try {
    const pcm = resamplePcm16(await synthesizePcm())
    const result = await recognizePcm(pcm)
    const normalized = result.transcript.toLowerCase()
    const ok = normalized.includes('university') && normalized.includes('computer science')
    console.log(JSON.stringify({
      ok,
      pcmBytes: pcm.length,
      transcript: result.transcript,
      providerError: result.providerError || undefined,
    }))
    if (!ok) process.exitCode = 1
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      stage: 'speech-smoke',
      error: error instanceof Error ? error.message : String(error),
    }))
    process.exitCode = 1
  }
}
