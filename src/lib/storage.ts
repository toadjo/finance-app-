import type {
  AppState,
  Category,
  Contribution,
  Expense,
  Frequency,
  Goal,
  IncomeSource,
  Lifestyle,
  Pace,
  RecurringRule,
  Settings,
} from '../types'
import { uid } from './id'

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
    return normaliseState(JSON.parse(raw))
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

// ---------------------------------------------------------------- normalisation

/**
 * Turns anything JSON-shaped into a state the app can actually render.
 *
 * Every route by which foreign data enters — the browser store, a file you import, a
 * backup you restore, the snapshot recovered from disk — goes through here. Without
 * it a payload that merely *looks* plausible (`{"expenses":[],"goals":[]}`) reaches
 * the views with `categories` undefined and takes the whole app down on first render,
 * and a bad currency code makes `Intl` throw from inside every money label.
 *
 * The rule is repair over reject: fill in what's missing, coerce what's the wrong
 * type, and drop only the individual records that can't be made sense of — so one bad
 * row in a hand-edited export costs you that row, not the file.
 */
export function normaliseState(input: unknown): AppState {
  const saved = isRecord(input) ? input : {}

  const categories = normaliseCategories(saved.categories)
  // Anything pointing at a category that didn't survive is re-homed rather than left
  // dangling, matching what deleting a category in-app already does.
  const fallbackCategory = categories.find((c) => c.id === 'other')?.id ?? categories[0].id
  const goals = normaliseGoals(saved.goals)
  const goalIds = new Set(goals.map((g) => g.id))

  return {
    version: STATE_VERSION,
    settings: normaliseSettings(saved.settings),
    categories,
    incomes: normaliseIncomes(saved.incomes),
    expenses: normaliseExpenses(saved.expenses, categories, fallbackCategory),
    goals,
    // Added after v0.3; older saves simply have none.
    recurring: normaliseRecurring(saved.recurring, categories, fallbackCategory, goalIds),
  }
}

