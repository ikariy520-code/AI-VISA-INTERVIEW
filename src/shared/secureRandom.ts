function cryptoApi() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('This browser does not provide secure randomness.')
  }
  return globalThis.crypto
}

export function createSecureId() {
  const secureCrypto = cryptoApi()
  if (typeof secureCrypto.randomUUID === 'function') return secureCrypto.randomUUID()

  const bytes = secureCrypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function secureRandomUnit() {
  const values = cryptoApi().getRandomValues(new Uint32Array(1))
  return values[0] / 0x1_0000_0000
}
