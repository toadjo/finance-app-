import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { daysToNextPayday, describePayday, incomeArrivingIn, nextPayday, payDatesIn, paydaysIn } from './payday'
import type { IncomeSource } from '../types'
import { TODAY } from '../test/fixtures'

const salary: IncomeSource = {
  id: 'salary',
  label: 'Salary',
  amount: 3000,
  frequency: 'monthly',
  payAnchor: '2026-01-28',
}

describe('payDatesIn', () => {
  it('repeats the anchor day every month', () => {
    expect(payDatesIn(salary, '2026-07')).toEqual(['2026-07-28'])
    expect(payDatesIn(salary, '2026-12')).toEqual(['2026-12-28'])
    // Works backwards from the anchor too.
    expect(payDatesIn(salary, '2025-11')).toEqual(['2025-11-28'])
  })

  it('clamps a late-month payday to short months', () => {
    const endOfMonth = { ...salary, payAnchor: '2026-01-31' }
    expect(payDatesIn(endOfMonth, '2026-02')).toEqual(['2026-02-28'])
    expect(payDatesIn(endOfMonth, '2026-04')).toEqual(['2026-04-30'])
    expect(payDatesIn(endOfMonth, '2026-05')).toEqual(['2026-05-31'])
    // A clamped month must not shift later months off the 31st.
    expect(payDatesIn(endOfMonth, '2028-02')).toEqual(['2028-02-29'])
  })

  it('steps weekly from the anchor, including five-payday months', () => {
    const weekly: IncomeSource = { id: 'w', label: 'Shifts', amount: 400, frequency: 'weekly', payAnchor: '2026-07-03' }
    expect(payDatesIn(weekly, '2026-07')).toEqual(['2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24', '2026-07-31'])
    expect(payDatesIn(weekly, '2026-08')).toEqual(['2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28'])
  })

  it('steps fortnightly on the right weeks', () => {
    const biweekly: IncomeSource = { id: 'b', label: 'Contract', amount: 900, frequency: 'biweekly', payAnchor: '2026-07-03' }
    expect(payDatesIn(biweekly, '2026-07')).toEqual(['2026-07-03', '2026-07-17', '2026-07-31'])
    expect(payDatesIn(biweekly, '2026-08')).toEqual(['2026-08-14', '2026-08-28'])
  })

  it('only pays in the months a quarterly or yearly cadence lands in', () => {
    const quarterly: IncomeSource = { id: 'q', label: 'Dividend', amount: 600, frequency: 'quarterly', payAnchor: '2026-02-10' }
    expect(payDatesIn(quarterly, '2026-05')).toEqual(['2026-05-10'])
    expect(payDatesIn(quarterly, '2026-08')).toEqual(['2026-08-10'])
    expect(payDatesIn(quarterly, '2026-06')).toEqual([])

    const yearly: IncomeSource = { id: 'y', label: 'Bonus', amount: 5000, frequency: 'yearly', payAnchor: '2026-03-01' }
    expect(payDatesIn(yearly, '2027-03')).toEqual(['2027-03-01'])
    expect(payDatesIn(yearly, '2027-04')).toEqual([])
  })

  it('respects the source’s active window', () => {
    const ended = { ...salary, endMonth: '2026-05' }
    expect(payDatesIn(ended, '2026-05')).toEqual(['2026-05-28'])
    expect(payDatesIn(ended, '2026-06')).toEqual([])
  })

  it('returns nothing when no payday has been set', () => {
    const { payAnchor: _unused, ...noAnchor } = salary
    expect(payDatesIn(noAnchor, '2026-07')).toEqual([])
  })
})

