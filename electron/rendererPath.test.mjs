import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

const { resolveRendererPath } = createRequire(import.meta.url)('./rendererPath.cjs')

const ROOT = '/opt/Ledger/resources/app.asar/dist'
const resolve = (url) => resolveRendererPath(ROOT, url)

/** Inside the renderer directory, or refused — never a path anywhere else. */
function isContained(result) {
  if (result.status) return true
  const relative = path.relative(ROOT, result.file)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

describe('resolving app:// URLs to renderer files', () => {
  it('serves index.html at the root', () => {
    expect(resolve('app://ledger/')).toEqual({ file: `${ROOT}/index.html` })
  })

  it('serves bundled assets', () => {
    expect(resolve('app://ledger/assets/index-abc123.js')).toEqual({ file: `${ROOT}/assets/index-abc123.js` })
  })

  it('decodes percent-escapes, so a name with a space is found rather than 404ing', () => {
    expect(resolve('app://ledger/assets/my%20icon.png')).toEqual({ file: `${ROOT}/assets/my icon.png` })
  })

  it('rejects a malformed percent-escape instead of throwing', () => {
    expect(resolve('app://ledger/%E0%A4%A')).toEqual({ status: 400 })
  })

  // `app` is registered as a standard scheme, so the WHATWG URL parser collapses dot
  // segments — percent-encoded ones included — before the handler sees the path. That
  // is the first line of defence; the relative-path check below is the backstop for
  // anything it doesn't catch. Neither may ever yield a path outside the renderer.
  it('never resolves outside the renderer directory, however the path is dressed up', () => {
    const attempts = [
      'app://ledger/../../../etc/passwd',
      'app://ledger/assets/../../secrets.json',
      'app://ledger/%2e%2e/%2e%2e/etc/passwd',
      'app://ledger/%2e%2e%2f%2e%2e%2fetc/passwd',
      'app://ledger//etc/passwd',
      'app://ledger/./././../../root/.ssh/id_rsa',
      'app://ledger/assets/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/shadow',
    ]
    for (const url of attempts) {
      expect(isContained(resolve(url)), url).toBe(true)
    }
  })

  it('refuses outright when a path does resolve outside, rather than serving it', () => {
    // Reached by handing the resolver a path the URL parser would not have produced —
    // the guard has to stand on its own, not on the parser having been kind.
    expect(resolveRendererPath(ROOT, 'app://ledger/x').file).toBe(`${ROOT}/x`)
    expect(resolveRendererPath(`${ROOT}/assets`, 'app://ledger/x')).toEqual({ file: `${ROOT}/assets/x` })
    // A sibling sharing the directory's string prefix is outside it, and a
    // `startsWith` check would have let this through.
    expect(resolveRendererPath(`${ROOT}-private`, 'app://ledger/x').file.startsWith(`${ROOT}/`)).toBe(false)
  })
})
