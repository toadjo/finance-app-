import type { AppState, Expense } from '../../types'
import { daysInMonth, monthOf, monthRange, todayKey, type MonthKey } from '../date'
import { expensesForMonth, goalProgress, monthlyIncome, sumAmounts } from '../selectors'
import { committedSpend, detectRecurring, groupKey, upcomingBills } from './recurring'

/**
 * The "what should I do about it" layer: how much is genuinely free to spend, what
 * looks out of character, and where the month is actually heading.
 */

export interface SafeToSpend {
  /** Free to spend across the rest of the month, after bills and goal funding. */
  total: number
  perDay: number
  daysLeft: number
  committed: number
  goalFunding: number
  spent: number
  income: number
}

/**
 * Income, minus what you've already spent, minus the recurring bills still to land,
 * minus what your goals need this month. What's left is genuinely discretionary.
 */
export function safeToSpend(state: AppState, month: MonthKey): SafeToSpend {
  const income = monthlyIncome(state.incomes, month)
  const spent = sumAmounts(expensesForMonth(state.expenses, month))
  const committed = committedSpend(state.expenses, month)

  const goalFunding = state.goals.reduce((sum, goal) => {
    const progress = goalProgress(goal)
    if (progress.status === 'complete' || progress.requiredPerMonth === undefined) return sum
    const alreadyGiven = sumAmounts(goal.contributions.filter((c) => monthOf(c.date) === month))
    return sum + Math.max(0, progress.requiredPerMonth - alreadyGiven)
  }, 0)

  const today = todayKey()
  const isCurrentMonth = today.startsWith(month)
  const total = income - spent - committed - goalFunding
  const daysLeft = isCurrentMonth ? Math.max(1, daysInMonth(month) - Number(today.slice(8)) + 1) : 0

  return { total, perDay: daysLeft > 0 ? total / daysLeft : 0, daysLeft, committed, goalFunding, spent, income }
}

/** Spend + observed burn rate for the days remaining + bills known to be coming. */
export function projectedSpend(state: AppState, month: MonthKey): number {
  const today = todayKey()
  const spent = sumAmounts(expensesForMonth(state.expenses, month))
  if (!today.startsWith(month)) return spent

  const dayOfMonth = Number(today.slice(8))
  const total = daysInMonth(month)
  const remaining = total - dayOfMonth

  // Bills still to come are added explicitly, so they must not also inflate the burn
  // rate. Every recurring charge is excluded from that rate — including ones already
  // paid this month, since rent landing on the 1st says nothing about daily spending.
  const billTotal = upcomingBills(state.expenses, month).reduce((sum, b) => sum + b.typicalAmount, 0)
  const recurringKeys = new Set(detectRecurring(state.expenses).map((b) => b.key))
  const discretionary = expensesForMonth(state.expenses, month).filter((e) => !recurringKeys.has(groupKey(e)))
  const burnRate = dayOfMonth > 0 ? sumAmounts(discretionary) / dayOfMonth : 0

  return spent + burnRate * remaining + billTotal
}

export type AlertLevel = 'info' | 'warn' | 'danger'

export interface Alert {
  id: string
  level: AlertLevel
  title: string
  detail: string
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

/** Expenses well above what that category normally costs you. */
export function unusualExpenses(state: AppState, month: MonthKey): { expense: Expense; typical: number }[] {
  const history = monthRange(month, 7).slice(0, -1)
  const past = state.expenses.filter((e) => history.includes(monthOf(e.date)))
  const current = expensesForMonth(state.expenses, month)
  const flagged: { expense: Expense; typical: number }[] = []

  for (const expense of current) {
    const sameCategory = past.filter((e) => e.categoryId === expense.categoryId).map((e) => e.amount)
    // Need a real baseline before calling anything unusual.
    if (sameCategory.length < 5) continue
    const threshold = percentile(sameCategory, 90)
    if (expense.amount > threshold * 1.25) {
      flagged.push({ expense, typical: percentile(sameCategory, 50) })
    }
  }

  return flagged.sort((a, b) => b.expense.amount - a.expense.amount)
}

/**
 * Everything worth telling you about this month, most urgent first.
 * Callers render `title` prominently and `detail` underneath.
 */
export function buildAlerts(state: AppState, month: MonthKey, format: (n: number) => string): Alert[] {
  const alerts: Alert[] = []
  const safe = safeToSpend(state, month)
  const projection = projectedSpend(state, month)
  const isCurrentMonth = todayKey().startsWith(month)

  if (safe.income > 0 && projection > safe.income) {
    alerts.push({
      id: 'overspend',
      level: 'danger',
      title: `Heading for ${format(projection - safe.income)} over budget`,
      detail: `At this pace the month lands at ${format(projection)} against ${format(safe.income)} of income.`,
    })
  }

  if (isCurrentMonth && safe.total < 0) {
    alerts.push({
      id: 'nothing-left',
      level: 'warn',
      title: 'Nothing left for the rest of the month',
      detail: `Bills still due (${format(safe.committed)}) and goal funding (${format(safe.goalFunding)}) exceed what's left of your income.`,
    })
  }

  for (const bill of upcomingBills(state.expenses, month)) {
    if (bill.priceIncrease) {
      alerts.push({
        id: `price-${bill.key}`,
        level: 'warn',
        title: `${bill.label} went up ${Math.round(bill.priceIncrease.ratio * 100)}%`,
        detail: `Now ${format(bill.priceIncrease.to)}, was ${format(bill.priceIncrease.from)}.`,
      })
    }
  }

  for (const { expense, typical } of unusualExpenses(state, month).slice(0, 3)) {
    const category = state.categories.find((c) => c.id === expense.categoryId)
    alerts.push({
      id: `unusual-${expense.id}`,
      level: 'info',
      title: `Unusually large ${category?.name.toLowerCase() ?? 'expense'}: ${format(expense.amount)}`,
      detail: `${expense.note || 'No note'} — you normally spend about ${format(typical)} here.`,
    })
  }

  const categoryPace = pacedCategories(state, month)
  for (const paced of categoryPace.slice(0, 2)) {
    alerts.push({
      id: `pace-${paced.categoryId}`,
      level: 'info',
      title: `${paced.name} is running ${Math.round(paced.ratio * 100)}% above normal`,
      detail: `${format(paced.current)} so far against a ${format(paced.average)} average for this point in the month.`,
    })
  }

  return alerts
}

/** Categories tracking meaningfully above their own 3-month norm. */
function pacedCategories(state: AppState, month: MonthKey) {
  const previous = monthRange(month, 4).slice(0, -1)
  const current = expensesForMonth(state.expenses, month)
  const today = todayKey()
  const elapsed = today.startsWith(month) ? Number(today.slice(8)) / daysInMonth(month) : 1

  return state.categories
    .map((category) => {
      const currentTotal = sumAmounts(current.filter((e) => e.categoryId === category.id))
      const averages = previous.map((m) =>
        sumAmounts(state.expenses.filter((e) => monthOf(e.date) === m && e.categoryId === category.id)),
      )
      const average = averages.reduce((a, b) => a + b, 0) / Math.max(1, averages.length)
      const expected = average * elapsed
      return {
        categoryId: category.id,
        name: category.name,
        current: currentTotal,
        average,
        ratio: expected > 0 ? currentTotal / expected - 1 : 0,
      }
    })
    .filter((row) => row.average > 0 && row.ratio > 0.4 && row.current > 0)
    .sort((a, b) => b.ratio - a.ratio)
}
