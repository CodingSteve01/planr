# Architecture

Client-only SPA. No backend, no bundler lock-in beyond Vite, no TypeScript. The design goals are: understandable in one sitting, hackable without ceremony, deployable as static files.

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
      JiraSyncModal.jsx    — Jira reconcile (link check + paste-and-compare)
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
    scheduler.js           — auto-scheduling engine + computeConfidence() + the tree index
    archive.js             — which roots / members are long-finished ("old news"); display filter only
    exportCtx.js           — exports read the PLAN, never the filtered view (buildExportCtx)
    projectRoadmap.js      — single-project roadmap: calendar rows instead of a metro line
    jiraSync.js            — Jira table parsing + plan-vs-board reconciliation
    cpm.js                 — critical path method, global + per-goal
    date.js                — date arithmetic helpers (addD, iso, etc.)
    holidays.js            — NRW holiday algorithm + week grid builder
    fileHandleStore.js     — File System Access API persistence layer
    exports.js             — all export functions (CSV, Sprint MD, Mermaid, SVG, PNG, PDF)
    markdown.js            — Markdown serialization (parseMdToProject, buildMarkdownText)
    report.js              — HTML report generation (bilingual, auto-print) + buildReportModel()
    pdfExports.js          — pdfmake exports (Management Summary, Gantt, TODO, What-comes-when)
    progress.js            — single source of truth for aggregate progress % / PT + formatting
                             (aggregateProgressPct is THE percentage for any multi-task scope;
                              scheduler.treeStats imports it back — a deliberate call-time cycle)
    timeline.js            — node period/planned/actual windows + deadlineStatus() state machine
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
- `archive` — `scanArchive({tree, members, days})`: long-finished roots + long-offboarded members
- `activeTree` / `activeScheduled` / `activeMembers` — the archive-filtered copies the views render

### Mutations and undo

Every write to `data` falls into one of two buckets, and the difference is load-bearing — mixing them up either pollutes the undo stack or lets ⌘Z corrupt derived state:

