import type { AppState, Goal, Lifestyle, Pace } from '../../types'
import { addMonths, monthOf, monthRange, todayKey, type MonthKey } from '../date'
import { goalProgress, summariseMonth } from '../selectors'

/**
 * Deciding how much to save versus how much to keep for living.
 *
 * Two ideas meet here. A goal's *pace* says whether its deadline is a promise
 * (strict: the required amount is non-negotiable) or an intention (balanced: fund it
 * from what's comfortably spare and let the date move). A person's *lifestyle* says
 * how much of their spare money should go to saving at all.
 *
 * The result is a monthly figure per goal, and — the point of the exercise — an
 * honest spending allowance left over.
 */

/** Share of spare money that goes to saving. */
const SAVE_SHARE: Record<Lifestyle, number> = {
  relaxed: 0.25,
  balanced: 0.5,
  focused: 0.8,
}

export const LIFESTYLE_LABEL: Record<Lifestyle, string> = {
  relaxed: 'Enjoy it now',
  balanced: 'A bit of both',
  focused: 'Save hard',
}

export const LIFESTYLE_BLURB: Record<Lifestyle, string> = {
  relaxed: 'Keep most of your spare money for living. Goals progress slowly.',
  balanced: 'Split your spare money evenly between saving and spending.',
  focused: 'Put most of your spare money aside. Less to spend month to month.',
}

export function paceOf(goal: Goal): Pace {
  // Goals created before paces existed behaved strictly, so that stays their default.
  return goal.pace ?? 'strict'
}

export interface Allocation {
  goal: Goal
  pace: Pace
  /** What this plan actually puts aside each month. */
  monthly: number
  /** What hitting the deadline exactly would demand. Undefined without a deadline. */
  required?: number
  /** When it lands at `monthly`. Undefined when nothing is being allocated. */
  projectedCompletion?: MonthKey
  /** Strict goals only: how far the budget falls short of `required`. */
  shortfall?: number
  /** With a deadline: does `projectedCompletion` beat it? */
  onTimeForDeadline?: boolean
  /** Months late against the deadline; negative means early. */
  monthsLate?: number
}

export interface SavingsPlan {
  /** Typical monthly money left after living costs, before any saving. */
  spare: number
  /** The slice of `spare` your lifestyle earmarks for saving. */
  savingsBudget: number
  /** What the plan actually commits across all goals. */
  totalSaving: number
  /** What's left to spend freely — the number this whole feature exists for. */
  spendingAllowance: number
  allocations: Allocation[]
  /** Strict goals demand more than the savings budget allows. */
  overCommitted: boolean
  advice: string
}

/** Median monthly leftover over the last three complete months. */
function typicalSpare(state: AppState, month: MonthKey): number {
  const history = monthRange(month, 4)
    .slice(0, -1)
    .map((m) => summariseMonth(state, m).net)
    .sort((a, b) => a - b)
  if (history.length === 0) return summariseMonth(state, month).net
  return history[Math.floor(history.length / 2)]
}

function project(remaining: number, monthly: number, from: MonthKey): MonthKey | undefined {
  if (monthly <= 0 || remaining <= 0) return undefined
  return addMonths(from, Math.ceil(remaining / monthly))
}

/**
 * Works out what to put aside per goal this month, and what's left to spend.
 *
 * Strict goals are funded first at whatever their deadline demands — that's what
 * choosing strict means. Whatever the lifestyle budget has left is shared among the
 * balanced goals in proportion to how much each still needs.
 */
