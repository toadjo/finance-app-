import type { AppState } from '../types'

export const STORAGE_KEY = 'ledger.state.v1'
export const STATE_VERSION = 1

export const DEFAULT_STATE: AppState = {
  version: STATE_VERSION,
  settings: { currency: 'USD', locale: 'en-US', lifestyle: 'balanced' },
  categories: [
    { id: 'housing', name: 'Housing', color: '#5856D6', icon: '🏠' },
    { id: 'groceries', name: 'Groceries', color: '#34C759', icon: '🛒' },
    { id: 'transport', name: 'Transport', color: '#5AC8FA', icon: '🚇' },
    { id: 'dining', name: 'Eating out', color: '#FF9500', icon: '🍜' },
    { id: 'utilities', name: 'Utilities', color: '#FFCC00', icon: '💡' },
    { id: 'health', name: 'Health', color: '#FF2D55', icon: '💊' },
    { id: 'fun', name: 'Fun', color: '#AF52DE', icon: '🎬' },
    { id: 'subscriptions', name: 'Subscriptions', color: '#32ADE6', icon: '🔁' },
    { id: 'other', name: 'Other', color: '#8E8E93', icon: '📦' },
  ],
  incomes: [],
  expenses: [],
  goals: [],
  recurring: [],
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
    // Added after v0.3; older saves simply have none.
    recurring: saved.recurring ?? [],
  }
}
