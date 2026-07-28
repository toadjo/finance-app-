import type { AppState, Category, Expense, Goal, IncomeSource } from '../types'
import { toMonthly } from './money'
import { daysUntil, monthOf, monthRange, monthsBetween, todayKey, type MonthKey } from './date'

export function isIncomeActive(income: IncomeSource, month: MonthKey): boolean {
  // A one-off exists only in the month it lands in, and needs a date to land on.
  if (income.frequency === 'once') return income.payAnchor ? monthOf(income.payAnchor) === month : false
  if (income.startMonth && month < income.startMonth) return false
  if (income.endMonth && month > income.endMonth) return false
  return true
}

/** Every active source normalised to a monthly figure, biggest first. */
export function incomeBreakdown(incomes: IncomeSource[], month: MonthKey) {
  return incomes
    .filter((i) => isIncomeActive(i, month))
    .map((income) => ({ income, monthly: toMonthly(income.amount, income.frequency) }))
    .sort((a, b) => b.monthly - a.monthly)
}

export function monthlyIncome(incomes: IncomeSource[], month: MonthKey): number {
  return incomeBreakdown(incomes, month).reduce((sum, row) => sum + row.monthly, 0)
}

export function expensesForMonth(expenses: Expense[], month: MonthKey): Expense[] {
  return expenses.filter((e) => monthOf(e.date) === month).sort((a, b) => b.date.localeCompare(a.date))
}

export function sumAmounts(items: { amount: number }[]): number {
  return items.reduce((sum, i) => sum + i.amount, 0)
}

export interface CategoryTotal {
  category: Category
  total: number
  share: number
  budget?: number
  /** Fraction of budget used; undefined when no budget is set. */
  budgetUsed?: number
}

export function spendByCategory(expenses: Expense[], categories: Category[]): CategoryTotal[] {
  const total = sumAmounts(expenses)
  const totals = new Map<string, number>()
  for (const e of expenses) totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount)

  return categories
    .map((category) => {
      const spent = totals.get(category.id) ?? 0
      return {
        category,
        total: spent,
        share: total > 0 ? spent / total : 0,
        budget: category.budget,
        budgetUsed: category.budget ? spent / category.budget : undefined,
      }
    })
    .filter((row) => row.total > 0 || row.budget)
    .sort((a, b) => b.total - a.total)
}

export interface MonthSummary {
  month: MonthKey
  income: number
  spent: number
  net: number
  saved: number
  savingsRate: number
}

export function summariseMonth(state: AppState, month: MonthKey): MonthSummary {
  const income = monthlyIncome(state.incomes, month)
  const spent = sumAmounts(expensesForMonth(state.expenses, month))
  const saved = state.goals.reduce(
    (sum, g) => sum + sumAmounts(g.contributions.filter((c) => monthOf(c.date) === month)),
    0,
  )
  return { month, income, spent, net: income - spent, saved, savingsRate: income > 0 ? (income - spent) / income : 0 }
}

/** The `count` months ending at `month`, oldest first. */
export function monthlyTrend(state: AppState, month: MonthKey, count = 6): MonthSummary[] {
  return monthRange(month, count).map((m) => summariseMonth(state, m))
}

export type GoalStatus = 'complete' | 'on-track' | 'behind' | 'overdue' | 'open'

export interface GoalProgress {
  goal: Goal
  saved: number
  remaining: number
  /** 0–1, clamped. */
  progress: number
  /** Whole months left until the deadline; undefined when there is no deadline. */
  monthsLeft?: number
  daysLeft?: number
  /** What you need to put aside each month to land on time. */
  requiredPerMonth?: number
  status: GoalStatus
}

export function goalProgress(goal: Goal): GoalProgress {
  const saved = sumAmounts(goal.contributions)
  const remaining = Math.max(0, goal.target - saved)
  const progress = goal.target > 0 ? Math.min(1, saved / goal.target) : 0
  const complete = remaining === 0 && goal.target > 0

  if (!goal.deadline) {
    return { goal, saved, remaining, progress, status: complete ? 'complete' : 'open' }
  }

  const daysLeft = daysUntil(goal.deadline)
  // Count the deadline's own month as available, so a goal due this month has one month left.
  const monthsLeft = Math.max(0, monthsBetween(monthOf(todayKey()), monthOf(goal.deadline)) + 1)
  const requiredPerMonth = monthsLeft > 0 ? remaining / monthsLeft : remaining

  let status: GoalStatus
  if (complete) status = 'complete'
  else if (daysLeft < 0) status = 'overdue'
  else status = progress >= expectedProgress(goal) ? 'on-track' : 'behind'

  return { goal, saved, remaining, progress, monthsLeft, daysLeft, requiredPerMonth, status }
}

/** Where a goal *should* be right now if funded evenly from creation to deadline. */
function expectedProgress(goal: Goal): number {
  if (!goal.deadline) return 0
  const start = new Date(goal.createdAt).getTime()
  const end = new Date(`${goal.deadline}T00:00:00`).getTime()
  const now = Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.min(1, Math.max(0, (now - start) / (end - start)))
}

/** Total you must set aside monthly to hit every unfinished, dated goal on time. */
export function requiredMonthlySavings(goals: Goal[]): number {
  return goals.reduce((sum, goal) => {
    const p = goalProgress(goal)
    return sum + (p.status === 'complete' ? 0 : (p.requiredPerMonth ?? 0))
  }, 0)
}

export function categoryById(categories: Category[], id: string): Category | undefined {
  return categories.find((c) => c.id === id)
}
