import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAlerts, projectedSpend, safeToSpend, unusualExpenses } from './insights'
import { fmt, makeLedger, THIS_MONTH, TODAY } from '../../test/fixtures'

describe('safe to spend', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('subtracts spending, bills still due and goal funding from income', () => {
    const safe = safeToSpend(makeLedger(), THIS_MONTH)
    expect(safe.income).toBe(4000)
    expect(safe.spent).toBe(1666) // rent + three grocery shops
    expect(safe.committed).toBe(12.99) // Netflix, due on the 20th
    expect(safe.goalFunding).toBe(750) // emergency fund, nothing given yet this month
    expect(safe.total).toBeCloseTo(1571.01, 2)
  })

  it('spreads what is left across the days remaining, today included', () => {
    const safe = safeToSpend(makeLedger(), THIS_MONTH)
    expect(safe.daysLeft).toBe(17) // 15th to 31st inclusive
    expect(safe.perDay).toBeCloseTo(1571.01 / 17, 2)
  })

  it('counts goal money already given this month', () => {
    const state = makeLedger()
    state.goals[0].contributions.push({ id: 'x', amount: 750, date: '2026-07-02' })
    expect(safeToSpend(state, THIS_MONTH).goalFunding).toBe(0)
  })

  it('reports no days left for a month that has already finished', () => {
    const safe = safeToSpend(makeLedger(), '2026-05')
    expect(safe.daysLeft).toBe(0)
    expect(safe.perDay).toBe(0)
  })
})

describe('projected spend', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('adds known upcoming bills to the discretionary burn rate', () => {
    const projection = projectedSpend(makeLedger(), THIS_MONTH)
    expect(projection).toBeGreaterThan(1666) // more than spent so far
    expect(projection).toBeLessThan(1666 * 31 / 15) // but below a naive linear extrapolation
  })

  it('returns the actual total for a past month, not a projection', () => {
    expect(projectedSpend(makeLedger(), '2026-05')).toBe(1678.99)
  })
})

describe('unusual expenses', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('says nothing when the month is unremarkable', () => {
    expect(unusualExpenses(makeLedger(), THIS_MONTH)).toEqual([])
  })

  it('flags a spend well above the category norm', () => {
    const state = makeLedger()
    state.expenses.push({ id: 'blowout', date: '2026-07-12', amount: 480, categoryId: 'groceries', note: 'Party supplies' })
    const flagged = unusualExpenses(state, THIS_MONTH)
    expect(flagged).toHaveLength(1)
    expect(flagged[0].expense.id).toBe('blowout')
    expect(flagged[0].typical).toBeGreaterThan(0)
  })

  it('stays quiet without enough history to judge against', () => {
    const state = makeLedger()
    state.expenses = [{ id: 'lonely', date: '2026-07-12', amount: 9000, categoryId: 'fun', note: 'Boat' }]
    expect(unusualExpenses(state, THIS_MONTH)).toEqual([])
  })
})

describe('alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('warns about the subscription price rise', () => {
    const alerts = buildAlerts(makeLedger(), THIS_MONTH, fmt)
    const priceAlert = alerts.find((a) => a.id.startsWith('price-'))
    expect(priceAlert?.title).toContain('Netflix')
    expect(priceAlert?.title).toContain('23%')
  })

  it('raises a danger alert when the month is heading over budget', () => {
    const state = makeLedger()
    state.expenses.push({ id: 'big', date: '2026-07-10', amount: 3200, categoryId: 'fun', note: 'Festival' })
    const alerts = buildAlerts(state, THIS_MONTH, fmt)
    expect(alerts[0].level).toBe('danger')
    expect(alerts[0].title).toContain('over budget')
  })

  it('keeps quiet on a healthy month', () => {
    const alerts = buildAlerts(makeLedger(), THIS_MONTH, fmt)
    expect(alerts.some((a) => a.level === 'danger')).toBe(false)
  })
})
