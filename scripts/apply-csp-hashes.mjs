// Recompute script-src hashes from the BUILT html and rewrite dist/_headers.
// Runs after `vite build` so the shipped policy always matches the shipped
// markup, even when a source edit forgets to update public/_headers. The
// vitest suite still checks the source pair so drift is caught pre-commit;
// this script is the guarantee for the artifact that actually deploys.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')

const htmlFiles = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (entry.endsWith('.html')) htmlFiles.push(p)
  }
}
walk(dist)

const hashes = new Set()
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8')
  let match
  while ((match = scriptPattern.exec(html)) !== null) {
    if (/\bsrc\s*=/.test(match[1])) continue
    hashes.add(`'sha256-${createHash('sha256').update(match[2], 'utf8').digest('base64')}'`)
  }
}

if (hashes.size === 0) {
  throw new Error('apply-csp-hashes: no inline scripts found in dist — refusing to emit an empty hash list')
}

const headersPath = join(dist, '_headers')
const headers = readFileSync(headersPath, 'utf8')
const updated = headers.replace(
  /(script-src[^;]*)/,
  (directive) => {
    const kept = directive
      .split(/\s+/)
      .filter((token) => token && !token.startsWith("'sha256-"))
    return [...kept, ...[...hashes].sort()].join(' ')
  },
)
if (updated === headers && ![...hashes].every((h) => headers.includes(h))) {
  throw new Error('apply-csp-hashes: failed to rewrite script-src in dist/_headers')
}
writeFileSync(headersPath, updated)
console.log(`apply-csp-hashes: ${hashes.size} inline script hash(es) written to dist/_headers`)
