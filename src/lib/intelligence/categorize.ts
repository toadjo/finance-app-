import type { Category, Expense } from '../../types'

/**
 * Guesses the category for an expense from its note.
 *
 * Two signals, blended: a naive-Bayes model trained on the notes you have already
 * categorised yourself, and a seed keyword table that carries the guess while your
 * history is still too thin to learn from. Entirely local and deterministic — no
 * model files, no network, nothing to download.
 */

export interface Suggestion {
  categoryId: string
  /** 0–1. Above CONFIDENT the UI pre-selects it; below, it merely offers it. */
  confidence: number
  reason: 'history' | 'keyword'
}

export const CONFIDENT = 0.62

/** Seed rules, keyed by the default category ids in storage.ts. */
const KEYWORDS: Record<string, string[]> = {
  housing: ['rent', 'mortgage', 'landlord', 'lease', 'housing', 'deposit', 'council tax'],
  groceries: ['grocery', 'groceries', 'supermarket', 'market', 'aldi', 'lidl', 'tesco', 'sainsbury', 'kroger', 'safeway', 'whole foods', 'trader joe', 'food shop'],
  transport: ['uber', 'lyft', 'taxi', 'bus', 'train', 'metro', 'transit', 'subway pass', 'fuel', 'petrol', 'gas station', 'parking', 'fare', 'flight', 'railcard'],
  dining: ['restaurant', 'dinner', 'lunch', 'breakfast', 'brunch', 'cafe', 'coffee', 'starbucks', 'pizza', 'sushi', 'takeaway', 'takeout', 'deliveroo', 'doordash', 'ubereats', 'bar', 'pub', 'beer'],
  utilities: ['electric', 'electricity', 'water', 'gas bill', 'internet', 'broadband', 'wifi', 'phone bill', 'mobile', 'heating', 'utility'],
  health: ['pharmacy', 'doctor', 'dentist', 'clinic', 'hospital', 'medicine', 'prescription', 'therapy', 'optician', 'insurance', 'gym'],
  fun: ['cinema', 'movie', 'concert', 'game', 'book', 'museum', 'theatre', 'hobby', 'ticket', 'festival'],
  subscriptions: ['netflix', 'spotify', 'subscription', 'prime', 'disney', 'hulu', 'icloud', 'dropbox', 'patreon', 'youtube', 'membership'],
}

const STOPWORDS = new Set(['the', 'a', 'an', 'for', 'and', 'to', 'of', 'at', 'in', 'on', 'my', 'with', 'from', 'this', 'that'])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
}

/** Keyword hits, scored by how much of the phrase matched. */
function keywordScores(note: string): Map<string, number> {
  const haystack = note.toLowerCase()
  const tokens = new Set(tokenize(note))
  const scores = new Map<string, number>()

  for (const [categoryId, words] of Object.entries(KEYWORDS)) {
    let best = 0
    for (const word of words) {
      // Multi-word rules ("whole foods") match on the raw string; single words on tokens,
      // so "bargas" can't match "gas".
      const hit = word.includes(' ') ? haystack.includes(word) : tokens.has(word)
      if (hit) best = Math.max(best, word.includes(' ') ? 1 : 0.9)
    }
    if (best > 0) scores.set(categoryId, best)
  }
  return scores
}

interface Model {
  /** token -> categoryId -> count */
  counts: Map<string, Map<string, number>>
  /** categoryId -> number of expenses */
  docs: Map<string, number>
  vocabulary: Set<string>
  total: number
}

/** Trains on every past expense that carries a note. Cheap enough to redo on each render. */
export function train(expenses: Expense[]): Model {
  const counts = new Map<string, Map<string, number>>()
  const docs = new Map<string, number>()
  const vocabulary = new Set<string>()
  let total = 0

  for (const expense of expenses) {
    if (!expense.note) continue
    const tokens = tokenize(expense.note)
    if (tokens.length === 0) continue

    docs.set(expense.categoryId, (docs.get(expense.categoryId) ?? 0) + 1)
    total++

    for (const token of tokens) {
      vocabulary.add(token)
      const perCategory = counts.get(token) ?? new Map<string, number>()
      perCategory.set(expense.categoryId, (perCategory.get(expense.categoryId) ?? 0) + 1)
      counts.set(token, perCategory)
    }
  }

  return { counts, docs, vocabulary, total }
}

/** Multinomial naive Bayes with Laplace smoothing, in log space. */
function historyScores(model: Model, tokens: string[], categories: Category[]): Map<string, number> {
  const scores = new Map<string, number>()
  if (model.total === 0 || tokens.length === 0) return scores

  const vocabSize = Math.max(1, model.vocabulary.size)

  for (const category of categories) {
    const docCount = model.docs.get(category.id) ?? 0
    // Unseen categories stay reachable, just unlikely.
    let logProb = Math.log((docCount + 0.5) / (model.total + 0.5 * categories.length))
    let categoryTokens = 0
    for (const perCategory of model.counts.values()) categoryTokens += perCategory.get(category.id) ?? 0

    for (const token of tokens) {
      const occurrences = model.counts.get(token)?.get(category.id) ?? 0
      logProb += Math.log((occurrences + 1) / (categoryTokens + vocabSize))
    }
    scores.set(category.id, logProb)
  }

  return softmax(scores)
}

function softmax(logScores: Map<string, number>): Map<string, number> {
  const values = [...logScores.values()]
  if (values.length === 0) return logScores
  const max = Math.max(...values)
  let sum = 0
  const exponentiated = new Map<string, number>()
  for (const [key, value] of logScores) {
    const e = Math.exp(value - max)
    exponentiated.set(key, e)
    sum += e
  }
  for (const [key, value] of exponentiated) exponentiated.set(key, value / sum)
  return exponentiated
}

/**
 * Ranked category suggestions for a note, best first.
 *
 * History dominates once there's enough of it; below ~20 categorised notes the keyword
 * table is weighted more heavily, so the feature is useful on day one.
 */
export function suggestCategories(
  note: string,
  expenses: Expense[],
  categories: Category[],
  limit = 3,
): Suggestion[] {
  const trimmed = note.trim()
  if (trimmed.length < 2) return []

  const tokens = tokenize(trimmed)
  const model = train(expenses)
  const history = historyScores(model, tokens, categories)
  const keywords = keywordScores(trimmed)

  // 0 history -> keywords only; 20+ -> history mostly.
  const historyWeight = Math.min(1, model.total / 20) * 0.75
  const keywordWeight = 1 - historyWeight

  const known = new Set(categories.map((c) => c.id))
  const combined = new Map<string, number>()

  for (const category of categories) {
    const fromHistory = history.get(category.id) ?? 0
    const fromKeyword = keywords.get(category.id) ?? 0
    const score = fromHistory * historyWeight + fromKeyword * keywordWeight
    if (score > 0) combined.set(category.id, score)
  }

  const ranked = [...combined.entries()]
    .filter(([id]) => known.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  const total = ranked.reduce((sum, [, score]) => sum + score, 0)
  if (total === 0) return []

  return ranked.map(([categoryId, score]) => ({
    categoryId,
    confidence: score / total,
    reason: (keywords.get(categoryId) ?? 0) > 0 && historyWeight < 0.4 ? 'keyword' : 'history',
  }))
}

/** The single best guess, or undefined when nothing scores. */
export function suggestCategory(note: string, expenses: Expense[], categories: Category[]): Suggestion | undefined {
  return suggestCategories(note, expenses, categories, 1)[0]
}
