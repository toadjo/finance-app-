import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import type { Goal } from '../types'
import { goalProgress, requiredMonthlySavings, summariseMonth, type GoalProgress, type GoalStatus } from '../lib/selectors'
import { formatMoney, formatPercent, parseAmount } from '../lib/money'
import { formatDay, todayKey, type MonthKey } from '../lib/date'
import { Card, CardHeader, EmptyState, Field, Modal, ProgressBar, Stat } from './ui'

const STATUS_LABEL: Record<GoalStatus, string> = {
  complete: 'Reached 🎉',
  'on-track': 'On track',
  behind: 'Behind pace',
  overdue: 'Past deadline',
  open: 'No deadline',
}

export function GoalsView({ month }: { month: MonthKey }) {
  const { state, dispatch } = useStore()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [contributing, setContributing] = useState<Goal | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const progress = useMemo(() => state.goals.map(goalProgress), [state.goals])
  const summary = useMemo(() => summariseMonth(state, month), [state, month])
  const needed = requiredMonthlySavings(state.goals)
  const totalTarget = state.goals.reduce((s, g) => s + g.target, 0)
  const totalSaved = progress.reduce((s, p) => s + p.saved, 0)

  return (
    <div className="grid">
      <div className="grid stats">
        <Stat
          label="Saved so far"
          value={formatMoney(totalSaved, state.settings)}
          note={totalTarget > 0 ? `${formatPercent(totalSaved / totalTarget, state.settings.locale)} of ${formatMoney(totalTarget, state.settings, { decimals: false })}` : 'Across all goals'}
        />
        <Stat
          label="Needed per month"
          value={formatMoney(needed, state.settings)}
          note="To hit every dated goal on time"
        />
        <Stat
          label="Left over this month"
          value={formatMoney(summary.net, state.settings)}
          tone={summary.net >= needed ? 'positive' : summary.net < 0 ? 'negative' : 'neutral'}
          note={
            needed === 0
              ? 'Income minus spending'
              : summary.net >= needed
                ? `Covers your goals with ${formatMoney(summary.net - needed, state.settings)} spare`
                : `${formatMoney(needed - summary.net, state.settings)} short of your goal pace`
          }
        />
        <Stat
          label="Goals reached"
          value={`${progress.filter((p) => p.status === 'complete').length} / ${state.goals.length}`}
          note={`${progress.filter((p) => p.status === 'behind' || p.status === 'overdue').length} need attention`}
        />
      </div>

      <Card>
        <CardHeader
          title="Your goals"
          hint="Fund a goal by logging a contribution"
          action={
            <button className="btn primary" onClick={() => setEditing('new')}>
              + New goal
            </button>
          }
        />

        {state.goals.length === 0 ? (
          <EmptyState
            emoji="🎯"
            title="No goals yet"
            hint="Emergency fund, a trip, a new laptop — name it and track it."
          />
        ) : (
          <div className="stack" style={{ gap: 18 }}>
            {progress.map((p) => (
              <GoalCard
                key={p.goal.id}
                progress={p}
                open={expanded === p.goal.id}
                onToggle={() => setExpanded(expanded === p.goal.id ? null : p.goal.id)}
                onEdit={() => setEditing(p.goal)}
                onContribute={() => setContributing(p.goal)}
                onDelete={() => dispatch({ type: 'goal/remove', id: p.goal.id })}
              />
            ))}
          </div>
        )}
      </Card>

      {editing && <GoalForm goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {contributing && <ContributionForm goal={contributing} month={month} onClose={() => setContributing(null)} />}
    </div>
  )
}

function GoalCard({
  progress: p,
  open,
  onToggle,
  onEdit,
  onContribute,
  onDelete,
}: {
  progress: GoalProgress
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onContribute: () => void
  onDelete: () => void
}) {
  const { state, dispatch } = useStore()
  const { goal } = p
  const color = p.status === 'complete' ? 'var(--accent)' : p.status === 'behind' || p.status === 'overdue' ? 'var(--warning)' : 'var(--positive)'

  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15.5 }}>{goal.name}</div>
          <div className="faint">
            {goal.deadline ? `Due ${formatDay(goal.deadline, state.settings.locale)}` : 'No deadline'}
            {p.monthsLeft !== undefined && p.status !== 'complete' && p.status !== 'overdue'
              ? ` · ${p.monthsLeft} ${p.monthsLeft === 1 ? 'month' : 'months'} left`
              : ''}
            {goal.note ? ` · ${goal.note}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`chip ${p.status}`}>{STATUS_LABEL[p.status]}</span>
          <button className="btn small" onClick={onContribute}>
            Add money
          </button>
          <button className="btn ghost small" onClick={onEdit}>
            Edit
          </button>
          <button className="btn danger small" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div style={{ margin: '12px 0 8px' }}>
        <ProgressBar value={p.progress} color={color} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }} className="faint">
        <span className="numeric">
          <strong style={{ color: 'var(--text)' }}>{formatMoney(p.saved, state.settings)}</strong> of{' '}
          {formatMoney(goal.target, state.settings)} · {formatPercent(p.progress, state.settings.locale)}
        </span>
        <span className="numeric">
          {p.status === 'complete'
            ? 'Fully funded'
            : p.requiredPerMonth !== undefined
              ? `${formatMoney(p.requiredPerMonth, state.settings)}/month to finish on time`
              : `${formatMoney(p.remaining, state.settings)} to go`}
        </span>
      </div>

      {goal.contributions.length > 0 && (
        <button className="btn ghost small" style={{ marginTop: 8, paddingLeft: 0 }} onClick={onToggle}>
          {open ? '▾' : '▸'} {goal.contributions.length}{' '}
          {goal.contributions.length === 1 ? 'contribution' : 'contributions'}
        </button>
      )}

      {open && (
        <div style={{ marginTop: 6 }}>
          {[...goal.contributions]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((c) => (
              <div className="list-row" key={c.id}>
                <span className="muted" style={{ width: 120 }}>
                  {formatDay(c.date, state.settings.locale)}
                </span>
                <span className="grow truncate faint">{c.note || ''}</span>
                <span className="numeric" style={{ fontWeight: 550 }}>
                  {formatMoney(c.amount, state.settings)}
                </span>
                <button
                  className="btn danger small"
                  onClick={() => dispatch({ type: 'goal/uncontribute', goalId: goal.id, contributionId: c.id })}
                >
                  Remove
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { dispatch } = useStore()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(goal.target) : '')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [note, setNote] = useState(goal?.note ?? '')
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseAmount(target)
    if (!name.trim()) return setError('Give the goal a name.')
    if (value <= 0) return setError('Set a target greater than zero.')

    const payload = { name: name.trim(), target: value, deadline: deadline || undefined, note: note.trim() || undefined }
    if (goal) dispatch({ type: 'goal/update', id: goal.id, patch: payload })
    else dispatch({ type: 'goal/add', goal: payload })
    onClose()
  }

  return (
    <Modal title={goal ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Goal">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" autoFocus />
        </Field>
        <div className="form-row">
          <Field label="Target amount">
            <input inputMode="decimal" placeholder="0.00" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Deadline (optional)">
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)" error={error}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="3 months of rent" />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {goal ? 'Save changes' : 'Create goal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ContributionForm({ goal, month, onClose }: { goal: Goal; month: MonthKey; onClose: () => void }) {
  const { dispatch } = useStore()
  const p = goalProgress(goal)
  const [amount, setAmount] = useState(p.requiredPerMonth ? p.requiredPerMonth.toFixed(2) : '')
  const today = todayKey()
  const [date, setDate] = useState(today.startsWith(month) ? today : `${month}-01`)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (value === 0) return setError('Enter an amount.')
    dispatch({
      type: 'goal/contribute',
      goalId: goal.id,
      contribution: { amount: value, date, note: note.trim() || undefined },
    })
    onClose()
  }

  return (
    <Modal title={`Add money to “${goal.name}”`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="form-row">
          <Field label="Amount">
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="faint">
          {p.remaining > 0 ? `${p.remaining.toFixed(2)} still to go.` : 'This goal is already funded.'} Use a negative
          amount to record a withdrawal.
        </div>
        <Field label="Note (optional)" error={error}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Payday transfer" />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Add contribution
          </button>
        </div>
      </form>
    </Modal>
  )
}