const FREQUENCIES: readonly Frequency[] = ['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
const LIFESTYLES: readonly Lifestyle[] = ['relaxed', 'balanced', 'focused']
const PACES: readonly Pace[] = ['strict', 'balanced']

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_PATTERN = /^\d{4}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

/** A finite number, however it was stored — exports have been seen with amounts as strings. */
function finite(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function day(value: unknown): string | undefined {
  return typeof value === 'string' && DAY_PATTERN.test(value) ? value : undefined
}

function month(value: unknown): string | undefined {
  return typeof value === 'string' && MONTH_PATTERN.test(value) ? value : undefined
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

/**
 * Currency and locale are the two fields that can crash the app from a distance:
 * `Intl` throws on an unknown currency code, and every amount on every screen goes
 * through it. Probe them once here rather than guarding a hundred call sites.
 */
function normaliseSettings(value: unknown): Settings {
  const saved = isRecord(value) ? value : {}
  return {
    currency: usable(text(saved.currency)?.toUpperCase(), DEFAULT_STATE.settings.currency, (currency) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(1),
    ),
    locale: usable(text(saved.locale), DEFAULT_STATE.settings.locale, (locale) => new Intl.NumberFormat(locale).format(1)),
    lifestyle: oneOf(saved.lifestyle, LIFESTYLES) ?? 'balanced',
  }
}

function usable(candidate: string | undefined, fallback: string, probe: (value: string) => unknown): string {
  if (candidate === undefined) return fallback
  try {
    probe(candidate)
    return candidate
  } catch {
    return fallback
  }
}

function normaliseCategories(value: unknown): Category[] {
  const categories = records(value).flatMap((raw) => {
    const name = text(raw.name)
    if (!name) return []
    const budget = finite(raw.budget)
    return [
      {
        id: text(raw.id) ?? uid(),
        name,
        color: text(raw.color) ?? '#8E8E93',
        icon: text(raw.icon) ?? '📦',
        ...(budget !== undefined && budget > 0 ? { budget } : {}),
      },
    ]
  })
  // The app assumes at least one category exists — every expense form picks one.
  return categories.length > 0 ? dedupe(categories) : DEFAULT_STATE.categories
}

function normaliseIncomes(value: unknown): IncomeSource[] {
  return dedupe(
    records(value).flatMap((raw) => {
      const amount = finite(raw.amount)
      const label = text(raw.label)
      if (amount === undefined || !label) return []
      return [
        {
          id: text(raw.id) ?? uid(),
          label,
          amount,
          frequency: oneOf(raw.frequency, FREQUENCIES) ?? 'monthly',
          startMonth: month(raw.startMonth),
          endMonth: month(raw.endMonth),
          payAnchor: day(raw.payAnchor),
          note: text(raw.note),
        },
      ]
    }),
  )
}

function normaliseExpenses(value: unknown, categories: Category[], fallback: string): Expense[] {
  const known = new Set(categories.map((c) => c.id))
  return dedupe(
    records(value).flatMap((raw) => {
      const date = day(raw.date)
      const amount = finite(raw.amount)
      if (!date || amount === undefined) return []
      const categoryId = text(raw.categoryId)
      return [
        {
          id: text(raw.id) ?? uid(),
          date,
          amount,
          categoryId: categoryId && known.has(categoryId) ? categoryId : fallback,
          note: text(raw.note),
        },
      ]
    }),
  )
}

function normaliseGoals(value: unknown): Goal[] {
  return dedupe(
    records(value).flatMap((raw) => {
      const name = text(raw.name)
      const target = finite(raw.target)
      if (!name || target === undefined) return []
      return [
        {
          id: text(raw.id) ?? uid(),
          name,
          target,
          deadline: day(raw.deadline),
          // A goal with no creation date is treated as new; pacing reads this.
          createdAt: text(raw.createdAt) ?? new Date().toISOString(),
          note: text(raw.note),
          pace: oneOf(raw.pace, PACES),
          contributions: normaliseContributions(raw.contributions),
        },
      ]
    }),
  )
}

function normaliseContributions(value: unknown): Contribution[] {
  return dedupe(
    records(value).flatMap((raw) => {
      const date = day(raw.date)
      const amount = finite(raw.amount)
      if (!date || amount === undefined) return []
      return [{ id: text(raw.id) ?? uid(), amount, date, note: text(raw.note) }]
    }),
  )
}

function normaliseRecurring(
  value: unknown,
  categories: Category[],
  fallback: string,
  goalIds: Set<string>,
): RecurringRule[] {
  const known = new Set(categories.map((c) => c.id))
  return dedupe(
    records(value).flatMap((raw) => {
      const label = text(raw.label)
      const amount = finite(raw.amount)
      const anchor = day(raw.anchor)
      if (!label || amount === undefined || !anchor) return []

      const kind = raw.kind === 'contribution' ? 'contribution' : 'expense'
      const goalId = text(raw.goalId)
      // A transfer whose goal didn't survive has nowhere to post and would sit in the
      // list reading "Goal removed" forever, so it goes with the goal.
      if (kind === 'contribution' && (!goalId || !goalIds.has(goalId))) return []

      const categoryId = text(raw.categoryId)
      return [
        {
          id: text(raw.id) ?? uid(),
          kind,
          label,
          amount,
          frequency: oneOf(raw.frequency, FREQUENCIES) ?? 'monthly',
          anchor,
          categoryId: kind === 'expense' ? (categoryId && known.has(categoryId) ? categoryId : fallback) : undefined,
          goalId: kind === 'contribution' ? goalId : undefined,
          endDate: day(raw.endDate),
          active: raw.active !== false,
          autoPost: raw.autoPost !== false,
          lastPostedDate: day(raw.lastPostedDate),
          note: text(raw.note),
        },
      ]
    }),
  )
}

/** Duplicate ids make React lists and every `find`-by-id ambiguous; first one wins. */
function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
