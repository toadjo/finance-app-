import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { committedSpend, detectRecurring, upcomingBills } from './recurring'
import { makeLedger, THIS_MONTH, TODAY } from '../../test/fixtures'

describe('detectRecurring', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('finds the monthly rent and reads its cadence', () => {
    const bills = detectRecurring(makeLedger().expenses)
    const rent = bills.find((b) => b.label === 'Rent')
    expect(rent).toBeDefined()
    expect(rent!.frequency).toBe('monthly')
    expect(rent!.typicalAmount).toBe(1450)
    expect(rent!.occurrences).toBe(6)
    // Calendar months run 28–31 days against a 30.4-day nominal cadence, so even a
    // perfectly punctual monthly bill tops out at 0.9 rather than 1.
    expect(rent!.regularity).toBeGreaterThan(0.85)
  })

  it('projects the next due date one cadence past the last charge', () => {
    const netflix = detectRecurring(makeLedger().expenses).find((b) => b.label === 'Netflix')
    expect(netflix).toBeDefined()
    expect(netflix!.lastDate).toBe('2026-06-20')
    expect(netflix!.nextDue).toBe('2026-07-20')
  })

  it('notices a subscription price rise', () => {
    const netflix = detectRecurring(makeLedger().expenses).find((b) => b.label === 'Netflix')!
    expect(netflix.priceIncrease).toBeDefined()
    expect(netflix.priceIncrease!.from).toBe(12.99)
    expect(netflix.priceIncrease!.to).toBe(15.99)
    expect(netflix.priceIncrease!.ratio).toBeCloseTo(0.231, 3)
  })

  it('ignores irregular spending that merely shares a note', () => {
    // Kafeneio appears 11 times, but at 3–13 day gaps: not a bill.
    const bills = detectRecurring(makeLedger().expenses)
    expect(bills.some((b) => b.label === 'Kafeneio')).toBe(false)
  })

  it('ignores anything with fewer than three occurrences', () => {
    const bills = detectRecurring([
      { id: '1', date: '2026-05-01', amount: 40, categoryId: 'fun', note: 'Climbing gym' },
      { id: '2', date: '2026-06-01', amount: 40, categoryId: 'fun', note: 'Climbing gym' },
    ])
    expect(bills).toEqual([])
  })

  it('lists only bills still to land this month', () => {
    const state = makeLedger()
    const upcoming = upcomingBills(state.expenses, THIS_MONTH)
    // Rent already went out on the 1st; Netflix is due on the 20th.
    expect(upcoming.map((b) => b.label)).toEqual(['Netflix'])
    expect(committedSpend(state.expenses, THIS_MONTH)).toBe(12.99)
  })
})
