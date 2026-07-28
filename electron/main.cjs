'use strict'

const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const { pathToFileURL } = require('node:url')
const updates = require('./updater.cjs')

const DEV_SERVER = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIR = path.join(__dirname, '..', 'dist')

/**
 * The app is served over app:// rather than file:// so the renderer gets a stable,
 * persistent origin — file:// origins give unreliable localStorage between launches.
 */
const APP_ORIGIN = 'app://ledger'

// ---------------------------------------------------------------- offline lockdown

// Nothing here should ever reach a network, so switch off everything Chromium
// would otherwise do on its own initiative.
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('disable-domain-reliability')
app.commandLine.appendSwitch('disable-breakpad')
app.commandLine.appendSwitch('metrics-recording-only')

/** Requests the app tried to make to somewhere other than itself. Should stay empty. */
const blockedRequests = []

const CSP = [
  "default-src 'self' app:",
  "script-src 'self' app:",
  "style-src 'self' app: 'unsafe-inline'",
  "img-src 'self' app: data:",
  "font-src 'self' app: data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

function isLocalRequest(url) {
  return (
    url.startsWith('app://') ||
    url.startsWith('devtools://') ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    // Only while running against the Vite dev server.
    (DEV_SERVER !== undefined && url.startsWith(DEV_SERVER))
  )
}

/**
 * The single exception to "no network": release endpoints for this repository, and
 * only while you have updates switched on. Everything else is still refused.
 */
function isAllowedRequest(url) {
  return isLocalRequest(url) || updates.isUpdateRequest(url)
}

function lockDownSession(target) {
  target.webRequest.onBeforeRequest((details, callback) => {
    if (isAllowedRequest(details.url)) return callback({ cancel: false })
    blockedRequests.push({ url: details.url, at: new Date().toISOString() })
    console.warn('[offline] blocked outbound request:', details.url)
    callback({ cancel: true })
  })

  target.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
  })

  // No camera, geolocation, notifications — the app needs none of it.
  target.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  target.setPermissionCheckHandler(() => false)
}

// ---------------------------------------------------------------- data on disk

const dataDir = path.join(app.getPath('userData'), 'data')
const backupDir = path.join(dataDir, 'backups')
const snapshotFile = path.join(dataDir, 'ledger.json')
const windowStateFile = path.join(app.getPath('userData'), 'window-state.json')
const MAX_BACKUPS = 20

async function ensureDirs() {
  await fsp.mkdir(backupDir, { recursive: true })
}

/** Write via a temp file + rename so an interrupted write can never truncate good data. */
async function writeAtomic(file, contents) {
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, contents, 'utf8')
  await fsp.rename(tmp, file)
}

function backupName(date = new Date()) {
  const iso = date.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `ledger-${iso}.json`
}

async function pruneBackups() {
  const files = (await fsp.readdir(backupDir)).filter((f) => f.endsWith('.json')).sort()
  for (const stale of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
    await fsp.unlink(path.join(backupDir, stale)).catch(() => {})
  }
}

/** One backup a day is plenty for autosaves; explicit reasons always get their own. */
async function writeBackup(contents, { force = false } = {}) {
  await ensureDirs()
  const today = new Date().toISOString().slice(0, 10)
  const existing = (await fsp.readdir(backupDir)).filter((f) => f.startsWith(`ledger-${today}`))
  if (existing.length > 0 && !force) return null
  const name = backupName()
  await writeAtomic(path.join(backupDir, name), contents)
  await pruneBackups()
  return name
}

async function saveSnapshot(contents, reason) {
  await ensureDirs()
  if (reason === 'import' || reason === 'reset') {
    // Take a backup of what was there *before* we overwrite it.
    const previous = await fsp.readFile(snapshotFile, 'utf8').catch(() => null)
    if (previous) await writeBackup(previous, { force: true })
  }
  await writeAtomic(snapshotFile, contents)
  await writeBackup(contents)
  return { file: snapshotFile }
}

// ---------------------------------------------------------------- window

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStateFile, 'utf8'))
  } catch {
    return { width: 1280, height: 860 }
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return
  const bounds = win.getNormalBounds()
  try {
    fs.writeFileSync(windowStateFile, JSON.stringify({ ...bounds, maximized: win.isMaximized() }))
  } catch {
    /* a window that won't remember its size is not worth crashing over */
  }
}

let mainWindow = null

function send(channel, payload) {
  mainWindow?.webContents.send(channel, payload)
}

function createWindow() {
  const state = loadWindowState()

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width ?? 1280,
    height: state.height ?? 860,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#f2f2f7',
    show: false,
    // Frameless with our own traffic lights, so the window reads like a Mac app
    // on a desktop that has no native equivalent.
    frame: false,
    autoHideMenuBar: true,
    title: 'Ledger',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  })

  if (state.maximized) mainWindow.maximize()
  mainWindow.once('ready-to-show', () => mainWindow.show())
  // Let the custom titlebar restyle its zoom button in step with the real state.
  mainWindow.on('maximize', () => send('window-state', { maximized: true }))
  mainWindow.on('unmaximize', () => send('window-state', { maximized: false }))
  mainWindow.on('close', () => saveWindowState(mainWindow))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Never navigate away from the app, and never open a second window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN) && url !== DEV_SERVER) event.preventDefault()
  })

  if (DEV_SERVER) mainWindow.loadURL(DEV_SERVER)
  else mainWindow.loadURL(`${APP_ORIGIN}/index.html`)
}

