import type { AppState } from '../types'
import { DEFAULT_STATE } from '../lib/storage'

/**
 * A six-month ledger with known shape, used across the maths tests.
 *
 * Tests pin the clock to TODAY so anything derived from "now" (goal pacing, safe-to-spend,
 * next-due dates) stays deterministic.
 */
export const TODAY = new Date(2026, 6, 15, 9, 0, 0) // 15 July 2026
export const THIS_MONTH = '2026-07'
export const MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']

let counter = 0
const id = () => `fixture-${counter++}`

function expense(date: string, amount: number, categoryId: string, note?: string) {
  return { id: id(), date, amount, categoryId, note }
}

export function makeLedger(): AppState {
  counter = 0
  const expenses = []

  // Rent: same amount, 1st of every month — textbook recurring.
  for (const month of MONTHS) expenses.push(expense(`${month}-01`, 1450, 'housing', 'Rent'))

  // Streaming: 20th of the month, and the price rose in June.
  // July's hasn't landed yet, so it should show up as upcoming.
  for (const month of MONTHS.slice(0, 5)) {
    expenses.push(expense(`${month}-20`, month === '2026-06' ? 15.99 : 12.99, 'subscriptions', 'Netflix'))
  }

  // Groceries: regular-ish but under different shop names, so they never group
  // into a single recurring charge.
  const shops = ['Aldi', 'Tesco', 'Corner shop']
  for (const month of MONTHS) {
    shops.forEach((shop, i) => {
      expenses.push(expense(`${month}-${String(5 + i * 9).padStart(2, '0')}`, 60 + i * 12, 'groceries', `${shop} shop`))
    })
  }

  // Coffee: same note, but genuinely irregular spacing — must NOT be called recurring.
  for (const [i, day] of [3, 6, 14, 27].entries()) {
    expenses.push(expense(`2026-02-${String(day).padStart(2, '0')}`, 4 + i, 'dining', 'Kafeneio'))
  }
  for (const [i, day] of [2, 11, 19, 28].entries()) {
    expenses.push(expense(`2026-03-${String(day).padStart(2, '0')}`, 4 + i, 'dining', 'Kafeneio'))
  }
  for (const [i, day] of [7, 12, 23].entries()) {
    expenses.push(expense(`2026-04-${String(day).padStart(2, '0')}`, 5 + i, 'dining', 'Kafeneio'))
  }

  return {
    ...DEFAULT_STATE,
    incomes: [{ id: id(), label: 'Salary', amount: 4000, frequency: 'monthly' }],
    expenses,
    goals: [
      {
        id: 'goal-emergency',
        name: 'Emergency fund',
        target: 6000,
        deadline: '2026-12-31',
        createdAt: new Date(2026, 1, 1).toISOString(),
        contributions: [
          { id: id(), amount: 500, date: '2026-03-05' },
          { id: id(), amount: 500, date: '2026-04-05' },
          { id: id(), amount: 500, date: '2026-05-05' },
        ],
      },
      {
        id: 'goal-laptop',
        name: 'Laptop',
        target: 1800,
        createdAt: new Date(2026, 1, 1).toISOString(),
        contributions: [{ id: id(), amount: 1800, date: '2026-04-20' }],
      },
    ],
  }
}

/** Plain formatter so test expectations read as numbers, not locale strings. */
export const fmt = (n: number) => n.toFixed(2)
