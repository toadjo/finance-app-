import { describe, expect, it } from 'vitest'
import { formatMoney, parseAmount, toMonthly } from './money'
import type { Settings } from '../types'

const settings: Settings = { currency: 'USD', locale: 'en-US' }

describe('frequency normalisation', () => {
  it('converts every cadence to a monthly figure', () => {
    expect(toMonthly(1000, 'monthly')).toBe(1000)
    expect(toMonthly(1200, 'yearly')).toBe(100)
    expect(toMonthly(300, 'quarterly')).toBeCloseTo(100, 6)
    expect(toMonthly(100, 'weekly')).toBeCloseTo(433.33, 2)
    expect(toMonthly(200, 'biweekly')).toBeCloseTo(433.33, 2)
  })

  it('treats weekly and biweekly consistently — 52 weeks, not 4 per month', () => {
    // The naive "4 weeks a month" would give 400; a year has 52 weeks, not 48.
    expect(toMonthly(100, 'weekly') * 12).toBeCloseTo(5200, 6)
  })
})

describe('parseAmount', () => {
  it('accepts what people actually type', () => {
    expect(parseAmount('42')).toBe(42)
    expect(parseAmount('42.50')).toBe(42.5)
    expect(parseAmount('$1,299.99')).toBe(1299.99)
    expect(parseAmount('  12,5 ')).toBe(12.5)
    expect(parseAmount('€80')).toBe(80)
  })

  it('rounds to cents and rejects nonsense', () => {
    expect(parseAmount('3.14159')).toBe(3.14)
    expect(parseAmount('abc')).toBe(0)
    expect(parseAmount('')).toBe(0)
  })

  it('keeps negatives, which record a withdrawal from a goal', () => {
    expect(parseAmount('-250')).toBe(-250)
  })
})

describe('formatMoney', () => {
  it('shows cents on small amounts and drops them on large ones', () => {
    expect(formatMoney(12.5, settings)).toBe('$12.50')
    expect(formatMoney(4200, settings)).toBe('$4,200')
  })

  it('honours the chosen currency', () => {
    expect(formatMoney(10, { currency: 'EUR', locale: 'en-US' })).toBe('€10.00')
  })
})
