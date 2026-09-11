# Planr

**Offline-first project scheduling tool with auto-scheduling, critical path analysis, and network graph visualization.**

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![React 18](https://img.shields.io/badge/React-18-61dafb.svg)
![Vite 6](https://img.shields.io/badge/Vite-6-646cff.svg)
![No Backend](https://img.shields.io/badge/backend-none-green.svg)

## What it is

Planr turns a work breakdown tree into an auto-scheduled plan. You write goals, break them into tasks, assign people, declare dependencies — Planr schedules everything respecting capacity, vacations, holidays, and pinned dates, and highlights the critical path.

No backend, no accounts, no cloud sync. A static React SPA that persists to `localStorage` or a local `.json` / `.md` file via the File System Access API.

> **Desktop-first.** Planr is optimized for large screens and keyboard/mouse interaction. It is not intended for mobile use.

## Start instantly (no local setup)

You can use Planr directly in the browser:

- **https://codingsteve01.github.io/planr**

No local server required.

## Quick start

```bash
git clone https://github.com/CodingSteve01/planr planr
cd planr
npm install
npm run dev
```

Open [http://localhost:5173/planr/](http://localhost:5173/planr/).

From zero to a plan: **New Project Wizard → add members → build the tree → estimate leaves → assign people → review the Gantt**. Step-by-step in [docs/user-guide.md](docs/user-guide.md).

## Documentation

Everything lives in [docs/](docs/). This README is an index.

### For users

- **[docs/user-guide.md](docs/user-guide.md)** — end-to-end workflow, from new project to saved plan
- **[docs/features.md](docs/features.md)** — full feature catalog
- **[docs/gantt.md](docs/gantt.md)** — Gantt chart: drag-to-pin, link handles, dependency arrows, deadline flags, critical path
- **[docs/network-graph.md](docs/network-graph.md)** — network graph: layout, zoom, fit-to-selection
- **[docs/import-export.md](docs/import-export.md)** — JSON, Markdown, CSV, Sprint MD, Mermaid, SVG, PNG, round-trip caveats

The Roadmap view (metro-style SVG map) is documented in [docs/features.md](docs/features.md) under "Views and navigation" and in [docs/user-guide.md](docs/user-guide.md#8-review-the-result).

### Where the app is going

- **[docs/principles.md](docs/principles.md)** — the eight principles, the five modes, design language, roadmap lenses, and the rebuild order. Every proposal is read against this first.
- **[docs/ui-inventory.md](docs/ui-inventory.md)** — every control the app has today, assigned to a mode and a visibility tier — or marked as removed.

### For developers

- **[docs/architecture.md](docs/architecture.md)** — modules, tech stack, design decisions, backlog
- **[docs/scheduler.md](docs/scheduler.md)** — the auto-scheduling algorithm in detail
- **[docs/data-model.md](docs/data-model.md)** — full schema for tree items, members, teams, etc.
- **[docs/contributing.md](docs/contributing.md)** — dev setup, code style, PR workflow

## Feature highlights

### What makes Planr different

- **Offboard-Cascade (unique)** — when a person's contract ends mid-task, the scheduler automatically hands the remainder to the next free same-team member, falling back to cross-team and finally to a hatched unscheduled tail. Each offcut is an independent scheduled row: filterable, editable, exportable. Override per stage via `handoffPlan` on the task.
- **Transparent capacity from meetings (unique)** — cap isn't a made-up percentage. Define a team-level or member-level meeting plan (daily standup, biweekly retro, monthly all-hands…) and the scheduler subtracts their weekly-equivalent hours from the 40 h FTE baseline. Auditable, honest, and inherits through team assignment.
- **Real-vector PDF + DOCX exports** — management summary, hi-res Gantt, horizon-aware "What comes when", and per-person TODO PDFs, generated via pdfmake (selectable text, real tables). Word export via html-to-docx for Confluence import — keeps the subway chart, team capacity cards, critical path.
- **Horizon-aware dates** — near-term items render exact dates, mid-term compress to weeks, far-term to months, exploratory to quarters. Honest granularity — don't pretend precision that isn't there.
- **Metro-style Roadmap** — SVG subway map: each project is a colored line, stations are milestone clusters, a pulsing train shows effort-weighted progress. Exports vector-clean into PDF. Pick one project and it switches to a real per-project roadmap: packages as calendar rows, tasks as stops, today and the deadline as lines.
- **Jira reconcile (not just export)** — paste a Jira table (CSV, TSV or a copied search result, EN or DE headers) and get the drift: status differences you can accept per row, renamed tickets, tickets nobody planned, plan items no longer in Jira. Plus a paste-free check for open work without a ticket and keys used twice.
- **Archive filter** — projects finished long ago and people who left long ago drop off the map, tree, Gantt and dropdowns by default, without leaving the totals. A finished project stays 100 % finished; only the screen gets quieter.
- **Exports can't ship a subset** — the display filters are structurally unable to reach a PDF, the HTML report or the Word export: the export context reads the plan from the store, not from the view, and a test asserts each PDF is byte-identical when handed a filtered one.

### Standard planner features

- **N-level work breakdown** — unlimited nesting, goals / painpoints / deadlines as tree roots
- **Auto-scheduler** — capacity-aware, vacation-aware, holiday-aware (NRW preset built in), dep-ordered, pinned-aware
- **Critical path analysis** — global and per-goal, with slack calculation
- **Planning confidence model** — committed / estimated / exploratory with auto-derivation, manual override, visual differentiation in Gantt
- **Planning review tab** — assign people, spot open phases, check team capacity, per-person TODO lists
- **Gantt chart** — drag-to-pin (day accuracy), draggable dependency links, bezier arrows, deadline flags with backfill, horizon lines, confidence-based bar styling, weighted phase overlays, multi-segment handoff bars
- **Network graph** — bin-packed layout, obstacle-aware edge routing, fit-to-selection
- **QuickEdit sidebar + NodeModal** — tabbed quick edit, "Estimate now" CTA, searchable dropdowns with full keyboard nav, handoff-plan editor that deep-links from handoff bars
- **Markdown + JSON round-trip** — meeting plans, handoff plans, offboarding dates, all persisted
- **Auto-save** — File System Access API, external change polling, auto-mount of `.md`/`.json`
- **Multi-select bulk editing** — Ctrl+Click toggles, Shift+Click range
- **Multi-assignee tasks** — pair programming; scheduler rescues remainder via co-assignee on offboarding
- **PERT Estimation Wizard** — 3-point with workflow template selection
- **Global search** — Ctrl/Cmd+F with cycling, debounced propagation, keyboard-nav in all SearchSelects
- **Bilingual (EN/DE)** — full i18n with language selector
- **Dark / light mode** — manual toggle (Auto / Dark / Light)
- **Unit tests** — `npm test` runs vitest suites covering capacity, scheduler (cascade, cross-team, cycles, pinned, parallel, multi-assign, dep regressions), handoff chain rendering, date helpers, archive/Jira reconcile logic, view filter scoping, screen-vs-export parity, and a derive-cost guard rail so the tree helpers can't go quadratic again

Full list in [docs/features.md](docs/features.md).

## Tech

- Vite 6 + React 18, plain JavaScript (no TypeScript, no PropTypes)
- CSS with theme variables, dark + light mode via `data-theme` attribute
- Lightweight i18n system (no external library, ~350 keys in `src/i18n.jsx`)
- `localStorage` + File System Access API (no server)
- Deployed to GitHub Pages via `gh-pages` branch

See [docs/architecture.md](docs/architecture.md) for details.

## Status

Actively developed. Known limitations and backlog items are listed in the respective doc files, notably [docs/scheduler.md#known-limitations](docs/scheduler.md#known-limitations) and [docs/architecture.md#known-issues--backlog](docs/architecture.md#known-issues--backlog).

## License

[MIT](LICENSE)
