import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
const entries = []

function packageName(path) {
  const marker = 'node_modules/'
  const tail = path.slice(path.lastIndexOf(marker) + marker.length)
  const parts = tail.split('/')
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

for (const [path, metadata] of Object.entries(lock.packages || {})) {
  if (!path.includes('node_modules/') || !metadata?.version) continue
  entries.push({
    name: packageName(path),
    version: String(metadata.version),
    license: typeof metadata.license === 'string' ? metadata.license : 'UNKNOWN',
    scope: metadata.dev === true ? 'development/build' : 'runtime',
  })
}

const packages = [...new Map(entries.map(entry => [
  `${entry.name}@${entry.version}:${entry.license}:${entry.scope}`,
  entry,
])).values()].sort((left, right) =>
  left.name.localeCompare(right.name) || left.version.localeCompare(right.version))

const missing = packages.filter(entry => entry.license === 'UNKNOWN')
const manualReview = packages.filter(entry => /(?:^|[^A-Z])(A?GPL|LGPL|SSPL|BUSL|UNLICENSED|CC-BY-NC)/i.test(entry.license))

if (missing.length || manualReview.length) {
  if (missing.length) console.error(`Dependencies with missing license metadata: ${missing.map(item => `${item.name}@${item.version}`).join(', ')}`)
  if (manualReview.length) console.error(`Dependencies requiring manual license review: ${manualReview.map(item => `${item.name}@${item.version} (${item.license})`).join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`Third-party license metadata check passed for ${packages.length} unique package records.`)
}

if (process.argv.includes('--write')) {
  const lines = [
    '# Third-party notices',
    '',
    'AI Visa Interview includes third-party software. The project license does not replace the license of any dependency.',
    '',
    'This inventory is generated from `package-lock.json` by `npm run licenses:generate`. It includes runtime and development/build packages because Windows installers may incorporate build-time runtimes such as Electron. Distributed packages retain their own license files. Electron distributions also include Chromium notices.',
    '',
    '| Package | Version | License | Lockfile scope |',
    '|---|---:|---|---|',
    ...packages.map(entry => {
      const url = `https://www.npmjs.com/package/${entry.name}/v/${entry.version}`
      return `| [${entry.name}](${url}) | ${entry.version} | ${entry.license} | ${entry.scope} |`
    }),
    '',
    'The absence of a package from this generated inventory should be reported as a release issue. Before distribution, run `npm run licenses:check` and `npm run licenses:generate` after every dependency update.',
    '',
  ]
  writeFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), lines.join('\n'), 'utf8')
  console.log('Wrote THIRD_PARTY_NOTICES.md.')
}
