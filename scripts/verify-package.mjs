/**
 * Asserts that a packaged build actually contains the app.
 *
 * electron-builder happily produces a valid AppImage with no renderer in it if the
 * Vite build was never run — the app launches to a blank window and nothing fails
 * loudly. This check reads the packaged asar and insists the pieces are present.
 *
 * Usage: node scripts/verify-package.mjs [path/to/app.asar]
 */
import { readFileSync, existsSync } from 'node:fs'

const asarPath = process.argv[2] ?? 'release/linux-unpacked/resources/app.asar'

if (!existsSync(asarPath)) {
  console.error(`✗ No packaged asar at ${asarPath} — did the build run?`)
  process.exit(1)
}

// asar layout: 8-byte pickle preamble, header size at offset 12, JSON header from 16.
const buf = readFileSync(asarPath)
const headerSize = buf.readUInt32LE(12)
const header = JSON.parse(buf.subarray(16, 16 + headerSize).toString('utf8'))

const failures = []

function entry(path) {
  return path.split('/').reduce((node, part) => node?.files?.[part], { files: header.files })
}

const dist = entry('dist')
if (!dist?.files) {
  failures.push('dist/ is missing entirely — the renderer was never built (run `npm run build` first)')
} else {
  if (!entry('dist/index.html')) failures.push('dist/index.html is missing')

  const assets = entry('dist/assets')?.files ?? {}
  const names = Object.keys(assets)
  if (!names.some((n) => n.endsWith('.js'))) failures.push('no JS bundle in dist/assets')
  if (!names.some((n) => n.endsWith('.css'))) failures.push('no stylesheet in dist/assets')
}

if (!entry('electron/main.cjs')) failures.push('electron/main.cjs is missing')
if (!entry('electron/preload.cjs')) failures.push('electron/preload.cjs is missing')

if (failures.length > 0) {
  console.error('✗ Packaged app is incomplete:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

const bundles = Object.keys(entry('dist/assets').files)
console.log(`✓ Package looks complete: dist/index.html + ${bundles.length} asset(s), main and preload present.`)
