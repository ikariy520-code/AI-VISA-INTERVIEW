const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const CLIENT_FULL_REQUEST = 0b0001
const CLIENT_AUDIO_REQUEST = 0b0010
const SERVER_FULL_RESPONSE = 0b1001
const SERVER_AUDIO_RESPONSE = 0b1011
const SERVER_ERROR_RESPONSE = 0b1111

const MESSAGE_WITH_EVENT = 0b0100
const SERIALIZATION_RAW = 0b0000
const SERIALIZATION_JSON = 0b0001
const COMPRESSION_NONE = 0b0000
const COMPRESSION_GZIP = 0b0001

export const DOUBAO_EVENT = {
  START_CONNECTION: 1,
  FINISH_CONNECTION: 2,
  CONNECTION_STARTED: 50,
  CONNECTION_FAILED: 51,
  CONNECTION_FINISHED: 52,
  START_SESSION: 100,
  FINISH_SESSION: 102,
  SESSION_STARTED: 150,
  SESSION_FINISHED: 152,
  SESSION_FAILED: 153,
  TASK_REQUEST: 200,
  SAY_HELLO: 300,
  TTS_SENTENCE_START: 350,
  TTS_SENTENCE_END: 351,
  TTS_RESPONSE: 352,
  TTS_ENDED: 359,
  ASR_INFO: 450,
  ASR_RESPONSE: 451,
  ASR_ENDED: 459,
  CHAT_RESPONSE: 550,
  CHAT_ENDED: 559,
  DIALOG_ERROR: 599,
} as const

export interface DoubaoServerFrame {
  messageType: number
  event?: number
  sessionId?: string
  errorCode?: number
  payload: Uint8Array
  json?: Record<string, unknown>
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, false)
}

function createClientFrame(
  event: number,
  payload: Uint8Array,
  sessionId?: string,
  audioOnly = false,
) {
  const sessionBytes = sessionId ? textEncoder.encode(sessionId) : new Uint8Array(0)
  const headerSize = 4
  const optionalSize = 4 + (sessionId ? 4 + sessionBytes.length : 0)
  const frame = new Uint8Array(headerSize + optionalSize + 4 + payload.length)

  frame[0] = 0x11
  frame[1] = ((audioOnly ? CLIENT_AUDIO_REQUEST : CLIENT_FULL_REQUEST) << 4) | MESSAGE_WITH_EVENT
  frame[2] = ((audioOnly ? SERIALIZATION_RAW : SERIALIZATION_JSON) << 4) | COMPRESSION_NONE
  frame[3] = 0

  let offset = headerSize
  writeUint32(frame, offset, event)
  offset += 4
  if (sessionId) {
    writeUint32(frame, offset, sessionBytes.length)
    offset += 4
    frame.set(sessionBytes, offset)
    offset += sessionBytes.length
  }
  writeUint32(frame, offset, payload.length)
  offset += 4
  frame.set(payload, offset)
  return frame
}

export function createJsonEventFrame(
  event: number,
  payload: Record<string, unknown> = {},
  sessionId?: string,
) {
  return createClientFrame(event, textEncoder.encode(JSON.stringify(payload)), sessionId)
}

export function createAudioEventFrame(sessionId: string, audio: Uint8Array) {
  return createClientFrame(DOUBAO_EVENT.TASK_REQUEST, audio, sessionId, true)
}

function readUint32(view: DataView, offset: number, signed = false) {
  if (offset + 4 > view.byteLength) throw new Error('Incomplete realtime protocol frame')
  return signed ? view.getInt32(offset, false) : view.getUint32(offset, false)
}

async function decompressGzip(payload: Uint8Array) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decode realtime audio frames')
  }
  const input = new Blob([payload as BlobPart]).stream()
  const output = input.pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(output).arrayBuffer())
}

export async function parseServerFrame(buffer: ArrayBuffer): Promise<DoubaoServerFrame> {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 4) throw new Error('Incomplete realtime protocol header')

  const view = new DataView(buffer)
  const headerSize = (bytes[0] & 0x0f) * 4
  const messageType = bytes[1] >> 4
  const flags = bytes[1] & 0x0f
  const serialization = bytes[2] >> 4
  const compression = bytes[2] & 0x0f
  let offset = headerSize
  let event: number | undefined
  let sessionId: string | undefined
  let errorCode: number | undefined

  if (messageType === SERVER_ERROR_RESPONSE) {
    errorCode = readUint32(view, offset)
    offset += 4
  } else if (messageType === SERVER_FULL_RESPONSE || messageType === SERVER_AUDIO_RESPONSE) {
    if (flags & 0b0010) offset += 4
    if (flags & MESSAGE_WITH_EVENT) {
      event = readUint32(view, offset)
      offset += 4
    }

    const sessionIdSize = readUint32(view, offset, true)
    offset += 4
    if (sessionIdSize < 0 || offset + sessionIdSize > bytes.length) {
      throw new Error('Invalid realtime session identifier')
    }
    sessionId = textDecoder.decode(bytes.subarray(offset, offset + sessionIdSize))
    offset += sessionIdSize
  } else {
    throw new Error(`Unsupported realtime message type: ${messageType}`)
  }

  const payloadSize = readUint32(view, offset)
  offset += 4
  if (offset + payloadSize > bytes.length) throw new Error('Incomplete realtime payload')
  let payload = bytes.slice(offset, offset + payloadSize)
  if (compression === COMPRESSION_GZIP) payload = await decompressGzip(payload)

  let json: Record<string, unknown> | undefined
  if (serialization === SERIALIZATION_JSON && payload.length) {
    const value = JSON.parse(textDecoder.decode(payload)) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      json = value as Record<string, unknown>
    }
  }

  return { messageType, event, sessionId, errorCode, payload, json }
}

export function protocolPayloadText(frame: DoubaoServerFrame) {
  if (frame.json) return JSON.stringify(frame.json)
  return frame.payload.length ? textDecoder.decode(frame.payload) : ''
}
