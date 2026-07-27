import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { monthMode, planMonth, plannedItems } from './plan'
import { projectedBillsIn, projectedBillTotal } from './recurring'
import { makeLedger, THIS_MONTH, TODAY } from '../../test/fixtures'

describe('monthMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('separates past, current and future', () => {
    expect(monthMode('2026-06')).toBe('past')
    expect(monthMode(THIS_MONTH)).toBe('current')
    expect(monthMode('2026-08')).toBe('future')
    expect(monthMode('2027-01')).toBe('future')
  })
})

describe('projected bills for a future month', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('carries recurring charges forward into a month with nothing logged', () => {
    const projected = projectedBillsIn(makeLedger().expenses, '2026-09')
    const labels = projected.map((p) => p.bill.label).sort()
    // The three monthly shops are as regular as the rent, so they carry forward too.
    expect(labels).toEqual(['Aldi shop', 'Corner shop shop', 'Netflix', 'Rent', 'Tesco shop'])
    expect(projected.find((p) => p.bill.label === 'Rent')?.date).toBe('2026-09-01')
    expect(projected.find((p) => p.bill.label === 'Netflix')?.date).toBe('2026-09-20')
  })

  it('keeps projecting many months out', () => {
    const projected = projectedBillsIn(makeLedger().expenses, '2027-03')
    expect(projected.map((p) => p.bill.label).sort()).toEqual(['Aldi shop', 'Corner shop shop', 'Netflix', 'Rent', 'Tesco shop'])
    expect(projected.find((p) => p.bill.label === 'Rent')?.date).toBe('2027-03-01')
  })

  it('does not double-count a bill already entered for that month', () => {
    const state = makeLedger()
    state.expenses.push({ id: 'future-rent', date: '2026-09-01', amount: 1500, categoryId: 'housing', note: 'Rent' })
    const labels = projectedBillsIn(state.expenses, '2026-09').map((p) => p.bill.label)
    expect(labels).not.toContain('Rent')
    expect(labels).toContain('Netflix')
  })

  it('totals the projection', () => {
    // Rent 1450 + Netflix 12.99 + the three shops (60 + 72 + 84).
    expect(projectedBillTotal(makeLedger().expenses, '2026-09')).toBeCloseTo(1678.99, 2)
  })
})

describe('planMonth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('shapes a future month from expected bills and goal funding', () => {
    const plan = planMonth(makeLedger(), '2026-09')
    expect(plan.income).toBe(4000)
    expect(plan.planned).toBe(0) // nothing entered yet
    expect(plan.expectedBills).toBeCloseTo(1678.99, 2)
    expect(plan.goalFunding).toBe(750)
    expect(plan.leftOver).toBeCloseTo(1571.01, 2)
    expect(plan.overCommitted).toBe(false)
  })

  it('counts expenses you deliberately plan into a future month', () => {
    const state = makeLedger()
    state.expenses.push({ id: 'flights', date: '2026-09-12', amount: 900, categoryId: 'transport', note: 'Flights' })
    const plan = planMonth(state, '2026-09')
    expect(plan.planned).toBe(900)
    expect(plan.leftOver).toBeCloseTo(671.01, 2)
  })

  it('flags a month committed beyond its income', () => {
    const state = makeLedger()
    state.expenses.push({ id: 'big', date: '2026-09-12', amount: 3000, categoryId: 'fun', note: 'Wedding' })
    const plan = planMonth(state, '2026-09')
    expect(plan.overCommitted).toBe(true)
    expect(plan.leftOver).toBeLessThan(0)
  })

  it('uses real paydays for what arrives, so a five-payday month reads bigger', () => {
    const state = makeLedger()
    state.incomes = [{ id: 'w', label: 'Shifts', amount: 400, frequency: 'weekly', payAnchor: '2026-07-03' }]
    expect(planMonth(state, '2026-07').arriving).toBe(2000) // five Fridays
    expect(planMonth(state, '2026-08').arriving).toBe(1600) // four
  })

  it('falls back to the normalised figure when no payday is set', () => {
    const plan = planMonth(makeLedger(), '2026-09')
    expect(plan.paydayCount).toBe(0)
    expect(plan.arriving).toBe(plan.income)
  })
})

describe('plannedItems', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('merges entered expenses and expected bills in date order', () => {
    const state = makeLedger()
    state.expenses.push({ id: 'gift', date: '2026-09-10', amount: 60, categoryId: 'fun', note: 'Birthday gift' })
    const items = plannedItems(state, '2026-09')
    expect(items.map((i) => i.label)).toEqual([
      'Rent', 'Aldi shop', 'Birthday gift', 'Tesco shop', 'Netflix', 'Corner shop shop',
    ])
    expect(items.map((i) => i.kind)).toEqual([
      'expected', 'expected', 'entered', 'expected', 'expected', 'expected',
    ])
  })
})
