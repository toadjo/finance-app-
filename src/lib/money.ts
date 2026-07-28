import type { Frequency, Settings } from '../types'

/** How many times a `frequency` period occurs in an average month. */
const PER_MONTH: Record<Frequency, number> = {
  // A one-off is active only in its own month, so there it counts in full.
  once: 1,
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
}

export function toMonthly(amount: number, frequency: Frequency): number {
  return amount * PER_MONTH[frequency]
}

export function frequencyLabel(frequency: Frequency): string {
  return {
    once: 'one-off',
    weekly: 'per week',
    biweekly: 'every 2 weeks',
    monthly: 'per month',
    quarterly: 'per quarter',
    yearly: 'per year',
  }[frequency]
}

export function formatMoney(amount: number, settings: Settings, opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? Math.abs(amount) < 1000
  return new Intl.NumberFormat(settings.locale, {
    style: 'currency',
    currency: settings.currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(amount)
}

/** Compact form for chart axes and tight tiles: $1.2k, $18k. */
export function formatCompact(amount: number, settings: Settings): string {
  return new Intl.NumberFormat(settings.locale, {
    style: 'currency',
    currency: settings.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)
}

export function formatPercent(ratio: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio)
}

/** Parses user input leniently: strips currency symbols, spaces and thousands separators. */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}
