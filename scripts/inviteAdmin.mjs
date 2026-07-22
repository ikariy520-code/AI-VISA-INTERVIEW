import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DEFAULT_SEED_FILE = 'server/inviteCodes.json'
const DEFAULT_USAGE_FILE = process.env.INVITE_USAGE_FILE || 'data/invite-usage.json'

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function positiveInteger(value, label, maximum = 1000) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}.`)
  }
  return parsed
}

function inviteCode() {
  const bytes = randomBytes(16)
  const characters = Array.from(bytes, byte => ALPHABET[byte & 31])
  return `TEST-${characters.slice(0, 4).join('')}-${characters.slice(4, 8).join('')}-${characters.slice(8, 12).join('')}-${characters.slice(12).join('')}`
}

function codeHash(code) {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

function writePrivateFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
}

function generate() {
  const count = positiveInteger(option('count', '20'), 'count', 100)
  const maxUses = positiveInteger(option('uses', '3'), 'uses')
  const seedFile = resolve(option('seed', DEFAULT_SEED_FILE))
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const outputFile = resolve(option('output', `private/invite-codes_${timestamp}.csv`))

  if (existsSync(seedFile)) {
    throw new Error(`Seed file already exists: ${seedFile}. Move it aside before generating a replacement set.`)
  }

  const seen = new Set()
  const rows = []
  while (rows.length < count) {
    const code = inviteCode()
    if (seen.has(code)) continue
    seen.add(code)
    rows.push({
      id: `T${String(rows.length + 1).padStart(2, '0')}`,
      code,
      maxUses,
    })
  }

  const seed = {
    version: 1,
    generatedAt: new Date().toISOString(),
    codes: rows.map(row => ({
      id: row.id,
      codeHash: codeHash(row.code),
      maxUses: row.maxUses,
      enabled: true,
    })),
  }

  const csv = [
    '编号,邀请码,总次数,剩余次数,发放对象,反馈状态,备注',
    ...rows.map(row => `${row.id},${row.code},${row.maxUses},${row.maxUses},,,`),
  ].join('\r\n')

  mkdirSync(dirname(seedFile), { recursive: true })
  writeFileSync(seedFile, `${JSON.stringify(seed, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  writePrivateFile(outputFile, `\uFEFF${csv}\r\n`)

  console.log(`Generated ${count} limited invite codes with ${maxUses} uses each.`)
  console.log(`Private CSV: ${outputFile}`)
  console.log(`Hashed seed: ${seedFile}`)
  console.log('The plaintext codes exist only in the private CSV. Keep that file safe.')
}

function loadJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function status() {
  const seedFile = resolve(option('seed', DEFAULT_SEED_FILE))
  const usageFile = resolve(option('usage', DEFAULT_USAGE_FILE))
  const seed = loadJson(seedFile, null)
  if (!seed?.codes || !Array.isArray(seed.codes)) throw new Error(`Invite seed not found or invalid: ${seedFile}`)
  const usage = loadJson(usageFile, { version: 1, codes: {} })
  const rows = seed.codes.map(entry => {
    const used = Math.max(0, Math.min(Number(usage.codes?.[entry.id]?.used) || 0, entry.maxUses))
    return {
      id: entry.id,
      enabled: entry.enabled !== false,
      total: entry.maxUses,
      used,
      remaining: Math.max(0, entry.maxUses - used),
      updatedAt: usage.codes?.[entry.id]?.updatedAt || '',
    }
  })
  console.table(rows)
  console.log(`Usage file: ${usageFile}`)
}

function reset() {
  const id = String(option('id', '')).trim()
  if (!id) throw new Error('reset requires --id, for example: npm run invite:reset -- --id T01')
  const seedFile = resolve(option('seed', DEFAULT_SEED_FILE))
  const usageFile = resolve(option('usage', DEFAULT_USAGE_FILE))
  const seed = loadJson(seedFile, null)
  if (!seed?.codes?.some(entry => entry.id === id)) throw new Error(`Unknown invite id: ${id}`)
  const usage = loadJson(usageFile, { version: 1, codes: {} })
  if (!usage.codes || typeof usage.codes !== 'object') usage.codes = {}
  delete usage.codes[id]
  mkdirSync(dirname(usageFile), { recursive: true })
  const temporary = `${usageFile}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(usage, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, usageFile)
  console.log(`Reset usage for ${id}. It now has its full quota again.`)
}

const command = process.argv[2]
if (command === 'generate') generate()
else if (command === 'status') status()
else if (command === 'reset') reset()
else {
  console.error('Usage: node scripts/inviteAdmin.mjs <generate|status|reset> [options]')
  process.exitCode = 1
}
