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
import { buildAlerts, projectedSpend, safeToSpend } from '../lib/intelligence/insights'
import { dueDescription, upcomingBills } from '../lib/intelligence/recurring'
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
  const projected = projectedSpend(state, month)

  const money = useMemo(() => (n: number) => formatMoney(n, settings), [settings])
  const safe = useMemo(() => safeToSpend(state, month), [state, month])
  const alerts = useMemo(() => buildAlerts(state, month, money), [state, month, money])
  const bills = useMemo(() => upcomingBills(state.expenses, month), [state.expenses, month])

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
        {isCurrentMonth ? (
          <Stat
            label="Safe to spend"
            value={formatMoney(Math.max(0, safe.perDay), settings)}
            tone={safe.total < 0 ? 'negative' : 'positive'}
            note={
              safe.total < 0
                ? `${formatMoney(Math.abs(safe.total), settings)} short once bills and goals are covered`
                : `a day for ${safe.daysLeft} days · ${formatMoney(safe.total, settings)} left after bills and goals`
            }
          />
        ) : (
          <Stat
            label="Daily average"
            value={formatMoney(burnRate, settings)}
            note={`Over ${daysInMonth(month)} days`}
          />
        )}
      </div>

      {alerts.length > 0 && (
        <Card>
          <CardHeader
            title="Worth knowing"
            hint={isCurrentMonth ? `Projected to finish the month at ${formatMoney(projected, settings)}` : undefined}
          />
          <div className="stack" style={{ gap: 10 }}>
            {alerts.map((alert) => (
              <div className="list-row" key={alert.id} style={{ alignItems: 'flex-start' }}>
                <span className={`alert-mark ${alert.level}`} aria-hidden="true">
                  {alert.level === 'danger' ? '!' : alert.level === 'warn' ? '▲' : 'i'}
                </span>
                <span className="grow">
                  <div style={{ fontWeight: 550 }}>{alert.title}</div>
                  <div className="faint">{alert.detail}</div>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

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
            title="Upcoming bills"
            hint={
              bills.length > 0
                ? `${formatMoney(safe.committed, settings)} still to leave your account`
                : 'Spotted automatically from repeating charges'
            }
          />
          {bills.length === 0 ? (
            <EmptyState
              emoji="🔁"
              title="No bills detected for the rest of this month"
              hint="Recurring charges are recognised after they repeat three times."
            />
          ) : (
            <div>
              {bills.map((bill) => {
                const category = categoryById(state.categories, bill.categoryId)
                return (
                  <div className="list-row" key={bill.key}>
                    <span className="dot" style={{ background: category?.color }} />
                    <span className="grow truncate">
                      {bill.label}
                      <div className="faint">
                        {formatDay(bill.nextDue, settings.locale)} · {dueDescription(bill)}
                        {bill.priceIncrease
                          ? ` · up ${Math.round(bill.priceIncrease.ratio * 100)}% from ${formatMoney(bill.priceIncrease.from, settings)}`
                          : ''}
                      </div>
                    </span>
                    <span className="numeric" style={{ fontWeight: 550 }}>
                      {formatMoney(bill.typicalAmount, settings)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid two">
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
