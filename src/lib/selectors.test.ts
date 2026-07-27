import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { goalProgress, isIncomeActive, monthlyIncome, requiredMonthlySavings, summariseMonth } from './selectors'
import type { Goal, IncomeSource } from '../types'
import { makeLedger, THIS_MONTH, TODAY } from '../test/fixtures'

describe('income activity windows', () => {
  const job: IncomeSource = { id: '1', label: 'Old job', amount: 3000, frequency: 'monthly', startMonth: '2026-01', endMonth: '2026-05' }

  it('counts a source only inside its window, inclusive at both ends', () => {
    expect(isIncomeActive(job, '2026-01')).toBe(true)
    expect(isIncomeActive(job, '2026-05')).toBe(true)
    expect(isIncomeActive(job, '2025-12')).toBe(false)
    expect(isIncomeActive(job, '2026-06')).toBe(false)
  })

  it('treats a missing window as always active', () => {
    const freelance: IncomeSource = { id: '2', label: 'Freelance', amount: 500, frequency: 'monthly' }
    expect(isIncomeActive(freelance, '2019-01')).toBe(true)
    expect(isIncomeActive(freelance, '2099-01')).toBe(true)
  })

  it('drops a job you left out of later months', () => {
    const incomes = [job, { id: '2', label: 'New job', amount: 4000, frequency: 'monthly' as const, startMonth: '2026-06' }]
    expect(monthlyIncome(incomes, '2026-04')).toBe(3000)
    expect(monthlyIncome(incomes, '2026-06')).toBe(4000)
  })
})

describe('monthly summary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('nets income against only that month’s expenses', () => {
    const state = makeLedger()
    const july = summariseMonth(state, THIS_MONTH)
    // July: rent 1450 + three grocery shops (60 + 72 + 84).
    expect(july.income).toBe(4000)
    expect(july.spent).toBe(1666)
    expect(july.net).toBe(2334)
    expect(july.savingsRate).toBeCloseTo(0.5835, 4)
  })

  it('counts goal contributions made in that month', () => {
    const state = makeLedger()
    expect(summariseMonth(state, '2026-04').saved).toBe(2300) // 500 emergency + 1800 laptop
    expect(summariseMonth(state, THIS_MONTH).saved).toBe(0)
  })
})

describe('goal progress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  const base: Goal = { id: 'g', name: 'Trip', target: 1200, createdAt: new Date(2026, 0, 1).toISOString(), contributions: [] }

  it('divides what is left over the months remaining, counting the deadline month', () => {
    const goal: Goal = { ...base, deadline: '2026-10-31', contributions: [{ id: 'c', amount: 300, date: '2026-03-01' }] }
    const progress = goalProgress(goal)
    expect(progress.saved).toBe(300)
    expect(progress.remaining).toBe(900)
    expect(progress.progress).toBe(0.25)
    expect(progress.monthsLeft).toBe(4) // July, August, September, October
    expect(progress.requiredPerMonth).toBe(225)
  })

  it('marks a fully funded goal complete even past its deadline', () => {
    const goal: Goal = { ...base, deadline: '2026-01-01', contributions: [{ id: 'c', amount: 1200, date: '2025-12-01' }] }
    expect(goalProgress(goal).status).toBe('complete')
  })

  it('flags an unfunded goal past its deadline as overdue', () => {
    expect(goalProgress({ ...base, deadline: '2026-06-01' }).status).toBe('overdue')
  })

  it('compares against the pace implied by the deadline', () => {
    // Half the window elapsed (Jan→Dec, now July) so half funded is on track.
    const onTrack: Goal = { ...base, deadline: '2026-12-31', contributions: [{ id: 'c', amount: 700, date: '2026-04-01' }] }
    const behind: Goal = { ...base, deadline: '2026-12-31', contributions: [{ id: 'c', amount: 100, date: '2026-04-01' }] }
    expect(goalProgress(onTrack).status).toBe('on-track')
    expect(goalProgress(behind).status).toBe('behind')
  })

  it('caps progress at 100% when overfunded', () => {
    const goal: Goal = { ...base, contributions: [{ id: 'c', amount: 5000, date: '2026-04-01' }] }
    expect(goalProgress(goal).progress).toBe(1)
    expect(goalProgress(goal).remaining).toBe(0)
  })

  it('excludes undated and completed goals from the required monthly total', () => {
    const state = makeLedger()
    // Emergency fund only: 4500 left over Jul–Dec = 750/mo. The laptop is funded.
    expect(requiredMonthlySavings(state.goals)).toBe(750)
  })
})
