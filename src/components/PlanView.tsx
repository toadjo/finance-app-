import type { Category, Settings } from '../types'
import type { MonthPlan, plannedItems } from '../lib/intelligence/plan'
import type { Payday } from '../lib/payday'
import { formatMoney } from '../lib/money'
import { formatDayShort, formatMonth, type MonthKey } from '../lib/date'
import { Card, CardHeader, EmptyState, ProgressBar, Stat } from './ui'
import type { View } from '../App'

type PlannedItem = ReturnType<typeof plannedItems>[number]

/**
 * A month that hasn't happened yet, shown as a plan rather than a record: what is
 * already committed, what your history says is coming, and what's left to play with.
 */
export function PlanView({
  month,
  plan,
  items,
  paydays,
  categories,
  settings,
  onNavigate,
}: {
  month: MonthKey
  plan: MonthPlan
  items: PlannedItem[]
  paydays: Payday[]
  categories: Category[]
  settings: Settings
  onNavigate: (view: View) => void
}) {
  const committed = plan.planned + plan.scheduled + plan.expectedBills + plan.goalFunding
  const category = (id: string) => categories.find((c) => c.id === id)

  return (
    <div className="grid">
      <div className="grid stats">
        <Stat
          label="Expected income"
          value={formatMoney(plan.arriving, settings)}
          note={
            plan.paydayCount > 0
              ? `${plan.paydayCount} ${plan.paydayCount === 1 ? 'payday' : 'paydays'} this month`
              : 'Set paydays on your income to see exact dates'
          }
        />
        <Stat
          label="Expected bills"
          value={formatMoney(plan.scheduled + plan.expectedBills, settings)}
          note={(() => {
            const scheduled = items.filter((i) => i.kind === 'scheduled').length
            const predicted = items.filter((i) => i.kind === 'expected').length
            if (scheduled + predicted === 0) return 'Nothing repeating due this month'
            return `${scheduled} from your recurring items · ${predicted} predicted from history`
          })()}
        />
        <Stat
          label="Your expenses"
          value={formatMoney(plan.planned, settings)}
          note={(() => {
            const n = items.filter((i) => i.kind === 'entered').length
            return `${n} ${n === 1 ? 'expense' : 'expenses'} you entered for this month`
          })()}
        />
        <Stat
          label={plan.leftOver >= 0 ? 'Left to play with' : 'Short by'}
          value={formatMoney(Math.abs(plan.leftOver), settings)}
          tone={plan.leftOver >= 0 ? 'positive' : 'negative'}
          note={plan.goalFunding > 0 ? `After ${formatMoney(plan.goalFunding, settings)} towards goals` : 'After bills and goals'}
        />
      </div>

      {plan.overCommitted && (
        <Card>
          <div className="list-row" style={{ alignItems: 'flex-start', borderBottom: 0, padding: 0 }}>
            <span className="alert-mark danger" aria-hidden="true">
              !
            </span>
            <span className="grow">
              <div style={{ fontWeight: 550 }}>
                {formatMonth(month, settings.locale)} is over budget before it starts
              </div>
              <div className="faint">
                {formatMoney(committed, settings)} is committed against {formatMoney(plan.income, settings)} of income.
                Move something out of this month, or trim a goal.
              </div>
            </span>
          </div>
        </Card>
      )}

      <div className="grid two">
        <Card>
          <CardHeader
            title="What this month looks like"
            hint={`${formatMonth(month, settings.locale)} · anything you enter replaces the matching prediction`}
            action={
              <button className="btn primary small" onClick={() => onNavigate('expenses')}>
                + Plan an expense
              </button>
            }
          />
          {items.length === 0 ? (
            <EmptyState
              emoji="🗓"
              title="Nothing planned yet"
              hint="Add an expense dated in this month, and recurring bills will fill themselves in."
            />
          ) : (
            <div>
              {items.map((item) => (
                <div className="list-row" key={item.id}>
                  <span className="dot" style={{ background: category(item.categoryId)?.color }} />
                  <span className="grow truncate">
                    {item.label}
                    <div className="faint">
                      {formatDayShort(item.date, settings.locale)} · {category(item.categoryId)?.name} ·{' '}
                      {item.kind === 'expected' ? 'predicted' : item.kind === 'scheduled' ? 'scheduled' : 'you entered'}
                    </div>
                  </span>
                  <span
                    className="numeric"
                    style={{ fontWeight: 550, opacity: item.kind === 'expected' ? 0.72 : 1 }}
                  >
                    {formatMoney(item.amount, settings)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="How the month is committed" />
          <div className="stack" style={{ gap: 12 }}>
            <Slice label="Entered by you" value={plan.planned} total={plan.income} color="#FF3B30" settings={settings} />
            <Slice label="Scheduled rules" value={plan.scheduled} total={plan.income} color="#FF9500" settings={settings} />
            <Slice label="Still predicted" value={plan.expectedBills} total={plan.income} color="var(--warning)" settings={settings} />
            <Slice label="Goal funding" value={plan.goalFunding} total={plan.income} color="var(--accent)" settings={settings} />
            <Slice
              label="Unallocated"
              value={Math.max(0, plan.leftOver)}
              total={plan.income}
              color="var(--positive)"
              settings={settings}
            />
          </div>

          {paydays.length > 0 && (
            <>
              <div className="card-header" style={{ margin: '18px 0 8px' }}>
                <h3 style={{ fontSize: 14 }}>Paydays</h3>
              </div>
              {paydays.map((payday) => (
                <div className="list-row" key={`${payday.income.id}-${payday.date}`}>
                  <span className="dot" style={{ background: 'var(--positive)' }} />
                  <span className="grow truncate">
                    {payday.income.label}
                    <div className="faint">{formatDayShort(payday.date, settings.locale)}</div>
                  </span>
                  <span className="numeric" style={{ fontWeight: 550 }}>
                    {formatMoney(payday.amount, settings)}
                  </span>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

function Slice({
  label,
  value,
  total,
  color,
  settings,
}: {
  label: string
  value: number
  total: number
  color: string
  settings: Settings
}) {
  return (
    <div>
      <div className="legend-row" style={{ justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span className="numeric faint">{formatMoney(value, settings)}</span>
      </div>
      <ProgressBar value={total > 0 ? value / total : 0} color={color} />
    </div>
  )
}
