# Ledger

A personal finance tracker: log what you spend, record what you make each month, and set savings goals
that tell you how much to put aside.

Everything is stored in your browser's `localStorage` — no accounts, no server, no data leaving the machine.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # typecheck + production bundle into dist/
npm run preview  # serve the built bundle
```

Not sure where to start? Open **Settings → Load demo data** for six months of furnished history, then reset
it when you want to enter your own.

## What it does

**Dashboard** — income, spending, what's left over and your savings rate for the selected month, plus a
category donut, a six-month income-vs-spending chart, goal progress and recent transactions. While you're
in the current month it also projects where your spending will land based on your daily burn rate.

**Expenses** — dated transactions with a category and an optional note. Search, filter by category, edit
and delete. Category budgets show as progress bars that turn red when you go over.

**Income** — recurring sources at any cadence (weekly, biweekly, monthly, quarterly, yearly), all
normalised to a monthly figure. Sources can have a start and/or end month, so a job you left stops
counting toward the months after it ended.

**Goals** — a target amount, an optional deadline, and contributions you log as you fund it. Each goal
shows how much per month you need to finish on time and whether you're on track, judged against the pace
implied by its deadline. The summary tiles compare what your goals need per month against what's actually
left over.

**Settings** — currency and number formatting, custom categories (name, icon, colour, monthly budget), and
JSON export/import so you can back up or move your data.

## How the numbers work

- **Monthly income** normalises every active source: weekly × 52/12, biweekly × 26/12, quarterly ÷ 3,
  yearly ÷ 12. A source counts for a month only if that month falls inside its start/end range.
- **Left over** is monthly income minus expenses dated in that month; the savings rate is that over income.
- **Needed per month** for a goal is the remaining amount divided by the months left until its deadline,
  counting the deadline's own month. Goals with no deadline aren't included in that total.
- **On track vs. behind** compares actual progress against where a goal would be if funded evenly from the
  day it was created to its deadline.
- **Projected spend** extrapolates the current month's daily average across the whole month.

Deleting a category doesn't delete its expenses — they move to another category so nothing goes missing
from your history.

## Layout

```
src/
  lib/         date, money, storage, selectors (all the maths lives here)
  state/       reducer + context, persisted to localStorage on every change
  components/  one file per view, plus shared UI primitives and SVG charts
```

Built with React, TypeScript and Vite. The charts are hand-rolled SVG, so there are no runtime
dependencies beyond React itself.
