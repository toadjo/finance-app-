import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import type { AppState, Category } from '../types'
import { formatMoney, parseAmount } from '../lib/money'
import { sampleState } from '../lib/sample'
import { Card, CardHeader, Field, Modal } from './ui'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'INR', 'BRL', 'MXN', 'ZAR']
const LOCALES = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'nl-NL', 'sv-SE', 'pt-BR', 'ja-JP']
const PALETTE = ['#6366f1', '#22c55e', '#38bdf8', '#f97316', '#eab308', '#ec4899', '#a855f7', '#14b8a6', '#f4645f', '#94a3b8']

export function SettingsView() {
  const { state, dispatch } = useStore()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importData(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as AppState
      if (!Array.isArray(parsed.expenses) || !Array.isArray(parsed.goals)) throw new Error('unrecognised file')
      dispatch({ type: 'state/replace', state: parsed })
      setMessage('Data imported.')
    } catch {
      setMessage('That file could not be read as a Ledger export.')
    }
  }

  return (
    <div className="grid">
      <div className="grid two">
        <Card>
          <CardHeader title="Display" hint="How amounts and dates are formatted" />
          <div className="form-row">
            <Field label="Currency">
              <select
                value={state.settings.currency}
                onChange={(e) => dispatch({ type: 'settings/update', patch: { currency: e.target.value } })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Format">
              <select
                value={state.settings.locale}
                onChange={(e) => dispatch({ type: 'settings/update', patch: { locale: e.target.value } })}
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="faint" style={{ marginTop: 10 }}>
            Preview: {formatMoney(1234.5, state.settings)}
          </div>
        </Card>

        <Card>
          <CardHeader title="Your data" hint="Everything lives in this browser only" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={exportData}>
              Export JSON
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              Import JSON
            </button>
            <button
              className="btn"
              onClick={() => {
                if (confirm('Replace everything with demo data?')) {
                  dispatch({ type: 'state/replace', state: sampleState() })
                  setMessage('Demo data loaded.')
                }
              }}
            >
              Load demo data
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (confirm('Delete all income, expenses and goals? This cannot be undone.')) {
                  dispatch({ type: 'state/reset' })
                  setMessage('All data cleared.')
                }
              }}
            >
              Reset everything
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importData(file)
              e.target.value = ''
            }}
          />
          {message && (
            <div className="faint" style={{ marginTop: 10 }}>
              {message}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Categories"
          hint="Set an optional monthly budget for any category"
          action={
            <button className="btn primary" onClick={() => setEditing('new')}>
              + Add category
            </button>
          }
        />
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="right">Monthly budget</th>
              <th className="right">Logged expenses</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.categories.map((c) => {
              const uses = state.expenses.filter((e) => e.categoryId === c.id).length
              return (
                <tr key={c.id}>
                  <td>
                    <span className="chip">
                      <span className="dot" style={{ background: c.color }} />
                      {c.icon} {c.name}
                    </span>
                  </td>
                  <td className="right numeric muted">{c.budget ? formatMoney(c.budget, state.settings) : '—'}</td>
                  <td className="right muted">{uses}</td>
                  <td className="actions">
                    <button className="btn ghost small" onClick={() => setEditing(c)}>
                      Edit
                    </button>
                    <button
                      className="btn danger small"
                      disabled={state.categories.length < 2}
                      onClick={() => {
                        if (uses === 0 || confirm(`Move ${uses} expense(s) to another category and delete "${c.name}"?`))
                          dispatch({ type: 'category/remove', id: c.id })
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
      </Card>

      {editing && <CategoryForm category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function CategoryForm({ category, onClose }: { category?: Category; onClose: () => void }) {
  const { dispatch } = useStore()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '📦')
  const [color, setColor] = useState(category?.color ?? PALETTE[0])
  const [budget, setBudget] = useState(category?.budget ? String(category.budget) : '')
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Give the category a name.')
    const parsed = parseAmount(budget)
    const payload = { name: name.trim(), icon: icon.trim() || '📦', color, budget: parsed > 0 ? parsed : undefined }
    if (category) dispatch({ type: 'category/update', id: category.id, patch: payload })
    else dispatch({ type: 'category/add', category: payload })
    onClose()
  }

  return (
    <Modal title={category ? 'Edit category' : 'New category'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="form-row">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pets" autoFocus />
          </Field>
          <Field label="Icon">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder="🐈" />
          </Field>
        </div>
        <Field label="Monthly budget (optional)" error={error}>
          <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Colour">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use colour ${c}`}
                onClick={() => setColor(c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: c,
                  border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {category ? 'Save changes' : 'Add category'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
