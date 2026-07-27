/** Helpers for 'YYYY-MM' month keys and 'YYYY-MM-DD' day keys, all timezone-free. */

export type MonthKey = string // 'YYYY-MM'
export type DayKey = string // 'YYYY-MM-DD'

const pad = (n: number) => String(n).padStart(2, '0')

export function todayKey(): DayKey {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function currentMonth(): MonthKey {
  return todayKey().slice(0, 7)
}

export function monthOf(day: DayKey): MonthKey {
  return day.slice(0, 7)
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** Inclusive count of months from `a` to `b`; negative when b precedes a. */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return by * 12 + bm - (ay * 12 + am)
}

/** The `count` months ending at `month`, oldest first. */
export function monthRange(month: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonths(month, i - count + 1))
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Local-midnight epoch millis for a day key. */
export function dayToTime(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export function timeToDay(time: number): DayKey {
  const d = new Date(time)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(day: DayKey, delta: number): DayKey {
  return timeToDay(dayToTime(day) + delta * 86_400_000)
}

/**
 * The same day-of-month, `months` later, clamped to the target month's length —
 * so the 31st lands on the 30th (or 28th) rather than spilling into the next month.
 */
export function addMonthsToDay(day: DayKey, months: number): DayKey {
  const [y, m, d] = day.split('-').map(Number)
  const target = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d, lastDay))
  return timeToDay(target.getTime())
}

/** 0 = Sunday. */
export function weekdayOf(day: DayKey): number {
  return new Date(dayToTime(day)).getDay()
}

export function formatDayShort(day: DayKey, locale = 'en-US'): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatMonth(month: MonthKey, locale = 'en-US'): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

export function formatMonthShort(month: MonthKey, locale = 'en-US'): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short' })
}

export function formatDay(day: DayKey, locale = 'en-US'): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Whole days from today until `day`; negative when the date has passed. */
export function daysUntil(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const [ty, tm, td] = todayKey().split('-').map(Number)
  const today = new Date(ty, tm - 1, td).getTime()
  return Math.round((target - today) / 86_400_000)
}
