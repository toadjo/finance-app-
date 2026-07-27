import { describe, expect, it } from 'vitest'
import { CONFIDENT, suggestCategories, suggestCategory, tokenize } from './categorize'
import { DEFAULT_STATE } from '../storage'
import { makeLedger } from '../../test/fixtures'

const categories = DEFAULT_STATE.categories

describe('tokenize', () => {
  it('strips punctuation, digits and filler words', () => {
    expect(tokenize('Coffee at the Kafeneio, 12')).toEqual(['coffee', 'kafeneio'])
  })
})

describe('suggestCategory with no history', () => {
  it('falls back to keyword rules on day one', () => {
    expect(suggestCategory('Monthly rent', [], categories)?.categoryId).toBe('housing')
    expect(suggestCategory('Uber home', [], categories)?.categoryId).toBe('transport')
    expect(suggestCategory('Netflix subscription', [], categories)?.categoryId).toBe('subscriptions')
    expect(suggestCategory('Pharmacy prescription', [], categories)?.categoryId).toBe('health')
  })

  it('reports keyword-derived guesses as such', () => {
    expect(suggestCategory('Tesco big shop', [], categories)?.reason).toBe('keyword')
  })

  it('says nothing rather than guessing wildly', () => {
    expect(suggestCategory('zzz', [], categories)).toBeUndefined()
    expect(suggestCategory('', [], categories)).toBeUndefined()
  })

  it('does not let a keyword match inside a longer word', () => {
    // "bargain" contains "bar", but is not a night out.
    const suggestion = suggestCategory('bargain bin', [], categories)
    expect(suggestion?.categoryId).not.toBe('dining')
  })
})

describe('suggestCategory learned from your own history', () => {
  const { expenses } = makeLedger()

  it('learns a word the keyword table has never heard of', () => {
    // "Kafeneio" means nothing to the seed rules; the ledger files it under dining 11 times.
    const suggestion = suggestCategory('Kafeneio', expenses, categories)
    expect(suggestion?.categoryId).toBe('dining')
    expect(suggestion?.reason).toBe('history')
    expect(suggestion?.confidence).toBeGreaterThan(CONFIDENT)
  })

  it('recognises your own shop names', () => {
    expect(suggestCategory('Aldi shop', expenses, categories)?.categoryId).toBe('groceries')
    expect(suggestCategory('Rent', expenses, categories)?.categoryId).toBe('housing')
  })

  it('still answers on unseen notes by leaning on keywords', () => {
    expect(suggestCategory('Dentist appointment', expenses, categories)?.categoryId).toBe('health')
  })

  it('returns ranked alternatives, best first', () => {
    const ranked = suggestCategories('Kafeneio coffee', expenses, categories, 3)
    expect(ranked.length).toBeGreaterThan(1)
    expect(ranked[0].categoryId).toBe('dining')
    expect(ranked[0].confidence).toBeGreaterThanOrEqual(ranked[1].confidence)
    expect(ranked.reduce((sum, s) => sum + s.confidence, 0)).toBeCloseTo(1, 6)
  })

  it('only suggests categories that exist', () => {
    const trimmed = categories.filter((c) => c.id !== 'dining')
    const suggestion = suggestCategory('Kafeneio', expenses, trimmed)
    expect(trimmed.some((c) => c.id === suggestion?.categoryId)).toBe(true)
  })
})
