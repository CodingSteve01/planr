# Planr

**Offline-first project scheduling tool with auto-scheduling, critical path analysis, and network graph visualization.**

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![React 18](https://img.shields.io/badge/React-18-61dafb.svg)
![Vite 6](https://img.shields.io/badge/Vite-6-646cff.svg)
![No Backend](https://img.shields.io/badge/backend-none-green.svg)

## What it is

Planr turns a work breakdown tree into an auto-scheduled plan. You write goals, break them into tasks, assign people, declare dependencies — Planr schedules everything respecting capacity, vacations, holidays, and pinned dates, and highlights the critical path.

No backend, no accounts, no cloud sync. A static React SPA that persists to `localStorage` or a local `.json` / `.md` file via the File System Access API.

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

### For developers

- **[docs/architecture.md](docs/architecture.md)** — modules, tech stack, design decisions, backlog
- **[docs/scheduler.md](docs/scheduler.md)** — the auto-scheduling algorithm in detail
- **[docs/data-model.md](docs/data-model.md)** — full schema for tree items, members, teams, etc.
- **[docs/contributing.md](docs/contributing.md)** — dev setup, code style, PR workflow

## Feature highlights

- **N-level work breakdown** — unlimited nesting, goals / painpoints / deadlines as tree roots
- **Auto-scheduler** — capacity-aware, vacation-aware, holiday-aware (NRW preset built in)
- **Critical path analysis** — global and per-goal, with slack calculation
- **Planning confidence model** — three levels (committed / estimated / exploratory) with auto-derivation, manual override, and visual differentiation in the Gantt chart
- **Planning review tab** — guided workflow for assigning people, spotting open phases, checking team capacity, and working per-person TODO lists
- **Gantt chart** — drag-to-pin, draggable dependency links, bezier arrows, click-to-remove, deadline flags with backfill, horizon lines, confidence-based bar styling, weighted phase overlays
- **Network graph** — bin-packed layout, obstacle-aware edge routing, fit-to-selection
- **QuickEdit sidebar + NodeModal** — tabbed quick edit, visible "Estimate now" CTA, searchable dropdowns
- **Markdown + JSON** — fully functional round-trip for both formats
- **Auto-save** — File System Access API, external change polling, mounts either format
- **Multi-select bulk editing** — Ctrl+Click toggles, Shift+Click range, batch confidence assignment
- **PERT Estimation Wizard** — 3-point (optimistic, likely, pessimistic) with workflow template selection directly in the wizard
- **Bilingual (EN/DE)** — full i18n with language selector in settings, ~350 translated strings
- **Dark / light mode** — manual toggle (Auto / Dark / Light) in settings
- **Project report export** — comprehensive HTML report (PDF via print) with executive summary, roadmap, team capacity, critical path, and open decisions

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