export function allocateSavings(state: AppState, month: MonthKey = monthOf(todayKey())): SavingsPlan {
  const lifestyle = state.settings.lifestyle ?? 'balanced'
  const spare = typicalSpare(state, month)
  const savingsBudget = Math.max(0, spare) * SAVE_SHARE[lifestyle]

  const active = state.goals
    .map((goal) => ({ goal, progress: goalProgress(goal), pace: paceOf(goal) }))
    .filter(({ progress }) => progress.status !== 'complete')

  const strict = active.filter((g) => g.pace === 'strict')
  const balanced = active.filter((g) => g.pace === 'balanced')

  const strictTotal = strict.reduce((sum, { progress }) => sum + (progress.requiredPerMonth ?? 0), 0)
  // Strict goals are commitments: they get funded even past the lifestyle budget.
  const leftForBalanced = Math.max(0, savingsBudget - strictTotal)
  const balancedNeed = balanced.reduce((sum, { progress }) => sum + progress.remaining, 0)

  const allocations: Allocation[] = []

  for (const { goal, progress } of strict) {
    const required = progress.requiredPerMonth
    const monthly = required ?? 0
    const projectedCompletion = project(progress.remaining, monthly, month)
    allocations.push({
      goal,
      pace: 'strict',
      monthly,
      required,
      projectedCompletion,
      shortfall: Math.max(0, monthly - savingsBudget),
      onTimeForDeadline: goal.deadline ? true : undefined,
      monthsLate: 0,
    })
  }

  for (const { goal, progress } of balanced) {
    // Bigger remaining balances draw a bigger share of what's left.
    const share = balancedNeed > 0 ? progress.remaining / balancedNeed : 1 / Math.max(1, balanced.length)
    const monthly = leftForBalanced * share
    const projectedCompletion = project(progress.remaining, monthly, month)
    const monthsLate =
      goal.deadline && projectedCompletion
        ? monthsBetweenKeys(monthOf(goal.deadline), projectedCompletion)
        : undefined

    allocations.push({
      goal,
      pace: 'balanced',
      monthly,
      required: progress.requiredPerMonth,
      projectedCompletion,
      onTimeForDeadline: monthsLate === undefined ? undefined : monthsLate <= 0,
      monthsLate,
    })
  }

  const totalSaving = allocations.reduce((sum, a) => sum + a.monthly, 0)

  return {
    spare,
    savingsBudget,
    totalSaving,
    spendingAllowance: spare - totalSaving,
    allocations,
    overCommitted: strictTotal > savingsBudget,
    advice: buildAdvice({ lifestyle, spare, savingsBudget, strictTotal, totalSaving, allocations }),
  }
}

function monthsBetweenKeys(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return by * 12 + bm - (ay * 12 + am)
}

function buildAdvice({
  lifestyle,
  spare,
  savingsBudget,
  strictTotal,
  totalSaving,
  allocations,
}: {
  lifestyle: Lifestyle
  spare: number
  savingsBudget: number
  strictTotal: number
  totalSaving: number
  allocations: Allocation[]
}): string {
  if (allocations.length === 0) {
    return spare > 0
      ? 'No goals to fund yet — all your spare money is yours to spend.'
      : 'No goals to fund, and nothing spare at the moment.'
  }
  if (spare <= 0) {
    return "You're not finishing months with anything spare, so there's nothing to allocate. Trim spending or add income before setting a pace."
  }
  if (strictTotal > savingsBudget) {
    return `Your fixed-deadline goals need more than a "${LIFESTYLE_LABEL[lifestyle].toLowerCase()}" split sets aside. They'll still be funded, but it eats into spending money — switch one to flexible, or move a deadline.`
  }
  const late = allocations.filter((a) => a.pace === 'balanced' && a.onTimeForDeadline === false).length
  if (late > 0) {
    return `Saving ${percent(totalSaving, spare)} of your spare money. ${late} flexible ${late === 1 ? 'goal lands' : 'goals land'} after their target date — that's the trade for keeping spending money.`
  }
  return `Saving ${percent(totalSaving, spare)} of your spare money, leaving the rest to spend.`
}

function percent(part: number, whole: number): string {
  if (whole <= 0) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

/** What a single goal should receive this month under the current plan. */
export function allocationFor(state: AppState, goalId: string, month?: MonthKey): Allocation | undefined {
  return allocateSavings(state, month).allocations.find((a) => a.goal.id === goalId)
}
