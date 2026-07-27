import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coachGoal, coachPortfolio } from './coach'
import type { Goal } from '../../types'
import { fmt, makeLedger, THIS_MONTH, TODAY } from '../../test/fixtures'

const base: Goal = {
  id: 'g',
  name: 'Trip',
  target: 2400,
  createdAt: new Date(2026, 0, 1).toISOString(),
  contributions: [],
}

describe('coachGoal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('measures the rate you have actually been contributing at', () => {
    // 200/month across April, May, June, July — four months up to today.
    const goal: Goal = {
      ...base,
      contributions: [
        { id: '1', amount: 200, date: '2026-04-10' },
        { id: '2', amount: 200, date: '2026-05-10' },
        { id: '3', amount: 200, date: '2026-06-10' },
        { id: '4', amount: 200, date: '2026-07-10' },
      ],
    }
    expect(coachGoal(goal, fmt).actualPerMonth).toBe(200)
  })

  it('projects a landing month from that rate and calls it late', () => {
    const goal: Goal = {
      ...base,
      deadline: '2026-10-31',
      contributions: [
        { id: '1', amount: 200, date: '2026-06-10' },
        { id: '2', amount: 200, date: '2026-07-10' },
      ],
    }
    const coaching = coachGoal(goal, fmt)
    expect(coaching.actualPerMonth).toBe(200)
    // 2000 left at 200/month = 10 more months, so June 2027 against an October deadline.
    expect(coaching.projectedCompletion).toBe('2027-05')
    expect(coaching.verdict).toBe('late')
    expect(coaching.monthsLate).toBe(7)
    expect(coaching.shortfallPerMonth).toBe(300) // needs 500/month, giving 200
    expect(coaching.advice).toContain('Add 300.00 a month')
  })

  it('recognises a goal that is comfortably on pace', () => {
    const goal: Goal = {
      ...base,
      deadline: '2026-12-31',
      contributions: [
        { id: '1', amount: 900, date: '2026-06-10' },
        { id: '2', amount: 900, date: '2026-07-10' },
      ],
    }
    const coaching = coachGoal(goal, fmt)
    expect(['ahead', 'on-track']).toContain(coaching.verdict)
    expect(coaching.monthsLate).toBeLessThanOrEqual(0)
  })

  it('calls out a goal nobody has funded', () => {
    const coaching = coachGoal({ ...base, deadline: '2026-12-31' }, fmt)
    expect(coaching.verdict).toBe('stalled')
    expect(coaching.shortfallPerMonth).toBe(400) // 2400 over six months
    expect(coaching.advice).toContain('Nothing contributed yet')
  })

  it('has nothing to nag about once a goal is funded', () => {
    const coaching = coachGoal({ ...base, contributions: [{ id: '1', amount: 2400, date: '2026-05-01' }] }, fmt)
    expect(coaching.verdict).toBe('complete')
  })

  it('still forecasts a landing month without a deadline', () => {
    const goal: Goal = { ...base, contributions: [{ id: '1', amount: 600, date: '2026-07-01' }] }
    const coaching = coachGoal(goal, fmt)
    expect(coaching.verdict).toBe('no-deadline')
    expect(coaching.projectedCompletion).toBe('2026-10') // 1800 left at 600/month
  })
})

describe('coachPortfolio', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('compares what the goals need against what you typically have spare', () => {
    const portfolio = coachPortfolio(makeLedger(), THIS_MONTH, fmt)
    expect(portfolio.requiredPerMonth).toBe(750) // emergency fund only; the laptop is done
    expect(portfolio.typicalLeftover).toBeGreaterThan(0)
    expect(portfolio.overcommitted).toBe(false)
    expect(portfolio.advice).toContain('affordable')
  })

  it('flags being over-committed and says how short you are', () => {
    const state = makeLedger()
    state.goals.push({
      id: 'huge',
      name: 'House deposit',
      target: 60000,
      deadline: '2027-01-31',
      createdAt: new Date(2026, 5, 1).toISOString(),
      contributions: [],
    })
    const portfolio = coachPortfolio(state, THIS_MONTH, fmt)
    expect(portfolio.overcommitted).toBe(true)
    expect(portfolio.gap).toBeGreaterThan(0)
    expect(portfolio.advice).toContain('short')
  })

  it('funds the nearest deadline first and marks what does not fit', () => {
    const state = makeLedger()
    state.goals.push({
      id: 'huge',
      name: 'House deposit',
      target: 60000,
      deadline: '2027-01-31',
      createdAt: new Date(2026, 5, 1).toISOString(),
      contributions: [],
    })
    const { priority } = coachPortfolio(state, THIS_MONTH, fmt)
    expect(priority[0].goal.id).toBe('goal-emergency') // December beats January
    expect(priority[0].fundable).toBe(true)
    expect(priority.find((p) => p.goal.id === 'huge')?.fundable).toBe(false)
  })
})
