import type { Expense, Frequency } from '../../types'
import { daysUntil, monthOf, todayKey, type DayKey, type MonthKey } from '../date'
import { tokenize } from './categorize'

/**
 * Finds the charges that repeat — rent, subscriptions, the season ticket — by looking
 * at how evenly spaced they are, then projects when the next one is due.
 */

export interface RecurringBill {
  key: string
  label: string
  categoryId: string
  frequency: Frequency
  /** Median amount across occurrences; what we expect the next one to cost. */
  typicalAmount: number
  lastAmount: number
  lastDate: DayKey
  nextDue: DayKey
  occurrences: number
  /** 0–1: how metronomic the spacing is. Below ~0.55 we don't report it. */
  regularity: number
  /** Set when the latest charge is meaningfully above the established norm. */
  priceIncrease?: { from: number; to: number; ratio: number }
}

const CADENCES: { frequency: Frequency; days: number; tolerance: number }[] = [
  { frequency: 'weekly', days: 7, tolerance: 2 },
  { frequency: 'biweekly', days: 14, tolerance: 3 },
  { frequency: 'monthly', days: 30.4, tolerance: 6 },
  { frequency: 'quarterly', days: 91.3, tolerance: 12 },
  { frequency: 'yearly', days: 365, tolerance: 30 },
]

const MIN_OCCURRENCES = 3
const MIN_REGULARITY = 0.55
const PRICE_JUMP = 0.12

function toTime(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function toDayKey(time: number): DayKey {
  const d = new Date(time)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Advances a date by one cadence.
 *
 * Monthly and longer cadences move by calendar months, not by an average number of
 * days: rent paid on the 1st is next due on the 1st, and adding 30 days would have it
 * falling due again in the same month.
 */
function advance(day: DayKey, frequency: Frequency, days: number): DayKey {
  if (frequency === 'weekly' || frequency === 'biweekly') {
    return toDayKey(toTime(day) + Math.round(days) * 86_400_000)
  }

  const step = { monthly: 1, quarterly: 3, yearly: 12 }[frequency as 'monthly' | 'quarterly' | 'yearly']
  const [y, m, d] = day.split('-').map(Number)
  const target = new Date(y, m - 1 + step, 1)
  // The 31st of a month rolls back to the last day of a shorter one.
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d, lastDay))
  return toDayKey(target.getTime())
}

/**
 * Groups charges that are "the same bill". Notes get reduced to their significant
 * tokens so "Netflix" and "netflix subscription" land together.
 *
 * Exported because callers that need to tell recurring spending apart from
 * discretionary spending must group it exactly the same way.
 */
export function groupKey(expense: Expense): string {
  const tokens = tokenize(expense.note ?? '')
    .slice(0, 2)
    .sort()
    .join(' ')
  return `${expense.categoryId}::${tokens || 'untitled'}`
}

export function detectRecurring(expenses: Expense[]): RecurringBill[] {
  const groups = new Map<string, Expense[]>()
  for (const expense of expenses) {
    const key = groupKey(expense)
    groups.set(key, [...(groups.get(key) ?? []), expense])
  }

  const bills: RecurringBill[] = []

  for (const [key, items] of groups) {
    if (items.length < MIN_OCCURRENCES) continue

    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((toTime(sorted[i].date) - toTime(sorted[i - 1].date)) / 86_400_000)
    }

    const typicalGap = median(gaps)
    const cadence = CADENCES.find((c) => Math.abs(typicalGap - c.days) <= c.tolerance)
    if (!cadence) continue

    // How tightly the gaps cluster around the cadence: 1 is perfect, 0 is noise.
    const deviation = median(gaps.map((g) => Math.abs(g - cadence.days)))
    const regularity = Math.max(0, 1 - deviation / cadence.tolerance)
    if (regularity < MIN_REGULARITY) continue

    const amounts = sorted.map((e) => e.amount)
    const typicalAmount = median(amounts)
    const last = sorted[sorted.length - 1]
    const earlier = median(amounts.slice(0, -1))

    const priceIncrease =
      earlier > 0 && last.amount > earlier * (1 + PRICE_JUMP)
        ? { from: earlier, to: last.amount, ratio: last.amount / earlier - 1 }
        : undefined

    bills.push({
      key,
      label: last.note?.trim() || 'Recurring charge',
      categoryId: last.categoryId,
      frequency: cadence.frequency,
      typicalAmount,
      lastAmount: last.amount,
      lastDate: last.date,
      nextDue: advance(last.date, cadence.frequency, cadence.days),
      occurrences: sorted.length,
      regularity,
      priceIncrease,
    })
  }

  return bills.sort((a, b) => a.nextDue.localeCompare(b.nextDue))
}

