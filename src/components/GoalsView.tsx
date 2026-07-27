import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import type { Goal, Lifestyle, Pace } from '../types'
import { goalProgress, requiredMonthlySavings, type GoalProgress, type GoalStatus } from '../lib/selectors'
import { coachGoal } from '../lib/intelligence/coach'
import { allocateSavings, paceOf, LIFESTYLE_BLURB, LIFESTYLE_LABEL, type SavingsPlan } from '../lib/intelligence/allocate'
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
  const savings = useMemo(() => allocateSavings(state, month), [state, month])
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
          label="Saving per month"
          value={formatMoney(savings.totalSaving, state.settings)}
          note={
            needed > savings.totalSaving
              ? `${formatMoney(needed, state.settings)} would hit every deadline exactly`
              : 'On your current plan'
          }
        />
        <Stat
          label="Free to spend"
          value={formatMoney(savings.spendingAllowance, state.settings)}
          tone={savings.spendingAllowance >= 0 ? 'positive' : 'negative'}
          note={`After saving, from ${formatMoney(savings.spare, state.settings)} typically spare`}
        />
        <Stat
          label="Goals reached"
          value={`${progress.filter((p) => p.status === 'complete').length} / ${state.goals.length}`}
          note={`${progress.filter((p) => p.status === 'behind' || p.status === 'overdue').length} need attention`}
        />
      </div>

      <Card>
        <CardHeader
          title="How you want to live"
          hint="This decides how much of your spare money goes to goals, and how much stays yours to spend"
        />
        <div className="pace-picker">
          {(['relaxed', 'balanced', 'focused'] as Lifestyle[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`pace-option ${(state.settings.lifestyle ?? 'balanced') === option ? 'selected' : ''}`}
              onClick={() => dispatch({ type: 'settings/update', patch: { lifestyle: option } })}
            >
              <strong>{LIFESTYLE_LABEL[option]}</strong>
              <span>{LIFESTYLE_BLURB[option]}</span>
            </button>
          ))}
        </div>

        <div className="grid stats" style={{ marginTop: 16 }}>
          <div className="stat">
            <div className="stat-label">Spare each month</div>
            <div className="stat-value numeric">{formatMoney(savings.spare, state.settings)}</div>
            <div className="stat-note">Typical income minus what you actually spend</div>
          </div>
          <div className="stat">
            <div className="stat-label">Going to goals</div>
            <div className="stat-value numeric">{formatMoney(savings.totalSaving, state.settings)}</div>
            <div className="stat-note">Across {savings.allocations.length} unfinished {savings.allocations.length === 1 ? 'goal' : 'goals'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Yours to spend</div>
            <div className={`stat-value numeric ${savings.spendingAllowance >= 0 ? 'positive' : 'negative'}`}>
              {formatMoney(savings.spendingAllowance, state.settings)}
            </div>
            <div className="stat-note">After goals are funded</div>
          </div>
        </div>

        <div className="list-row" style={{ alignItems: 'flex-start', marginTop: 8, borderBottom: 0 }}>
          <span className={`alert-mark ${savings.overCommitted ? 'warn' : 'info'}`} aria-hidden="true">
            {savings.overCommitted ? '▲' : 'i'}
          </span>
          <span className="grow">
            {savings.advice}
            {savings.allocations.length > 0 && savings.allocations.every((a) => a.pace === 'strict') && (
              <div className="faint" style={{ marginTop: 4 }}>
                Every goal you have is on a fixed deadline, so this setting has nothing to flex — their
                amounts are set by their dates. Switch one to <strong>Flexible</strong> to let it adapt to
                how you want to live.
              </div>
            )}
          </span>
        </div>
      </Card>

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
                savings={savings}
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
  savings,
  open,
  onToggle,
  onEdit,
  onContribute,
  onDelete,
}: {
  progress: GoalProgress
  savings: SavingsPlan
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onContribute: () => void
  onDelete: () => void
}) {
  const { state, dispatch } = useStore()
  const { goal } = p
  const color = p.status === 'complete' ? 'var(--accent)' : p.status === 'behind' || p.status === 'overdue' ? 'var(--warning)' : 'var(--positive)'
  const coaching = useMemo(() => coachGoal(goal, (n) => formatMoney(n, state.settings)), [goal, state.settings])
  const allocation = savings.allocations.find((a) => a.goal.id === goal.id)

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
          <span className="chip">{allocation?.pace === 'balanced' ? 'Flexible' : 'Fixed date'}</span>
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

      {allocation && p.status !== 'complete' && (
        <div className={`coach-line ${allocation.onTimeForDeadline === false ? 'late' : ''}`}>
          <span aria-hidden="true">{allocation.onTimeForDeadline === false ? '⚠' : '✓'}</span>
          <span>
            {allocation.pace === 'balanced' ? (
              allocation.monthly > 0 ? (
                <>
                  Putting aside <strong>{formatMoney(allocation.monthly, state.settings)}</strong> a month on your
                  current plan — on track for <strong>{allocation.projectedCompletion}</strong>
                  {allocation.monthsLate !== undefined && allocation.monthsLate > 0
                    ? `, ${allocation.monthsLate} month${allocation.monthsLate === 1 ? '' : 's'} past your target date.`
                    : '.'}
                </>
              ) : (
                <>Nothing spare to put towards this yet — it'll start funding itself when your months end in the black.</>
              )
            ) : (
              <>
                Fixed deadline: <strong>{formatMoney(allocation.monthly, state.settings)}</strong> a month to land on
                time.
                {allocation.shortfall !== undefined && allocation.shortfall > 0
                  ? ` That's ${formatMoney(allocation.shortfall, state.settings)} more than your saving style sets aside, so it comes out of spending money.`
                  : ''}
              </>
            )}
          </span>
        </div>
      )}
      {coaching.verdict !== 'complete' && allocation?.pace === 'strict' && (
        <div className={`coach-line ${coaching.verdict === 'late' || coaching.verdict === 'stalled' ? 'late' : ''}`}>
          <span aria-hidden="true">{coaching.verdict === 'late' || coaching.verdict === 'stalled' ? '⚠' : '✓'}</span>
          <span>{coaching.advice}</span>
        </div>
      )}

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
  // New goals default to flexible: keeping money to live on is the friendlier default.
  const [pace, setPace] = useState<Pace>(goal ? paceOf(goal) : 'balanced')
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseAmount(target)
    if (!name.trim()) return setError('Give the goal a name.')
    if (value <= 0) return setError('Set a target greater than zero.')

    const payload = {
      name: name.trim(),
      target: value,
      deadline: deadline || undefined,
      note: note.trim() || undefined,
      pace,
    }
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
        <Field label="How should we fund it?">
          <div className="pace-picker">
            <button
              type="button"
              className={`pace-option ${pace === 'balanced' ? 'selected' : ''}`}
              onClick={() => setPace('balanced')}
            >
              <strong>Flexible</strong>
              <span>Save what you can comfortably spare. We'll tell you when it lands — the date moves, your spending money doesn't.</span>
            </button>
            <button
              type="button"
              className={`pace-option ${pace === 'strict' ? 'selected' : ''}`}
              onClick={() => setPace('strict')}
            >
              <strong>Fixed deadline</strong>
              <span>Hit the date no matter what. We'll set the amount you must save, even if it leaves less to live on.</span>
            </button>
          </div>
        </Field>
        {pace === 'strict' && !deadline && (
          <div className="faint">A fixed deadline needs a date — without one this behaves like flexible.</div>
        )}

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
