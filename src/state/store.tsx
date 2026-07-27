import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import type { ReactNode } from 'react'
import type { AppState, Category, Contribution, Expense, Goal, IncomeSource, Settings } from '../types'
import { DEFAULT_STATE, loadState, saveState } from '../lib/storage'
import { desktop } from '../lib/desktop'
import { uid } from '../lib/id'

export type Action =
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'category/add'; category: Omit<Category, 'id'> }
  | { type: 'category/update'; id: string; patch: Partial<Category> }
  | { type: 'category/remove'; id: string }
  | { type: 'income/add'; income: Omit<IncomeSource, 'id'> }
  | { type: 'income/update'; id: string; patch: Partial<IncomeSource> }
  | { type: 'income/remove'; id: string }
  | { type: 'expense/add'; expense: Omit<Expense, 'id'> }
  | { type: 'expense/update'; id: string; patch: Partial<Expense> }
  | { type: 'expense/remove'; id: string }
  | { type: 'goal/add'; goal: Omit<Goal, 'id' | 'createdAt' | 'contributions'> }
  | { type: 'goal/update'; id: string; patch: Partial<Omit<Goal, 'contributions'>> }
  | { type: 'goal/remove'; id: string }
  | { type: 'goal/contribute'; goalId: string; contribution: Omit<Contribution, 'id'> }
  | { type: 'goal/uncontribute'; goalId: string; contributionId: string }
  | { type: 'state/replace'; state: AppState }
  | { type: 'state/reset' }

const FALLBACK_CATEGORY = 'other'

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'category/add':
      return { ...state, categories: [...state.categories, { ...action.category, id: uid() }] }

    case 'category/update':
      return {
        ...state,
        categories: state.categories.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      }

    case 'category/remove': {
      // Keep the ledger intact: orphaned expenses fall back to "Other".
      const fallback = state.categories.find((c) => c.id === FALLBACK_CATEGORY && c.id !== action.id)
      const target = fallback?.id ?? state.categories.find((c) => c.id !== action.id)?.id
      if (!target) return state
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.id),
        expenses: state.expenses.map((e) => (e.categoryId === action.id ? { ...e, categoryId: target } : e)),
      }
    }

    case 'income/add':
      return { ...state, incomes: [...state.incomes, { ...action.income, id: uid() }] }

    case 'income/update':
      return { ...state, incomes: state.incomes.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)) }

    case 'income/remove':
      return { ...state, incomes: state.incomes.filter((i) => i.id !== action.id) }

    case 'expense/add':
      return { ...state, expenses: [...state.expenses, { ...action.expense, id: uid() }] }

    case 'expense/update':
      return { ...state, expenses: state.expenses.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)) }

    case 'expense/remove':
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.id) }

    case 'goal/add':
      return {
        ...state,
        goals: [...state.goals, { ...action.goal, id: uid(), createdAt: new Date().toISOString(), contributions: [] }],
      }

    case 'goal/update':
      return { ...state, goals: state.goals.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)) }

    case 'goal/remove':
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) }

    case 'goal/contribute':
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.goalId
            ? { ...g, contributions: [...g.contributions, { ...action.contribution, id: uid() }] }
            : g,
        ),
      }

    case 'goal/uncontribute':
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.goalId
            ? { ...g, contributions: g.contributions.filter((c) => c.id !== action.contributionId) }
            : g,
        ),
      }

    case 'state/replace':
      return action.state

    case 'state/reset':
      return DEFAULT_STATE
  }
}

interface Store {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)

  useEffect(() => {
    saveState(state)
  }, [state])

  // On the desktop, mirror every change to a real file so a cleared browser store
  // (or a moved machine) never means lost history. Debounced — typing an amount
  // shouldn't hit the disk on every keystroke.
  useEffect(() => {
    const bridge = desktop()
    if (!bridge) return
    const timer = setTimeout(() => {
      void bridge.save(JSON.stringify(state, null, 2), 'autosave')
    }, 800)
    return () => clearTimeout(timer)
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <StoreProvider>')
  return store
}

export function useSettings(): Settings {
  return useStore().state.settings
}