// ---------------------------------------------------------------- menu

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Export data…', accelerator: 'CmdOrCtrl+E', click: () => send('menu', 'export') },
        { label: 'Import data…', accelerator: 'CmdOrCtrl+O', click: () => send('menu', 'import') },
        { type: 'separator' },
        { label: 'Back up now', accelerator: 'CmdOrCtrl+B', click: () => send('menu', 'backup') },
        { label: 'Restore from backup…', click: () => send('menu', 'restore') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'Go',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => send('menu', 'view:dashboard') },
        { label: 'Expenses', accelerator: 'CmdOrCtrl+2', click: () => send('menu', 'view:expenses') },
        { label: 'Income', accelerator: 'CmdOrCtrl+3', click: () => send('menu', 'view:income') },
        { label: 'Goals', accelerator: 'CmdOrCtrl+4', click: () => send('menu', 'view:goals') },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => send('menu', 'view:settings') },
        { type: 'separator' },
        { label: 'Previous month', accelerator: 'CmdOrCtrl+Left', click: () => send('menu', 'month:prev') },
        { label: 'Next month', accelerator: 'CmdOrCtrl+Right', click: () => send('menu', 'month:next') },
        { label: 'This month', accelerator: 'CmdOrCtrl+T', click: () => send('menu', 'month:today') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle light / dark', accelerator: 'CmdOrCtrl+D', click: () => send('menu', 'theme') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(DEV_SERVER ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for updates…',
          click: async () => {
            const status = await updates.check({ manual: true })
            if (status.state === 'disabled') send('menu', 'view:settings')
          },
        },
        { type: 'separator' },
        {
          label: 'About Ledger',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Ledger',
              message: `Ledger ${app.getVersion()}`,
              detail: [
                'An offline personal finance tracker.',
                '',
                `Your data: ${dataDir}`,
                `Backups: ${backupDir}`,
                '',
                updates.updatesEnabled()
                  ? 'Updates: on — release checks against GitHub are allowed.'
                  : 'Updates: off — this app makes no network requests at all.',
                blockedRequests.length === 0
                  ? 'No outbound requests have been blocked this session.'
                  : `${blockedRequests.length} outbound request(s) blocked this session.`,
              ].join('\n'),
              buttons: ['OK'],
            }),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------------------------------------------------------------- ipc

function registerIpc() {
  ipcMain.handle('ledger:save', async (_e, { contents, reason }) => saveSnapshot(contents, reason))

  ipcMain.handle('ledger:read-snapshot', async () => fsp.readFile(snapshotFile, 'utf8').catch(() => null))

  ipcMain.handle('ledger:data-dir', () => ({ dataDir, backupDir, snapshotFile }))

  ipcMain.handle('ledger:list-backups', async () => {
    await ensureDirs()
    const names = (await fsp.readdir(backupDir)).filter((f) => f.endsWith('.json')).sort().reverse()
    return Promise.all(
      names.map(async (name) => {
        const stat = await fsp.stat(path.join(backupDir, name))
        return { name, size: stat.size, modified: stat.mtime.toISOString() }
      }),
    )
  })

  ipcMain.handle('ledger:read-backup', async (_e, name) => {
    // Never let a renderer-supplied name escape the backup directory.
    const file = path.join(backupDir, path.basename(name))
    return fsp.readFile(file, 'utf8')
  })

  ipcMain.handle('ledger:backup-now', async (_e, contents) => writeBackup(contents, { force: true }))

  ipcMain.handle('ledger:export', async (_e, contents) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Ledger data',
      defaultPath: path.join(app.getPath('documents'), `ledger-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { canceled: true }
    await writeAtomic(filePath, contents)
    return { canceled: false, filePath }
  })

  ipcMain.handle('ledger:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Ledger data',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || filePaths.length === 0) return { canceled: true }
    return { canceled: false, filePath: filePaths[0], contents: await fsp.readFile(filePaths[0], 'utf8') }
  })

  // Exposed so the offline guarantee is inspectable from inside the app.
  ipcMain.handle('ledger:blocked-requests', () => blockedRequests)

  // Window controls, since a frameless window has none of its own.
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
}

// ---------------------------------------------------------------- bootstrap

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    lockDownSession(session.defaultSession)
    await ensureDirs()

    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url)
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1)
      const resolved = path.join(RENDERER_DIR, relative)
      // Refuse anything that resolves outside the bundled renderer.
      if (!resolved.startsWith(RENDERER_DIR)) return new Response('Forbidden', { status: 403 })
      return net.fetch(pathToFileURL(resolved).toString())
    })

    registerIpc()
    updates.register({ onStatus: (status) => send('update-status', status) })
    buildMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => app.quit())
}
