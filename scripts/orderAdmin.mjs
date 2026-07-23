import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DEFAULT_ORDERS_FILE = process.env.ORDER_NUMBERS_FILE || 'data/orders.json'
const DEFAULT_USAGE_FILE = process.env.ORDER_USAGE_FILE || 'data/order-usage.json'
const RESERVATION_TTL_MS = 4 * 60 * 60 * 1000

function option(name, fallback = '') {
  const prefix = `--${name}=`
  const inline = process.argv.find(value => value.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback
}

function normalizeOrderNumber(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
}

function orderHash(value) {
  return createHash('sha256').update(normalizeOrderNumber(value)).digest('hex')
}

function positiveInteger(value, name) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1000) throw new Error(`${name} must be an integer between 1 and 1000`)
  return parsed
}

function loadJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, filePath)
}

function loadOrders(filePath) {
  const value = loadJson(filePath, { version: 1, orders: [] })
  if (value?.version !== 1 || !Array.isArray(value.orders)) throw new Error(`Order file is invalid: ${filePath}`)
  return value
}

function findOrder(orders, id) {
  const entry = orders.orders.find(order => order.id === id)
  if (!entry) throw new Error(`Unknown order id: ${id}`)
  return entry
}

function add() {
  const ordersFile = resolve(option('file', DEFAULT_ORDERS_FILE))
  const orderNumber = normalizeOrderNumber(option('order'))
  if (!orderNumber) throw new Error('add requires --order <platform-order-number>')
  const hash = orderHash(orderNumber)
  const orders = loadOrders(ordersFile)
  if (orders.orders.some(entry => entry.orderNumberHash === hash)) throw new Error('This order number already exists')

  const maxUses = positiveInteger(option('uses', '1'), 'uses')
  const expires = String(option('expires', '')).trim()
  const expiresAt = expires ? new Date(expires).toISOString() : null
  const id = String(option('id', `O-${hash.slice(0, 12).toUpperCase()}`)).trim()
  if (!/^[A-Z0-9_-]{1,64}$/i.test(id)) throw new Error('id may only contain letters, numbers, underscores and hyphens')
  if (orders.orders.some(entry => entry.id === id)) throw new Error(`Order id already exists: ${id}`)

  orders.orders.push({
    id,
    orderNumberHash: hash,
    displaySuffix: orderNumber.slice(-6),
    channel: String(option('channel', '')).trim().slice(0, 40),
    maxUses,
    expiresAt,
    enabled: true,
    createdAt: new Date().toISOString(),
  })
  writeJson(ordersFile, orders)
  console.log(`Added order ${id} ending in ${orderNumber.slice(-6)} with ${maxUses} use(s).`)
  console.log(`Order file: ${ordersFile}`)
}

function status() {
  const ordersFile = resolve(option('file', DEFAULT_ORDERS_FILE))
  const usageFile = resolve(option('usage', DEFAULT_USAGE_FILE))
  const orders = loadOrders(ordersFile)
  const usage = loadJson(usageFile, { version: 1, orders: {} })
  const rows = orders.orders.map(entry => {
    const used = Math.max(0, Math.min(Number(usage.orders?.[entry.id]?.used) || 0, entry.maxUses))
    const attempts = Object.values(usage.orders?.[entry.id]?.attempts || {})
    const reserved = attempts.filter(attempt => {
      if (attempt?.state !== 'reserved') return false
      const reservedAt = Date.parse(String(attempt.reservedAt || ''))
      return Number.isFinite(reservedAt) && Date.now() - reservedAt <= RESERVATION_TTL_MS
    }).length
    return {
      id: entry.id,
      channel: entry.channel || '',
      ending: entry.displaySuffix || '',
      enabled: entry.enabled !== false,
      total: entry.maxUses,
      used,
      remaining: Math.max(0, entry.maxUses - used),
      reserved,
      expiresAt: entry.expiresAt || '',
    }
  })
  console.table(rows)
  console.log(`Orders: ${ordersFile}`)
  console.log(`Usage: ${usageFile}`)
}

function setEnabled(enabled) {
  const ordersFile = resolve(option('file', DEFAULT_ORDERS_FILE))
  const id = String(option('id', '')).trim()
  if (!id) throw new Error(`${enabled ? 'enable' : 'disable'} requires --id <order-id>`)
  const orders = loadOrders(ordersFile)
  const entry = findOrder(orders, id)
  entry.enabled = enabled
  entry.updatedAt = new Date().toISOString()
  writeJson(ordersFile, orders)
  console.log(`${id} is now ${enabled ? 'enabled' : 'disabled'}.`)
}

function reset() {
  const ordersFile = resolve(option('file', DEFAULT_ORDERS_FILE))
  const usageFile = resolve(option('usage', DEFAULT_USAGE_FILE))
  const id = String(option('id', '')).trim()
  if (!id) throw new Error('reset requires --id <order-id>')
  const orders = loadOrders(ordersFile)
  findOrder(orders, id)
  const usage = loadJson(usageFile, { version: 1, orders: {} })
  if (!usage.orders || typeof usage.orders !== 'object') usage.orders = {}
  delete usage.orders[id]
  writeJson(usageFile, usage)
  console.log(`Reset usage and reservations for ${id}.`)
}

const command = process.argv[2]
if (command === 'add') add()
else if (command === 'status') status()
else if (command === 'enable') setEnabled(true)
else if (command === 'disable') setEnabled(false)
else if (command === 'reset') reset()
else {
  console.error('Usage: node scripts/orderAdmin.mjs <add|status|enable|disable|reset> [options]')
  process.exitCode = 1
}
