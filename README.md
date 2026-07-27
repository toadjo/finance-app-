# Ledger

A personal finance tracker for Linux: log what you spend, record what you make each month, and set savings
goals that tell you how much to put aside.

It runs **completely offline**. There is no account, no server, and no telemetry — and that isn't left to
chance: the app blocks its own network access at two layers and will tell you if anything ever tries
(Help → About reports the count).

## Install

Grab a build, or make one yourself:

```bash
npm install
npm run dist        # → release/Ledger-<version>.AppImage and release/ledger_<version>_amd64.deb
```

**AppImage** — no installation, no root:

```bash
chmod +x release/Ledger-*.AppImage
./release/Ledger-*.AppImage
```

If your distro ships without FUSE, run it as `./Ledger-*.AppImage --appimage-extract-and-run`.

**Debian / Ubuntu / Mint:**

```bash
sudo apt install ./release/ledger_*_amd64.deb
```

**Fedora / RHEL / openSUSE:**

```bash
sudo dnf install ./release/ledger-*.x86_64.rpm
```

Either package registers Ledger in your application menu under Office/Finance. Building the RPM needs
`rpmbuild` on the build machine (`sudo dnf install rpm-build`, or `sudo apt install rpm` on Debian).

## Develop

```bash
npm run electron:dev   # Vite + Electron with hot reload
npm run dev            # renderer only, in a browser at localhost:5173
npm test               # 91 unit tests over the maths
npm run typecheck
```

The app degrades gracefully in a plain browser: it falls back to `localStorage` and download-based export,
because the desktop bridge (`window.ledger`) is feature-detected rather than assumed.

## What it does

**Dashboard** — income, spending, what's left over, and **safe to spend**: what you can spend per day for the
rest of the month once bills still due and goal contributions are set aside. Plus a category donut, a
six-month income-vs-spending chart, and a *Worth knowing* panel that surfaces only what's actually notable.

**Expenses** — dated transactions with a category and note; search, filter, edit, delete. Optional monthly
budget per category, shown as a bar that turns red when you go over. **The category fills itself in as you
type the note.**

**Income** — recurring sources at any cadence (weekly → yearly), normalised to a monthly figure. Sources can
have a start and/or end month, so a job you left stops counting toward later months. Give a source a
**payday** — any one date it paid out — and the cadence derives every past and future payday from it, so the
dashboard can tell you what lands when, and a five-payday month reads bigger than a four-payday one.

**Goals** — a target, an optional deadline, and contributions you log. Each goal is **coached**: at the rate
you're actually funding it, when does it land, and what exactly would fix it. Goals are also checked
collectively against what you genuinely have spare.

**Planning ahead** — step the month picker forward and a future month opens as a plan rather than a record:
what your paydays bring in, the recurring bills your history says are coming, what your goals need, and
what's genuinely left. Enter expenses against any future month to plan against them, and the month warns
you if it's over budget before it even starts.

**Settings** — currency and formatting, custom categories, JSON export/import through native dialogs, and
the on-disk backup list.

## The smart parts

All of it is deterministic arithmetic over your own history — computed locally, with no model to download
and nothing sent anywhere. Each of these has unit tests, because a wrong number stated confidently is worse
than no number at all.

**Auto-categorisation.** A naive-Bayes classifier trained on the notes you've already categorised, blended
with a seed keyword table that carries the guess while your history is thin. A confident guess pre-selects
the category; a weaker one is offered as a chip you can accept. It learns your own vocabulary — file
"Kafeneio" under Eating out a few times and it stops needing the hint.

**Recurring bills.** Charges that repeat at least three times at a steady spacing are recognised as bills,
their cadence inferred from the median gap between them. The app projects when the next one is due and
flags when one quietly gets more expensive (that 23% streaming rise). Monthly bills advance by a calendar
month, not 30 days, so rent paid on the 1st isn't reported as due again on the 31st.

**Safe to spend and alerts.** Income, minus what you've spent, minus bills still to land, minus what your
goals need this month — spread across the days remaining. Alerts fire for a month heading over budget, an
expense above the 90th percentile for its category, and categories pacing well above their own norm.
The month-end projection excludes recurring charges from the burn rate, since rent landing on the 1st says
nothing about your daily spending.

**Paydays and forward planning.** One anchor date per income source yields every payday at any cadence,
handling the awkward cases: the 31st clamps to the 28th in February without dragging later months off the
31st, and fortnightly pay lands five times in some months. Future months are projected from your recurring
charges, so next March already knows about the rent.

**Goal coaching.** Your actual contribution rate gives a projected landing month, compared against the
deadline: *"At $500 a month this lands 5 months late. Add $250 a month, or move the deadline to 2027-07."*
Across all goals, required funding is compared against your typical monthly leftover; when you're
over-committed it says by how much and which goals the money actually reaches, nearest deadline first.

## Your data

`localStorage` is the working store. On the desktop the app also mirrors every change to disk:

```
~/.config/Ledger/data/ledger.json          # current snapshot, written ~1s after a change
~/.config/Ledger/data/backups/             # rolling daily backups, last 20 kept
```

Writes go to a temp file and are renamed into place, so an interrupted write can't corrupt the ledger. A
backup of the previous state is taken before any import or reset. If the browser store is ever cleared but
the file survives, the app offers to restore it on launch. Settings → Backups lists them all with one-click
restore, and File → Export writes a portable JSON copy anywhere you like.

## How offline is enforced

- Every request whose scheme isn't the app's own is cancelled by a session-level handler and logged.
- A Content-Security-Policy of `default-src 'self'; connect-src 'none'` blocks it again at the renderer.
- `contextIsolation` on, `nodeIntegration` off, renderer sandboxed; permission requests are all denied;
  navigation away from the app and new windows are refused.
- Chromium's background networking, component updater, domain reliability and crash reporting are disabled.

Verified rather than asserted: a `fetch()` from inside the app fails with a CSP error, and a request forced
through the session is refused with `ERR_BLOCKED_BY_CLIENT` and recorded in the blocked list.

The renderer talks to the system only through a preload bridge exposing named operations (save, list
backups, export…) — no filesystem handles and no arbitrary paths, and backup names are basename-stripped so
they can't escape the backup directory.

## Layout

```
electron/       main process: window, native menu, offline lockdown, file IPC
src/lib/        date, money, storage, selectors — the arithmetic
src/lib/intelligence/   categorize, recurring, insights, coach — the smarts, each with tests
src/state/      reducer + context, persisted to localStorage and mirrored to disk
src/components/ one file per view, plus shared UI primitives and hand-rolled SVG charts
```

React, TypeScript, Vite and Electron. The charts are hand-written SVG, so React is the only runtime
dependency in the renderer.
