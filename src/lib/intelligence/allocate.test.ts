import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allocateSavings, paceOf } from './allocate'
import { safeToSpend } from './insights'
import type { AppState, Goal, Lifestyle } from '../../types'
import { makeLedger, THIS_MONTH, TODAY } from '../../test/fixtures'

/** The fixture nets 4000 income − 1678.99 spending ≈ 2321 spare per past month. */
function ledger(goals: Goal[], lifestyle: Lifestyle = 'balanced'): AppState {
  const base = makeLedger()
  return { ...base, goals, settings: { ...base.settings, lifestyle } }
}

const trip: Goal = {
  id: 'trip',
  name: 'Trip',
  target: 6000,
  deadline: '2027-07-31',
  createdAt: new Date(2026, 0, 1).toISOString(),
  contributions: [],
  pace: 'balanced',
}

const laptop: Goal = {
  id: 'laptop',
  name: 'Laptop',
  target: 2000,
  deadline: '2026-11-30',
  createdAt: new Date(2026, 0, 1).toISOString(),
  contributions: [],
  pace: 'strict',
}

describe('paceOf', () => {
  it('treats goals made before paces existed as strict', () => {
    const { pace: _unused, ...legacy } = trip
    expect(paceOf(legacy as Goal)).toBe('strict')
    expect(paceOf(trip)).toBe('balanced')
  })
})

describe('lifestyle drives how much is saved', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('sets the savings budget as a share of spare money', () => {
    const relaxed = allocateSavings(ledger([trip], 'relaxed'), THIS_MONTH)
    const balanced = allocateSavings(ledger([trip], 'balanced'), THIS_MONTH)
    const focused = allocateSavings(ledger([trip], 'focused'), THIS_MONTH)

    expect(relaxed.savingsBudget).toBeCloseTo(relaxed.spare * 0.25, 6)
    expect(balanced.savingsBudget).toBeCloseTo(balanced.spare * 0.5, 6)
    expect(focused.savingsBudget).toBeCloseTo(focused.spare * 0.8, 6)
  })

  it('leaves more to spend the more relaxed you are', () => {
    const relaxed = allocateSavings(ledger([trip], 'relaxed'), THIS_MONTH)
    const focused = allocateSavings(ledger([trip], 'focused'), THIS_MONTH)

    expect(relaxed.spendingAllowance).toBeGreaterThan(focused.spendingAllowance)
    expect(relaxed.totalSaving).toBeLessThan(focused.totalSaving)
    // Whatever the split, saving plus spending accounts for all the spare money.
    for (const plan of [relaxed, focused]) {
      expect(plan.totalSaving + plan.spendingAllowance).toBeCloseTo(plan.spare, 6)
    }
  })
})

describe('balanced goals bend, strict goals do not', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('funds a strict goal at exactly what its deadline demands', () => {
    const plan = allocateSavings(ledger([laptop]), THIS_MONTH)
    const allocation = plan.allocations[0]
    // 2000 over July–November inclusive: five months.
    expect(allocation.required).toBe(400)
    expect(allocation.monthly).toBe(400)
    expect(allocation.pace).toBe('strict')
  })

  it('funds a balanced goal from spare money and lets the date move', () => {
    const plan = allocateSavings(ledger([trip], 'relaxed'), THIS_MONTH)
    const allocation = plan.allocations[0]
    expect(allocation.pace).toBe('balanced')
    // Gets the whole relaxed budget, since it's the only goal.
    expect(allocation.monthly).toBeCloseTo(plan.savingsBudget, 6)
    expect(allocation.projectedCompletion).toBeDefined()
    // A relaxed pace saves less, so it finishes later than a focused one.
    const focused = allocateSavings(ledger([trip], 'focused'), THIS_MONTH).allocations[0]
    expect(focused.monthly).toBeGreaterThan(allocation.monthly)
    expect(focused.projectedCompletion! < allocation.projectedCompletion!).toBe(true)
  })

  it('reports whether a balanced goal still beats its deadline', () => {
    const soon: Goal = { ...trip, deadline: '2026-09-30' }
    const late = allocateSavings(ledger([soon], 'relaxed'), THIS_MONTH).allocations[0]
    expect(late.onTimeForDeadline).toBe(false)
    expect(late.monthsLate).toBeGreaterThan(0)
  })

  it('shares what is left between balanced goals, biggest need first', () => {
    const small: Goal = { ...trip, id: 'small', name: 'Small', target: 1000 }
    const plan = allocateSavings(ledger([trip, small]), THIS_MONTH)
    const big = plan.allocations.find((a) => a.goal.id === 'trip')!
    const little = plan.allocations.find((a) => a.goal.id === 'small')!

    expect(big.monthly).toBeGreaterThan(little.monthly)
    expect(big.monthly + little.monthly).toBeCloseTo(plan.savingsBudget, 6)
  })

  it('pays strict goals first, and balanced goals get only the remainder', () => {
    const plan = allocateSavings(ledger([laptop, trip]), THIS_MONTH)
    const strict = plan.allocations.find((a) => a.goal.id === 'laptop')!
    const flexible = plan.allocations.find((a) => a.goal.id === 'trip')!

    expect(strict.monthly).toBe(400)
    expect(flexible.monthly).toBeCloseTo(plan.savingsBudget - 400, 6)
  })

  it('flags being over-committed when strict goals exceed the budget', () => {
    const huge: Goal = { ...laptop, id: 'huge', target: 40000, deadline: '2026-10-31' }
    const plan = allocateSavings(ledger([huge], 'relaxed'), THIS_MONTH)
    expect(plan.overCommitted).toBe(true)
    expect(plan.spendingAllowance).toBeLessThan(plan.spare)
    expect(plan.advice).toContain('fixed-deadline')
  })
})

describe('edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('allocates nothing when there is no spare money', () => {
    const broke = ledger([trip])
    broke.incomes = [{ id: 'i', label: 'Small', amount: 100, frequency: 'monthly' }]
    const plan = allocateSavings(broke, THIS_MONTH)
    expect(plan.savingsBudget).toBe(0)
    expect(plan.allocations[0].monthly).toBe(0)
    expect(plan.allocations[0].projectedCompletion).toBeUndefined()
    expect(plan.advice).toContain('nothing to allocate')
  })

  it('ignores goals that are already funded', () => {
    const done: Goal = { ...trip, contributions: [{ id: 'c', amount: 6000, date: '2026-05-01' }] }
    const plan = allocateSavings(ledger([done]), THIS_MONTH)
    expect(plan.allocations).toHaveLength(0)
    expect(plan.spendingAllowance).toBeCloseTo(plan.spare, 6)
  })

  it('leaves all spare money spendable when there are no goals', () => {
    const plan = allocateSavings(ledger([]), THIS_MONTH)
    expect(plan.totalSaving).toBe(0)
    expect(plan.spendingAllowance).toBeCloseTo(plan.spare, 6)
    expect(plan.advice).toContain('yours to spend')
  })
})

describe('spending money reflects the pace you chose', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('a flexible goal leaves more safe-to-spend than the same goal held strictly', () => {
    const strictVersion = { ...trip, pace: 'strict' as const, deadline: '2026-10-31' }
    const balancedVersion = { ...strictVersion, pace: 'balanced' as const }

    const strictSafe = safeToSpend(ledger([strictVersion], 'relaxed'), THIS_MONTH)
    const balancedSafe = safeToSpend(ledger([balancedVersion], 'relaxed'), THIS_MONTH)

    expect(balancedSafe.goalFunding).toBeLessThan(strictSafe.goalFunding)
    expect(balancedSafe.total).toBeGreaterThan(strictSafe.total)
  })
})
