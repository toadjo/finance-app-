import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addMonths, currentMonth, daysInMonth, daysUntil, monthRange, monthsBetween, todayKey } from './date'
import { TODAY } from '../test/fixtures'

describe('month arithmetic', () => {
  it('adds months across year boundaries in both directions', () => {
    expect(addMonths('2026-07', 1)).toBe('2026-08')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-03', -14)).toBe('2025-01')
  })

  it('keeps zero-padding on single-digit months', () => {
    expect(addMonths('2026-12', 2)).toBe('2027-02')
    expect(addMonths('2026-11', 10)).toBe('2027-09')
  })

  it('measures the distance between two months', () => {
    expect(monthsBetween('2026-01', '2026-07')).toBe(6)
    expect(monthsBetween('2026-07', '2026-01')).toBe(-6)
    expect(monthsBetween('2025-11', '2026-02')).toBe(3)
    expect(monthsBetween('2026-05', '2026-05')).toBe(0)
  })

  it('builds an inclusive range ending at the given month', () => {
    expect(monthRange('2026-03', 4)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03'])
  })

  it('knows month lengths, leap years included', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-07')).toBe(31)
    expect(daysInMonth('2026-04')).toBe(30)
  })
})

describe('clock-relative helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('reports today without drifting across timezones', () => {
    expect(todayKey()).toBe('2026-07-15')
    expect(currentMonth()).toBe('2026-07')
  })

  it('counts whole days to a date, signed', () => {
    expect(daysUntil('2026-07-15')).toBe(0)
    expect(daysUntil('2026-07-16')).toBe(1)
    expect(daysUntil('2026-08-01')).toBe(17)
    expect(daysUntil('2026-07-01')).toBe(-14)
  })
})
