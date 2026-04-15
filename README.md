# Planr

**Offline-first project scheduling tool with auto-scheduling, critical path analysis, and network graph visualization.**

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![React 18](https://img.shields.io/badge/React-18-61dafb.svg)
![Vite 6](https://img.shields.io/badge/Vite-6-646cff.svg)
![No Backend](https://img.shields.io/badge/backend-none-green.svg)

<!-- screenshots -->

## Features

- **N-level work breakdown tree** — unlimited nesting of goals, causes, measures, and tasks
- **Goals / Painpoints / Deadlines** — focus items pinned to tree roots to drive analysis
- **Auto-scheduler** — resource-based, capacity-aware, vacation-aware scheduling engine
- **Critical path analysis** — global and per-goal CPM with slack calculation
- **Network graph** — bin-packed layout with TD/BU flip and obstacle-aware edge routing
- **Gantt chart** — drag-to-reorder, team color coding
- **Progress tracking** — leaf-level input with automatic cascading to parents
- **Multi-select bulk editing** — apply changes to many nodes at once
- **Markdown + JSON import/export** — interoperable project files
- **Auto-save with file mount** — File System Access API for seamless `.json`/`.md` persistence
- **External file change detection** — picks up edits made outside the app
- **Dark / Light mode** — full theme support
- **NRW holiday calendar** — built-in German NRW public holidays for scheduling
- **Estimation Wizard** — PERT 3-point estimation (optimistic, likely, pessimistic)
- **Export** — SVG, CSV, JSON, Markdown, and Print

## Quick Start

```bash
git clone <repo-url> planr
cd planr
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## User Guide

### Creating a Project

The new-project wizard walks through three steps:

1. **Basics** — project name, start date, description
2. **Teams** — define teams with colors and add members (capacity, vacation, role)
3. **Goals** — create top-level goals, painpoints, or deadlines

### Top-Down Analysis Flow

Planr follows a structured breakdown approach:

**Goal → Causes → Measures → Tasks**

Start with a high-level goal or painpoint, break it into causes, derive measures for each cause, then decompose measures into estimatable tasks.

### Estimating

- **T-shirt sizes** — set `best` (optimistic days) and `factor` (complexity multiplier, default 1.5) on leaf tasks
- **PERT Wizard** — enter optimistic, most likely, and pessimistic estimates; the wizard calculates the weighted expected duration

### Scheduling

1. Assign team members to leaf tasks
2. Run **Auto-schedule** — the engine respects capacity, vacations, dependencies, and priorities
3. Review the Gantt chart and network graph for the resulting plan

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save project |
| `Esc` | Deselect graph / close modal |
| `Delete` | Remove selected node |

## Architecture

| Aspect | Detail |
|---|---|
| Framework | Vite 6 + React 18 |
| Language | JavaScript (ES modules, no TypeScript) |
| Styling | CSS (dark/light theme via CSS variables) |
| Storage | `localStorage` + File System Access API (`.json` / `.md`) |
| Backend | None — fully client-side |

### Key Modules

| File | Purpose |
|---|---|
| `src/App.jsx` | Main application shell, state management |
| `src/utils/scheduler.js` | Auto-scheduling engine (resource allocation, capacity) |
| `src/utils/cpm.js` | Critical path method, global + per-goal |
| `src/components/views/NetGraph.jsx` | Network graph with bin-packed layout |
| `src/components/views/TreeView.jsx` | Work breakdown tree |
| `src/components/views/GanttView.jsx` | Gantt chart |
| `src/components/views/ResView.jsx` | Resource / team view |
| `src/components/modals/EstimationWizard.jsx` | PERT 3-point estimation |

Source files target **< 400 LOC** each.

## Data Model

### Tree Item

```js
{
  id,          // hierarchical dot-notation ("1", "1.1", "1.1.3")
  name,        // display label
  status,      // e.g. "open", "active", "done"
  team,        // assigned team id
  best,        // optimistic effort in days
  factor,      // complexity multiplier (default 1.5)
  prio,        // priority (lower = higher priority)
  deps,        // dependency ids (array)
  assign,      // assigned member id(s)
  progress,    // 0–100, auto-cascaded for parents
  type?,       // "goal", "painpoint", "deadline", "cause", "measure"
  severity?,   // severity level for painpoints
  date?,       // target date for deadlines
  description? // rich text / notes
}
```

### Member

```js
{ id, name, team, role, cap, vac, start }
// cap  = capacity (fraction, e.g. 1.0 = full-time)
// vac  = vacation periods
// start = availability start date
```

### Team

```js
{ id, name, color }
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Make your changes
4. Test in the browser — there is no test suite, manual QA is expected
5. Open a pull request

### Code Style

- **Terse JSX** — minimal verbosity, functional components, hooks only
- **No TypeScript, no PropTypes** — plain JavaScript throughout
- **Module size** — keep each file under 400 LOC; split when it grows
- **ES modules** — `import`/`export`, no CommonJS

## License

MIT
