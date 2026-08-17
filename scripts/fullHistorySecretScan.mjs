import { execFileSync } from 'node:child_process'

const patch = execFileSync('git', [
  'log',
  '--all',
  '--format=@@COMMIT@@%H',
  '--patch',
  '--no-ext-diff',
  '--unified=0',
  '--',
  '.',
  ':!package-lock.json',
  ':!LICENSE',
  ':!THIRD_PARTY_NOTICES.md',
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

const fixedRules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[opusr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['openai-key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
]

const assignment = /\b(api[_-]?key|access[_-]?(?:key|token)|client[_-]?secret|secret[_-]?key|password|bearer[_-]?token)\b\s*[=:]\s*["']?([^\s"',;#}]{12,})/ig
const placeholders = /^(?:your[-_]|example|sample|placeholder|dummy|test[-_]|.*[-_]test[-_]|fake[-_]|redacted|replace[-_]|changeme|x{6,}|\*{6,}|<|\$\{|process\.env|import\.meta\.env)/i
const codeReference = /^\(?[A-Za-z_$][A-Za-z0-9_$?.]*(?:\([^)]*\)?)?$/

let commit = 'working-tree'
let file = 'unknown'
let patchLine = 0
const findings = []
const seen = new Set()

function record(rule, shape = '') {
  const key = `${commit}:${file}:${patchLine}:${rule}`
  if (seen.has(key)) return
  seen.add(key)
  findings.push({ rule, commit, file, patchLine, shape })
}

for (const rawLine of patch.split(/\r?\n/)) {
  const commitMatch = rawLine.match(/^@@COMMIT@@([0-9a-f]{40})$/)
  if (commitMatch) {
    commit = commitMatch[1]
    patchLine = 0
    continue
  }
  const fileMatch = rawLine.match(/^diff --git a\/(.+) b\/(.+)$/)
  if (fileMatch) {
    file = fileMatch[2]
    patchLine = 0
    continue
  }
  if (!rawLine || (!rawLine.startsWith('+') && !rawLine.startsWith('-')) || rawLine.startsWith('+++') || rawLine.startsWith('---')) continue
  patchLine += 1
  const line = rawLine.slice(1)
  for (const [rule, pattern] of fixedRules) {
    if (pattern.test(line)) record(rule)
  }
  assignment.lastIndex = 0
  for (const match of line.matchAll(assignment)) {
    const candidate = match[2].replace(/[)\]]+$/, '')
    if (!placeholders.test(candidate) && !codeReference.test(candidate) && !/^https?:\/\//i.test(candidate)) {
      const shape = `${candidate.length}:${candidate.replace(/[A-Za-z0-9]/g, 'x').slice(0, 80)}`
      record('credential-assignment', shape)
    }
  }
}

if (findings.length > 0) {
  console.error(`full-history-secret-scan=findings count=${findings.length}`)
  for (const finding of findings) {
    const shape = process.argv.includes('--show-shapes') && finding.shape ? `\tshape:${finding.shape}` : ''
    console.error(`${finding.rule}\t${finding.file}\tpatch-line:${finding.patchLine}\tcommit:${finding.commit.slice(0, 12)}${shape}`)
  }
  process.exitCode = 1
} else {
  console.log('full-history-secret-scan=passed')
}
