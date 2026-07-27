import type { AppState } from '../../types'
import { monthOf, todayKey, type MonthKey } from '../date'
import { expensesForMonth, goalProgress, monthlyIncome, sumAmounts } from '../selectors'
import { projectedBillsIn, projectedBillTotal } from './recurring'
import { incomeArrivingIn, paydaysIn } from '../payday'

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
  /** Recurring bills expected but not yet entered. */
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
  const expectedBills = projectedBillTotal(state.expenses, month)

  const goalFunding = state.goals.reduce((sum, goal) => {
    const progress = goalProgress(goal)
    if (progress.status === 'complete' || progress.requiredPerMonth === undefined) return sum
    // A future month's goal money hasn't been contributed yet by definition.
    const alreadyGiven = sumAmounts(goal.contributions.filter((c) => monthOf(c.date) === month))
    return sum + Math.max(0, progress.requiredPerMonth - alreadyGiven)
  }, 0)

  const leftOver = income - planned - expectedBills - goalFunding

  return {
    month,
    income,
    arriving,
    paydayCount: paydays.length,
    planned,
    expectedBills,
    goalFunding,
    leftOver,
    overCommitted: leftOver < 0,
  }
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

  const expected = projectedBillsIn(state.expenses, month).map(({ bill, date }) => ({
    kind: 'expected' as const,
    date,
    label: bill.label,
    categoryId: bill.categoryId,
    amount: bill.typicalAmount,
    id: `${bill.key}-${date}`,
  }))

  return [...entered, ...expected].sort((a, b) => a.date.localeCompare(b.date))
}