- **User-initiated** — the user asked for this change (edited a field, deleted a node, dragged a slider, reconciled with Jira…). These route through one helper, `mutate(updater)`: it pushes the current `data` onto the undo history, then calls `setData(updater)`, then `setSaved(false)`. `setD(key, value)`, `updateNode`, `addDep`/`removeDep`, `reorderSibling`, and the rest of the per-field/per-entity mutators all call `mutate` instead of `setData` directly.
- **Automatic** — the app derived this change from something else the user did, and it always runs unprompted from a `useEffect`: parent-status derivation (`deriveParentStatuses`), the completion-metadata sync (stamping `completedStart`/`completedEnd` when a leaf's status/progress imply it), the Subway-Map's `roadmapAssignment` merge, holiday/deadline migrations, and the autosave history-event append. These stay on plain `setData` (no `setSaved(false)` pairing where the write is purely derivable, or the pairing exists but skips `mutate`). If these pushed onto the undo stack, a single ⌘Z after an unrelated edit could "undo" a derivation the tree still needs — e.g. reverting a status without reverting the progress that implied it — landing the plan in a state that could never have been reached by editing it. Effects are also comparatively chatty (they re-run on every relevant dependency change), which would flood the stack with entries the user never asked for.

The undo history itself (`src/utils/undo.js`) is a small, pure `{ past, future }` model — `push`/`undo`/`redo`/`canUndo`/`canRedo` — with no dependency on React. Snapshots are the previous `data` object *references*, never deep clones: because every mutator already does `{ ...d, changedPart }` instead of touching `d` in place, two adjacent snapshots share every branch that didn't change, so keeping 100 of them costs little more than keeping one. `push` coalesces calls that land within 300 ms of each other into a single entry, so a progress-slider drag or a burst of status clicks costs the user one ⌘Z, not one per event; any *new* push clears the redo branch, same as every other editor.

Loading a different document — opening a file, starting a new project, restoring a JSON snapshot — calls `resetHistory()` alongside `setData(...)`. The old undo stack describes edits to a document that's no longer on screen; keeping it around would let ⌘Z reach back into a plan you already closed.

### Display filters vs. facts

`tree`, `stats`, `scheduled` and `goals` always describe the **whole** plan. The
filters (`hideDone`, the archive filter, root/team/person) produce *separate*
derived copies (`activeTree` → `visibleTree` → `visibleTreeForViews`) that only
the views consume. Aggregates therefore never move when the user changes what
is on screen — archiving a finished project must not make the project look less
finished. The one deliberate exception is `viewStats`, which re-aggregates for
the hide-done tree so a filtered view can still show sub-totals for what it
renders.

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

## Tree index (why the app stays responsive)

`isLeafNode`, `hasChildren`, `directChildren`, `leafNodes` and
`resolveToLeafIds` in [scheduler.js](../src/utils/scheduler.js) are called from
inside loops all over the app. Each one used to re-scan the whole tree array,
so the callers multiplied out badly — `treeStats` rebuilt the entire leaf list
once per parent node, making it **O(n³)**, and the roadmap model resolved leaves
per node the same way. On a 250-item plan one recompute cost ~2.3 s, and every
edit triggered two of them (the derive memos plus the `deriveParentStatuses`
effect). That is what "the whole app hangs" was.

`treeIndex(tree)` derives the structure once — `byId`, `childIds`, the leaf
list, and a memoized descendant-leaf list per node — and caches it in a
`WeakMap` keyed by the **array identity**. Every mutation here produces a new
array (functional `setData` + `map`/`filter`), so a changed tree can never hit a
stale entry, and old trees stay collectable. Same public signatures, same
results, same ordering; the helpers just consult the index.

Measured on a 248-node plan (`src/utils/__tests__/treeIndex.test.js` guards it):

| | before | after |
|---|---|---|
| `treeStats` | 673 ms | 0.8 ms |
| `computeRoadmapModel` | 783 ms | 4.2 ms |
| `rootCpm` | 123 ms | 1.0 ms |
| `computeConfidence` | 27 ms | 0.3 ms |
| `scanArchive` | 14 ms | 0.1 ms |
| whole chain | **~2.3 s** | **~7 ms** |

Two rules follow from this:

- **Never mutate a tree array in place** once it is (or is about to become)
  state. The parser in `App.jsx` pushes into a local array, which is fine
  because nothing reads an index off a half-built tree.
- **Do not mutate what these helpers return.** `leafNodes` and
  `descendantLeaves` hand back the cached arrays; copy before sorting.

## Export scope

Views render filtered copies of the tree; exports must not. The guarantee is
structural, in [exportCtx.js](../src/utils/exportCtx.js):

- `buildExportCtx({ data, scheduled, … })` derives `tree`, `members`, `teams`,
  `vacations`, `meta` and `roadmapAssignment` **from `data`**. `App._exportCtx`
  deliberately does not pass them, so `activeTree` / `visibleTree` cannot reach
  an export by accident.
- `projectScopedCtx(ctx, label)` runs at the entry of all four PDFs and of
  `buildReportModel` (which the HTML report and the DOCX export both route
  through). A hand-built ctx carrying a filtered tree is repaired, not
  rejected — the user asked for a document, and the correct document is the
  complete one — and the repair is logged.
- `scheduled` / `stats` / `cpSet` / `goalPaths` cannot be re-derived here (they
  need the scheduler, holidays and work days). They are computed from the full
  tree in `App.jsx`, and [exportScope.test.jsx](../src/__tests__/exportScope.test.jsx)
  pins the result: with filters active, every surface still prints the
  full-plan figure, and each PDF is byte-identical when handed a filtered ctx.

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
- **Vitest, not a test pyramid** — pure logic (`src/utils/__tests__/`) is tested directly; views get happy-dom smoke and behaviour tests (`src/__tests__/`) for the invariants that keep breaking silently — progress/export parity, filter scoping. Everything else is manual QA in the browser. `npm test` runs the suite.
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
