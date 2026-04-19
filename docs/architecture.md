# Architecture

Client-only SPA. No backend, no bundler lock-in beyond Vite, no TypeScript, no test suite. The design goals are: understandable in one sitting, hackable without ceremony, deployable as static files.

## Tech stack

| Aspect | Detail |
|---|---|
| Framework | Vite 6 + React 18 |
| Language | JavaScript (ES modules) — no TypeScript, no PropTypes |
| Styling | CSS with theme variables (`--bg`, `--tx`, `--ac`, etc.); dark + light palettes; switched via `data-theme` on `<html>` |
| i18n | Lightweight, ~350 keys in `src/i18n.jsx`; React context + `useT()` hook; Auto/EN/DE |
| Persistence | `localStorage` + File System Access API |
| Deployment | GitHub Pages via `gh-pages` branch (`peaceiris/actions-gh-pages` workflow) |
| Routing | None — everything is one page with tabs |
| State | Plain React `useState` + one top-level `data` object in `App.jsx` |

`vite.config.js` sets `base: '/planr/'` for GitHub Pages deployment.

## Directory layout

```
src/
  App.jsx                  — top-level shell, state, import/export, tabs
  App.css                  — global styles, theme variables
  main.jsx                 — Vite entry point
  constants.js             — WPX, MDE, GT, etc.
  components/
    views/
      TreeView.jsx         — hierarchical editor (primary authoring view)
      GanttView.jsx        — Gantt chart — see docs/gantt.md
      NetGraph.jsx         — network graph — see docs/network-graph.md
      ResView.jsx          — resources: teams + members
      HolView.jsx          — holidays editor
      DLView.jsx           — deadlines / goals summary
      SumView.jsx          — per-goal progress summary
      QuickEdit.jsx        — sidebar editor (primary interaction)
      PlanReview.jsx       — Planning Review tab (Decisions, Team Capacity, Blocked)
      Onboard.jsx          — first-launch onboarding
    modals/
      NodeModal.jsx        — full editor modal (⊞ button opens this)
      AddModal.jsx         — add a new tree item
      EstimationWizard.jsx — PERT 3-point wizard
      SettingsModal.jsx    — theme, file handle, etc.
      DLModal.jsx          — deadline editor
      NewProjModal.jsx     — new-project wizard
    shared/
      SearchSelect.jsx     — searchable dropdown (used everywhere >5 items)
      LazyInput.jsx        — debounced text input for perf in long lists
      Tooltip.jsx          — shared tooltip component
      Badges.jsx           — status/severity/priority badges
  utils/
    scheduler.js           — auto-scheduling engine + computeConfidence() — see docs/scheduler.md
    cpm.js                 — critical path method, global + per-goal
    date.js                — date arithmetic helpers (addD, iso, etc.)
    holidays.js            — NRW holiday algorithm + week grid builder
    fileHandleStore.js     — File System Access API persistence layer
    exports.js             — all export functions (CSV, Sprint MD, Mermaid, SVG, PNG, PDF)
    markdown.js            — Markdown serialization (parseMdToProject, buildMarkdownText)
    report.js              — HTML report generation (bilingual, auto-print)
  i18n.jsx                 — internationalization: ~350 keys, React context, useT() hook
docs/                      — this directory
data/                      — gitignored private project data
```

## State flow

Top-level in `App.jsx`:

```
data (one object in useState)
  ├── meta
  ├── teams
  ├── members
  ├── tree
  ├── vacations
  └── holidays
```

Derived values via `useMemo`:

- `goals` — tree roots with a `type`
- `scheduled` — scheduler output
- `stats` — `treeStats(tree) + enrichParentSchedules`
- `cpSet` — global CPM critical set
- `goalPaths` — per-goal CPM
- `leaves` — `leafNodes(tree)`
- `shortNamesMap` — member short-name lookup
- `weeks` — week grid from the scheduler
- `confidenceMap` — per-item confidence (auto-derived via `computeConfidence()`, with manual overrides)

Every mutation goes through `setData(d => ...)` with a functional updater. Functions like `updateNode`, `removeDep`, `addDep` always read the latest tree state from the functional updater argument — no stale-closure overwrites.

