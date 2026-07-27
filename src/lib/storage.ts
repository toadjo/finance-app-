import type { AppState } from '../types'

export const STORAGE_KEY = 'ledger.state.v1'
export const STATE_VERSION = 1

export const DEFAULT_STATE: AppState = {
  version: STATE_VERSION,
  settings: { currency: 'USD', locale: 'en-US' },
  categories: [
    { id: 'housing', name: 'Housing', color: '#6366f1', icon: '🏠' },
    { id: 'groceries', name: 'Groceries', color: '#22c55e', icon: '🛒' },
    { id: 'transport', name: 'Transport', color: '#38bdf8', icon: '🚇' },
    { id: 'dining', name: 'Eating out', color: '#f97316', icon: '🍜' },
    { id: 'utilities', name: 'Utilities', color: '#eab308', icon: '💡' },
    { id: 'health', name: 'Health', color: '#ec4899', icon: '💊' },
    { id: 'fun', name: 'Fun', color: '#a855f7', icon: '🎬' },
    { id: 'subscriptions', name: 'Subscriptions', color: '#14b8a6', icon: '🔁' },
    { id: 'other', name: 'Other', color: '#94a3b8', icon: '📦' },
  ],
  incomes: [],
  expenses: [],
  goals: [],
}

/** Reads persisted state, tolerating absent, corrupt or partial payloads. */
export function loadState(): AppState {
  if (typeof localStorage === 'undefined') return DEFAULT_STATE
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_STATE
  try {
    return migrate(JSON.parse(raw) as Partial<AppState>)
  } catch {
    console.warn('Saved data could not be read; starting fresh.')
    return DEFAULT_STATE
  }
}

export function saveState(state: AppState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    console.warn('Could not save data:', err)
  }
}

/** Fills in anything a older/hand-edited payload is missing. */
function migrate(saved: Partial<AppState>): AppState {
  return {
    version: STATE_VERSION,
    settings: { ...DEFAULT_STATE.settings, ...saved.settings },
    categories: saved.categories?.length ? saved.categories : DEFAULT_STATE.categories,
    incomes: saved.incomes ?? [],
    expenses: saved.expenses ?? [],
    goals: (saved.goals ?? []).map((g) => ({ ...g, contributions: g.contributions ?? [] })),
  }
}
