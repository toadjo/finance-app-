import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{children}</section>
}

export function CardHeader({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <header className="card-header">
      <div>
        <h3>{title}</h3>
        {hint && <div className="hint">{hint}</div>}
      </div>
      {action}
    </header>
  )
}

export function Stat({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string
  value: string
  note?: ReactNode
  tone?: 'neutral' | 'positive' | 'negative'
}) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value numeric ${tone === 'neutral' ? '' : tone}`}>{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

export function ProgressBar({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="emoji">{emoji}</div>
      <div style={{ fontWeight: 550 }}>{title}</div>
      {hint && <div className="faint">{hint}</div>}
    </div>
  )
}

export function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
