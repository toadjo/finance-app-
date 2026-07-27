'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * The only surface the renderer gets. Everything is a narrow, named operation —
 * no filesystem handles, no arbitrary paths, no node APIs.
 *
 * The renderer feature-detects `window.ledger`, so the same build still runs in a
 * plain browser (npm run dev) with these capabilities simply absent.
 */
contextBridge.exposeInMainWorld('ledger', {
  isDesktop: true,

  /** Persist a JSON snapshot of the whole store. `reason` drives backup behaviour. */
  save: (contents, reason) => ipcRenderer.invoke('ledger:save', { contents, reason }),

  /** The snapshot written on disk, or null if there isn't one yet. */
  readSnapshot: () => ipcRenderer.invoke('ledger:read-snapshot'),

  dataDir: () => ipcRenderer.invoke('ledger:data-dir'),
  listBackups: () => ipcRenderer.invoke('ledger:list-backups'),
  readBackup: (name) => ipcRenderer.invoke('ledger:read-backup', name),
  backupNow: (contents) => ipcRenderer.invoke('ledger:backup-now', contents),

  /** Native save/open dialogs. */
  exportData: (contents) => ipcRenderer.invoke('ledger:export', contents),
  importData: () => ipcRenderer.invoke('ledger:import'),

  /** Outbound requests the main process refused. Should always be empty. */
  blockedRequests: () => ipcRenderer.invoke('ledger:blocked-requests'),

  /** Opt-in updates from this project's GitHub releases. Off unless you enable it. */
  updates: {
    get: () => ipcRenderer.invoke('updates:get'),
    setEnabled: (enabled) => ipcRenderer.invoke('updates:set-enabled', enabled),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (handler) => {
      const listener = (_event, status) => handler(status)
      ipcRenderer.on('update-status', listener)
      return () => ipcRenderer.removeListener('update-status', listener)
    },
  },

  /** Menu commands, e.g. 'view:goals', 'month:prev', 'export'. Returns an unsubscribe fn. */
  onMenu: (handler) => {
    const listener = (_event, command) => handler(command)
    ipcRenderer.on('menu', listener)
    return () => ipcRenderer.removeListener('menu', listener)
  },
})
