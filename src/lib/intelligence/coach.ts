import type { AppState, Goal } from '../../types'
import { addMonths, monthOf, monthRange, monthsBetween, todayKey, type MonthKey } from '../date'
import { goalProgress, summariseMonth, sumAmounts, type GoalProgress } from '../selectors'

/**
 * Turns goal arithmetic into advice: at the rate you are actually funding this, when
 * does it land, and what specifically would fix it.
 */

export type Verdict = 'complete' | 'ahead' | 'on-track' | 'late' | 'stalled' | 'no-deadline'

export interface GoalCoaching {
  progress: GoalProgress
  verdict: Verdict
  /** Average contributed per month, measured over the goal's active months. */
  actualPerMonth: number
  /** Month the goal lands at the current rate; undefined if nothing is being contributed. */
  projectedCompletion?: MonthKey
  /** Months late (positive) or early (negative) against the deadline. */
  monthsLate?: number
  /** Extra per month that would bring it back on schedule. */
  shortfallPerMonth?: number
  /** One line of plain advice. */
  advice: string
}

/** Contribution rate measured over the months the goal has actually existed. */
function actualRate(goal: Goal): number {
  if (goal.contributions.length === 0) return 0
  const months = goal.contributions.map((c) => monthOf(c.date)).sort()
  const first = months[0]
  const span = Math.max(1, monthsBetween(first, monthOf(todayKey())) + 1)
  return sumAmounts(goal.contributions) / span
}

export function coachGoal(goal: Goal, format: (n: number) => string): GoalCoaching {
  const progress = goalProgress(goal)
  const actualPerMonth = actualRate(goal)
  const thisMonth = monthOf(todayKey())

  if (progress.status === 'complete') {
    return { progress, verdict: 'complete', actualPerMonth, advice: 'Funded. Nothing more to do here.' }
  }

  const monthsAtRate = actualPerMonth > 0 ? Math.ceil(progress.remaining / actualPerMonth) : undefined
  const projectedCompletion = monthsAtRate !== undefined ? addMonths(thisMonth, monthsAtRate) : undefined

  if (!goal.deadline) {
    return {
      progress,
      verdict: 'no-deadline',
      actualPerMonth,
      projectedCompletion,
      advice:
        actualPerMonth > 0
          ? `At ${format(actualPerMonth)} a month you'll get there around ${projectedCompletion}.`
          : `No deadline and nothing contributed yet — ${format(progress.remaining)} to go.`,
    }
  }

  const deadlineMonth = monthOf(goal.deadline)
  const required = progress.requiredPerMonth ?? progress.remaining

  if (actualPerMonth <= 0) {
    return {
      progress,
      verdict: 'stalled',
      actualPerMonth,
      shortfallPerMonth: required,
      advice: `Nothing contributed yet. You need ${format(required)} a month to make ${deadlineMonth}.`,
    }
  }

  const monthsLate = projectedCompletion ? monthsBetween(deadlineMonth, projectedCompletion) : 0
  const shortfallPerMonth = Math.max(0, required - actualPerMonth)

  if (monthsLate <= 0) {
    return {
      progress,
      verdict: monthsLate < 0 ? 'ahead' : 'on-track',
      actualPerMonth,
      projectedCompletion,
      monthsLate,
      advice:
        monthsLate < 0
          ? `Ahead of schedule — on pace to finish ${Math.abs(monthsLate)} month${Math.abs(monthsLate) === 1 ? '' : 's'} early.`
          : `On pace. Keep putting aside ${format(actualPerMonth)} a month.`,
    }
  }

  return {
    progress,
    verdict: 'late',
    actualPerMonth,
    projectedCompletion,
    monthsLate,
    shortfallPerMonth,
    advice: `At ${format(actualPerMonth)} a month this lands ${monthsLate} month${monthsLate === 1 ? '' : 's'} late. Add ${format(shortfallPerMonth)} a month, or move the deadline to ${projectedCompletion}.`,
  }
}

export interface Portfolio {
  requiredPerMonth: number
  /** Median leftover (income − spending) over the last three complete months. */
  typicalLeftover: number
  overcommitted: boolean
  gap: number
  /** Goals in the order worth funding — nearest deadline first. */
  priority: { goal: Goal; requiredPerMonth: number; fundable: boolean }[]
  advice: string
}

/**
 * Checks every goal against what you actually have spare, and says which ones the
 * money realistically reaches.
 */
export function coachPortfolio(state: AppState, month: MonthKey, format: (n: number) => string): Portfolio {
  const history = monthRange(month, 4)
    .slice(0, -1)
    .map((m) => summariseMonth(state, m).net)
    .sort((a, b) => a - b)

  const typicalLeftover = history.length > 0 ? history[Math.floor(history.length / 2)] : summariseMonth(state, month).net

  const active = state.goals
    .map((goal) => ({ goal, progress: goalProgress(goal) }))
    .filter(({ progress }) => progress.status !== 'complete')

  const requiredPerMonth = active.reduce((sum, { progress }) => sum + (progress.requiredPerMonth ?? 0), 0)

  // Nearest deadline first; undated goals go last since they can absorb the wait.
  const ordered = [...active].sort((a, b) => {
    if (!a.goal.deadline) return 1
    if (!b.goal.deadline) return -1
    return a.goal.deadline.localeCompare(b.goal.deadline)
  })

  let budget = Math.max(0, typicalLeftover)
  const priority = ordered.map(({ goal, progress }) => {
    const needed = progress.requiredPerMonth ?? 0
    const fundable = needed <= budget
    if (fundable) budget -= needed
    return { goal, requiredPerMonth: needed, fundable }
  })

  const gap = requiredPerMonth - typicalLeftover
  const overcommitted = gap > 0

  const fundableCount = priority.filter((p) => p.fundable).length
  const advice = overcommitted
    ? `Your goals need ${format(requiredPerMonth)} a month but you typically have ${format(typicalLeftover)} spare — ${format(gap)} short. At that rate ${fundableCount} of ${priority.length} stay on schedule; the rest need later deadlines or smaller targets.`
    : priority.length === 0
      ? 'No active goals to fund.'
      : `Your goals need ${format(requiredPerMonth)} a month and you typically have ${format(typicalLeftover)} spare. All ${priority.length} are affordable.`

  return { requiredPerMonth, typicalLeftover, overcommitted, gap, priority, advice }
}
