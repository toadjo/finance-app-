import type { AppState } from '../types'
import { DEFAULT_STATE } from './storage'
import { addMonths, currentMonth, daysInMonth, todayKey } from './date'
import { uid } from './id'

/** Deterministic pseudo-random so the demo looks the same on every load. */
function makeRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

const PATTERN: { categoryId: string; note: string; min: number; max: number; perMonth: number }[] = [
  { categoryId: 'housing', note: 'Rent', min: 1450, max: 1450, perMonth: 1 },
  { categoryId: 'groceries', note: 'Supermarket', min: 42, max: 130, perMonth: 5 },
  { categoryId: 'transport', note: 'Transit pass', min: 18, max: 62, perMonth: 3 },
  { categoryId: 'dining', note: 'Dinner out', min: 16, max: 74, perMonth: 4 },
  { categoryId: 'utilities', note: 'Electricity & internet', min: 85, max: 145, perMonth: 2 },
  { categoryId: 'health', note: 'Pharmacy', min: 12, max: 90, perMonth: 1 },
  { categoryId: 'fun', note: 'Cinema & books', min: 11, max: 55, perMonth: 2 },
  { categoryId: 'subscriptions', note: 'Streaming', min: 9, max: 17, perMonth: 2 },
]

/** A furnished six-month ledger so the app is explorable before you type anything. */
export function sampleState(): AppState {
  const random = makeRandom(20260727)
  const month = currentMonth()
  const state: AppState = {
    ...DEFAULT_STATE,
    categories: DEFAULT_STATE.categories.map((c) =>
      c.id === 'groceries' ? { ...c, budget: 450 } : c.id === 'dining' ? { ...c, budget: 200 } : c,
    ),
    incomes: [
      { id: uid(), label: 'Day job', amount: 3800, frequency: 'monthly', note: 'After tax' },
      { id: uid(), label: 'Freelance design', amount: 550, frequency: 'monthly', note: 'Varies month to month' },
      { id: uid(), label: 'Dividends', amount: 900, frequency: 'yearly' },
    ],
    expenses: [],
    goals: [],
  }

  for (let back = 5; back >= 0; back--) {
    const m = addMonths(month, -back)
    const lastDay = back === 0 ? Number(todayKey().slice(8)) : daysInMonth(m)
    for (const p of PATTERN) {
      for (let i = 0; i < p.perMonth; i++) {
        const day = Math.min(lastDay, 1 + Math.floor(random() * lastDay))
        if (day < 1) continue
        state.expenses.push({
          id: uid(),
          date: `${m}-${String(day).padStart(2, '0')}`,
          amount: Math.round((p.min + random() * (p.max - p.min)) * 100) / 100,
          categoryId: p.categoryId,
          note: p.note,
        })
      }
    }
  }

  const created = new Date()
  created.setMonth(created.getMonth() - 5)

  state.goals = [
    {
      id: uid(),
      name: 'Emergency fund',
      target: 9000,
      deadline: `${addMonths(month, 7)}-01`,
      createdAt: created.toISOString(),
      note: '3 months of expenses',
      contributions: [0, 1, 2, 3, 4].map((i) => ({
        id: uid(),
        amount: 600,
        date: `${addMonths(month, i - 5)}-05`,
        note: 'Payday transfer',
      })),
    },
    {
      id: uid(),
      name: 'Trip to Japan',
      target: 3200,
      deadline: `${addMonths(month, 10)}-15`,
      createdAt: created.toISOString(),
      contributions: [
        { id: uid(), amount: 250, date: `${addMonths(month, -3)}-12` },
        { id: uid(), amount: 250, date: `${addMonths(month, -1)}-12` },
      ],
    },
    {
      id: uid(),
      name: 'New laptop',
      target: 1800,
      createdAt: created.toISOString(),
      contributions: [{ id: uid(), amount: 1800, date: `${addMonths(month, -2)}-20`, note: 'Bonus' }],
    },
  ]

  return state
}
