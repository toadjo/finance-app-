import type { IncomeSource } from '../types'
import {
  addDays,
  addMonthsToDay,
  daysUntil,
  monthOf,
  monthsBetween,
  todayKey,
  type DayKey,
  type MonthKey,
} from './date'
import { isIncomeActive } from './selectors'
import { toMonthly } from './money'

/**
 * When money actually lands.
 *
 * A source records a single `payAnchor` — any one date you were paid — and the
 * cadence does the rest. That covers every frequency with one field: weekly and
 * biweekly step from the anchor, monthly and longer repeat its day of the month.
 */

export interface Payday {
  date: DayKey
  income: IncomeSource
  /** The per-period amount, i.e. what actually arrives that day. */
  amount: number
}

/** How many months either side of a target month we bother stepping through. */
const SEARCH_HORIZON_MONTHS = 24

/** Every date this source pays out during `month`, earliest first. */
export function payDatesIn(income: IncomeSource, month: MonthKey): DayKey[] {
  if (!income.payAnchor) return []
  if (!isIncomeActive(income, month)) return []

  const anchor = income.payAnchor
  const dates: DayKey[] = []

  if (income.frequency === 'weekly' || income.frequency === 'biweekly') {
    const step = income.frequency === 'weekly' ? 7 : 14
    // Jump close to the target month, then walk day-steps across it.
    const monthsAway = monthsBetween(monthOf(anchor), month)
    if (Math.abs(monthsAway) > SEARCH_HORIZON_MONTHS * 12) return []

    const approxDays = Math.round(monthsAway * 30.4)
    let cursor = addDays(anchor, Math.floor(approxDays / step) * step)
    // Rewind to before the month, then step forward through it.
    while (monthOf(cursor) >= month) cursor = addDays(cursor, -step)
    cursor = addDays(cursor, step)
    while (monthOf(cursor) === month) {
      dates.push(cursor)
      cursor = addDays(cursor, step)
    }
    return dates
  }

  const stride = { monthly: 1, quarterly: 3, yearly: 12 }[income.frequency]
  const offset = monthsBetween(monthOf(anchor), month)
  // Quarterly and yearly only pay in months lining up with the anchor's.
  if (offset % stride !== 0) return []

  const candidate = addMonthsToDay(anchor, offset)
  if (monthOf(candidate) === month) dates.push(candidate)
  return dates
}

/** Every payday from every active source in `month`, earliest first. */
export function paydaysIn(incomes: IncomeSource[], month: MonthKey): Payday[] {
  return incomes
    .flatMap((income) => payDatesIn(income, month).map((date) => ({ date, income, amount: income.amount })))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * The next date money arrives, on or after `from`.
 * Looks a couple of years ahead so a yearly source still resolves.
 */
export function nextPayday(incomes: IncomeSource[], from: DayKey = todayKey()): { date: DayKey; total: number; sources: Payday[] } | undefined {
  let month = monthOf(from)
  for (let i = 0; i <= SEARCH_HORIZON_MONTHS; i++) {
    const upcoming = paydaysIn(incomes, month).filter((p) => p.date >= from)
    if (upcoming.length > 0) {
      const date = upcoming[0].date
      const sources = upcoming.filter((p) => p.date === date)
      return { date, total: sources.reduce((sum, p) => sum + p.amount, 0), sources }
    }
    month = addMonthsToMonth(month, 1)
  }
  return undefined
}

function addMonthsToMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Days until the next payday; undefined when no source has an anchor set. */
export function daysToNextPayday(incomes: IncomeSource[], from: DayKey = todayKey()): number | undefined {
  const next = nextPayday(incomes, from)
  return next ? daysUntil(next.date) : undefined
}

/**
 * What lands in `month` in total — useful when a 4-weekly cycle gives a fifth payday.
 *
 * Sources with a payday contribute exactly what their pay dates add up to; sources
 * without one fall back to their normalised monthly figure, so a half-configured
 * ledger still totals correctly rather than quietly dropping the unset sources.
 */
export function incomeArrivingIn(incomes: IncomeSource[], month: MonthKey): number {
  return incomes.reduce((sum, income) => {
    if (!isIncomeActive(income, month)) return sum
    if (income.payAnchor) return sum + payDatesIn(income, month).length * income.amount
    return sum + toMonthly(income.amount, income.frequency)
  }, 0)
}

export function describePayday(income: IncomeSource, locale = 'en-US'): string {
  if (!income.payAnchor) return 'No payday set'
  const [, , day] = income.payAnchor.split('-').map(Number)
  switch (income.frequency) {
    case 'weekly':
    case 'biweekly': {
      const weekday = new Date(`${income.payAnchor}T00:00:00`).toLocaleDateString(locale, { weekday: 'long' })
      return income.frequency === 'weekly' ? `Every ${weekday}` : `Every other ${weekday}`
    }
    case 'monthly':
      return `${ordinal(day)} of the month`
    case 'quarterly':
      return `${ordinal(day)}, every 3 months`
    case 'yearly':
      return `Once a year, ${ordinal(day)}`
  }
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}
