import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import { Dashboard } from './components/Dashboard'
import { ExpensesView } from './components/ExpensesView'
import { IncomeView } from './components/IncomeView'
import { GoalsView } from './components/GoalsView'
import { SettingsView } from './components/SettingsView'
import { addMonths, currentMonth, formatMonth } from './lib/date'

export type View = 'dashboard' | 'expenses' | 'income' | 'goals' | 'settings'

const NAV: { id: View; label: string; icon: string; title: string; subtitle: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◎', title: 'Dashboard', subtitle: 'Your month at a glance' },
  { id: 'expenses', label: 'Expenses', icon: '🧾', title: 'Expenses', subtitle: 'Every spend, categorised' },
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
  const { state } = useStore()
  const [view, setView] = useState<View>('dashboard')
  const [month, setMonth] = useState(currentMonth())
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('ledger.theme') as 'dark' | 'light') ?? 'dark',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('ledger.theme', theme)
  }, [theme])

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
            Saved in this browser
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
              <div className="month-picker">
                <button className="icon-button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
                  ‹
                </button>
                <span>{formatMonth(month, state.settings.locale)}</span>
                <button
                  className="icon-button"
                  aria-label="Next month"
                  onClick={() => setMonth(addMonths(month, 1))}
                  disabled={month >= currentMonth()}
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </header>

        {view === 'dashboard' && <Dashboard month={month} onNavigate={setView} />}
        {view === 'expenses' && <ExpensesView month={month} />}
        {view === 'income' && <IncomeView month={month} />}
        {view === 'goals' && <GoalsView month={month} />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}
