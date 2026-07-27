import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import type { Frequency, RecurringRule } from '../types'
import { describeRule, nextDue, scheduledIn, scheduledTotal } from '../lib/recurringRules'
import { categoryById } from '../lib/selectors'
import { formatMoney, frequencyLabel, parseAmount, toMonthly } from '../lib/money'
import { daysUntil, formatDayShort, formatMonth, todayKey, type MonthKey } from '../lib/date'
import { Card, CardHeader, EmptyState, Field, Modal, Stat } from './ui'

const FREQUENCIES: Frequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']

/**
 * Declared repeating items. Unlike the charges the app infers from history, these
 * are exact, and can write themselves into the ledger as they fall due.
 */
export function RecurringView({ month }: { month: MonthKey }) {
  const { state, dispatch } = useStore()
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null)

  const rules = state.recurring
  const thisMonth = useMemo(() => scheduledIn(rules, month), [rules, month])
  const outgoing = scheduledTotal(rules, month, 'expense')
  const saving = scheduledTotal(rules, month, 'contribution')

  const monthlyCommitment = rules
    .filter((r) => r.active && r.kind === 'expense')
    .reduce((sum, r) => sum + toMonthly(r.amount, r.frequency), 0)

  return (
    <div className="grid">
      <div className="grid stats">
        <Stat
          label="Bills this month"
          value={formatMoney(outgoing, state.settings)}
          note={`${thisMonth.filter((s) => s.rule.kind === 'expense').length} due in ${formatMonth(month, state.settings.locale)}`}
        />
        <Stat
          label="Into goals this month"
          value={formatMoney(saving, state.settings)}
          note={`${thisMonth.filter((s) => s.rule.kind === 'contribution').length} transfers`}
        />
        <Stat
          label="Committed per month"
          value={formatMoney(monthlyCommitment, state.settings)}
          note="Bills normalised to a monthly figure"
        />
        <Stat
          label="Active rules"
          value={`${rules.filter((r) => r.active).length} / ${rules.length}`}
          note={`${rules.filter((r) => r.autoPost && r.active).length} post automatically`}
        />
      </div>

      <Card>
        <CardHeader
          title="Recurring items"
          hint="Bills, subscriptions and standing transfers into goals"
          action={
            <button className="btn primary" onClick={() => setEditing('new')}>
              + Add recurring
            </button>
          }
        />

        {rules.length === 0 ? (
          <EmptyState
            emoji="🔁"
            title="Nothing set up yet"
            hint="Add your rent or a subscription and it'll log itself each month, and show up in future plans."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Schedule</th>
                <th>Next due</th>
                <th className="right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const due = nextDue(rule)
                const days = due ? daysUntil(due) : undefined
                const target =
                  rule.kind === 'expense'
                    ? categoryById(state.categories, rule.categoryId ?? '')
                    : undefined
                const goal = state.goals.find((g) => g.id === rule.goalId)

                return (
                  <tr key={rule.id} style={{ opacity: rule.active ? 1 : 0.5 }}>
                    <td>
                      <div style={{ fontWeight: 550 }}>
                        {rule.label}
                        {!rule.autoPost && rule.active && <span className="chip" style={{ marginLeft: 8 }}>manual</span>}
                        {!rule.active && <span className="chip" style={{ marginLeft: 8 }}>paused</span>}
                      </div>
                      <div className="faint">
                        {rule.kind === 'expense'
                          ? `${target?.icon ?? ''} ${target?.name ?? 'Uncategorised'}`
                          : `🎯 ${goal?.name ?? 'Goal removed'}`}
                      </div>
                    </td>
                    <td className="muted">
                      {describeRule(rule, state.settings.locale)}
                      <div className="faint">{frequencyLabel(rule.frequency)}</div>
                    </td>
                    <td className="muted">
                      {due ? (
                        <>
                          {formatDayShort(due, state.settings.locale)}
                          <div className="faint">
                            {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="right numeric" style={{ fontWeight: 550 }}>
                      {formatMoney(rule.amount, state.settings)}
                    </td>
                    <td className="actions">
                      <button
                        className="btn ghost small"
                        onClick={() => dispatch({ type: 'recurring/update', id: rule.id, patch: { active: !rule.active } })}
                      >
                        {rule.active ? 'Pause' : 'Resume'}
                      </button>
                      <button className="btn ghost small" onClick={() => setEditing(rule)}>
                        Edit
                      </button>
                      <button
                        className="btn danger small"
                        onClick={() => {
                          if (confirm(`Delete "${rule.label}"? Entries it already posted stay in your ledger.`))
                            dispatch({ type: 'recurring/remove', id: rule.id })
                        }}
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

      {thisMonth.length > 0 && (
        <Card>
          <CardHeader title={`Due in ${formatMonth(month, state.settings.locale)}`} />
          {thisMonth.map((item) => (
            <div className="list-row" key={`${item.rule.id}-${item.date}`}>
              <span
                className="dot"
                style={{
                  background:
                    item.rule.kind === 'contribution'
                      ? 'var(--positive)'
                      : categoryById(state.categories, item.rule.categoryId ?? '')?.color,
                }}
              />
              <span className="grow truncate">
                {item.rule.label}
                <div className="faint">
                  {formatDayShort(item.date, state.settings.locale)}
                  {item.date <= todayKey() && item.rule.autoPost ? ' · posted' : ''}
                </div>
              </span>
              <span className="numeric" style={{ fontWeight: 550 }}>
                {formatMoney(item.rule.amount, state.settings)}
              </span>
            </div>
          ))}
        </Card>
      )}

      {editing && <RuleForm rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function RuleForm({ rule, onClose }: { rule?: RecurringRule; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [kind, setKind] = useState<RecurringRule['kind']>(rule?.kind ?? 'expense')
  const [label, setLabel] = useState(rule?.label ?? '')
  const [amount, setAmount] = useState(rule ? String(rule.amount) : '')
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly')
  const [anchor, setAnchor] = useState(rule?.anchor ?? todayKey())
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? state.categories[0]?.id ?? '')
  const [goalId, setGoalId] = useState(rule?.goalId ?? state.goals[0]?.id ?? '')
  const [endDate, setEndDate] = useState(rule?.endDate ?? '')
  const [autoPost, setAutoPost] = useState(rule?.autoPost ?? true)
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (!label.trim()) return setError('Give it a name.')
    if (value <= 0) return setError('Enter an amount greater than zero.')
    if (!anchor) return setError('Pick the date it happens.')
    if (kind === 'contribution' && !goalId) return setError('Create a goal first, or make this an expense.')
    if (endDate && endDate < anchor) return setError('The end date comes before the start date.')

    const payload = {
      kind,
      label: label.trim(),
      amount: value,
      frequency,
      anchor,
      categoryId: kind === 'expense' ? categoryId : undefined,
      goalId: kind === 'contribution' ? goalId : undefined,
      endDate: endDate || undefined,
      active: rule?.active ?? true,
      autoPost,
      // Editing an existing rule keeps its watermark, so it never re-posts history.
      lastPostedDate: rule?.lastPostedDate,
    }

    if (rule) dispatch({ type: 'recurring/update', id: rule.id, patch: payload })
    else dispatch({ type: 'recurring/add', rule: payload })
    onClose()
  }

  const preview = anchor ? describeRule({ ...(rule ?? {}), frequency, anchor } as RecurringRule) : ''

  return (
    <Modal title={rule ? 'Edit recurring item' : 'New recurring item'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as RecurringRule['kind'])}>
            <option value="expense">Bill or expense</option>
            <option value="contribution">Transfer into a goal</option>
          </select>
        </Field>

        <Field label="Name">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'expense' ? 'Rent' : 'Payday transfer'}
            autoFocus
          />
        </Field>

        <div className="form-row">
          <Field label="Amount">
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="How often">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {frequencyLabel(f)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {kind === 'expense' ? (
          <Field label="Category">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {state.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Goal">
            <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              {state.goals.length === 0 && <option value="">No goals yet</option>}
              {state.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="form-row">
          <Field label="Starting from">
            <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
          </Field>
          <Field label="Until (optional)">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={anchor || undefined} />
          </Field>
        </div>
        {preview && <div className="faint">Repeats: {preview}</div>}

        <label className="suggestion" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} style={{ width: 'auto' }} />
          <span style={{ color: 'var(--text)' }}>Log it automatically when it falls due</span>
        </label>
        <div className="faint">
          {autoPost
            ? 'Entries appear in your ledger as each date passes — including any missed since the start date.'
            : "Nothing is written to your ledger; it only shows in forecasts and future plans."}
        </div>
        {error && <div className="error" style={{ color: 'var(--negative)', fontSize: 12 }}>{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {rule ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
