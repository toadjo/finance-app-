import { useMemo } from 'react'
import { useStore } from '../state/store'
import {
  categoryById,
  expensesForMonth,
  goalProgress,
  monthlyTrend,
  requiredMonthlySavings,
  spendByCategory,
  summariseMonth,
} from '../lib/selectors'
import { formatMoney, formatPercent } from '../lib/money'
import { daysInMonth, formatDay, formatMonth, todayKey, type MonthKey } from '../lib/date'
import { Card, CardHeader, EmptyState, ProgressBar, Stat } from './ui'
import { DonutChart, TrendChart } from './charts'
import type { View } from '../App'

export function Dashboard({ month, onNavigate }: { month: MonthKey; onNavigate: (view: View) => void }) {
  const { state } = useStore()
  const { settings } = state

  const summary = useMemo(() => summariseMonth(state, month), [state, month])
  const trend = useMemo(() => monthlyTrend(state, month, 6), [state, month])
  const monthExpenses = useMemo(() => expensesForMonth(state.expenses, month), [state.expenses, month])
  const breakdown = useMemo(() => spendByCategory(monthExpenses, state.categories), [monthExpenses, state.categories])
  const goals = useMemo(() => state.goals.map(goalProgress), [state.goals])
  const needed = requiredMonthlySavings(state.goals)

  const isCurrentMonth = todayKey().startsWith(month)
  const dayOfMonth = isCurrentMonth ? Number(todayKey().slice(8)) : daysInMonth(month)
  const burnRate = dayOfMonth > 0 ? summary.spent / dayOfMonth : 0
  const projected = burnRate * daysInMonth(month)

  const previous = trend[trend.length - 2]
  const spendDelta = previous && previous.spent > 0 ? (summary.spent - previous.spent) / previous.spent : undefined

  return (
    <div className="grid">
      <div className="grid stats">
        <Stat
          label="Income"
          value={formatMoney(summary.income, settings)}
          note={state.incomes.length === 0 ? 'Add a source to get started' : `${state.incomes.length} sources`}
        />
        <Stat
          label="Spent"
          value={formatMoney(summary.spent, settings)}
          note={
            spendDelta === undefined
              ? `${monthExpenses.length} transactions`
              : `${spendDelta >= 0 ? '▲' : '▼'} ${formatPercent(Math.abs(spendDelta), settings.locale)} vs last month`
          }
        />
        <Stat
          label={summary.net >= 0 ? 'Left over' : 'Overspent by'}
          value={formatMoney(Math.abs(summary.net), settings)}
          tone={summary.net >= 0 ? 'positive' : 'negative'}
          note={summary.income > 0 ? `${formatPercent(summary.savingsRate, settings.locale)} savings rate` : undefined}
        />
        <Stat
          label={isCurrentMonth ? 'Projected spend' : 'Daily average'}
          value={formatMoney(isCurrentMonth ? projected : burnRate, settings)}
          note={
            isCurrentMonth
              ? `At ${formatMoney(burnRate, settings)} a day`
              : `Over ${daysInMonth(month)} days`
          }
        />
      </div>

      <div className="grid two">
        <Card>
          <CardHeader title="Where the money went" hint={formatMonth(month, settings.locale)} />
          {breakdown.filter((b) => b.total > 0).length === 0 ? (
            <EmptyState emoji="🧾" title="Nothing logged this month" hint="Add an expense to see the breakdown." />
          ) : (
            <div className="donut-wrap">
              <DonutChart
                total={summary.spent}
                centerLabel="Total"
                centerValue={formatMoney(summary.spent, settings, { decimals: false })}
                slices={breakdown
                  .filter((b) => b.total > 0)
                  .map((b) => ({ id: b.category.id, label: b.category.name, value: b.total, color: b.category.color }))}
              />
              <div className="donut-legend">
                {breakdown
                  .filter((b) => b.total > 0)
                  .slice(0, 6)
                  .map((b) => (
                    <div className="legend-row" key={b.category.id}>
                      <span className="dot" style={{ background: b.category.color }} />
                      <span className="grow truncate">
                        {b.category.icon} {b.category.name}
                      </span>
                      <span className="numeric muted">{formatMoney(b.total, settings)}</span>
                      <span className="numeric faint" style={{ width: 40, textAlign: 'right' }}>
                        {formatPercent(b.share, settings.locale)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Last 6 months" hint="Income against spending" />
          <TrendChart months={trend} settings={settings} />
        </Card>
      </div>

      <div className="grid two">
        <Card>
          <CardHeader
            title="Goals"
            hint={needed > 0 ? `${formatMoney(needed, settings)} a month keeps them on schedule` : undefined}
            action={
              <button className="btn ghost small" onClick={() => onNavigate('goals')}>
                Manage →
              </button>
            }
          />
          {goals.length === 0 ? (
            <EmptyState emoji="🎯" title="No goals yet" hint="Set one to give the leftover money a job." />
          ) : (
            <div className="stack" style={{ gap: 14 }}>
              {goals.slice(0, 4).map((p) => (
                <div key={p.goal.id}>
                  <div className="legend-row" style={{ justifyContent: 'space-between' }}>
                    <span className="truncate">{p.goal.name}</span>
                    <span className="numeric faint">
                      {formatMoney(p.saved, settings, { decimals: false })} /{' '}
                      {formatMoney(p.goal.target, settings, { decimals: false })}
                    </span>
                  </div>
                  <ProgressBar
                    value={p.progress}
                    color={
                      p.status === 'complete'
                        ? 'var(--accent)'
                        : p.status === 'behind' || p.status === 'overdue'
                          ? 'var(--warning)'
                          : 'var(--positive)'
                    }
                  />
                </div>
              ))}
              {summary.saved > 0 && (
                <div className="faint">
                  You put {formatMoney(summary.saved, settings)} towards goals in{' '}
                  {formatMonth(month, settings.locale)}.
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent expenses"
            action={
              <button className="btn ghost small" onClick={() => onNavigate('expenses')}>
                See all →
              </button>
            }
          />
          {monthExpenses.length === 0 ? (
            <EmptyState emoji="💸" title="No expenses this month" />
          ) : (
            <div>
              {monthExpenses.slice(0, 6).map((e) => {
                const category = categoryById(state.categories, e.categoryId)
                return (
                  <div className="list-row" key={e.id}>
                    <span className="dot" style={{ background: category?.color }} />
                    <span className="grow truncate">
                      {e.note || category?.name || 'Expense'}
                      <div className="faint">
                        {category?.icon} {category?.name} · {formatDay(e.date, settings.locale)}
                      </div>
                    </span>
                    <span className="numeric" style={{ fontWeight: 550 }}>
                      {formatMoney(e.amount, settings)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
