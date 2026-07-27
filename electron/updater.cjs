'use strict'

const { app, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Opt-in updates from this project's GitHub releases.
 *
 * The app's whole point is that it works offline, so updates are OFF by default and
 * the network stays sealed until you deliberately turn them on. When enabled, the
 * allowlist opens for this repository's release endpoints and nothing else.
 */

const REPO = { owner: 'toadjo', repo: 'finance-app-' }

/** The only hosts an update may touch, and only while updates are enabled. */
const UPDATE_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])

const prefsFile = path.join(app.getPath('userData'), 'preferences.json')

function loadPrefs() {
  try {
    return { updates: { enabled: false }, ...JSON.parse(fs.readFileSync(prefsFile, 'utf8')) }
  } catch {
    return { updates: { enabled: false } }
  }
}

function savePrefs(prefs) {
  try {
    fs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2))
  } catch (err) {
    console.warn('[updates] could not save preferences:', err)
  }
}

let prefs = loadPrefs()

function updatesEnabled() {
  return prefs.updates?.enabled === true
}

/**
 * Whether the offline blocker should let a URL through.
 * Always false while updates are disabled — that's what keeps the guarantee honest.
 */
function isUpdateRequest(url) {
  if (!updatesEnabled()) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (!UPDATE_HOSTS.has(parsed.hostname)) return false
    // Narrow the API surface to this repository's releases.
    if (parsed.hostname === 'api.github.com') {
      return parsed.pathname.startsWith(`/repos/${REPO.owner}/${REPO.repo}/releases`)
    }
    if (parsed.hostname === 'github.com') {
      return parsed.pathname.startsWith(`/${REPO.owner}/${REPO.repo}/releases/`)
    }
    return true
  } catch {
    return false
  }
}

/** deb/rpm installs need a privileged helper; AppImage can replace itself. */
function packageKind() {
  if (process.env.APPIMAGE) return 'AppImage'
  if (process.platform !== 'linux') return process.platform
  // electron-builder records the package type it produced.
  return process.env.LEDGER_PACKAGE ?? 'system package'
}

let autoUpdater = null
let status = { state: 'idle', version: app.getVersion(), packageKind: packageKind() }
let notify = () => {}

function setStatus(patch) {
  status = { ...status, ...patch }
  notify(status)
}

function getAutoUpdater() {
  if (autoUpdater) return autoUpdater
  // Required lazily: importing it in a dev run (unpackaged) is pointless and noisy.
  const { autoUpdater: updater } = require('electron-updater')
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = true
  updater.allowPrerelease = false
  updater.logger = null

  updater.on('checking-for-update', () => setStatus({ state: 'checking', error: undefined }))
  updater.on('update-available', (info) => setStatus({ state: 'available', latest: info.version }))
  updater.on('update-not-available', (info) => setStatus({ state: 'current', latest: info.version }))
  updater.on('download-progress', (p) => setStatus({ state: 'downloading', percent: Math.round(p.percent) }))
  updater.on('update-downloaded', (info) => setStatus({ state: 'ready', latest: info.version }))
  updater.on('error', (err) => setStatus({ state: 'error', error: String(err?.message ?? err) }))

  autoUpdater = updater
  return updater
}

async function check({ manual = false } = {}) {
  if (!updatesEnabled()) {
    setStatus({ state: 'disabled' })
    return status
  }
  if (!app.isPackaged) {
    setStatus({ state: 'error', error: 'Updates only work in a packaged build.' })
    return status
  }
  try {
    await getAutoUpdater().checkForUpdates()
    prefs.updates.lastCheck = new Date().toISOString()
    savePrefs(prefs)
  } catch (err) {
    setStatus({ state: 'error', error: String(err?.message ?? err) })
  }
  if (manual) console.log('[updates] manual check finished:', status.state)
  return status
}

function register({ onStatus }) {
  notify = onStatus ?? (() => {})
  setStatus({ state: updatesEnabled() ? 'idle' : 'disabled' })

  ipcMain.handle('updates:get', () => ({
    enabled: updatesEnabled(),
    lastCheck: prefs.updates?.lastCheck ?? null,
    status,
  }))

  ipcMain.handle('updates:set-enabled', async (_e, enabled) => {
    prefs = { ...prefs, updates: { ...prefs.updates, enabled: Boolean(enabled) } }
    savePrefs(prefs)
    setStatus({ state: enabled ? 'idle' : 'disabled', error: undefined })
    if (enabled) await check({ manual: true })
    return { enabled: updatesEnabled(), status }
  })

  ipcMain.handle('updates:check', () => check({ manual: true }))

  ipcMain.handle('updates:download', async () => {
    if (!updatesEnabled()) return status
    try {
      await getAutoUpdater().downloadUpdate()
    } catch (err) {
      setStatus({ state: 'error', error: String(err?.message ?? err) })
    }
    return status
  })

  ipcMain.handle('updates:install', () => {
    if (status.state !== 'ready') return status
    // isSilent false so a deb/rpm install can raise its authentication prompt.
    getAutoUpdater().quitAndInstall(false, true)
    return status
  })

  // A check on launch, but only if you've opted in.
  if (updatesEnabled() && app.isPackaged) {
    setTimeout(() => void check(), 4000)
  }
}

module.exports = { register, isUpdateRequest, updatesEnabled, check, packageKind }
