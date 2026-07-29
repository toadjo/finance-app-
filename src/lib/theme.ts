import { useSyncExternalStore } from 'react'

/**
 * Light or dark appearance, shared by the sidebar toggle and the Settings panel.
 *
 * It lives outside React state because two separate parts of the tree change it, and
 * the phone layout hides the sidebar entirely — Settings has to be able to reach it.
 */

export type Theme = 'light' | 'dark'

const KEY = 'ledger.theme'
const listeners = new Set<() => void>()

export function readTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'light'
  // Light by default, the way a Mac app opens.
  return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
}

/** Keep these in step with --bg in styles.css. */
const CHROME_COLOR: Record<Theme, string> = { light: '#f2f2f7', dark: '#1e1e1e' }

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  // Installed on a phone, the status bar takes its colour from this tag rather than
  // from the page, so it has to follow the toggle or it sits at the wrong shade.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME_COLOR[theme])
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* a private-mode browser that refuses storage still gets the right colours */
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light' as Theme)
  return [theme, applyTheme]
}
