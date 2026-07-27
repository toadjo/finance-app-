import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import { Dashboard } from './components/Dashboard'
import { ExpensesView } from './components/ExpensesView'
import { IncomeView } from './components/IncomeView'
import { GoalsView } from './components/GoalsView'
import { RecurringView } from './components/RecurringView'
import { SettingsView } from './components/SettingsView'
import { Modal } from './components/ui'
import type { AppState } from './types'
import { addMonths, currentMonth, formatMonth } from './lib/date'
import { desktop, isDesktop } from './lib/desktop'

export type View = 'dashboard' | 'expenses' | 'recurring' | 'income' | 'goals' | 'settings'

const NAV: { id: View; label: string; icon: string; title: string; subtitle: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◎', title: 'Dashboard', subtitle: 'Your month at a glance' },
  { id: 'expenses', label: 'Expenses', icon: '🧾', title: 'Expenses', subtitle: 'Every spend, categorised' },
  { id: 'recurring', label: 'Recurring', icon: '🔁', title: 'Recurring', subtitle: 'Bills and transfers that repeat' },
  { id: 'income', label: 'Income', icon: '💰', title: 'Income', subtitle: 'What you make each month' },
  { id: 'goals', label: 'Goals', icon: '🎯', title: 'Goals', subtitle: 'What you are saving towards' },
  { id: 'settings', label: 'Settings', icon: '⚙︎', title: 'Settings', subtitle: 'Categories, currency and your data' },
]

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { state, dispatch } = useStore()
  const [recovery, setRecovery] = useState<AppState | null>(null)
  const [view, setView] = useState<View>('dashboard')
  const [month, setMonth] = useState(currentMonth())
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('ledger.theme') as 'dark' | 'light') ?? 'dark',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('ledger.theme', theme)
  }, [theme])

  // Native menu commands. Export/import/backup live in Settings, so those jump there.
  useEffect(() => {
    const bridge = desktop()
    if (!bridge) return
    return bridge.onMenu((command) => {
      if (command.startsWith('view:')) setView(command.slice(5) as View)
      else if (command === 'month:prev') setMonth((m) => addMonths(m, -1))
      else if (command === 'month:next') setMonth((m) => (m >= currentMonth() ? m : addMonths(m, 1)))
      else if (command === 'month:today') setMonth(currentMonth())
      else if (command === 'theme') setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
      else setView('settings')
    })
  }, [])

  // Write any recurring items that have fallen due — on launch, and again whenever the
  // rules change, so a rule you add backdated starts posting immediately rather than
  // waiting for the next launch. The reducer is idempotent, so extra runs cost nothing
  // and this settles after one pass.
  useEffect(() => {
    dispatch({ type: 'recurring/post-due' })
  }, [dispatch, state.recurring])

  // And hourly, for an app left open across midnight.
  useEffect(() => {
    const timer = setInterval(() => dispatch({ type: 'recurring/post-due' }), 60 * 60 * 1000)
    return () => clearInterval(timer)
  }, [dispatch])

  // If the browser store was cleared but the app has data on disk, offer it back
  // rather than silently starting from nothing.
  useEffect(() => {
    const bridge = desktop()
    if (!bridge) return
    if (state.expenses.length > 0 || state.incomes.length > 0 || state.goals.length > 0) return
    void bridge.readSnapshot().then((contents) => {
      if (!contents) return
      try {
        const parsed = JSON.parse(contents) as AppState
        if (parsed.expenses?.length || parsed.incomes?.length || parsed.goals?.length) setRecovery(parsed)
      } catch {
        /* an unreadable snapshot is not worth interrupting startup over */
      }
    })
    // Deliberately mount-only: this is a startup recovery prompt, not a live watcher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = NAV.find((n) => n.id === view)!
  const showMonthPicker = view !== 'settings'

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark">▮</span>
          <span>Ledger</span>
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
            aria-current={view === item.id ? 'page' : undefined}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <div className="sidebar-footer">
          <button className="btn small" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀︎ Light' : '☾ Dark'}
          </button>
          <span className="faint">
            {state.expenses.length} expenses · {state.goals.length} goals
            <br />
            {isDesktop() ? 'Saved on this machine · offline' : 'Saved in this browser'}
          </span>
        </div>
      </nav>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{active.title}</h1>
            <div className="subtitle">{active.subtitle}</div>
          </div>

          {showMonthPicker && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {month !== currentMonth() && (
                <button className="btn small" onClick={() => setMonth(currentMonth())}>
                  Today
                </button>
              )}
              {month > currentMonth() && <span className="chip planning">Planning ahead</span>}
              <div className="month-picker">
                <button className="icon-button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
                  ‹
                </button>
                <span>{formatMonth(month, state.settings.locale)}</span>
                <button
                  className="icon-button"
                  aria-label="Next month"
                  onClick={() => setMonth(addMonths(month, 1))}
                  // Planning ahead is the point; two years is far enough to be useful
                  // without letting you wander somewhere meaningless.
                  disabled={month >= addMonths(currentMonth(), 24)}
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </header>

        {view === 'dashboard' && <Dashboard month={month} onNavigate={setView} />}
        {view === 'expenses' && <ExpensesView month={month} />}
        {view === 'recurring' && <RecurringView month={month} />}
        {view === 'income' && <IncomeView month={month} />}
        {view === 'goals' && <GoalsView month={month} />}
        {view === 'settings' && <SettingsView />}
      </main>

      {recovery && (
        <Modal title="Restore your data?" onClose={() => setRecovery(null)}>
          <div className="stack">
            <p style={{ margin: 0 }}>
              This app has no data, but there's a saved file on this machine with{' '}
              <strong>{recovery.expenses.length} expenses</strong>, {recovery.incomes.length} income sources and{' '}
              {recovery.goals.length} goals. Restore it?
            </p>
            <div className="form-actions">
              <button className="btn" onClick={() => setRecovery(null)}>
                Start fresh
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  dispatch({ type: 'state/replace', state: recovery })
                  setRecovery(null)
                }}
              >
                Restore
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
