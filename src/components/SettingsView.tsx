import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import type { AppState, Category } from '../types'
import { desktop, type BackupInfo, type UpdateStatus } from '../lib/desktop'
import { normaliseState } from '../lib/storage'
import { formatMoney, parseAmount } from '../lib/money'
import { sampleState } from '../lib/sample'
import { useTheme, type Theme } from '../lib/theme'
import { Card, CardHeader, Field, Modal } from './ui'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'INR', 'BRL', 'MXN', 'ZAR']
const LOCALES = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'nl-NL', 'sv-SE', 'pt-BR', 'ja-JP']
const PALETTE = ['#007AFF', '#34C759', '#5AC8FA', '#FF9500', '#FFCC00', '#FF2D55', '#AF52DE', '#32ADE6', '#FF3B30', '#8E8E93']

export function SettingsView() {
  const { state, dispatch } = useStore()
  const [theme, setTheme] = useTheme()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const bridge = desktop()

  const serialised = () => JSON.stringify(state, null, 2)

  async function exportData() {
    if (bridge) {
      const result = await bridge.exportData(serialised())
      setMessage(result.canceled ? '' : `Exported to ${result.filePath}`)
      return
    }
    // Browser fallback: hand it to the download manager.
    const blob = new Blob([serialised()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function applyImported(contents: string, source: string) {
    let state: AppState
    try {
      const parsed: unknown = JSON.parse(contents)
      if (!parsed || typeof parsed !== 'object') throw new Error('not a Ledger export')
      // Never dispatch a foreign payload as-is: a file that merely looks plausible
      // takes the app down on the next render, and it's already been saved by then.
      state = normaliseState(parsed)
    } catch {
      setMessage('That file could not be read as a Ledger export.')
      return
    }
    dispatch({ type: 'state/replace', state })
    // Snapshot immediately so the previous data is backed up before it's replaced.
    void bridge?.save(JSON.stringify(state, null, 2), 'import')
    setMessage(`Data imported from ${source}.`)
  }

  async function importData(file?: File) {
    if (!file && bridge) {
      const result = await bridge.importData()
      if (result.canceled || !result.contents) return
      applyImported(result.contents, result.filePath ?? 'file')
      return
    }
    if (file) applyImported(await file.text(), file.name)
  }

  return (
    <div className="grid">
      <div className="grid two">
        <Card>
          <CardHeader title="Display" hint="How amounts and dates are formatted" />
          <div className="form-row">
            <Field label="Currency">
              <select
                value={state.settings.currency}
                onChange={(e) => dispatch({ type: 'settings/update', patch: { currency: e.target.value } })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Format">
              <select
                value={state.settings.locale}
                onChange={(e) => dispatch({ type: 'settings/update', patch: { locale: e.target.value } })}
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="faint" style={{ marginTop: 10 }}>
            Preview: {formatMoney(1234.5, state.settings)}
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Appearance</label>
            <div className="pace-picker">
              {(['light', 'dark'] as Theme[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`pace-option ${theme === option ? 'selected' : ''}`}
                  onClick={() => setTheme(option)}
                >
                  <strong>{option === 'light' ? 'Light' : 'Dark'}</strong>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Your data"
            hint={bridge ? 'Saved on this machine, never sent anywhere' : 'Everything lives in this browser only'}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => void exportData()}>
              Export JSON
            </button>
            <button className="btn" onClick={() => (bridge ? void importData() : fileInput.current?.click())}>
              Import JSON
            </button>
            <button
              className="btn"
              onClick={() => {
                if (confirm('Replace everything with demo data?')) {
                  dispatch({ type: 'state/replace', state: sampleState() })
                  setMessage('Demo data loaded.')
                }
              }}
            >
              Load demo data
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (confirm('Delete all income, expenses and goals? This cannot be undone.')) {
                  dispatch({ type: 'state/reset' })
                  setMessage('All data cleared.')
                }
              }}
            >
              Reset everything
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importData(file)
              e.target.value = ''
            }}
            // Only used in a plain browser; the desktop build opens a native dialog.
          />
          {message && (
            <div className="faint" style={{ marginTop: 10 }}>
              {message}
            </div>
          )}
        </Card>
      </div>

      {bridge && <UpdatesPanel />}
      {bridge && <BackupsPanel onMessage={setMessage} />}

      <Card>
        <CardHeader
          title="Categories"
          hint="Set an optional monthly budget for any category"
          action={
            <button className="btn primary" onClick={() => setEditing('new')}>
              + Add category
            </button>
          }
        />
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="right">Monthly budget</th>
              <th className="right">Logged expenses</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.categories.map((c) => {
              const uses = state.expenses.filter((e) => e.categoryId === c.id).length
              return (
                <tr key={c.id}>
                  <td>
                    <span className="chip">
                      <span className="dot" style={{ background: c.color }} />
                      {c.icon} {c.name}
                    </span>
                  </td>
                  <td className="right numeric muted">{c.budget ? formatMoney(c.budget, state.settings) : '—'}</td>
                  <td className="right muted">{uses}</td>
                  <td className="actions">
                    <button className="btn ghost small" onClick={() => setEditing(c)}>
                      Edit
                    </button>
                    <button
                      className="btn danger small"
                      disabled={state.categories.length < 2}
                      onClick={() => {
                        if (uses === 0 || confirm(`Move ${uses} expense(s) to another category and delete "${c.name}"?`))
                          dispatch({ type: 'category/remove', id: c.id })
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {editing && <CategoryForm category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

const STATE_TEXT: Record<UpdateStatus['state'], string> = {
  disabled: 'Off — the app makes no network requests at all',
  idle: 'On — no check run yet',
  checking: 'Checking for updates…',
  available: 'An update is available',
  downloading: 'Downloading…',
  ready: 'Downloaded and ready to install',
  current: "You're on the latest version",
  error: 'Last check failed',
}

/**
 * Desktop only. Off by default: turning this on is the single thing that lets the
 * app talk to the network, and only to this project's release endpoints.
 */
function UpdatesPanel() {
  const bridge = desktop()!
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [lastCheck, setLastCheck] = useState<string | null>(null)
  const { state } = useStore()

  useEffect(() => {
    void bridge.updates.get().then((info) => {
      setEnabled(info.enabled)
      setStatus(info.status)
      setLastCheck(info.lastCheck)
    })
    return bridge.updates.onStatus(setStatus)
  }, [bridge])

  async function toggle(next: boolean) {
    setEnabled(next)
    const result = await bridge.updates.setEnabled(next)
    setStatus(result.status)
  }

  const canSelfUpdate = status?.packageKind === 'AppImage' || status?.packageKind === 'rpm' || status?.packageKind === 'deb'

  return (
    <Card>
      <CardHeader
        title="Updates"
        hint={`Version ${status?.version ?? ''} · installed as ${status?.packageKind ?? 'unknown'}`}
        action={
          enabled && (
            <button className="btn" onClick={() => void bridge.updates.check()} disabled={status?.state === 'checking'}>
              {status?.state === 'checking' ? 'Checking…' : 'Check now'}
            </button>
          )
        }
      />

      <label className="suggestion" style={{ cursor: 'pointer', marginBottom: 10 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => void toggle(e.target.checked)} style={{ width: 'auto' }} />
        <span style={{ color: 'var(--text)', fontWeight: 550 }}>Check GitHub for new versions</span>
      </label>

      <div className="faint">
        {enabled
          ? 'Ledger may now reach github.com for this project’s releases — nothing else. Your finances are never sent anywhere.'
          : 'Leave this off to keep the app completely offline. Turning it on is the only thing that opens any network access.'}
      </div>

      <div className="list-row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
        <span className={`alert-mark ${status?.state === 'error' ? 'danger' : status?.state === 'available' || status?.state === 'ready' ? 'warn' : 'info'}`} aria-hidden="true">
          {status?.state === 'error' ? '!' : status?.state === 'ready' ? '↓' : 'i'}
        </span>
        <span className="grow">
          <div style={{ fontWeight: 550 }}>{status ? STATE_TEXT[status.state] : 'Loading…'}</div>
          <div className="faint">
            {status?.error
              ? status.error
              : status?.latest
                ? `Latest release: ${status.latest}${status.percent !== undefined ? ` · ${status.percent}%` : ''}`
                : lastCheck
                  ? `Last checked ${new Date(lastCheck).toLocaleString(state.settings.locale)}`
                  : 'Nothing to report'}
          </div>
        </span>
        {status?.state === 'available' && (
          <button className="btn primary small" onClick={() => void bridge.updates.download()}>
            Download
          </button>
        )}
        {status?.state === 'ready' && (
          <button className="btn primary small" onClick={() => void bridge.updates.install()}>
            Restart &amp; install
          </button>
        )}
      </div>

      {enabled && !canSelfUpdate && (
        <div className="faint" style={{ marginTop: 8 }}>
          This build can tell you about new versions but can’t install them itself — download the new package
          from the releases page instead.
        </div>
      )}
    </Card>
  )
}

/**
 * Desktop only: the app keeps rolling JSON backups on disk, so a cleared browser
 * store or a bad import is always recoverable.
 */
function BackupsPanel({ onMessage }: { onMessage: (text: string) => void }) {
  const { state, dispatch } = useStore()
  const bridge = desktop()!
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [paths, setPaths] = useState<{ dataDir: string; backupDir: string } | null>(null)

  const refresh = useCallback(async () => {
    setBackups(await bridge.listBackups())
    setPaths(await bridge.dataDir())
  }, [bridge])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function restore(name: string) {
    if (!confirm(`Replace your current data with the backup from ${name}?`)) return
    try {
      const parsed = normaliseState(JSON.parse(await bridge.readBackup(name)))
      dispatch({ type: 'state/replace', state: parsed })
      onMessage(`Restored from ${name}.`)
      await refresh()
    } catch {
      onMessage('That backup could not be read.')
    }
  }

  return (
    <Card>
      <CardHeader
        title="Backups"
        hint={paths?.backupDir}
        action={
          <button
            className="btn"
            onClick={async () => {
              const name = await bridge.backupNow(JSON.stringify(state, null, 2))
              onMessage(name ? `Backed up as ${name}.` : 'Backup failed.')
              await refresh()
            }}
          >
            Back up now
          </button>
        }
      />
      {backups.length === 0 ? (
        <div className="faint">No backups yet — one is written automatically the first time you change something.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Taken</th>
              <th className="right">Size</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.name}>
                <td className="muted">{new Date(backup.modified).toLocaleString(state.settings.locale)}</td>
                <td className="right numeric muted">{(backup.size / 1024).toFixed(1)} kB</td>
                <td className="actions">
                  <button className="btn ghost small" onClick={() => void restore(backup.name)}>
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function CategoryForm({ category, onClose }: { category?: Category; onClose: () => void }) {
  const { dispatch } = useStore()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '📦')
  const [color, setColor] = useState(category?.color ?? PALETTE[0])
  const [budget, setBudget] = useState(category?.budget ? String(category.budget) : '')
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Give the category a name.')
    const parsed = parseAmount(budget)
    const payload = { name: name.trim(), icon: icon.trim() || '📦', color, budget: parsed > 0 ? parsed : undefined }
    if (category) dispatch({ type: 'category/update', id: category.id, patch: payload })
    else dispatch({ type: 'category/add', category: payload })
    onClose()
  }

  return (
    <Modal title={category ? 'Edit category' : 'New category'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="form-row">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pets" autoFocus />
          </Field>
          <Field label="Icon">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder="🐈" />
          </Field>
        </div>
        <Field label="Monthly budget (optional)" error={error}>
          <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Colour">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use colour ${c}`}
                onClick={() => setColor(c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: c,
                  border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {category ? 'Save changes' : 'Add category'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
