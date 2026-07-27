import type { AppState, Contribution, Expense, RecurringRule } from '../types'
import { addDays, monthOf, todayKey, type DayKey, type MonthKey } from './date'
import { nextOccurrence, occurrencesBetween, occurrencesIn } from './schedule'
import { uid } from './id'

/**
 * Declared repeating items — rent, subscriptions, standing transfers into goals.
 *
 * Two jobs: forecasting (what will this month look like) and posting (write the
 * entries that have actually come due). Posting is deliberately conservative — it
 * only ever moves forward, and never writes the same occurrence twice.
 */

export interface ScheduledItem {
  rule: RecurringRule
  date: DayKey
}

export function isRuleLive(rule: RecurringRule, on: DayKey): boolean {
  if (!rule.active) return false
  if (rule.endDate && on > rule.endDate) return false
  return true
}

/** Occurrences of every live rule inside `month`, earliest first. */
export function scheduledIn(rules: RecurringRule[], month: MonthKey, kind?: RecurringRule['kind']): ScheduledItem[] {
  return rules
    .filter((rule) => (kind ? rule.kind === kind : true))
    .flatMap((rule) =>
      occurrencesIn(rule.anchor, rule.frequency, month)
        .filter((date) => isRuleLive(rule, date))
        .map((date) => ({ rule, date })),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function scheduledTotal(rules: RecurringRule[], month: MonthKey, kind?: RecurringRule['kind']): number {
  return scheduledIn(rules, month, kind).reduce((sum, item) => sum + item.rule.amount, 0)
}

export function nextDue(rule: RecurringRule, from: DayKey = todayKey()): DayKey | undefined {
  const date = nextOccurrence(rule.anchor, rule.frequency, from)
  return date && isRuleLive(rule, date) ? date : undefined
}

/**
 * Occurrences that have come due but haven't been written yet.
 *
 * Starts the day after the last post (or at the anchor for a brand new rule) and
 * stops at today — future occurrences are forecast, not fact.
 */
export function duePostings(rule: RecurringRule, until: DayKey = todayKey()): DayKey[] {
  if (!rule.autoPost || !rule.active) return []
  const from = rule.lastPostedDate ? addDays(rule.lastPostedDate, 1) : rule.anchor
  if (from > until) return []
  const end = rule.endDate && rule.endDate < until ? rule.endDate : until
  return occurrencesBetween(rule.anchor, rule.frequency, from, end)
}

export interface PostingResult {
  expenses: Expense[]
  contributions: { goalId: string; contribution: Contribution }[]
  /** New watermark per rule id. */
  watermarks: Record<string, DayKey>
  count: number
}

/**
 * Works out everything that should be written to the ledger right now.
 *
 * Pure: it computes the entries and the new watermarks, leaving the caller to
 * dispatch them, so this stays testable and can't half-apply.
 */
export function collectDuePostings(state: AppState, until: DayKey = todayKey()): PostingResult {
  const result: PostingResult = { expenses: [], contributions: [], watermarks: {}, count: 0 }

  for (const rule of state.recurring) {
    const dates = duePostings(rule, until)
    if (dates.length === 0) continue

    for (const date of dates) {
      if (rule.kind === 'expense') {
        // A rule with no category still has to land somewhere sensible.
        const categoryId = rule.categoryId ?? state.categories[0]?.id
        if (!categoryId) continue
        result.expenses.push({ id: uid(), date, amount: rule.amount, categoryId, note: rule.label })
      } else {
        // Skip contributions whose goal has since been deleted.
        if (!rule.goalId || !state.goals.some((g) => g.id === rule.goalId)) continue
        result.contributions.push({
          goalId: rule.goalId,
          contribution: { id: uid(), amount: rule.amount, date, note: rule.label },
        })
      }
      result.count++
    }

    result.watermarks[rule.id] = dates[dates.length - 1]
  }

  return result
}

/** Human summary of a rule's cadence, e.g. "1st of the month". */
export function describeRule(rule: RecurringRule, locale = 'en-US'): string {
  const day = Number(rule.anchor.slice(8))
  switch (rule.frequency) {
    case 'weekly':
    case 'biweekly': {
      const weekday = new Date(`${rule.anchor}T00:00:00`).toLocaleDateString(locale, { weekday: 'long' })
      return rule.frequency === 'weekly' ? `Every ${weekday}` : `Every other ${weekday}`
    }
    case 'monthly':
      return `${ordinal(day)} of the month`
    case 'quarterly':
      return `${ordinal(day)}, every 3 months`
    case 'yearly':
      return `Yearly, on the ${ordinal(day)}`
  }
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** True when a rule already has a matching entry in that month, to avoid duplicates in forecasts. */
export function alreadyRecorded(state: AppState, rule: RecurringRule, month: MonthKey): boolean {
  if (rule.kind === 'expense') {
    return state.expenses.some((e) => monthOf(e.date) === month && e.note === rule.label)
  }
  const goal = state.goals.find((g) => g.id === rule.goalId)
  return goal?.contributions.some((c) => monthOf(c.date) === month && c.note === rule.label) ?? false
}
