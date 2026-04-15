# Architecture

Client-only SPA. No backend, no bundler lock-in beyond Vite, no TypeScript, no test suite. The design goals are: understandable in one sitting, hackable without ceremony, deployable as static files.

## Tech stack

| Aspect | Detail |
|---|---|
| Framework | Vite 6 + React 18 |
| Language | JavaScript (ES modules) — no TypeScript, no PropTypes |
| Styling | CSS with theme variables (`--bg`, `--tx`, `--ac`, etc.); dark + light palettes |
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
    scheduler.js           — auto-scheduling engine — see docs/scheduler.md
    cpm.js                 — critical path method, global + per-goal
    date.js                — date arithmetic helpers (addD, iso, etc.)
    holidays.js            — NRW holiday algorithm + week grid builder
    fileHandleStore.js     — File System Access API persistence layer
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
- **Gantt zoom buttons not wired** — state and handler exist, UI control missing
- **One-member-one-team** — members can't have different capacities per team
- **Day-level scheduler granularity** — currently weekly

## Deployment

`npm run build` outputs to `dist/`. The `gh-pages` workflow in `.github/workflows/` publishes it to the `gh-pages` branch. The site is served at `/planr/` (match `vite.config.js`).

For a dev loop: `npm run dev`. Note: we leave the dev server management to the user — don't start a second Vite instance.
