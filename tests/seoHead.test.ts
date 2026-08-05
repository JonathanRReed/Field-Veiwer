import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const repoRoot = join(import.meta.dirname, '..')
const indexHtml = readFileSync(join(repoRoot, 'index.html'), 'utf8')
const headers = readFileSync(join(repoRoot, 'public', '_headers'), 'utf8')

/** Every <script> in index.html that has no src, in document order. */
const inlineScripts = (html: string): { attrs: string; body: string }[] => {
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  const found: { attrs: string; body: string }[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    if (/\bsrc\s*=/.test(match[1])) continue
    found.push({ attrs: match[1], body: match[2] })
  }
  return found
}

const cspSha256 = (body: string) => `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`

const cspDirective = (name: string) => {
  const line = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'))
  expect(line, 'public/_headers must declare a Content-Security-Policy').toBeTruthy()
  const policy = line!.split('Content-Security-Policy:')[1]
  const directive = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `))
  expect(directive, `CSP must declare a ${name} directive`).toBeTruthy()
  return directive!
}

describe('CSP hashes stay in sync with index.html', () => {
  test('every inline script is allowed by script-src', () => {
    const scripts = inlineScripts(indexHtml)
    expect(scripts.length).toBeGreaterThan(0)

    const scriptSrc = cspDirective('script-src')
    for (const script of scripts) {
      // Vite copies inline blocks into dist/index.html byte for byte, so the
      // source hash is the hash that ships.
      expect(
        scriptSrc,
        `script-src is missing the hash for the inline script with attributes "${script.attrs.trim()}". ` +
          `Add '${cspSha256(script.body)}' to public/_headers.`
      ).toContain(cspSha256(script.body))
    }
  })

  test('script-src carries no hash that matches nothing on the page', () => {
    const live = new Set(inlineScripts(indexHtml).map((script) => cspSha256(script.body)))
    const declared = cspDirective('script-src').match(/sha256-[A-Za-z0-9+/=]+/g) ?? []
    for (const hash of declared) {
      expect(live, `public/_headers pins a stale hash: '${hash}'`).toContain(hash)
    }
  })
})

describe('structured data', () => {
  const blocks = inlineScripts(indexHtml).filter((script) =>
    /type\s*=\s*["']application\/ld\+json["']/i.test(script.attrs)
  )

  test('a JSON-LD block exists and parses', () => {
    expect(blocks.length).toBe(1)
    expect(() => JSON.parse(blocks[0].body)).not.toThrow()
  })

  test('the graph describes a WebApplication with visible facts', () => {
    const graph = JSON.parse(blocks[0].body)['@graph'] as Record<string, unknown>[]
    const types = (node: Record<string, unknown>) =>
      Array.isArray(node['@type']) ? (node['@type'] as string[]) : [node['@type'] as string]
    const app = graph.find((node) => types(node).includes('WebApplication'))

    expect(app, 'the @graph must contain a WebApplication node').toBeTruthy()
    expect(app!.url).toBe('https://fieldviewer.jonathanrreed.com/')
    expect(Array.isArray(app!.featureList)).toBe(true)
    expect((app!.citation as unknown[]).length).toBe(3)

    // Citations in the markup and citations in the graph must not drift apart.
    for (const citation of app!.citation as Record<string, string>[]) {
      expect(indexHtml).toContain(citation.url.replace('https://', ''))
    }
  })
})

describe('static explainer copy', () => {
  test('lives outside #root so React mounting cannot erase it', () => {
    const rootStart = indexHtml.indexOf('<div id="root">')
    expect(rootStart).toBeGreaterThan(-1)

    // Walk div open/close tags to find where #root actually ends.
    const tags = [...indexHtml.slice(rootStart).matchAll(/<div\b|<\/div>/g)]
    let depth = 0
    let rootEnd = -1
    for (const tag of tags) {
      depth += tag[0] === '</div>' ? -1 : 1
      if (depth === 0) {
        rootEnd = rootStart + tag.index + tag[0].length
        break
      }
    }
    expect(rootEnd).toBeGreaterThan(rootStart)
    expect(indexHtml.indexOf('id="about-field-viewer"')).toBeGreaterThan(rootEnd)
  })

  test('carries the noscript canvas description inside #root', () => {
    expect(indexHtml).toContain('<noscript>')
    expect(indexHtml).toMatch(/electron field on top/)
  })
})
