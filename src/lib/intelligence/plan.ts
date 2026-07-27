import type { AppState } from '../../types'
import { monthOf, todayKey, type MonthKey } from '../date'
import { expensesForMonth, monthlyIncome, sumAmounts } from '../selectors'
import { projectedBillsIn } from './recurring'
import { incomeArrivingIn, paydaysIn } from '../payday'
import { scheduledIn } from '../recurringRules'
import { allocateSavings } from './allocate'

/**
 * Looking forward rather than back: what a month is shaped like before it happens,
 * combining what you've deliberately planned with what past behaviour says is coming.
 */

export type MonthMode = 'past' | 'current' | 'future'

export function monthMode(month: MonthKey): MonthMode {
  const current = monthOf(todayKey())
  if (month === current) return 'current'
  return month > current ? 'future' : 'past'
}

export interface MonthPlan {
  month: MonthKey
  /** Income normalised to a monthly figure. */
  income: number
  /** What actually arrives that month, when paydays are known — a 5-payday month is bigger. */
  arriving: number
  paydayCount: number
  /** Expenses you have deliberately entered against this month. */
  planned: number
  /** Declared recurring rules due this month that haven't posted yet. */
  scheduled: number
  /** Bills inferred from spending patterns, beyond what your rules already cover. */
  expectedBills: number
  /** What your dated goals need that month. */
  goalFunding: number
  /** income − planned − expectedBills − goalFunding */
  leftOver: number
  /** True when the month is already committed beyond its income. */
  overCommitted: boolean
}

export function planMonth(state: AppState, month: MonthKey): MonthPlan {
  const income = monthlyIncome(state.incomes, month)
  const paydays = paydaysIn(state.incomes, month)
  const arriving = incomeArrivingIn(state.incomes, month)

  const planned = sumAmounts(expensesForMonth(state.expenses, month))
  const scheduled = pendingScheduled(state, month).reduce((sum, item) => sum + item.rule.amount, 0)
  const expectedBills = uncoveredBills(state, month).reduce((sum, p) => sum + p.bill.typicalAmount, 0)

  // What the savings plan commits, so a flexible goal leaves spending money intact.
  const goalFunding = allocateSavings(state, month).allocations.reduce((sum, allocation) => {
    // A future month's goal money hasn't been contributed yet by definition.
    const alreadyGiven = sumAmounts(
      allocation.goal.contributions.filter((c) => monthOf(c.date) === month),
    )
    return sum + Math.max(0, allocation.monthly - alreadyGiven)
  }, 0)

  const leftOver = income - planned - scheduled - expectedBills - goalFunding

  return {
    month,
    income,
    arriving,
    paydayCount: paydays.length,
    planned,
    scheduled,
    expectedBills,
    goalFunding,
    leftOver,
    overCommitted: leftOver < 0,
  }
}

/**
 * Recurring rules due in `month` that haven't already been written to the ledger.
 * Auto-posting fills past months in for real, so those must not be counted twice.
 */
function pendingScheduled(state: AppState, month: MonthKey) {
  const entered = new Set(
    expensesForMonth(state.expenses, month).map((e) => (e.note ?? '').trim().toLowerCase()),
  )
  return scheduledIn(state.recurring, month, 'expense').filter(
    (item) => !entered.has(item.rule.label.trim().toLowerCase()),
  )
}

/**
 * Inferred bills, minus anything a declared rule already accounts for — a rule you
 * wrote yourself is authoritative, and the guess would only duplicate it.
 */
function uncoveredBills(state: AppState, month: MonthKey) {
  const declared = new Set(state.recurring.map((r) => r.label.trim().toLowerCase()))
  return projectedBillsIn(state.expenses, month).filter(
    (p) => !declared.has(p.bill.label.trim().toLowerCase()),
  )
}

/** A planned month's bills and entered expenses, merged into one dated list. */
export function plannedItems(state: AppState, month: MonthKey) {
  const entered = expensesForMonth(state.expenses, month).map((expense) => ({
    kind: 'entered' as const,
    date: expense.date,
    label: expense.note || 'Expense',
    categoryId: expense.categoryId,
    amount: expense.amount,
    id: expense.id,
  }))

  const scheduled = pendingScheduled(state, month).map(({ rule, date }) => ({
    kind: 'scheduled' as const,
    date,
    label: rule.label,
    categoryId: rule.categoryId ?? 'other',
    amount: rule.amount,
    id: `${rule.id}-${date}`,
  }))

  const expected = uncoveredBills(state, month).map(({ bill, date }) => ({
    kind: 'expected' as const,
    date,
    label: bill.label,
    categoryId: bill.categoryId,
    amount: bill.typicalAmount,
    id: `${bill.key}-${date}`,
  }))

  return [...entered, ...scheduled, ...expected].sort((a, b) => a.date.localeCompare(b.date))
}
