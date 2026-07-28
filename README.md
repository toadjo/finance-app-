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
sudo apt install ./release/ledger-desktop_*_amd64.deb
```

**Fedora / RHEL / openSUSE:**

```bash
sudo dnf install ./release/ledger-desktop-*.x86_64.rpm
```

Either package registers Ledger in your application menu under Office/Finance. The package is called
`ledger-desktop`, not `ledger` — that name already belongs to the double-entry accounting CLI in both
Fedora and Debian, and claiming it would collide with a real distro package. Building the RPM needs
`rpmbuild` on the build machine (`sudo dnf install rpm-build`, or `sudo apt install rpm` on Debian).

## Develop

```bash
npm run electron:dev   # Vite + Electron with hot reload
npm run dev            # renderer only, in a browser at localhost:5173
npm test               # 140 unit tests over the maths
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

**Income** — recurring sources at any cadence (weekly → yearly) *and* **one-offs**: a bonus, a tax refund,
something you sold. A one-off is a single dated amount that counts in full in its own month and nowhere
else, so it lifts that month's income without inflating your average. Recurring sources are normalised to a
monthly figure. Sources can
have a start and/or end month, so a job you left stops counting toward later months. Give a source a
**payday** — any one date it paid out — and the cadence derives every past and future payday from it, so the
dashboard can tell you what lands when, and a five-payday month reads bigger than a four-payday one.

**Goals** — a target, an optional deadline, contributions you log, and a **pace**:

- **Fixed deadline** — the date is a promise. The app tells you what you must save each month to hit it,
  even when that eats into spending money.
- **Flexible** — your spending money is the promise. The app funds the goal from what's comfortably spare
  and tells you when it will actually land; the date moves instead of your life.

Alongside that, **how you want to live** (Enjoy it now / A bit of both / Save hard) sets how much of your
spare money goes to goals at all. Change it and every number moves: what you save, when each flexible goal
lands, and what's genuinely yours to spend. Fixed-deadline goals are funded first; whatever the budget has
left is shared among the flexible ones in proportion to what each still needs.

**Recurring** — declare the things that repeat: rent, subscriptions, and standing transfers into a savings
goal. Each one logs itself as it falls due (including anything missed since its start date), or you can set
it to forecast only and never touch the ledger. Pause one without losing its history.

A future month separates **expected bills** — your recurring items plus repeat charges predicted from
history — from **your expenses**, the one-offs you entered for that month. Anything you enter
replaces the matching prediction — matched on the note, or failing that on a same-category charge of about
the right size — so wording August's rent differently from July's doesn't make the month count it twice.

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

**Saving versus spending.** Spare money is the median of your last three months' income minus spending. Your
lifestyle setting earmarks a share of it for saving (25% / 50% / 80%), fixed-deadline goals are funded from
that first, and the rest is split across flexible goals by how much each still needs. What's left is your
spending allowance — and safe-to-spend uses the *allocated* figure, not the strict requirement, so choosing
"flexible" genuinely gives you more to live on rather than just relabelling the same number.

**Goal coaching.** Your actual contribution rate gives a projected landing month, compared against the
deadline: *"At $500 a month this lands 5 months late. Add $250 a month, or move the deadline to 2027-07."*
Across all goals, required funding is compared against your typical monthly leftover; when you're
over-committed it says by how much and which goals the money actually reaches, nearest deadline first.

## Look and feel

The interface follows macOS conventions: a frameless window with traffic-light controls, a translucent
sidebar, System Blue accents, Apple's system colours for categories, and SF Pro typography where it's
available (falling back to Inter or Cantarell on Linux). It opens in light appearance, with dark available
from the sidebar.

Because the window is frameless, the traffic lights are the window controls. `Ctrl+Q` always quits
regardless, and double-clicking the title bar zooms the window as it does on macOS.

## Updates

Updates are **off by default**, because an app that promises to be offline shouldn't quietly phone home.
Settings → Updates turns them on, and that is the only thing that opens any network access at all.

When enabled, the request allowlist admits exactly this repository's release endpoints — `api.github.com`
for `/repos/toadjo/finance-app-/releases`, plus GitHub's release-download hosts — and nothing else. Any
other request is still cancelled and logged, verified by test: with updates on, the releases endpoint is
reachable while an unrelated host stays blocked. Your finances are never uploaded anywhere; the only
traffic is "is there a newer version, and fetch it".

AppImage, deb and rpm builds can all install an update in place (deb and rpm ask for authentication, since
they touch system packages). Help → About reports whether updates are on and how many outbound requests
have been blocked.

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
