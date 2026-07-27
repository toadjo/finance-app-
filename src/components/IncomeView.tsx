import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import type { Frequency, IncomeSource } from '../types'
import { incomeBreakdown, monthlyIncome } from '../lib/selectors'
import { formatMoney, frequencyLabel, parseAmount, toMonthly } from '../lib/money'
import { addMonths, currentMonth, formatDayShort, formatMonth, todayKey, type MonthKey } from '../lib/date'
import { describePayday, nextPayday, payDatesIn, paydaysIn } from '../lib/payday'
import { Card, CardHeader, EmptyState, Field, Modal, ProgressBar } from './ui'

const FREQUENCIES: Frequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']

export function IncomeView({ month }: { month: MonthKey }) {
  const { state, dispatch } = useStore()
  const [editing, setEditing] = useState<IncomeSource | 'new' | null>(null)

  const rows = useMemo(() => incomeBreakdown(state.incomes, month), [state.incomes, month])
  const total = monthlyIncome(state.incomes, month)
  const inactive = state.incomes.filter((i) => !rows.some((r) => r.income.id === i.id))
  const paydays = useMemo(() => paydaysIn(state.incomes, month), [state.incomes, month])
  const next = useMemo(() => nextPayday(state.incomes), [state.incomes])

  return (
    <div className="grid">
      <div className="grid two">
        <Card>
          <CardHeader title="Monthly take" hint={formatMonth(month, state.settings.locale)} />
          <div className="stat-value numeric">{formatMoney(total, state.settings)}</div>
          <div className="stat-note">
            {formatMoney(total * 12, state.settings, { decimals: false })} a year across {rows.length}{' '}
            {rows.length === 1 ? 'source' : 'sources'}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Paydays"
            hint={
              next
                ? `Next: ${formatDayShort(next.date, state.settings.locale)} · ${formatMoney(next.total, state.settings)}`
                : 'Set a payday on a source to see the schedule'
            }
          />
          {paydays.length === 0 ? (
            <div className="faint">
              No paydays land in {formatMonth(month, state.settings.locale)}. Add one when editing a source.
            </div>
          ) : (
            <div>
              {paydays.map((payday) => (
                <div className="list-row" key={`${payday.income.id}-${payday.date}`}>
                  <span className="dot" style={{ background: payday.date >= todayKey() ? 'var(--positive)' : 'var(--border-strong)' }} />
                  <span className="grow truncate">
                    {payday.income.label}
                    <div className="faint">{formatDayShort(payday.date, state.settings.locale)}</div>
                  </span>
                  <span className="numeric" style={{ fontWeight: 550 }}>
                    {formatMoney(payday.amount, state.settings)}
                  </span>
                </div>
              ))}
              <div className="list-row" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="grow muted">Arriving in {formatMonth(month, state.settings.locale)}</span>
                <span className="numeric" style={{ fontWeight: 600 }}>
                  {formatMoney(paydays.reduce((sum, p) => sum + p.amount, 0), state.settings)}
                </span>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Where it comes from" />
          {rows.length === 0 ? (
            <div className="faint">Add a source to see the split.</div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {rows.map(({ income, monthly }) => (
                <div key={income.id}>
                  <div className="legend-row" style={{ justifyContent: 'space-between' }}>
                    <span className="truncate">{income.label}</span>
                    <span className="numeric faint">
                      {total > 0 ? Math.round((monthly / total) * 100) : 0}%
                    </span>
                  </div>
                  <ProgressBar value={total > 0 ? monthly / total : 0} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Income sources"
          hint="Amounts are normalised to a monthly figure"
          action={
            <button className="btn primary" onClick={() => setEditing('new')}>
              + Add income
            </button>
          }
        />

        {state.incomes.length === 0 ? (
          <EmptyState
            emoji="💰"
            title="No income sources yet"
            hint="Add your salary, freelance work or anything else that pays."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Amount</th>
                <th>Payday</th>
                <th className="right">Per month</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...rows.map((r) => r.income), ...inactive].map((income) => {
                const active = rows.some((r) => r.income.id === income.id)
                return (
                  <tr key={income.id} style={{ opacity: active ? 1 : 0.55 }}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{income.label}</div>
                      {income.note && <div className="faint truncate">{income.note}</div>}
                    </td>
                    <td className="muted numeric">
                      {formatMoney(income.amount, state.settings)}{' '}
                      <span className="faint">{frequencyLabel(income.frequency)}</span>
                    </td>
                    <td className="muted">
                      <div>{describePayday(income, state.settings.locale)}</div>
                      <div className="faint">{activeRange(income)}</div>
                    </td>
                    <td className="right numeric" style={{ fontWeight: 550 }}>
                      {active ? formatMoney(toMonthly(income.amount, income.frequency), state.settings) : '—'}
                    </td>
                    <td className="actions">
                      <button className="btn ghost small" onClick={() => setEditing(income)}>
                        Edit
                      </button>
                      <button
                        className="btn danger small"
                        onClick={() => dispatch({ type: 'income/remove', id: income.id })}
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

      {editing && <IncomeForm income={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function activeRange(income: IncomeSource): string {
  if (!income.startMonth && !income.endMonth) return 'Always'
  if (income.startMonth && income.endMonth) return `${income.startMonth} → ${income.endMonth}`
  if (income.startMonth) return `From ${income.startMonth}`
  return `Until ${income.endMonth}`
}

function IncomeForm({ income, onClose }: { income?: IncomeSource; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const { settings } = state
  const [label, setLabel] = useState(income?.label ?? '')
  const [amount, setAmount] = useState(income ? String(income.amount) : '')
  const [frequency, setFrequency] = useState<Frequency>(income?.frequency ?? 'monthly')
  const [startMonth, setStartMonth] = useState(income?.startMonth ?? '')
  const [endMonth, setEndMonth] = useState(income?.endMonth ?? '')
  const [payAnchor, setPayAnchor] = useState(income?.payAnchor ?? '')
  const [note, setNote] = useState(income?.note ?? '')
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (!label.trim()) return setError('Give this source a name.')
    if (value <= 0) return setError('Enter an amount greater than zero.')
    if (startMonth && endMonth && endMonth < startMonth) return setError('The end month comes before the start month.')

    const payload = {
      label: label.trim(),
      amount: value,
      frequency,
      startMonth: startMonth || undefined,
      endMonth: endMonth || undefined,
      payAnchor: payAnchor || undefined,
      note: note.trim() || undefined,
    }
    if (income) dispatch({ type: 'income/update', id: income.id, patch: payload })
    else dispatch({ type: 'income/add', income: payload })
    onClose()
  }

  const monthly = toMonthly(parseAmount(amount), frequency)

  // Show the next few paydays as you pick, so a wrong anchor is obvious immediately.
  const upcomingPreview = useMemo(() => {
    if (!payAnchor) return []
    const draft = { id: 'preview', label: 'preview', amount: 1, frequency, payAnchor } as IncomeSource
    const dates: string[] = []
    let month = currentMonth()
    for (let i = 0; i < 14 && dates.length < 3; i++) {
      for (const date of payDatesIn(draft, month)) {
        if (date >= todayKey() && dates.length < 3) dates.push(formatDayShort(date, settings.locale))
      }
      month = addMonths(month, 1)
    }
    return dates
  }, [payAnchor, frequency, settings.locale])

  return (
    <Modal title={income ? 'Edit income source' : 'Add income source'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Name">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Day job" autoFocus />
        </Field>
        <div className="form-row">
          <Field label="Amount">
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Frequency">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {frequencyLabel(f)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {monthly > 0 && frequency !== 'monthly' && (
          <div className="faint numeric">That works out to about {monthly.toFixed(2)} per month.</div>
        )}

        <Field label="Payday">
          <input type="date" value={payAnchor} onChange={(e) => setPayAnchor(e.target.value)} />
        </Field>
        <div className="faint">
          {payAnchor ? (
            <>
              <strong>{describePayday({ ...(income ?? {}), frequency, payAnchor } as IncomeSource)}</strong>
              {upcomingPreview.length > 0 && <> — next: {upcomingPreview.join(', ')}</>}
            </>
          ) : (
            'Pick any date you were paid (past or future) and the frequency fills in the rest. Optional, but it powers payday countdowns and planning.'
          )}
        </div>
        <div className="form-row">
          <Field label="Starts (optional)">
            <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} max={endMonth || undefined} />
          </Field>
          <Field label="Ends (optional)">
            <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} min={startMonth || undefined} />
          </Field>
        </div>
        <Field label="Note (optional)" error={error}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="After tax" />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {income ? 'Save changes' : 'Add source'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
