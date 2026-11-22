# UI inventory

This file lists the controls that frame the app: the topbar, the File menu, the tab bar, the sub-toolbar, the modals and the global keys. It names the source file for each, so a reader can find the code. Details of each view are in [features.md](features.md), [gantt.md](gantt.md) and [network-graph.md](network-graph.md).

UI labels are quoted in English. Every label also has a German translation in `src/i18n.jsx`.

There are no modes. All eleven views are tabs, and every tab is always available.

---

## Topbar

The topbar has a file group on the left (`src/components/app/TopBarFile.jsx`) and a state and command group (`src/components/app/TopBarState.jsx`).

### File group

| Element | What it does |
|---|---|
| "Planr." wordmark | Names the app. It is hidden when a host such as the Obsidian plugin already names the surface. It is not a button. |
| Plan name and save dot | Shows the project name. The dot is green when everything is saved and amber when it is not. |
| File name and disk icon | Shows the mounted file's name. The disk icon appears while changes are unsaved, and saves at once. |
| Auto-save toggle | Turns automatic saving on or off. |
| Status pill | Says where saving stands: `no file mounted`, `click to re-mount`, `auto-save off`, `saving…`, `all saved · time` or `unsaved · saving in Ns`. Clicking it when permission is lost opens Save as. |

### State and command group

| Element | What it does |
|---|---|
| Scenario switch | Switches between the plan and its scenarios, and creates, duplicates, renames or deletes one. It is not shown while an earlier day is on screen. |
| Earlier-day switch | Picks the day the plan is shown on. It is quiet while the day is today, and it cannot travel while a scenario is open. |
| Undo and redo buttons | Step through the edit history. They are greyed out when there is nothing to step through. |
| Plan counts | "N scheduled · N/N done", plus a dropped count when there is one. Shown on the Overview and the Report tabs only. |
| File menu | See below. |
| `/` button | Opens the command palette. |
| Gear button | Opens the settings (`⌘,`). |

### File menu

`src/components/shared/FileMenu.jsx`. The trigger shows a dot while there are unsaved changes.

| Entry | What it does |
|---|---|
| Load file… | Opens a file picker (`⌘O`). |
| Save as… | Saves under a new name or format (`⇧⌘S`). |
| Snapshots | Opens the snapshot dialog, where an earlier JSON snapshot can be restored. |
| Earlier day entry | Opens the earlier-day picker. |
| Export… | Opens the Report tab (`⌘E`). |
| Jira import | Opens the Jira import dialog. |
| New project | Starts a new project, after a confirm when there are unsaved changes. |

The command palette (`/` or `⌘K`) carries the same actions and jumps to any tab.

---

## Tab bar

`src/components/app/TabBar.jsx`, with the ids and their order in `TAB_IDS` in `src/utils/modes.js`.

| Tab | View |
|---|---|
| Overview | `SumView.jsx` — the subway map |
| Work Tree | `TreeView.jsx` — the one place the plan is edited |
| Work order | `WorkOrderView.jsx` — the order each person or team works in |
| Schedule | `GanttView.jsx` |
| Roadmap | `PlanRoadmap.jsx` — one project as a calendar |
| Briefing | `BriefingView.jsx` — the day, the attention list, the Jira drift section |
| Planning | `PlanReview.jsx` |
| Network | `NetGraph.jsx` |
| Resources | `ResView.jsx` |
| Holidays | `HolView.jsx` |
| Report | `ReportView.jsx` — the export cards |

The timetable (`TimetableView.jsx`) is drawn inside the Overview by `RoadmapSwitcher.jsx`. It has no tab of its own.

---

## Sub-toolbar

`src/components/app/FilterBar.jsx`. It is shown on Overview, Work Tree, Work order, Schedule, Roadmap, Briefing, Planning and Network (`FILTERED_TABS` in `src/app/shell.js`). It is not shown on Resources, Holidays or Report.

| Element | What it does |
|---|---|
| Active-filter chips | One chip per scope or quick filter that is on. A click clears it. |
| ⚙ Filter | Opens the filter popup (`src/components/shared/ViewFilters.jsx`): project, team and person scope, the quick filters, the Δ Review window, the Plan horizon and the archive threshold. |
| Search box | Shown on Work Tree, Work order, Schedule and Network (`SEARCH_TABS`). `⌘F` focuses it. The `▲`/`▼` buttons and `⌘↑`/`⌘↓` step through matches on Schedule and Network only (`MATCH_STEP_TABS`). |
| "+ Add item" | Opens the Add dialog. Shown on the Work Tree only. |

---

## Work Tree

| Element | What it does |
|---|---|
| Row buttons | Edit (opens the full editor), `+` (new row below), child button (new child). |
| Selection bar | Appears when rows are selected: rename, full edit, new row, new child, first, up, down, last, outdent, indent and delete. |
| Side panel | QuickEdit for the active row. The settings choose whether the editor is a side panel, a dialog or follows the width. |

The keys are in [features.md](features.md#keyboard-shortcuts).

## Schedule

The bars can be dragged to pin a start, and a bar's right-edge handle drags a dependency. The Gantt has no right-click menu. Selecting bars opens a selection bar (`src/components/views/gantt/GanttSelectionBar.jsx`) with the assign dialog. See [gantt.md](gantt.md).

## Network

The only right-click menu in the app is on a network node. When the plan has more than 140 items and no filter is set, the graph shows a note with a project picker and a "Draw all of it anyway" button. See [network-graph.md](network-graph.md).

## Overview

The subway map has zoom controls. With the Δ Review window on, the Δ banner and the Review · Estimate vs actual band appear above it. See [user-guide.md](user-guide.md#8-review-the-result).

---

## Modals

| Modal | File | Opened from |
|---|---|---|
| Add item | `src/components/modals/AddModal.jsx` | "+ Add item" |
| Item editor | `src/components/modals/NodeModal.jsx` | the full-edit buttons |
| Estimation wizard | `src/components/modals/EstimationWizard.jsx` | the estimate button in the editor |
| Assign | `src/components/modals/AssignModal.jsx` | the Gantt selection bar |
| New project | `src/components/modals/NewProjModal.jsx` | File menu, empty state |
| Jira import | `src/components/modals/JiraImportModal.jsx` | File menu, empty state, palette |
| Jira export | `src/components/modals/JiraExportModal.jsx` | the Jira export card |
| Export | `src/components/modals/ExportModal.jsx` | the palette |
| Snapshots | `src/components/modals/SnapshotModal.jsx` | File menu, palette |
| Settings | `src/components/modals/SettingsModal.jsx` | the gear, `⌘,` |

---

## Global keys

`src/app/useGlobalKeys.js`, `src/components/shared/CommandPalette.jsx` and the labels in `src/utils/shortcuts.js`.

| Key | Action |
|---|---|
| `⌘S` | Save now |
| `⇧⌘S` | Save as |
| `⌘O` | Open a file |
| `⌘E` | Open the Report tab |
| `⌘,` | Open the settings |
| `⌘K` or `/` | Command palette |
| `?` | Keyboard map |
| `⌘F` | Focus the search box |
| `⌘↑` / `⌘↓` | Previous / next match (Schedule and Network) |
| `⌘Z` / `⇧⌘Z` | Undo / redo |

`⌘O`, `⌘E` and `⌘,` do nothing while a text field has the keyboard.
