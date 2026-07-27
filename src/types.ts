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

/**
 * How a goal should be funded.
 * - `strict`: the deadline rules. Save whatever hitting it requires.
 * - `balanced`: your spending money rules. Save what's comfortably spare and let the
 *   finish date move to suit.
 */
export type Pace = 'strict' | 'balanced'

/** How much of your spare money should go to saving rather than living. */
export type Lifestyle = 'relaxed' | 'balanced' | 'focused'

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
  /** Omitted on goals made before paces existed; those behave as 'strict'. */
  pace?: Pace
  contributions: Contribution[]
}

/**
 * A thing that repeats: rent, a subscription, a standing transfer into a goal.
 *
 * Unlike the charges the app *infers* from your history, these are declared, so they
 * are exact — and they can post themselves into the ledger as they come due.
 */
export interface RecurringRule {
  id: string
  kind: 'expense' | 'contribution'
  label: string
  amount: number
  frequency: Frequency
  /** Any one date it happens, as 'YYYY-MM-DD'; the cadence derives the rest. */
  anchor: string
  /** Required for kind 'expense'. */
  categoryId?: string
  /** Required for kind 'contribution'. */
  goalId?: string
  /** Inclusive 'YYYY-MM-DD'. Omitted means "runs indefinitely". */
  endDate?: string
  /** Paused rules keep their history but stop posting and stop appearing in plans. */
  active: boolean
  /**
   * Post entries automatically once they come due. When false the rule still shows
   * in forecasts, but nothing is written to the ledger without you saying so.
   */
  autoPost: boolean
  /** Latest date already posted, so a rule can never post the same day twice. */
  lastPostedDate?: string
  note?: string
}

export interface Settings {
  currency: string
  locale: string
  /** Drives how much of your spare money the app earmarks for goals. */
  lifestyle?: Lifestyle
}

export interface AppState {
  version: number
  settings: Settings
  categories: Category[]
  incomes: IncomeSource[]
  expenses: Expense[]
  goals: Goal[]
  recurring: RecurringRule[]
}
