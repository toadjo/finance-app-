/**
 * Access to the Electron shell, when there is one.
 *
 * Every call is optional by design: the same bundle runs in a plain browser during
 * `npm run dev`, where `window.ledger` is undefined and callers fall back to browser
 * behaviour (localStorage only, download-based export).
 */

export type SaveReason = 'autosave' | 'import' | 'reset' | 'manual'

export interface BackupInfo {
  name: string
  size: number
  modified: string
}

export type UpdateState = 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'current' | 'error'

export interface UpdateStatus {
  state: UpdateState
  version: string
  packageKind: string
  latest?: string
  percent?: number
  error?: string
}

export interface UpdatesApi {
  get(): Promise<{ enabled: boolean; lastCheck: string | null; status: UpdateStatus }>
  setEnabled(enabled: boolean): Promise<{ enabled: boolean; status: UpdateStatus }>
  check(): Promise<UpdateStatus>
  download(): Promise<UpdateStatus>
  install(): Promise<UpdateStatus>
  onStatus(handler: (status: UpdateStatus) => void): () => void
}

export interface DesktopBridge {
  isDesktop: true
  save(contents: string, reason: SaveReason): Promise<{ file: string }>
  readSnapshot(): Promise<string | null>
  dataDir(): Promise<{ dataDir: string; backupDir: string; snapshotFile: string }>
  listBackups(): Promise<BackupInfo[]>
  readBackup(name: string): Promise<string>
  backupNow(contents: string): Promise<string | null>
  exportData(contents: string): Promise<{ canceled: boolean; filePath?: string }>
  importData(): Promise<{ canceled: boolean; filePath?: string; contents?: string }>
  blockedRequests(): Promise<{ url: string; at: string }[]>
  updates: UpdatesApi
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onStateChange(handler: (state: { maximized: boolean }) => void): () => void
  }
  onMenu(handler: (command: string) => void): () => void
}

declare global {
  interface Window {
    ledger?: DesktopBridge
  }
}

export function desktop(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.ledger
}

export function isDesktop(): boolean {
  return desktop() !== undefined
}