## Auto-save loop

```
user edits tree
  → setData(...)
  → useEffect on `data`
  → if file handle exists: write to disk (debounced)
  → setSaved(true)
```

External file change detection runs on a 5 s `setInterval`:

```
every 5s:
  stat(mounted file).lastModified
  if newer than lastSavedAt:
    read file, parse, setData
    setLastSavedAt = file.lastModified
```

## Critical path

[cpm.js](../src/utils/cpm.js) runs twice:

- **Global** — over all leaves, treating the whole tree as one DAG. Result: `cpSet` — Set of IDs on the critical path.
- **Per-goal** — for each tree root, CPM restricted to leaves under that root. Result: `goalPaths` — `{ rootId: Set<id> }`.

Both use earliest-start / latest-finish forward/backward passes. Slack is zero on the critical path, positive everywhere else.

## Confidence model

Three levels: **committed**, **estimated**, **exploratory**. Computed automatically by `computeConfidence()` in `scheduler.js` based on whether a task has an assignee, an estimate, and low risk indicators. Can be overridden manually via the `confidence` field on any item. Parents inherit the worst confidence from their children (exploratory > estimated > committed). The confidence map feeds into the Gantt (bar styling, horizon lines, legend) and the Planning Review tab.

## Internationalization (i18n)

`src/i18n.jsx` provides a lightweight translation system with ~350 keys. Uses React context and a `useT()` hook. Language selector in Settings: Auto / English / Deutsch. "Auto" follows `navigator.language`. No external library (no i18next, no react-intl). When adding new user-facing strings, add both EN and DE keys.

## Theme system

Manual Dark / Light / Auto toggle in Settings. The selected theme is stored in `localStorage`. CSS switches via the `data-theme` attribute on `<html>` (`"light"` or `"dark"`). "Auto" follows `prefers-color-scheme`. All color values use CSS custom properties (`--bg`, `--tx`, `--ac`, etc.).

## Code split (exports)

Export-related logic has been extracted from `App.jsx` into dedicated modules:

- `src/utils/exports.js` — CSV, Sprint MD, Mermaid, SVG, PNG, PDF export functions
- `src/utils/markdown.js` — Markdown parsing (`parseMdToProject`) and writing (`buildMarkdownText`)
- `src/utils/report.js` — HTML report generation (bilingual, opens in new tab, auto-triggers print)

## Design decisions (non-obvious)

- **Plain JS, not TypeScript** — keeps the file count and mental load low. The field names in [data-model.md](data-model.md) are the contract.
- **No Redux / no Zustand** — state is small and rarely contended. One `data` object + `setData` is enough.
- **No PropTypes** — prop shapes are self-documenting through destructuring at the top of each component.
- **Functional `setData` updaters everywhere** — avoids stale-closure bugs in mutation callbacks that fire in rapid succession (e.g. deleting two Gantt arrows in the same tick).
- **Targeted mutation helpers (`removeDep`, `addDep`)** — touch only the fields they own. Never overwrite an entire node object based on a stale snapshot.
- **No tests** — manual QA in the browser; no test suite to maintain.
- **Module size target: &lt; 400 LOC** — not strictly enforced. `App.jsx` and `NetGraph.jsx` are currently larger; splits are on the backlog.

## Known issues / backlog

See [scheduler.md](scheduler.md#known-limitations) for scheduler-specific items. Other open items:

- **App.jsx and NetGraph.jsx are &gt; 400 LOC** — should be split
- **Dark-mode palette needs a proper WCAG-AA pass** — currently iterated into shape, not designed
- **One-member-one-team** — members can't have different capacities per team
- **Day-level scheduler granularity** — currently weekly

## Deployment

`npm run build` outputs to `dist/`. The `gh-pages` workflow in `.github/workflows/` publishes it to the `gh-pages` branch. The site is served at `/planr/` (match `vite.config.js`).

Public hosted app: **https://codingsteve01.github.io/planr**

For a dev loop: `npm run dev`. Note: we leave the dev server management to the user — don't start a second Vite instance.
