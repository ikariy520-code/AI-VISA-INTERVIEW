import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]

if (!['dir', 'nsis'].includes(target)) {
  console.error('Usage: node scripts/buildDesktop.mjs <dir|nsis>')
  process.exit(2)
}

const cli = resolve(root, 'node_modules/electron-builder/out/cli/cli.js')
const localElectronDist = resolve(root, 'node_modules/electron/dist')
const localElectronExecutable = resolve(localElectronDist, 'electron.exe')
const args = [cli, '--win', target, '--publish', 'never']

if (existsSync(localElectronExecutable)) {
  args.push(`--config.electronDist=${localElectronDist}`)
  console.log(`Using installed Electron distribution: ${localElectronDist}`)
} else {
  console.log('Installed Electron distribution not found; electron-builder will obtain the configured version.')
}

const result = spawnSync(process.execPath, args, {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
