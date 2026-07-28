import type { MonthSummary } from '../lib/selectors'
import type { Settings } from '../types'
import { formatCompact, formatMoney } from '../lib/money'
import { formatMonthShort } from '../lib/date'

export interface Slice {
  id: string
  label: string
  value: number
  color: string
}

/** Donut built from SVG arcs — no chart library, no external requests. */
export function DonutChart({
  slices,
  total,
  centerLabel,
  centerValue,
  size = 168,
}: {
  slices: Slice[]
  total: number
  centerLabel: string
  centerValue: string
  size?: number
}) {
  const radius = size / 2
  const thickness = size * 0.17
  const r = radius - thickness / 2
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
      <g transform={`rotate(-90 ${radius} ${radius})`}>
        <circle cx={radius} cy={radius} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={thickness} />
        {total > 0 &&
          slices.map((slice) => {
            const length = (slice.value / total) * circumference
            const dash = `${Math.max(0, length - 1.5)} ${circumference}`
            const el = (
              <circle
                key={slice.id}
                cx={radius}
                cy={radius}
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              >
                <title>{`${slice.label}: ${slice.value.toFixed(2)}`}</title>
              </circle>
            )
            offset += length
            return el
          })}
      </g>
      <text x={radius} y={radius - 4} textAnchor="middle" fill="var(--text-muted)" fontSize={11.5}>
        {centerLabel}
      </text>
      <text
        x={radius}
        y={radius + 17}
        textAnchor="middle"
        fill="var(--text)"
        fontSize={17}
        fontWeight={650}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {centerValue}
      </text>
    </svg>
  )
}

/** Income vs. spending, one pair of bars per month. */
export function TrendChart({ months, settings }: { months: MonthSummary[]; settings: Settings }) {
  const peak = Math.max(1, ...months.flatMap((m) => [m.income, m.spent]))

  return (
    <div>
      <div className="bar-chart">
        {months.map((m) => (
          <div className="bar-col" key={m.month}>
            <div className="bar-pair">
              <div
                className="bar income"
                style={{ height: `${(m.income / peak) * 100}%` }}
                title={`Income ${formatMoney(m.income, settings)}`}
              />
              <div
                className="bar spent"
                style={{ height: `${(m.spent / peak) * 100}%` }}
                title={`Spent ${formatMoney(m.spent, settings)}`}
              />
            </div>
            <div className="bar-label">{formatMonthShort(m.month, settings.locale)}</div>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span className="legend-row">
          <span className="dot" style={{ background: 'var(--accent)' }} /> Income
        </span>
        <span className="legend-row">
          <span className="dot" style={{ background: '#FF3B30' }} /> Spent
        </span>
        <span style={{ marginLeft: 'auto' }} className="numeric">
          peak {formatCompact(peak, settings)}
        </span>
      </div>
    </div>
  )
}
