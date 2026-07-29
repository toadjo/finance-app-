'use strict'

const path = require('node:path')

/**
 * Resolving an `app://` URL to a file inside the bundled renderer.
 *
 * Split out from the protocol handler so the containment rule can be tested directly:
 * it is the only thing standing between a URL and the filesystem, and a string-prefix
 * check is not it — "…/dist-anything/x" starts with "…/dist" without being inside it.
 */

/**
 * @param {string} rendererDir absolute path to the bundled renderer
 * @param {string} url the requested app:// URL
 * @returns {{ file: string } | { status: 400 | 403 }}
 */
function resolveRendererPath(rendererDir, url) {
  let resolved
  try {
    const { pathname } = new URL(url)
    // URL pathnames stay percent-encoded, so an asset with a space in its name would
    // otherwise be looked up literally as "a%20b.png" and 404.
    const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).slice(1)
    resolved = path.resolve(rendererDir, relative)
  } catch {
    // A malformed percent-escape is not a path worth guessing at.
    return { status: 400 }
  }

  // Compare on path segments rather than string prefixes.
  const relativeToRoot = path.relative(rendererDir, resolved)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return { status: 403 }

  return { file: resolved }
}

module.exports = { resolveRendererPath }
