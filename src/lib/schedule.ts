import type { Frequency } from '../types'
import { addDays, addMonthsToDay, monthOf, monthsBetween, type DayKey, type MonthKey } from './date'

/**
 * "This happens every N, starting from here."
 *
 * One anchor date plus a cadence describes paydays, rent, a monthly transfer into a
 * savings goal — all the same arithmetic, so it lives in one place.
 */

/** Months either side of a target we're willing to step through. */
const HORIZON_MONTHS = 600

const MONTH_STRIDE: Record<Exclude<Frequency, 'weekly' | 'biweekly' | 'once'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

function isDayStepped(frequency: Frequency): frequency is 'weekly' | 'biweekly' {
  return frequency === 'weekly' || frequency === 'biweekly'
}

/** Every occurrence landing inside `month`, earliest first. */
export function occurrencesIn(anchor: DayKey, frequency: Frequency, month: MonthKey): DayKey[] {
  // A one-off happens exactly once, on its own date.
  if (frequency === 'once') return monthOf(anchor) === month ? [anchor] : []

  const distance = monthsBetween(monthOf(anchor), month)
  if (Math.abs(distance) > HORIZON_MONTHS) return []

  if (isDayStepped(frequency)) {
    const step = frequency === 'weekly' ? 7 : 14
    const dates: DayKey[] = []
    // Jump near the month, rewind behind it, then walk forward across it.
    let cursor = addDays(anchor, Math.floor((distance * 30.4) / step) * step)
    while (monthOf(cursor) >= month) cursor = addDays(cursor, -step)
    cursor = addDays(cursor, step)
    while (monthOf(cursor) === month) {
      dates.push(cursor)
      cursor = addDays(cursor, step)
    }
    return dates
  }

  const stride = MONTH_STRIDE[frequency]
  // Quarterly and yearly only land in months lining up with the anchor's.
  if (((distance % stride) + stride) % stride !== 0) return []

  const candidate = addMonthsToDay(anchor, distance)
  return monthOf(candidate) === month ? [candidate] : []
}

/** The first occurrence on or after `from`. */
export function nextOccurrence(anchor: DayKey, frequency: Frequency, from: DayKey): DayKey | undefined {
  let month = monthOf(from)
  // A yearly cadence may need a dozen months of looking; give it room.
  for (let i = 0; i <= 14; i++) {
    const hit = occurrencesIn(anchor, frequency, month).find((date) => date >= from)
    if (hit) return hit
    month = addMonthsToMonth(month, 1)
  }
  return undefined
}

/** Every occurrence in [from, to], inclusive. Bounded, so a bad anchor can't spin. */
export function occurrencesBetween(anchor: DayKey, frequency: Frequency, from: DayKey, to: DayKey): DayKey[] {
  if (to < from) return []
  const dates: DayKey[] = []
  let month = monthOf(from)
  const lastMonth = monthOf(to)

  for (let i = 0; i <= HORIZON_MONTHS && month <= lastMonth; i++) {
    for (const date of occurrencesIn(anchor, frequency, month)) {
      if (date >= from && date <= to) dates.push(date)
    }
    month = addMonthsToMonth(month, 1)
  }
  return dates
}

function addMonthsToMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
