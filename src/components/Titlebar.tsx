import { useEffect, useState } from 'react'
import { desktop } from '../lib/desktop'

/**
 * A macOS-style title bar for our frameless window: traffic lights on the left,
 * centred title, and the whole strip draggable.
 *
 * Rendered only on the desktop — in a browser there's no window to control.
 */
export function Titlebar({ title }: { title: string }) {
  const bridge = desktop()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!bridge) return
    void bridge.window.isMaximized().then(setMaximized)
    return bridge.window.onStateChange((state) => setMaximized(state.maximized))
  }, [bridge])

  if (!bridge) return null

  return (
    <div
      className="titlebar"
      // Double-clicking the title bar zooms the window, as it does on macOS.
      onDoubleClick={() => void bridge.window.toggleMaximize().then(setMaximized)}
    >
      <div className="traffic-lights">
        <button
          type="button"
          className="light close"
          aria-label="Close window"
          onClick={() => void bridge.window.close()}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.5 3.5 L8.5 8.5 M8.5 3.5 L3.5 8.5" />
          </svg>
        </button>
        <button
          type="button"
          className="light minimize"
          aria-label="Minimise window"
          onClick={() => void bridge.window.minimize()}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 6 H9" />
          </svg>
        </button>
        <button
          type="button"
          className="light zoom"
          aria-label={maximized ? 'Restore window' : 'Maximise window'}
          onClick={() => void bridge.window.toggleMaximize().then(setMaximized)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            {maximized ? <path d="M3.5 6 H8.5" /> : <path d="M4 8 V4 H8" />}
          </svg>
        </button>
      </div>

      <div className="titlebar-title">{title}</div>
      {/* Balances the traffic lights so the title sits truly centred. */}
      <div className="traffic-lights" aria-hidden="true" style={{ visibility: 'hidden' }} />
    </div>
  )
}
