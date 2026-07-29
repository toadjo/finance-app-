import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, normaliseState } from './storage'
import { formatMoney } from './money'
import { incomeBreakdown, summariseMonth } from './selectors'
import { makeLedger } from '../test/fixtures'

/**
 * Everything foreign — an imported file, a restored backup, the on-disk snapshot,
 * the browser store — arrives here. The bar is that whatever comes out can be
 * rendered, because the alternative is a blank window the user cannot get out of.
 */

/** The operations the views perform immediately on whatever state they're handed. */
function render(state: ReturnType<typeof normaliseState>) {
  return [
    formatMoney(1234.5, state.settings),
    state.categories.map((c) => c.name).join(),
    incomeBreakdown(state.incomes, '2026-07').length,
    summariseMonth(state, '2026-07').spent,
    state.goals.map((g) => g.contributions.length).join(),
    state.recurring.map((r) => r.label).join(),
  ]
}

describe('normalising foreign state', () => {
  it('survives the payloads that used to pass the import check and then crash', () => {
    // Both of these satisfied the old `Array.isArray(expenses) && Array.isArray(goals)`
    // test, reached the views with `categories` undefined, and took the app down.
    expect(() => render(normaliseState(JSON.parse('{"expenses":[],"goals":[]}')))).not.toThrow()
    expect(() => render(normaliseState(JSON.parse('{"expenses":[],"goals":[],"settings":{}}')))).not.toThrow()
  })

  it('survives input that is not a state object at all', () => {
    for (const junk of [null, 42, 'nope', [], true, {}]) {
      expect(() => render(normaliseState(junk))).not.toThrow()
    }
    expect(normaliseState(null)).toEqual(DEFAULT_STATE)
  })

  it('falls back on a currency Intl would throw on', () => {
    expect(normaliseState({ settings: { currency: 'NOPE' } }).settings.currency).toBe('USD')
    expect(normaliseState({ settings: { currency: null } }).settings.currency).toBe('USD')
    expect(normaliseState({ settings: { locale: 'not a locale' } }).settings.locale).toBe('en-US')
  })

  it('keeps a currency and locale that do work, upper-casing the code', () => {
    const settings = normaliseState({ settings: { currency: 'eur', locale: 'de-DE' } }).settings
    expect(settings).toMatchObject({ currency: 'EUR', locale: 'de-DE' })
  })

  it('rejects a lifestyle that is not one of the three', () => {
    expect(normaliseState({ settings: { lifestyle: 'yolo' } }).settings.lifestyle).toBe('balanced')
    expect(normaliseState({ settings: { lifestyle: 'focused' } }).settings.lifestyle).toBe('focused')
  })

  it('drops individual unusable rows rather than the whole file', () => {
    const state = normaliseState({
      expenses: [
        { id: 'a', date: '2026-07-01', amount: 20, categoryId: 'dining' },
        { id: 'b', date: 'the third', amount: 20, categoryId: 'dining' }, // unparseable date
        { id: 'c', date: '2026-07-02', amount: 'NaN', categoryId: 'dining' }, // unparseable amount
        'not even an object',
      ],
    })
    expect(state.expenses.map((e) => e.id)).toEqual(['a'])
  })

  it('reads amounts that were stored as strings', () => {
    const state = normaliseState({ expenses: [{ id: 'a', date: '2026-07-01', amount: '19.99', categoryId: 'dining' }] })
    expect(state.expenses[0].amount).toBe(19.99)
  })

  it('re-homes expenses whose category did not survive, so totals still add up', () => {
    const state = normaliseState({
      categories: [{ id: 'food', name: 'Food', color: '#fff', icon: '🍜' }],
      expenses: [{ id: 'a', date: '2026-07-01', amount: 20, categoryId: 'ghost' }],
    })
    expect(state.expenses[0].categoryId).toBe('food')
  })

  it('never leaves the app with zero categories to choose from', () => {
    expect(normaliseState({ categories: [] }).categories).toEqual(DEFAULT_STATE.categories)
    expect(normaliseState({ categories: [{ color: '#fff' }] }).categories).toEqual(DEFAULT_STATE.categories)
  })

  it('gives a goal missing its contributions an empty list', () => {
    const state = normaliseState({ goals: [{ id: 'g', name: 'Trip', target: 500 }] })
    expect(state.goals[0].contributions).toEqual([])
    expect(state.goals[0].createdAt).toBeTruthy()
  })

  it('drops a transfer rule whose goal is gone, since it can never post', () => {
    const state = normaliseState({
      goals: [{ id: 'g', name: 'Trip', target: 500, contributions: [] }],
      recurring: [
        { id: 'r1', kind: 'contribution', label: 'Standing order', amount: 100, frequency: 'monthly', anchor: '2026-01-05', goalId: 'g' },
        { id: 'r2', kind: 'contribution', label: 'Orphan', amount: 100, frequency: 'monthly', anchor: '2026-01-05', goalId: 'gone' },
      ],
    })
    expect(state.recurring.map((r) => r.id)).toEqual(['r1'])
  })

  it('defaults a rule to active and auto-posting only when not told otherwise', () => {
    const base = { label: 'Rent', amount: 1450, frequency: 'monthly', anchor: '2026-01-01', categoryId: 'housing' }
    const state = normaliseState({
      recurring: [
        { ...base, id: 'r1' },
        { ...base, id: 'r2', active: false, autoPost: false },
      ],
    })
    expect(state.recurring[0]).toMatchObject({ active: true, autoPost: true })
    expect(state.recurring[1]).toMatchObject({ active: false, autoPost: false })
  })

  it('discards duplicate ids, which would make every lookup-by-id ambiguous', () => {
    const state = normaliseState({
      expenses: [
        { id: 'same', date: '2026-07-01', amount: 10, categoryId: 'dining' },
        { id: 'same', date: '2026-07-02', amount: 99, categoryId: 'dining' },
      ],
    })
    expect(state.expenses).toHaveLength(1)
    expect(state.expenses[0].amount).toBe(10)
  })

  it('leaves a real ledger untouched, so a round-trip export/import changes nothing', () => {
    const ledger = makeLedger()
    expect(normaliseState(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger)
  })
})