describe('nextPayday', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY) // 15 July 2026
  })
  afterEach(() => vi.useRealTimers())

  it('finds the soonest date across every source', () => {
    const freelance: IncomeSource = { id: 'f', label: 'Freelance', amount: 500, frequency: 'monthly', payAnchor: '2026-01-20' }
    const next = nextPayday([salary, freelance])
    expect(next?.date).toBe('2026-07-20')
    expect(next?.total).toBe(500)
    expect(daysToNextPayday([salary, freelance])).toBe(5)
  })

  it('adds up sources that pay on the same day', () => {
    const second: IncomeSource = { id: 's2', label: 'Side gig', amount: 250, frequency: 'monthly', payAnchor: '2026-02-28' }
    const next = nextPayday([salary, second])
    expect(next?.date).toBe('2026-07-28')
    expect(next?.total).toBe(3250)
    expect(next?.sources).toHaveLength(2)
  })

  it('rolls into next month once this month’s payday has passed', () => {
    const early: IncomeSource = { ...salary, payAnchor: '2026-01-05' }
    expect(nextPayday([early])?.date).toBe('2026-08-05')
  })

  it('counts a payday falling today', () => {
    const todayPay: IncomeSource = { ...salary, payAnchor: '2026-01-15' }
    expect(nextPayday([todayPay])?.date).toBe('2026-07-15')
    expect(daysToNextPayday([todayPay])).toBe(0)
  })

  it('still resolves a once-a-year source', () => {
    const yearly: IncomeSource = { id: 'y', label: 'Bonus', amount: 5000, frequency: 'yearly', payAnchor: '2026-03-01' }
    expect(nextPayday([yearly])?.date).toBe('2027-03-01')
  })

  it('is undefined when nothing has a payday set', () => {
    const { payAnchor: _unused, ...noAnchor } = salary
    expect(nextPayday([noAnchor])).toBeUndefined()
    expect(daysToNextPayday([noAnchor])).toBeUndefined()
  })
})

describe('incomeArrivingIn', () => {
  it('reflects the real number of paydays, not an average', () => {
    const weekly: IncomeSource = { id: 'w', label: 'Shifts', amount: 400, frequency: 'weekly', payAnchor: '2026-07-03' }
    // July 2026 has five Fridays from the 3rd; August has four.
    expect(incomeArrivingIn([weekly], '2026-07')).toBe(2000)
    expect(incomeArrivingIn([weekly], '2026-08')).toBe(1600)
  })

  it('still counts sources that have no payday set', () => {
    const noAnchor: IncomeSource = { id: 'n', label: 'Freelance', amount: 550, frequency: 'monthly' }
    const yearly: IncomeSource = { id: 'y', label: 'Dividends', amount: 900, frequency: 'yearly', payAnchor: '2026-05-06' }
    // 3000 on the 28th + 550 normalised + nothing from the yearly source this month.
    expect(incomeArrivingIn([salary, noAnchor, yearly], '2026-09')).toBe(3550)
    // The yearly source lands in May, so that month is bigger.
    expect(incomeArrivingIn([salary, noAnchor, yearly], '2027-05')).toBe(4450)
  })

  it('sums every source paying in the month', () => {
    expect(paydaysIn([salary], '2026-09')).toHaveLength(1)
    expect(incomeArrivingIn([salary], '2026-09')).toBe(3000)
  })
})

describe('describePayday', () => {
  it('reads naturally for each cadence', () => {
    expect(describePayday(salary)).toBe('28th of the month')
    expect(describePayday({ ...salary, payAnchor: '2026-01-01' })).toBe('1st of the month')
    expect(describePayday({ ...salary, payAnchor: '2026-01-22' })).toBe('22nd of the month')
    expect(describePayday({ ...salary, payAnchor: '2026-01-03' })).toBe('3rd of the month')
    expect(describePayday({ ...salary, payAnchor: '2026-01-11' })).toBe('11th of the month')
    expect(describePayday({ ...salary, frequency: 'weekly', payAnchor: '2026-07-03' })).toBe('Every Friday')
    expect(describePayday({ ...salary, frequency: 'biweekly', payAnchor: '2026-07-03' })).toBe('Every other Friday')
  })

  it('says so when no payday is configured', () => {
    const { payAnchor: _unused, ...noAnchor } = salary
    expect(describePayday(noAnchor)).toBe('No payday set')
  })
})
