import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { STORAGE_KEY } from '../lib/storage'
import { Titlebar } from './Titlebar'

/**
 * The last line of defence.
 *
 * React unmounts the entire tree when a render throws, which on a desktop app means
 * a blank window and no way forward — and because the ledger is restored from storage
 * on every launch, a crash caused by the *data* comes back on restart too. So rather
 * than showing nothing, show what broke and the two ways out: reload (for a one-off
 * glitch), or set the saved ledger aside and start clean (for data the app can't read).
 *
 * The reset keeps a copy under a timestamped key instead of deleting it, because the
 * whole promise of this app is that your history is safe.
 */
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Ledger crashed while rendering:', error, info.componentStack)
  }

  private setAsideSavedData = (): void => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved !== null) {
        localStorage.setItem(`${STORAGE_KEY}.broken-${new Date().toISOString().slice(0, 19)}`, saved)
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      /* nothing more we can do here; the reload below is still worth trying */
    }
    location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash-shell">
        {/* The window is frameless: these are its only controls. Losing them along
            with the rest of the tree would leave a crashed app impossible to close. */}
        <Titlebar title="Ledger" />
        <div className="crash">
          <div className="crash-panel">
            <h1>Ledger hit a problem</h1>
            <p>
              Something went wrong while drawing the app. Your data on disk hasn't been touched — reloading
              usually clears it.
            </p>
            <pre className="crash-detail">{error.message || String(error)}</pre>
            <div className="form-actions">
              <button className="btn danger" onClick={this.setAsideSavedData}>
                Start with a clean ledger
              </button>
              <button className="btn primary" onClick={() => location.reload()}>
                Reload
              </button>
            </div>
            <p className="faint">
              “Start with a clean ledger” keeps your current data under a separate key rather than deleting
              it, and on the desktop the JSON backups in your data folder are untouched either way.
            </p>
          </div>
        </div>
      </div>
    )
  }
}