/** How far an amount may differ and still be recognised as the same charge. */
const AMOUNT_TOLERANCE = 0.15

/**
 * Does this ledger entry represent `target`?
 *
 * Note text is the strongest signal, but people don't retype it identically — August's
 * rent might be entered as "Rent for the flat", or with no note at all. So a same-category
 * expense of about the right size counts too, otherwise the month would show rent twice:
 * once as entered, once as still predicted.
 */
export function matchesEntry(
  expense: Expense,
  target: {
    categoryId?: string
    amount: number
    key?: string
    label?: string
    /**
     * Allow a same-category, similar-sized expense to count as this charge.
     * Right for *predictions*, which you may re-enter in your own words. Wrong for
     * *declared rules*, which post with their label verbatim — there, a coincidence
     * of size would silently delete something you explicitly set up.
     */
    amountFallback?: boolean
  },
): boolean {
  if (target.key && groupKey(expense) === target.key) return true

  const note = (expense.note ?? '').trim().toLowerCase()
  if (target.label && note && note === target.label.trim().toLowerCase()) return true

  if (target.amountFallback === false) return false
  if (!target.categoryId || expense.categoryId !== target.categoryId) return false
  if (target.amount <= 0) return false
  return Math.abs(expense.amount - target.amount) <= target.amount * AMOUNT_TOLERANCE
}

/**
 * Bills projected into `month`, however far ahead it is, minus any you've already
 * logged yourself. This is what makes a future month worth looking at: next March
 * starts out already knowing about the rent and the subscriptions.
 */
export function projectedBillsIn(expenses: Expense[], month: MonthKey): { bill: RecurringBill; date: DayKey }[] {
  const entered = expenses.filter((e) => monthOf(e.date) === month)
  const projected: { bill: RecurringBill; date: DayKey }[] = []

  for (const bill of detectRecurring(expenses)) {
    // Don't double-count a bill you've already entered for that month.
    const covered = entered.some((e) =>
      matchesEntry(e, { categoryId: bill.categoryId, amount: bill.typicalAmount, key: bill.key, label: bill.label }),
    )
    if (covered) continue

    const cadence = CADENCES.find((c) => c.frequency === bill.frequency)!
    let cursor = bill.lastDate
    // Step forward a bounded number of cycles rather than looping unguarded.
    for (let i = 0; i < 400 && monthOf(cursor) <= month; i++) {
      cursor = advance(cursor, cadence.frequency, cadence.days)
      if (monthOf(cursor) === month) projected.push({ bill, date: cursor })
      else if (monthOf(cursor) > month) break
    }
  }

  return projected.sort((a, b) => a.date.localeCompare(b.date))
}

/** What the projected bills for `month` are expected to cost in total. */
export function projectedBillTotal(expenses: Expense[], month: MonthKey): number {
  return projectedBillsIn(expenses, month).reduce((sum, p) => sum + p.bill.typicalAmount, 0)
}

/** Bills expected to land in `month` that haven't been paid yet. */
export function upcomingBills(expenses: Expense[], month: MonthKey): RecurringBill[] {
  const today = todayKey()
  return detectRecurring(expenses).filter(
    (bill) => monthOf(bill.nextDue) === month && bill.nextDue >= today,
  )
}

/** What the unpaid recurring bills still due this month will cost. */
export function committedSpend(expenses: Expense[], month: MonthKey): number {
  return upcomingBills(expenses, month).reduce((sum, bill) => sum + bill.typicalAmount, 0)
}

export function dueDescription(bill: RecurringBill): string {
  const days = daysUntil(bill.nextDue)
  if (days < 0) return 'overdue'
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  return `due in ${days} days`
}
