export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

/** A recurring (or one-off) source of money coming in. */
export interface IncomeSource {
  id: string
  label: string
  /** Gross amount per `frequency` period. */
  amount: number
  frequency: Frequency
  /** Inclusive 'YYYY-MM'. Omitted means "has always been active". */
  startMonth?: string
  /** Inclusive 'YYYY-MM'. Omitted means "still active". */
  endMonth?: string
  /**
   * Any one date this source paid out, as 'YYYY-MM-DD'. Combined with `frequency`
   * it yields every past and future payday, so weekly, monthly and yearly sources
   * all need just this one field. Omitted means "payday unknown".
   */
  payAnchor?: string
  note?: string
}

/** A single dated spend. */
export interface Expense {
  id: string
  /** 'YYYY-MM-DD' */
  date: string
  amount: number
  categoryId: string
  note?: string
}

export interface Category {
  id: string
  name: string
  color: string
  icon: string
  /** Optional monthly spending cap, in currency units. */
  budget?: number
}

export interface Contribution {
  id: string
  amount: number
  /** 'YYYY-MM-DD' */
  date: string
  note?: string
}

/** A savings target, funded by contributions. */
export interface Goal {
  id: string
  name: string
  target: number
  /** 'YYYY-MM-DD' */
  deadline?: string
  createdAt: string
  note?: string
  contributions: Contribution[]
}

export interface Settings {
  currency: string
  locale: string
}

export interface AppState {
  version: number
  settings: Settings
  categories: Category[]
  incomes: IncomeSource[]
  expenses: Expense[]
  goals: Goal[]
}
