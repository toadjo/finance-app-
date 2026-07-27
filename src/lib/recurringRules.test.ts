import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectDuePostings, describeRule, duePostings, nextDue, scheduledIn, scheduledTotal } from './recurringRules'
import { reducer } from '../state/store'
import type { AppState, RecurringRule } from '../types'
import { makeLedger, TODAY } from '../test/fixtures'

const rent: RecurringRule = {
  id: 'rent',
  kind: 'expense',
  label: 'Rent',
  amount: 1450,
  frequency: 'monthly',
  anchor: '2026-01-01',
  categoryId: 'housing',
  active: true,
  autoPost: true,
}

const saving: RecurringRule = {
  id: 'save',
  kind: 'contribution',
  label: 'Payday transfer',
  amount: 500,
  frequency: 'monthly',
  anchor: '2026-01-05',
  goalId: 'goal-emergency',
  active: true,
  autoPost: true,
}

function ledgerWith(rules: RecurringRule[]): AppState {
  return { ...makeLedger(), recurring: rules }
}

describe('scheduling', () => {
  it('lists a rule’s occurrences in a month', () => {
    expect(scheduledIn([rent], '2026-09').map((s) => s.date)).toEqual(['2026-09-01'])
    expect(scheduledTotal([rent, saving], '2026-09')).toBe(1950)
  })

  it('stops at the rule’s end date', () => {
    const ending = { ...rent, endDate: '2026-08-31' }
    expect(scheduledIn([ending], '2026-08')).toHaveLength(1)
    expect(scheduledIn([ending], '2026-09')).toHaveLength(0)
  })

  it('ignores paused rules', () => {
    expect(scheduledIn([{ ...rent, active: false }], '2026-09')).toHaveLength(0)
  })

  it('can filter to one kind', () => {
    expect(scheduledIn([rent, saving], '2026-09', 'contribution').map((s) => s.rule.id)).toEqual(['save'])
    expect(scheduledTotal([rent, saving], '2026-09', 'expense')).toBe(1450)
  })
})

describe('duePostings', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY) // 15 July 2026
  })
  afterEach(() => vi.useRealTimers())

  it('catches up every occurrence since the anchor on first run', () => {
    // January through July: seven rent payments.
    expect(duePostings(rent)).toEqual([
      '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01',
    ])
  })

  it('resumes from the watermark, never repeating one', () => {
    expect(duePostings({ ...rent, lastPostedDate: '2026-05-01' })).toEqual(['2026-06-01', '2026-07-01'])
  })

  it('posts nothing when already up to date', () => {
    expect(duePostings({ ...rent, lastPostedDate: '2026-07-01' })).toEqual([])
  })

  it('never posts into the future', () => {
    const laterThisMonth = { ...rent, anchor: '2026-01-20' }
    // The 20th hasn't happened yet in July, so June is the last one posted.
    expect(duePostings(laterThisMonth).at(-1)).toBe('2026-06-20')
  })

  it('honours autoPost and active flags', () => {
    expect(duePostings({ ...rent, autoPost: false })).toEqual([])
    expect(duePostings({ ...rent, active: false })).toEqual([])
  })

  it('stops posting after the end date', () => {
    expect(duePostings({ ...rent, endDate: '2026-03-15' }).at(-1)).toBe('2026-03-01')
  })

  it('reports the next due date', () => {
    expect(nextDue(rent)).toBe('2026-08-01')
    expect(nextDue({ ...rent, anchor: '2026-01-20' })).toBe('2026-07-20')
    expect(nextDue({ ...rent, active: false })).toBeUndefined()
  })
})

describe('collectDuePostings', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('builds expenses and contributions with correct watermarks', () => {
    const due = collectDuePostings(ledgerWith([rent, saving]))
    expect(due.expenses).toHaveLength(7)
    expect(due.contributions).toHaveLength(7)
    expect(due.expenses[0]).toMatchObject({ date: '2026-01-01', amount: 1450, categoryId: 'housing', note: 'Rent' })
    expect(due.contributions[0].goalId).toBe('goal-emergency')
    expect(due.watermarks).toEqual({ rent: '2026-07-01', save: '2026-07-05' })
  })

  it('skips a contribution whose goal has been deleted', () => {
    const state = ledgerWith([{ ...saving, goalId: 'gone' }])
    const due = collectDuePostings(state)
    expect(due.contributions).toHaveLength(0)
    expect(due.count).toBe(0)
  })

  it('does nothing when there is nothing due', () => {
    const due = collectDuePostings(ledgerWith([{ ...rent, lastPostedDate: '2026-07-01' }]))
    expect(due.count).toBe(0)
  })
})

describe('posting through the reducer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('writes the entries and advances the watermark in one update', () => {
    const before = ledgerWith([rent, saving])
    const after = reducer(before, { type: 'recurring/post-due' })

    expect(after.expenses.length).toBe(before.expenses.length + 7)
    const goal = after.goals.find((g) => g.id === 'goal-emergency')!
    expect(goal.contributions.length).toBe(3 + 7)
    expect(after.recurring.find((r) => r.id === 'rent')?.lastPostedDate).toBe('2026-07-01')
  })

  it('is idempotent — running it twice posts nothing the second time', () => {
    const once = reducer(ledgerWith([rent, saving]), { type: 'recurring/post-due' })
    const twice = reducer(once, { type: 'recurring/post-due' })
    expect(twice).toBe(once) // unchanged reference: no work done
    expect(twice.expenses.length).toBe(once.expenses.length)
  })

  it('picks up only the new occurrence a month later', () => {
    const caughtUp = reducer(ledgerWith([rent]), { type: 'recurring/post-due' })
    const nextMonth = reducer(caughtUp, { type: 'recurring/post-due', until: '2026-08-05' })
    expect(nextMonth.expenses.length).toBe(caughtUp.expenses.length + 1)
    expect(nextMonth.expenses.at(-1)?.date).toBe('2026-08-01')
  })
})

describe('describeRule', () => {
  it('reads naturally', () => {
    expect(describeRule(rent)).toBe('1st of the month')
    expect(describeRule({ ...rent, frequency: 'weekly', anchor: '2026-07-03' })).toBe('Every Friday')
    expect(describeRule({ ...rent, frequency: 'yearly', anchor: '2026-03-22' })).toBe('Yearly, on the 22nd')
  })
})
