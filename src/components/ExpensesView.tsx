import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { CONFIDENT, suggestCategory } from '../lib/intelligence/categorize'
import type { Expense } from '../types'
import { expensesForMonth, spendByCategory, sumAmounts, categoryById } from '../lib/selectors'
import { formatMoney, parseAmount } from '../lib/money'
import { formatDay, formatMonth, todayKey, type MonthKey } from '../lib/date'
import { Card, CardHeader, EmptyState, Field, Modal, ProgressBar } from './ui'

export function ExpensesView({ month }: { month: MonthKey }) {
  const { state, dispatch } = useStore()
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  const monthExpenses = useMemo(() => expensesForMonth(state.expenses, month), [state.expenses, month])
  const visible = useMemo(
    () =>
      monthExpenses.filter((e) => {
        if (filter !== 'all' && e.categoryId !== filter) return false
        if (!query.trim()) return true
        const needle = query.trim().toLowerCase()
        const category = categoryById(state.categories, e.categoryId)
        return (e.note ?? '').toLowerCase().includes(needle) || (category?.name ?? '').toLowerCase().includes(needle)
      }),
    [monthExpenses, filter, query, state.categories],
  )

  const total = sumAmounts(visible)
  const breakdown = useMemo(
    () => spendByCategory(monthExpenses, state.categories),
    [monthExpenses, state.categories],
  )

  return (
    <div className="grid">
      <div className="grid two">
        <Card>
          <CardHeader title="This month" hint={formatMonth(month, state.settings.locale)} />
          <div className="stat-value numeric">{formatMoney(sumAmounts(monthExpenses), state.settings)}</div>
          <div className="stat-note">
            {monthExpenses.length} {monthExpenses.length === 1 ? 'transaction' : 'transactions'}
            {monthExpenses.length > 0 &&
              ` · ${formatMoney(sumAmounts(monthExpenses) / monthExpenses.length, state.settings)} average`}
          </div>
        </Card>

        <Card>
          <CardHeader title="Budgets" hint="Set monthly caps in Settings" />
          {breakdown.filter((b) => b.budget).length === 0 ? (
            <div className="faint">No category budgets set yet.</div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {breakdown
                .filter((b) => b.budget)
                .map((b) => (
                  <div key={b.category.id}>
                    <div className="legend-row" style={{ justifyContent: 'space-between' }}>
                      <span>
                        {b.category.icon} {b.category.name}
                      </span>
                      <span className="numeric faint">
                        {formatMoney(b.total, state.settings)} / {formatMoney(b.budget!, state.settings)}
                      </span>
                    </div>
                    <ProgressBar
                      value={b.budgetUsed ?? 0}
                      color={(b.budgetUsed ?? 0) > 1 ? 'var(--negative)' : b.category.color}
                    />
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Transactions"
          hint={filter === 'all' && !query ? undefined : `${visible.length} shown · ${formatMoney(total, state.settings)}`}
          action={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="field"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  padding: '7px 11px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)',
                  width: 150,
                }}
              />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                  padding: '7px 11px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)',
                }}
              >
                <option value="all">All categories</option>
                {state.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={() => setEditing('new')}>
                + Add expense
              </button>
            </div>
          }
        />

        {visible.length === 0 ? (
          <EmptyState
            emoji="🧾"
            title={monthExpenses.length === 0 ? 'No expenses logged for this month' : 'Nothing matches that filter'}
            hint={monthExpenses.length === 0 ? 'Add your first one to start seeing where the money goes.' : undefined}
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Note</th>
                <th className="right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const category = categoryById(state.categories, e.categoryId)
                return (
                  <tr key={e.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {formatDay(e.date, state.settings.locale)}
                    </td>
                    <td>
                      <span className="chip">
                        <span className="dot" style={{ background: category?.color ?? 'var(--text-faint)' }} />
                        {category?.icon} {category?.name ?? 'Uncategorised'}
                      </span>
                    </td>
                    <td className="truncate muted" style={{ maxWidth: 280 }}>
                      {e.note || '—'}
                    </td>
                    <td className="right numeric" style={{ fontWeight: 550 }}>
                      {formatMoney(e.amount, state.settings)}
                    </td>
                    <td className="actions">
                      <button className="btn ghost small" onClick={() => setEditing(e)}>
                        Edit
                      </button>
                      <button
                        className="btn danger small"
                        onClick={() => dispatch({ type: 'expense/remove', id: e.id })}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <ExpenseForm
          expense={editing === 'new' ? undefined : editing}
          month={month}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ExpenseForm({
  expense,
  month,
  onClose,
}: {
  expense?: Expense
  month: MonthKey
  onClose: () => void
}) {
  const { state, dispatch } = useStore()
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? state.categories[0]?.id ?? '')
  // New expenses default into the month you are currently looking at.
  const [date, setDate] = useState(expense?.date ?? defaultDate(month))
  const [note, setNote] = useState(expense?.note ?? '')
  const [error, setError] = useState('')
  // Once you pick a category yourself, stop second-guessing you.
  const [chosenManually, setChosenManually] = useState(false)

  const suggestion = useMemo(
    () => suggestCategory(note, state.expenses, state.categories),
    [note, state.expenses, state.categories],
  )

  // A confident guess pre-selects; anything weaker is only offered.
  useEffect(() => {
    if (chosenManually || expense) return
    if (suggestion && suggestion.confidence >= CONFIDENT) setCategoryId(suggestion.categoryId)
  }, [suggestion, chosenManually, expense])

  const suggested = suggestion ? categoryById(state.categories, suggestion.categoryId) : undefined
  const showSuggestion = suggested !== undefined && suggested.id !== categoryId

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (value <= 0) return setError('Enter an amount greater than zero.')
    if (!date) return setError('Pick a date.')

    const payload = { amount: value, categoryId, date, note: note.trim() || undefined }
    if (expense) dispatch({ type: 'expense/update', id: expense.id, patch: payload })
    else dispatch({ type: 'expense/add', expense: payload })
    onClose()
  }

  return (
    <Modal title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="form-row">
          <Field label="Amount">
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Coffee with Sam" />
        </Field>
        <Field label="Category" error={error}>
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setChosenManually(true)
            }}
          >
            {state.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>
        {showSuggestion && (
          <div className="suggestion">
            <span>Looks like</span>
            <button
              type="button"
              onClick={() => {
                setCategoryId(suggested.id)
                setChosenManually(true)
              }}
            >
              {suggested.icon} {suggested.name}
            </button>
            <span className="faint">
              {suggestion!.reason === 'history' ? 'based on your past expenses' : 'based on the wording'}
            </span>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {expense ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Today when you're viewing the current month, otherwise the 1st of the viewed month. */
function defaultDate(month: MonthKey): string {
  const today = todayKey()
  return today.startsWith(month) ? today : `${month}-01`
}
