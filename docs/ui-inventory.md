# UI inventory

This file is a complete inventory of every user-facing control in Planr, as it exists in the code today. It is the decision basis for assigning each control to a mode (Build / Plan / Run / Review / Report / Settings) and a visibility tier (1/2/3) — it is **not** a spec, and it proposes no new features.

UI labels are quoted in English (the app's default language; every label also has a German translation in `src/i18n.jsx`) — everything in this document is written in English.

## Modes

| Mode | Moment | Intent |
|---|---|---|
| Build | at the desk | capture work items, build structure, set order and priorities (bottom-up and top-down) |
| Plan | planning round | who, when, capacity, deadlines |
| Run | daily/standup | what's up today, who's stuck, set status, Jira drift |
| Review | retro/status meeting | what happened since X, estimate vs. actual |
| Report | before the steering committee | one document that works without the author |

Tier 3 is **Settings** (Resources, Holidays, Templates, Sizes, Risks, Custom Fields, File/Save — these are maintenance, not modes). A control that should be removed is marked **remove**.

Flags: `⚠` writes data outside the tree · `↔` duplicates … · `🔧` mechanics exposed.

---

## Topbar

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Logo "Planr." click | Starts a new project (discards current after confirm) | src/App.jsx:2759 | remove | — | ↔ duplicates the "New" button (App.jsx:2821) |
| 💾 inline save button (shown only once a file is mounted and unsaved) | Saves immediately to the mounted file, bypassing the debounce | src/App.jsx:2767 | Settings | 1 | ↔ duplicates "Save as" and Ctrl/Cmd+S |
| Auto-save toggle | Turns automatic file-saving on/off | src/App.jsx:2769-2772 | Settings | 2 | |
| Status pill (save state) | Shows save status; clickable to re-mount the file after a permission loss | src/App.jsx:2773-2808 | Settings | 1 | 🔧 mechanics exposed (File System Access handle/permission state) |
| "reload" link (external change) | Reloads the project from the file on disk, discarding in-memory state | src/App.jsx:2804 | Settings | 2 | ⚠ writes data outside the tree — replaces the whole tree |
| × dismiss external-change notice | Hides the "file changed" hint | src/App.jsx:2805 | Settings | 2 | |
| ⚙ Settings button | Opens SettingsModal | src/App.jsx:2812 | Settings | 1 | |
| "? Tour" help button | Starts the onboarding tour | src/App.jsx:2813-2814 | Settings | 2 | reviewed: not a removal — the tour is a capability with no duplicate, so it moves to the palette/gear rather than disappearing |
| Load button | Opens a file picker to load a project | src/App.jsx:2816 | Settings | 1 | |
| ↶ Snapshots button | Opens SnapshotModal (recovery) | src/App.jsx:2817-2818 | Settings | 2 | |
| Save as button | Saves under a new filename/format | src/App.jsx:2819 | Settings | 1 | ↔ duplicates the 💾 inline button |
| Export… button | Opens ExportModal | src/App.jsx:2820 | Report | 1 | |
| New button | Starts a new project (discards current after confirm) | src/App.jsx:2821 | Settings | 1 | ↔ duplicates the logo click |

## Tab bar

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Tab "Overview" (summary) | Switches to SumView | src/App.jsx:2531,2825-2835 | Review | 1 | |
| Tab "Briefing" | Switches to BriefingView | src/App.jsx:2532,2825-2835 | Run | 1 | |
| Tab "Planning" (plan) | Switches to PlanReview | src/App.jsx:2533,2825-2835 | Review | 1 | (also: Plan) |
| Tab "Work Tree" (tree) | Switches to TreeView | src/App.jsx:2534,2825-2835 | Build | 1 | |
| Tab "Zeitplan" (gantt) | Switches to GanttView | src/App.jsx:2535,2825-2835 | Plan | 1 | |
| Tab "Netzwerk" (net) | Switches to NetGraph | src/App.jsx:2536,2825-2835 | Build | 1 | (also: Plan) |
| Tab "Ressourcen" (resources) | Switches to ResView | src/App.jsx:2537,2825-2835 | Settings | 1 | |
| Tab "Feiertage" (holidays) | Switches to HolView | src/App.jsx:2538,2825-2835 | Settings | 1 | |

## Sub-toolbar (shown on Tree / Gantt / Net / Plan / Briefing)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Root filter (SearchSelect) | Narrows the view to one project/root | src/App.jsx:2840 | Plan | 1 | (also: any tree-based mode) |
| Team filter (SearchSelect) | Narrows the view to one team | src/App.jsx:2841 | Plan | 1 | |
| Person filter (SearchSelect) | Narrows the view to one person | src/App.jsx:2842 | Run | 1 | (also: Plan) |
| Chip "Erledigte ausblenden" | Hides finished items | src/App.jsx:2847 | Run | 1 | |
| Chip "Archiv" (N archiviert) | Shows archived projects/people | src/App.jsx:2851-2854 | Review | 2 | only shown once something is archived; ↔ duplicates the archive toggle inside the ViewFilters popup |
| Chip "Auto" (only auto-assigned) | Filters to items the scheduler auto-assigned | src/App.jsx:2855 | Run | 2 | |
| Chip "Overdue" | Filters to overdue items | src/App.jsx:2856 | Run | 1 | |
| Chip "Unestimated" | Filters to items with no effort estimate | src/App.jsx:2857 | Build | 2 | |
| Chip "Overbooked" (N) | Filters to items with an over-booked resource | src/App.jsx:2858-2860 | Plan | 2 | only shown once something is over-booked |
| ViewFilters popup trigger (⚙, Review/Plan picker) | Opens the diff-window / planning-horizon popup | src/App.jsx:2864-2873 | Review | 2 | (also: Plan); contents detailed in its own table below |
| SearchBox | Full-text search over visible items | src/App.jsx:2875-2882 | Build | 1 | not shown on the "plan" tab; internals detailed below |
| "+ Add tree node" button | Opens AddModal (tree tab only) | src/App.jsx:2883 | Build | 1 | ↔ duplicates TreeView's own per-row quick-add and the empty-state "+ Add first item" button |

## Work Tree side panel (wiring in App.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "⤢ Modal" button | Opens the bulk-edit content as a standalone modal | src/App.jsx:2941 | Build | 2 | ↔ duplicates the inline bulk-edit body shown in the side panel itself |
| × close multi-selection | Clears the multi-selection | src/App.jsx:2942 | Build | 1 | |
| ⊞ "Full edit" button | Opens NodeModal for the selected item | src/App.jsx:2947 | Build | 1 | ↔ duplicates the QuickEdit side panel (near-identical fields) |
| × close selection | Deselects the item | src/App.jsx:2948 | Build | 1 | |
| "+ Add first item" button (empty tree) | Opens AddModal | src/App.jsx:2920 | Build | 1 | ↔ duplicates the sub-toolbar add button |

## Bulk-Edit modal (inline in App.jsx, no dedicated file)

Reachable from the tree's multi-selection ("⤢ Modal" button, Gantt's "Bulk edit…", or the QuickEdit side panel itself when several items are selected).

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Tabs Overview/Workflow/Effort/Timing | Switches bulk-edit section | src/App.jsx:2593-2603 | Build | 2 | |
| Status SearchSelect (bulk) | Sets status for every selected item | src/App.jsx:2606-2608 | Build | 2 | |
| Notes LazyInput (bulk) | Sets the note for every selected item | src/App.jsx:2609-2611 | Build | 2 | |
| Apply template SearchSelect (bulk) | Applies a task template to every selected item | src/App.jsx:2613-2624 | Build | 2 | |
| Phase-status dot toggle (bulk) | Clicking a phase dot cycles its status for every selected item that shares that phase structure | src/App.jsx:2625-2656 | Build | 2 | |
| Team SearchSelect (bulk) | Sets team for every selected item | src/App.jsx:2660-2662 | Build | 2 | |
| Assignee add/remove (bulk) | Adds/removes an assignee across the selection | src/App.jsx:2663-2673 | Plan | 2 | |
| Parallel toggle (bulk) | Sets the "parallel" scheduler flag across the selection | src/App.jsx:2674-2684 | Build | 3 | 🔧 mechanics exposed (internal scheduler flag) |
| Team-lock toggle (bulk) | Sets the "teamLock" flag across the selection | src/App.jsx:2685-2695 | Build | 3 | 🔧 mechanics exposed |
| Best-days / factor inputs (bulk) | Sets effort estimate fields across the selection | src/App.jsx:2698-2705 | Build | 2 | 🔧 mechanics exposed (best×factor model) |
| Priority SearchSelect (bulk) | Sets priority across the selection | src/App.jsx:2706-2708 | Build | 2 | |
| Confidence buttons (bulk) | Sets confidence across the selection | src/App.jsx:2709-2715 | Build | 3 | 🔧 mechanics exposed |
| Pinned/completed date inputs (bulk) | Sets pinnedStart / completedStart / completedEnd / completedAt across the selection | src/App.jsx:2717-2731 | Plan | 3 | 🔧 mechanics exposed (internal scheduling date fields) |
| Deadline-relevant toggle (bulk) | Sets deadlineRelevant across the selection | src/App.jsx:2732-2748 | Build | 3 | |
| "Clear selection" button (bulk) | Empties the multi-selection | src/App.jsx:2751 | Build | 1 | |

## Keyboard shortcuts (global, App.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Ctrl/Cmd+S | Saves the file | src/App.jsx:1208 | Settings | 2 | ↔ duplicates 💾 and "Save as" |
| Ctrl/Cmd+F | Focuses the search box (tree/gantt/net tabs only) | src/App.jsx:1209-1216 | Build | 2 | ↔ duplicates clicking the SearchBox |
| Ctrl/Cmd+↓ / ↑ | Jumps to the next/previous search match | src/App.jsx:1218-1221 | Build | 2 | ↔ duplicates SearchBox's own ▲/▼ buttons |

---

## Zeitplan / Gantt (GanttView.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Grouping: Project/Team/Resource/Thread | Sets groupBy, changes row structure (persisted in localStorage) | src/components/views/GanttView.jsx:2180 | Plan | 1 | |
| Load-heatmap toggle | Toggles showLoadHeatmap (localStorage) | src/components/views/GanttView.jsx:2189 | Plan | 1 | |
| "Expand all" | Clears collapsedByMode | src/components/views/GanttView.jsx:2205 | Plan | 1 | |
| "Collapse all" | Sets collapsedByMode to every key | src/components/views/GanttView.jsx:2206 | Plan | 1 | |
| Group row expand/collapse (▶/▼) | Toggles collapse of a group | src/components/views/GanttView.jsx:2262 | Plan | 1 | |
| Summary row expand/collapse (▶/▼) | Toggles collapse of a work package | src/components/views/GanttView.jsx:2294 | Plan | 1 | |
| Click a row in the left panel | Opens the task (via onBarClick), or extends multi-selection with Shift/Ctrl | src/components/views/GanttView.jsx:2290 | Plan | 1 | ↔ duplicates clicking the bar itself |
| Click a bar | Opens the task (via onBarClick), or extends multi-selection | src/components/views/GanttView.jsx:2692 | Plan | 1 | ↔ duplicates clicking the row |
| Click the pin badge (📌) | Clears the task's pinnedStart | src/components/views/GanttView.jsx:2817-2819 | Plan | 1 | ⚠ writes data outside the tree — clears pinnedStart |
| Drag a bar horizontally (open/wip) | Sets pinnedStart to the drop date | src/components/views/GanttView.jsx:2681 (start), 2078 (effect) | Plan | 1 | ⚠ writes data outside the tree — writes pinnedStart |
| Drag a bar horizontally (done) | Moves completedStart+completedEnd as a block | src/components/views/GanttView.jsx:2681 (start), 1963-1967 (effect) | Run | 1 | ⚠ writes data outside the tree — writes completedStart/completedEnd; unsure whether Run or Review fits better |
| Drag a bar vertically (tree grouping) | Reorders siblings | src/components/views/GanttView.jsx:2681 (start), 1968-1971 (effect) | Plan | 1 | ⚠ writes data outside the tree — onReorderSibling |
| Drag a bar vertically (resource grouping) | Writes a new seq (and maybe prio) to reposition the task in a person's queue | src/components/views/GanttView.jsx:2681 (start), 1972-2023 (effect) | Plan | 1 | ⚠ writes data outside the tree — seq/prio |
| Drag the right bar edge (open/wip) | Sets fixedDurationDays | src/components/views/GanttView.jsx:2851 (handle), 1934 (effect) | Plan | 1 | ⚠ writes data outside the tree |
| Drag the right bar edge (done) | Moves completedEnd/completedAt | src/components/views/GanttView.jsx:2849-2851 (handle), 1944 (effect) | Run | 1 | ⚠ writes data outside the tree; unsure whether Run or Review fits better |
| Drag the left bar edge (done) | Moves completedStart | src/components/views/GanttView.jsx:2842-2845 (handle), 1951 (effect) | Run | 1 | ⚠ writes data outside the tree |
| Drag the "+" link connector at a bar edge | Starts a dependency drag; drop creates the new dependency | src/components/views/GanttView.jsx:2893 (start), 2117-2129 (drop) | Plan | 1 | ⚠ writes data outside the tree — onAddDep |
| × badge on a dependency arrow (hover/pin) | Removes a dependency | src/components/views/GanttView.jsx:3000-3006 | Plan | 2 | ⚠ writes data outside the tree — onRemoveDep; only appears on hover |
| Click a dependency arrow | Pins the line so it stays visible | src/components/views/GanttView.jsx:2996 | Plan | 2 | display-only, no mutation |
| Marquee select (drag a rectangle) | Multi-selects bars | src/components/views/GanttView.jsx:1743, 1910-1927 | Plan | 1 | |
| Pan the timeline (drag empty area) | Scrolls the view | src/components/views/GanttView.jsx:1743, 1761-1769 | Plan | 1 | |
| Ctrl/Cmd + mouse wheel | Zooms (changes week-pixel width) | src/components/views/GanttView.jsx:210-225 | Plan | 2 | keyboard/mouse shortcut |
| Ctrl/Cmd+A | Selects all visible tasks | src/components/views/GanttView.jsx:1019-1031 | Plan | 2 | keyboard shortcut |
| Esc | Cancels an in-progress drag/selection/link | src/components/views/GanttView.jsx:2089-2102 | Plan | 2 | keyboard shortcut |
| Zoom: Month/Week/Day buttons | Sets a fixed zoom level | src/components/views/GanttView.jsx:3044-3046 | Plan | 1 | |
| Zoom −/+ buttons | Steps zoom in/out | src/components/views/GanttView.jsx:3047-3048 | Plan | 1 | |
| "Today" button | Scrolls the view to today | src/components/views/GanttView.jsx:3050 | Plan | 1 | |
| "Clear selection" (footer) | Empties selectedIds | src/components/views/GanttView.jsx:3059 | Plan | 1 | ↔ duplicates SelectionActionBar's own × |
| Critical-path badge (filter toggle) | Hides non-critical rows/lines | src/components/views/GanttView.jsx:3074 | Plan | 1 | |
| Load-heatmap week-strip click (header) | Switches grouping to "Resource" | src/components/views/GanttView.jsx:2397 | Plan | 1 | ↔ duplicates the "Resource" grouping button |
| "Link" (multi-selection) | Chains the selected tasks into a dependency sequence | src/components/views/GanttView.jsx:3093 (fn 1121-1126) | Plan | 2 | ⚠ writes data outside the tree — onAddDep; ↔ duplicates the "+" link connector; only shown with an active selection |
| ⏮ / ◀ / ▶ / ⏭ (multi-selection reorder) | Moves the selection to start/up/down/end of a team queue (seq, maybe prio) | src/components/views/GanttView.jsx:3097-3100 (fn 1042-1105) | Plan | 2 | ⚠ writes data outside the tree; ↔ duplicates vertical bar drag |
| Priority ⏫ / ⏬ (multi-selection) | Changes selection's prio by ±1 | src/components/views/GanttView.jsx:3103-3104 (fn 1110-1120) | Plan | 2 | ⚠ writes data outside the tree; ↔ duplicates the priority field in QuickEdit/NodeModal |
| "Bulk edit…" (multi-selection) | Opens the external bulk-edit dialog | src/components/views/GanttView.jsx:3106-3114 | Plan | 2 | mutation itself happens in the bulk-edit dialog (see above) |
| "Remove links" (multi-selection) | Removes all hard/soft dependencies of the selection | src/components/views/GanttView.jsx:3116 (fn 1127-1171) | Plan | 2 | ⚠ writes data outside the tree; ↔ duplicates the single × badge |
| AssignModal (team/person assignment) | Would set team/assign for the selection | src/components/views/GanttView.jsx:3118-3141 | remove | — | dead code: no button ever calls `setShowAssignModal(true)` anywhere in this file — unreachable |

## Planning / PlanReview (PlanReview.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Section tabs (Decide/Phases/Team capacity/Load/Blocked/Warnings/Critical paths) | Switches the visible section | src/components/views/PlanReview.jsx:181-182 | Review | 1 | pure view switch, no data write |
| Row click in "Decide" | Opens the item editor (onOpenItem → NodeModal) | src/components/views/PlanReview.jsx:203-204 | Review | 1 | (also: Plan); ↔ duplicates the tree's own "⊞ Full edit" entry point |
| "Adopt auto-assignment" button (only when a scheduler suggestion exists) | Adopts the scheduler's suggestion as a fixed assignment | src/components/views/PlanReview.jsx:216-218 (logic 119-124) | Plan | 1 | ⚠ writes data outside the tree — writes node.assign and node.team directly via onUpdate |
| Phase filter tabs "Current phases" / "All open" | Shows only current or all open phases | src/components/views/PlanReview.jsx:230-231 | Review | 1 | pure filter switch |
| Task header click (phases section) | Opens the item editor | src/components/views/PlanReview.jsx:246 | Review | 1 | ↔ duplicates the tree editor entry point |
| Phase status icon click (○/◐) | Cycles this phase open→wip→done | src/components/views/PlanReview.jsx:255-256 (logic 98-102) | Run | 1 | (also: Plan); ⚠ writes data outside the tree — writes node.phases and possibly derived status/progress via onUpdate |
| Row click in "Blocked" | Opens the item editor; shows the blocker as a tooltip | src/components/views/PlanReview.jsx:320-322 | Review | 1 | |
| Row click "date overdue" | Opens the item editor | src/components/views/PlanReview.jsx:353-354 | Review | 1 | |
| Row click "truncated by offboarding" | Opens the item editor | src/components/views/PlanReview.jsx:374-375 | Review | 1 | |
| Critical-path chain button (per node) | Opens the item editor | src/components/views/PlanReview.jsx:414-432 | Review | 1 | |
| ResourceLoadMatrix (Load tab) | Shows resource load across weeks | src/components/views/PlanReview.jsx:297-305 | Plan | 1 | unsure — embedded component outside the read scope, may carry its own controls |
| Unused `SearchSelect` import | — | src/components/views/PlanReview.jsx:5 | remove | — | dead import, never used in render — no actual control on the surface |

## Netzwerk (NetGraph.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "Fit" button | Zooms/pans to selection/search results/whole graph | src/components/views/NetGraph.jsx:561 | Build | 1 | (also: Plan); pure viewport action |
| Zoom-percent button (reset) | Resets zoom/pan to 100% | src/components/views/NetGraph.jsx:562 | Build | 1 | |
| "+" zoom-in button | Zooms toward screen center | src/components/views/NetGraph.jsx:563-570 | Build | 1 | |
| "−" zoom-out button | Zooms out from screen center | src/components/views/NetGraph.jsx:571-578 | Build | 1 | |
| Canvas drag (hold + move) | Pans the graph | src/components/views/NetGraph.jsx:541-543,586-587 | Build | 1 | |
| Mouse wheel (wheel=pan, Ctrl/Cmd+wheel=zoom) | Viewport control | src/components/views/NetGraph.jsx:512-539 | Build | 1 | |
| Single-click a node | Selects the node / highlights its connections | src/components/views/NetGraph.jsx:664 | Build | 1 | no data write |
| Double-click a node | Opens the item editor | src/components/views/NetGraph.jsx:665 | Build | 1 | ↔ duplicates the tree editor entry point |
| Right-click a node | Opens a context menu | src/components/views/NetGraph.jsx:666,544 | Build | 2 | |
| Context menu "Edit {id}" | Opens the item editor | src/components/views/NetGraph.jsx:700 | Build | 2 | ↔ duplicates double-click and the tree editor |
| Context menu "Delete" | Deletes the node (with confirm()) | src/components/views/NetGraph.jsx:701 | Build | 2 | ⚠ writes data outside the tree — calls onDeleteNode directly, guarded only by a browser confirm() |
| "+ Add first item" (empty state, unfiltered only) | Opens the global Add modal | src/components/views/NetGraph.jsx:553 | Build | 1 | ↔ duplicates the identical empty-state button in TreeView |
| Escape key | Clears node selection | src/components/views/NetGraph.jsx:504-508 | Build | 1 | no visible control, no data write |
| `onAddDep` prop | Meant to create a dependency via drag | src/components/views/NetGraph.jsx:343 | remove | — | prop is wired from App.jsx but never actually called anywhere in this file — dead/unfinished path |

## Ressourcen (ResView.jsx) — Settings surface

Every control on this surface is, by definition, Settings/tier 3 — Resources is maintenance data, not a mode.

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Section pills "Plans"/"Teams"/"Members"/"Vacations" | Switches sub-view | src/components/views/ResView.jsx:622-629 | Settings | 3 | |
| Checkbox "Include offboarded" | Shows/hides offboarded members and teams | src/components/views/ResView.jsx:631-637 | Settings | 3 | |
| Button "+ Team" | Creates a new team | src/components/views/ResView.jsx:638 | Settings | 3 | |
| Button "+ Urlaub" | Creates a new vacation entry, opens the modal | src/components/views/ResView.jsx:639,612-616 | Settings | 3 | |
| Button "+ Plan" | Creates a new meeting plan, opens the modal | src/components/views/ResView.jsx:640-644 | Settings | 3 | |
| Meeting-plan row click | Opens MeetingPlanEditModal | src/components/views/ResView.jsx:156-167,670-679 | Settings | 3 | |
| Team row click | Opens TeamEditModal | src/components/views/ResView.jsx:421-445,706-722 | Settings | 3 | |
| Button "+ Person" (per team group) | Creates a new member in that team | src/components/views/ResView.jsx:746 | Settings | 3 | |
| Member row click | Opens MemberEditModal | src/components/views/ResView.jsx:458-514,768-780 | Settings | 3 | |
| Vacation person filter (SearchSelect) | Filters the vacation list by person | src/components/views/ResView.jsx:793-798 | Settings | 3 | |
| Vacation year filter (select) | Filters the vacation list by year | src/components/views/ResView.jsx:799-803 | Settings | 3 | |
| Vacation filter reset (×) | Clears person/year filter | src/components/views/ResView.jsx:804-808 | Settings | 3 | |
| Vacation row click | Opens VacationEditModal | src/components/views/ResView.jsx:837-853 | Settings | 3 | |
| TeamEditModal — color picker | Sets team color | src/components/views/ResView.jsx:38-43 | Settings | 3 | |
| TeamEditModal — name (LazyInput) | Sets team name | src/components/views/ResView.jsx:47-51 | Settings | 3 | |
| TeamEditModal — meeting-plan chips | Assigns meeting plans to the team | src/components/views/ResView.jsx:55-60 | Settings | 3 | ↔ the same chip pattern also appears on a member (350-357) and on a capacity-timeline entry (1098-1106) — a triple-duplicated UI pattern, though each operates at a different data level |
| TeamEditModal — "Entfernen" | Deletes the team | src/components/views/ResView.jsx:64-69 | Settings | 3 | |
| TeamEditModal — close (×/"Close") | Closes the modal | src/components/views/ResView.jsx:32,71 | Settings | 3 | |
| MemberEditModal — short-name tooltip in header | Shows the auto short name; tooltip mentions "Markdown" | src/components/views/ResView.jsx:95-99 | Settings | 3 | 🔧 mechanics exposed — tooltip names the internal storage/export format instead of staying in domain language |
| MemberEditModal — full name (LazyInput) | Sets name | src/components/views/ResView.jsx:108 | Settings | 3 | |
| MemberEditModal — team (SearchSelect) | Sets team | src/components/views/ResView.jsx:109 | Settings | 3 | |
| MemberEditModal — role (LazyInput) | Sets role | src/components/views/ResView.jsx:110 | Settings | 3 | |
| MemberEditModal — vacation days (LazyInput) | Sets annual vacation entitlement | src/components/views/ResView.jsx:111 | Settings | 3 | |
| MemberEditModal — start date (LazyInput) | Sets start date | src/components/views/ResView.jsx:112 | Settings | 3 | |
| MemberEditModal — end date (LazyInput) | Sets end date | src/components/views/ResView.jsx:113 | Settings | 3 | |
| MemberEditModal — "Entfernen" | Deletes the member | src/components/views/ResView.jsx:132-136 | Settings | 3 | |
| MemberEditModal — "Duplizieren" | Clones the member | src/components/views/ResView.jsx:138-146 | Settings | 3 | |
| MemberEditModal — close | Closes the modal | src/components/views/ResView.jsx:102,148 | Settings | 3 | |
| CapacityField — Manual/Derived mode toggle | Switches capacity calculation mode | src/components/views/ResView.jsx:292-296 | Settings | 3 | |
| CapacityField — manual % (LazyInput) | Sets capacity manually | src/components/views/ResView.jsx:301-304 | Settings | 3 | |
| DerivedCapacity — weekly hours (LazyInput) | Sets base weekly hours | src/components/views/ResView.jsx:340-341 | Settings | 3 | |
| DerivedCapacity — "additional meeting plans" chips | Assigns extra plans to the member | src/components/views/ResView.jsx:350-357 | Settings | 3 | ↔ see team chips above |
| DerivedCapacity — meeting row name | Sets an ad-hoc meeting's name | src/components/views/ResView.jsx:388 | Settings | 3 | ↔ structurally identical to the meeting list in MeetingPlanEditModal (205-219), different data level (personal vs. plan catalogue) |
| DerivedCapacity — meeting row hours | Sets hours | src/components/views/ResView.jsx:389-390 | Settings | 3 | |
| DerivedCapacity — meeting row frequency (select) | Sets frequency | src/components/views/ResView.jsx:391-397 | Settings | 3 | |
| DerivedCapacity — meeting row remove (×) | Deletes an ad-hoc meeting | src/components/views/ResView.jsx:398-399 | Settings | 3 | |
| DerivedCapacity — "+ Meeting" | Adds an ad-hoc meeting | src/components/views/ResView.jsx:402 | Settings | 3 | |
| CapChangesField — "+ Add" | Adds a capacity-timeline entry | src/components/views/ResView.jsx:997-998 | Settings | 3 | |
| CapChangesField — date | Sets the effective date of a capacity change | src/components/views/ResView.jsx:1021-1023 | Settings | 3 | |
| CapChangesField — % | Sets capacity from that date | src/components/views/ResView.jsx:1024-1027 | Settings | 3 | |
| CapChangesField — h/week | Sets weekly hours from that date | src/components/views/ResView.jsx:1028-1031 | Settings | 3 | |
| CapChangesField — row remove (×) | Deletes a timeline entry | src/components/views/ResView.jsx:1032-1033 | Settings | 3 | |
| MeetingChangesField — "+ Add" | Adds a meeting-timeline entry | src/components/views/ResView.jsx:1068-1069 | Settings | 3 | |
| MeetingChangesField — date | Sets the effective date | src/components/views/ResView.jsx:1091-1093 | Settings | 3 | |
| MeetingChangesField — plan chips | Picks plans from that date | src/components/views/ResView.jsx:1098-1106 | Settings | 3 | ↔ third occurrence of the same chip pattern |
| MeetingChangesField — row remove | Deletes a timeline entry | src/components/views/ResView.jsx:1112-1113 | Settings | 3 | |
| MeetingPlanEditModal — name (LazyInput) | Sets plan name | src/components/views/ResView.jsx:196 | Settings | 3 | |
| MeetingPlanEditModal — meeting name | Sets a meeting's name in the plan catalogue | src/components/views/ResView.jsx:207 | Settings | 3 | |
| MeetingPlanEditModal — meeting hours | Sets hours | src/components/views/ResView.jsx:208-209 | Settings | 3 | |
| MeetingPlanEditModal — meeting frequency (select) | Sets frequency | src/components/views/ResView.jsx:210-216 | Settings | 3 | |
| MeetingPlanEditModal — meeting remove (×) | Deletes a meeting from the plan | src/components/views/ResView.jsx:217 | Settings | 3 | |
| MeetingPlanEditModal — "+ Meeting" | Adds a meeting to the plan | src/components/views/ResView.jsx:220 | Settings | 3 | |
| MeetingPlanEditModal — "Entfernen" (with confirm) | Deletes the whole plan | src/components/views/ResView.jsx:223-225 | Settings | 3 | the confirm text itself warns that references become a dead reference — a data-hygiene risk, not a tree edit |
| MeetingPlanEditModal — close | Closes the modal | src/components/views/ResView.jsx:192,227 | Settings | 3 | |
| VacationEditModal — person (SearchSelect) | Sets the vacation's person | src/components/views/ResView.jsx:945-950 | Settings | 3 | |
| VacationEditModal — from date | Sets vacation start | src/components/views/ResView.jsx:955 | Settings | 3 | |
| VacationEditModal — to date | Sets vacation end | src/components/views/ResView.jsx:958-959 | Settings | 3 | |
| VacationEditModal — note | Sets a free-text note | src/components/views/ResView.jsx:964 | Settings | 3 | |
| VacationEditModal — "Entfernen" | Deletes the vacation entry | src/components/views/ResView.jsx:967 | Settings | 3 | |
| VacationEditModal — close (×/"Close") | Closes the modal | src/components/views/ResView.jsx:941,969 | Settings | 3 | |

## Feiertage (HolView.jsx) — Settings surface

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Button "NRW importieren" | Imports statutory NRW holidays for the plan period | src/components/views/HolView.jsx:57 | Settings | 3 | |
| Button "Add manually" | Creates an empty manual holiday | src/components/views/HolView.jsx:58 | Settings | 3 | |
| Button "Clear all" (with confirm) | Clears the whole holiday list | src/components/views/HolView.jsx:60 | Settings | 3 | destructive but confirm()-guarded |
| Year filter (select) | Filters the list by year | src/components/views/HolView.jsx:70-74 | Settings | 3 | |
| Filter reset (×) | Clears the year filter | src/components/views/HolView.jsx:76-78 | Settings | 3 | |
| Empty-state "NRW importieren" button | Same action as above, shown in the empty state | src/components/views/HolView.jsx:88 | Settings | 3 | ↔ duplicates the toolbar button (deliberate empty-state CTA) |
| Date (LazyInput, manual entries only) | Sets a manual holiday's date | src/components/views/HolView.jsx:115-116 | Settings | 3 | auto-imported (NRW) entries are display-only here |
| Name (LazyInput, manual entries only) | Sets a manual holiday's name | src/components/views/HolView.jsx:120-122 | Settings | 3 | |
| Remove holiday (×) | Deletes the entry (works on NRW-imported ones too) | src/components/views/HolView.jsx:127 | Settings | 3 | |

## Zugfahrplan (TimetableView.jsx)

No editable controls found — the view is entirely read-only (used inside SumView and inside PDF export). No buttons, inputs, dropdowns, or drag handles exist; `data-htip` tooltips are purely informational.

## Focus/Deadlines (DLView.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Button "Edit focus" | Calls an external `onEdit` callback | src/components/views/DLView.jsx:18 | remove | — | `grep -rn "DLView" src/` finds only this file's own definition — the component has no importer anywhere in the app; dead surface |
| Goal/painpoint/deadline cards | Read-only display (status, progress, dates) | src/components/views/DLView.jsx:41-62 | remove | — | same as above — not reachable |

## Overview / SumView (SumView.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "Open Plan Review" link (confidence panel) | Jumps to the Planning tab | src/components/views/SumView.jsx:274 | Review | 1 | (also: Plan) |
| "Open Plan Review" link (pulse-check panel) | Jumps to the Planning tab | src/components/views/SumView.jsx:323 | Review | 1 | (also: Plan) |
| Pulse-check item link "→ {id}" | Jumps to the affected task in the tree | src/components/views/SumView.jsx:329-330 | Review | 1 | 🔧 mechanics exposed (shows the task ID, not just the name) |
| Critical-path chip in a goal card | Jumps to the task in the tree | src/components/views/SumView.jsx:412 | Review | 2 | 🔧 mechanics exposed (chip label is the raw ID; name only in tooltip) |
| "Top items" table row click | Jumps to the tree | src/components/views/SumView.jsx:430-431 | Review | 1 | 🔧 mechanics exposed (ID shown next to name) |
| Button "Karte" (roadmap view) | Switches the RoadmapSwitcher to the subway-map view | src/components/views/SumView.jsx:494-495 | Review | 1 | ↔ possibly duplicates a standalone roadmap view; unsure |
| Button "Fahrplan" (schedule view) | Switches to the TimetableView | src/components/views/SumView.jsx:496-497 | Review | 1 | ↔ duplicates the same TimetableView component used elsewhere |
| Line picker (SearchSelect, "show one line solo") | Picks a root/project, filters map+schedule to that line | src/components/views/SumView.jsx:505-514 | Review | 2 | 🔧 mechanics exposed (`showIds` shows raw IDs in the dropdown) |
| ViewFilters instance (collective control) | Bundles several filters (since/diff window, horizon, archive) | src/components/views/SumView.jsx:517-525 | Review | 2 | see the ViewFilters table below |
| Archive pill button ("N archiviert") | Sets showArchived=true | src/components/views/SumView.jsx:529-538 | Review | 1 | ↔ duplicates the archive toggle inside the ViewFilters popup (same props) |
| Retro panel — top-overruns row | Opens the task's detail | src/components/views/SumView.jsx:617-628 | Review | 1 | (also: Report); 🔧 mechanics exposed (raw task ID shown) |
| Retro panel — top-underruns row | Opens the task's detail | src/components/views/SumView.jsx:630-641 | Review | 1 | (also: Report); 🔧 mechanics exposed |
| Roadmap component (map view) | Renders the subway map; passes onAssignmentChange down | src/components/views/SumView.jsx:651-658 | Review | 1 | ⚠ possibly writes data outside the tree — see the Roadmap.jsx table |
| TimetableView component (schedule view) | Renders the read-only schedule table | src/components/views/SumView.jsx:659-660 | Review | 1 | |

Also found: `sprintDays`/`setHd`/`sprintEnd`/`upcoming`/`sprintGroups` (SumView.jsx:57-82) are computed but never rendered anywhere in the JSX — dead code, no associated control.

## Briefing (BriefingView.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Horizon buttons ("Diese Woche"/"2 Wochen"/"4 Wochen") | Sets a local horizonDays, filters every card | src/components/views/BriefingView.jsx:222-226 | Run | 1 | ↔ possibly related to/duplicating the project-wide horizon picker and the dead sprint-horizon control in SumView; a code comment in SumView (54-56) suggests a deliberate separation |
| Button "Todo exportieren" | Calls onExportTodo(horizonDays) (export, read-only) | src/components/views/BriefingView.jsx:227-234 | Run | 1 | ↔ possibly duplicates the PDF/DOCX report exports (Report) |
| Person-card task row | Opens the task's detail | src/components/views/BriefingView.jsx:325-327 | Run | 1 | 🔧 mechanics exposed (raw task ID shown before the name) |
| Milestone row | Opens the root item's detail | src/components/views/BriefingView.jsx:373-375 | Run | 1 | (also: Review) |
| Risk row ("overdue"/"late"/"exploratory, date near") | Opens the affected item | src/components/views/BriefingView.jsx:396-398 | Run | 1 | (also: Review); 🔧 mechanics exposed (raw ID) |

## Onboarding (Onboard.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Button "Neues Projekt" (primary) | Starts a new project (onCreate) | src/components/views/Onboard.jsx:36-39 | Build | 1 | shown before any mode is chosen |
| Button "Demo ausprobieren" | Loads the demo project | src/components/views/Onboard.jsx:40-44 | Build | 1 | (also: remove — arguably a marketing/demo affordance, not a work mode) |
| Link "Projekt laden" | Opens the hidden file input | src/components/views/Onboard.jsx:46-48 | Build | 2 | (also: Settings — it's an import action) |

---

## Work Tree / TreeView (TreeView.jsx) — the sanctioned editing surface

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "Collapse all" / "Collapse selection" | Collapses all rows or only the selected subtrees | src/components/views/TreeView.jsx:310 | Build | 1 | |
| "Expand all" / "Expand selection" | Expands all rows or only the selected subtrees | src/components/views/TreeView.jsx:311 | Build | 1 | |
| Row click | Selects the item (single, or multi with Shift/Ctrl) | src/components/views/TreeView.jsx:382 | Build | 1 | |
| Drag handle (⋮⋮) reorder | Drags a row to reorder it among its siblings | src/components/views/TreeView.jsx:395-405,291-303 | Build | 1 | ↔ duplicates the "First/Up/Down/Last" toolbar buttons below |
| Row expand/collapse toggle (▶/▼) | Toggles a row's children | src/components/views/TreeView.jsx:420 | Build | 1 | |
| Per-row "+" quick-add | Adds a child under this row | src/components/views/TreeView.jsx:538-541 | Build | 1 | ↔ duplicates the sub-toolbar "+ Add item" button and AddModal |
| "⤒ First" button (contextual toolbar) | Moves the selected item to the first sibling position | src/components/views/TreeView.jsx:328 | Build | 1 | ↔ duplicates the drag handle |
| "▲ Up" button | Moves the item up one position | src/components/views/TreeView.jsx:329 | Build | 1 | ↔ duplicates the drag handle |
| "▼ Down" button | Moves the item down one position | src/components/views/TreeView.jsx:330 | Build | 1 | ↔ duplicates the drag handle |
| "⤓ Last" button | Moves the item to the last sibling position | src/components/views/TreeView.jsx:331 | Build | 1 | ↔ duplicates the drag handle |
| "Delete item" button (contextual toolbar) | Deletes the selected item (with confirm) | src/components/views/TreeView.jsx:334-336 | Build | 1 | ↔ duplicates Delete in QuickEdit/NodeModal |
| SelectionActionBar "Bulk edit…" trigger | Opens the bulk-edit modal | src/components/views/TreeView.jsx:552-560 | Build | 1 | ↔ duplicates the App.jsx "⤢ Modal" trigger |
| SelectionActionBar status buttons (open/wip/done) | Sets status across the multi-selection | src/components/views/TreeView.jsx:562-575 | Build | 1 | ↔ duplicates the status field in QuickEdit/NodeModal and the bulk-edit modal |
| AssignModal (via showAssignModal) | Would set team/persons across the multi-selection | src/components/views/TreeView.jsx:577-599 | remove | — | dead trigger — nothing in this file ever calls `setShowAssignModal(true)` |

## QuickEdit (QuickEdit.jsx) — side panel of the sanctioned editing surface

Reached by selecting a row in TreeView; fields commit instantly per-edit (no separate Save step). None of its own writes are flagged ⚠ — this is the one permitted editing surface.

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "Estimate now" button (header) | Opens EstimationWizard | src/components/views/QuickEdit.jsx:251 | Build | 1 | ↔ duplicates the Effort tab's quick-estimate buttons |
| Tab bar (Insights/Overview/Workflow/Effort/Timing) | Switches the visible section | src/components/views/QuickEdit.jsx:255-260 | Build | 1 | |
| Insights tab | Read-only summary with click-to-jump sections | src/components/views/QuickEdit.jsx:264-287 | Build | 1 | reuses TaskInsights.jsx — see its own table below |
| Name input (Overview) | Sets the item name | src/components/views/QuickEdit.jsx:291 | Build | 1 | |
| Notes textarea (Overview) | Sets the note | src/components/views/QuickEdit.jsx:292 | Build | 1 | |
| Focus-type buttons (Overview, root only) | Sets goal/painpoint/deadline/none | src/components/views/QuickEdit.jsx:295-300 | Build | 1 | |
| Severity SearchSelect (Overview, root+type) | Sets severity | src/components/views/QuickEdit.jsx:303-305 | Build | 1 | |
| Date input (Overview, deadline type) | Sets the deadline date | src/components/views/QuickEdit.jsx:306 | Build | 1 | |
| Description input (Overview, root+type) | Sets the description | src/components/views/QuickEdit.jsx:308 | Build | 1 | |
| Custom field inputs (Overview) | Sets each configured custom field's value | src/components/views/QuickEdit.jsx:338-345 | Build | 1 | |
| Status SearchSelect (Workflow, leaf without phases) | Sets status | src/components/views/QuickEdit.jsx:351-363 | Build | 1 | |
| Progress slider (Workflow, leaf without phases) | Sets progress % | src/components/views/QuickEdit.jsx:368-382 | Build | 1 | |
| Phase list (Workflow, leaf) | Add/reorder/remove/apply-template/status-toggle phases | src/components/views/QuickEdit.jsx:387-394 | Build | 1 | reuses Phases.jsx — see its own table below |
| Team SearchSelect (Workflow) | Sets team | src/components/views/QuickEdit.jsx:397 | Build | 1 | |
| Team-lock toggle (Workflow, leaf) | Sets teamLock | src/components/views/QuickEdit.jsx:401-404 | Build | 1 | 🔧 mechanics exposed |
| Parallel toggle (Workflow, leaf) | Sets the "parallel" scheduler flag | src/components/views/QuickEdit.jsx:406-411 | Build | 1 | 🔧 mechanics exposed |
| Assignee tag remove (×) (Workflow) | Removes one assignee | src/components/views/QuickEdit.jsx:416 | Build | 1 | |
| AutoAssignHint "accept" (Workflow, leaf) | Adopts the scheduler's suggested person/team | src/components/views/QuickEdit.jsx:418-419 | Plan | 1 | |
| Assignee add (SearchSelect) (Workflow) | Adds an assignee | src/components/views/QuickEdit.jsx:421-430 | Build | 1 | |
| Quick-estimate size buttons (Effort, leaf) | Sets best/factor from a T-shirt size | src/components/views/QuickEdit.jsx:442-450 | Build | 1 | ↔ duplicates EstimationWizard's own size step |
| "Estimate now" button (Effort tab) | Opens EstimationWizard | src/components/views/QuickEdit.jsx:452 | Build | 1 | ↔ duplicates the header button |
| Best-days input (Effort, leaf) | Sets best estimate | src/components/views/QuickEdit.jsx:456 | Build | 1 | |
| Factor input (Effort, leaf) | Sets the realism factor | src/components/views/QuickEdit.jsx:457 | Build | 1 | 🔧 mechanics exposed |
| Priority SearchSelect (Effort, leaf) | Sets priority | src/components/views/QuickEdit.jsx:458-460 | Build | 1 | |
| Fixed-duration toggle+input (Effort, leaf) | Sets a fixed duration instead of best×factor | src/components/views/QuickEdit.jsx:466-474 | Build | 1 | 🔧 mechanics exposed |
| Confidence SearchSelect (Effort, leaf) | Sets confidence | src/components/views/QuickEdit.jsx:481 | Build | 1 | 🔧 mechanics exposed |
| Decide-by date input (Timing, leaf) | Sets decideBy | src/components/views/QuickEdit.jsx:512-514 | Plan | 1 | |
| Due date input+clear (Timing, leaf) | Sets/clears due | src/components/views/QuickEdit.jsx:515-520 | Plan | 1 | |
| Pinned-start date input+clear (Timing, leaf) | Sets/clears pinnedStart | src/components/views/QuickEdit.jsx:521-526 | Plan | 1 | 🔧 mechanics exposed |
| Completed-start/end/at date inputs (Timing, leaf) | Sets the actual completion window | src/components/views/QuickEdit.jsx:529-537 | Run | 1 | 🔧 mechanics exposed |
| Planned-start/end date inputs (Timing, leaf) | Sets the "Soll" (estimate) window | src/components/views/QuickEdit.jsx:546-552 | Review | 1 | 🔧 mechanics exposed |
| Deadline-relevant toggle (Timing) | Sets deadlineRelevant | src/components/views/QuickEdit.jsx:598-613 | Plan | 1 | |
| Predecessor label input (Timing) | Sets a dependency's display label | src/components/views/QuickEdit.jsx:631 | Build | 1 | |
| Predecessor hard↔soft toggle (→S/→H) | Converts a dependency's kind | src/components/views/QuickEdit.jsx:632,656 | Build | 1 | 🔧 mechanics exposed (hard/soft dependency concept) |
| Predecessor remove (×) | Removes a dependency | src/components/views/QuickEdit.jsx:638,662 | Build | 1 | |
| Predecessor add (SearchSelect + H/S toggle) | Adds a dependency | src/components/views/QuickEdit.jsx:680-691 | Build | 1 | 🔧 mechanics exposed |
| Successor hard↔soft toggle, remove (×) | Converts/removes a successor link | src/components/views/QuickEdit.jsx:704-713 | Build | 1 | 🔧 mechanics exposed |
| Successor add (SearchSelect + H/S toggle) | Adds a successor link | src/components/views/QuickEdit.jsx:716-725 | Build | 1 | 🔧 mechanics exposed |
| "Duplicate" button (footer) | Duplicates the item + subtree | src/components/views/QuickEdit.jsx:731-734 | Build | 1 | |
| "Split" button (footer, wip with partial progress) | Splits the task at a given progress % | src/components/views/QuickEdit.jsx:738-752 | Build | 1 | |
| "Delete" button (footer) | Deletes the item (with confirm) | src/components/views/QuickEdit.jsx:753-755 | Build | 1 | ↔ duplicates TreeView's contextual-toolbar delete |

## TaskInsights (shared, used inside QuickEdit's Insights tab and NodeModal's Insights tab)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Name/description block click | Jumps to Overview/Details | src/components/shared/TaskInsights.jsx:207-230 | Build | 1 | |
| Status+progress header click | Jumps to Workflow/Details | src/components/shared/TaskInsights.jsx:233-252 | Build | 1 | |
| Timing section click | Jumps to Timing | src/components/shared/TaskInsights.jsx:258 | Build | 1 | |
| "Wartet auf" (blocked-by) link | Opens the blocking item | src/components/shared/TaskInsights.jsx:351-373 | Build | 1 | |
| Effort section click | Jumps to Effort | src/components/shared/TaskInsights.jsx:379 | Build | 1 | |
| People section click | Jumps to Workflow | src/components/shared/TaskInsights.jsx:432 | Build | 1 | |
| "Split" button (handoff chain) | Materializes the handoff chain as sibling tasks | src/components/shared/TaskInsights.jsx:468-471 | Build | 1 | calls onSplitHandoff — a sanctioned tree write, reached only from inside the tree editor |
| "Split" button (truncated by offboarding) | Splits at the consumed/remaining ratio | src/components/shared/TaskInsights.jsx:473-480 | Build | 1 | calls onSplitTaskAtProgress — same as above |
| Phases section click | Jumps to Workflow | src/components/shared/TaskInsights.jsx:532 | Build | 1 | |
| Phase dot inline toggle | Cycles a phase open→wip→done | src/components/shared/TaskInsights.jsx:541-547 | Build | 1 | writes node.phases directly — sanctioned (reached only from the tree editor) |
| Dependencies section click | Jumps to Timing | src/components/shared/TaskInsights.jsx:561 | Build | 1 | |
| Predecessor/successor/inherited-dep link click | Opens that item | src/components/shared/TaskInsights.jsx:566-605 | Build | 1 | |
| Custom fields section click | Jumps to Overview | src/components/shared/TaskInsights.jsx:611 | Build | 1 | |
| Custom-field URI link click | Opens the external link | src/components/shared/TaskInsights.jsx:618 | Build | 1 | navigation only, no mutation |

## Phases (shared: PhaseList + PhaseEditPopout, used in QuickEdit, NodeModal, SettingsModal templates, and the bulk-edit modal)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Phase dot click | Advances the phase's status | src/components/shared/Phases.jsx:139-140 | Build | 1 | |
| Phase name click | Opens the phase edit popout | src/components/shared/Phases.jsx:141-142 | Build | 1 | |
| "▲"/"▼" move phase | Reorders a phase | src/components/shared/Phases.jsx:148-149 | Build | 1 | |
| "×" remove phase | Deletes a phase | src/components/shared/Phases.jsx:150 | Build | 1 | |
| "+ Add phase" button | Adds a phase | src/components/shared/Phases.jsx:156 | Build | 1 | |
| Apply-template SearchSelect | Replaces phases with a template's | src/components/shared/Phases.jsx:158 | Build | 1 | |
| "Clear phases" button | Removes all phases (with confirm) | src/components/shared/Phases.jsx:162 | Build | 1 | |
| PhaseEditPopout — name input | Sets phase name | src/components/shared/Phases.jsx:27 | Build | 2 | |
| PhaseEditPopout — team chips | Adds/removes teams on the phase | src/components/shared/Phases.jsx:30-37 | Build | 2 | |
| PhaseEditPopout — assignee chips | Adds/removes assignees on the phase | src/components/shared/Phases.jsx:40-54 | Build | 2 | |
| PhaseEditPopout — effort % input | Sets the phase's effort share | src/components/shared/Phases.jsx:58-60 | Build | 2 | |
| PhaseEditPopout — Save/Cancel | Commits or discards the phase edit | src/components/shared/Phases.jsx:65-66 | Build | 2 | |

This component is reused verbatim in three hosts (QuickEdit, NodeModal, SettingsModal templates) — not itself a duplication problem, but the reason phase-editing rows appear three times below in different tables.

## HandoffPlanEditor (shared, currently parked)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Entire component (per-cutoff team/person override editor) | Would let a user override the scheduler's handoff cutoffs | src/components/shared/HandoffPlanEditor.jsx:14 | Plan | 2 | reviewed: parked, not dead — `handoffPlan` is parsed, written and round-tripped in markdown (data-model.md), so deleting the editor would strip the only UI for a live field. Re-render it in Plan mode instead. Original finding: imported by QuickEdit.jsx:5 and NodeModal.jsx:5 but never rendered — both call sites carry only a comment ("HandoffPlanEditor disabled"); would write node.handoffPlan if re-enabled |

---

## Modals

### NodeModal (NodeModal.jsx)

**Opened from more than the tree**: `onBarClick` in Gantt, `onNodeClick` in NetGraph, `onOpenItem` in PlanReview, and `openItem` in JiraSyncModal all open this same modal — in addition to the tree's own "⊞ Full edit" button. Every field below therefore becomes a P2 violation (writes data outside the tree) whenever the modal was opened from one of those non-tree surfaces; only the rows most central to that finding carry an explicit ⚠, but the finding applies to the whole table.

Fields are buffered in local state and committed only by the "Save" button — a different editing model than QuickEdit, which commits per-field instantly.

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Ancestor breadcrumb links | Navigates to an ancestor (with unsaved-changes guard) | src/components/modals/NodeModal.jsx:257-277 | Build | 2 | |
| Tab bar (Insights/Overview/Workflow/Effort/Timing/History/Advanced) | Switches section | src/components/modals/NodeModal.jsx:287-294 | Build | 2 | ↔ duplicates QuickEdit's tab bar, plus two extra tabs (History, Advanced) |
| 📌 pinnedStart badge click | Clears pinnedStart | src/components/modals/NodeModal.jsx:283 | Build | 2 | ⚠ writes data outside the tree when opened from Gantt/NetGraph/PlanReview/JiraSync; 🔧 mechanics exposed |
| Insights tab | Read-only summary, click-to-jump | src/components/modals/NodeModal.jsx:297-321 | Build | 2 | ↔ duplicates QuickEdit's Insights tab (same TaskInsights.jsx component) |
| Name/notes/focus-type/severity/date/description (Overview) | Sets the corresponding fields | src/components/modals/NodeModal.jsx:325-340 | Build | 2 | ⚠ writes data outside the tree when opened non-tree; ↔ duplicates QuickEdit Overview |
| Custom field inputs (Overview) | Sets custom field values | src/components/modals/NodeModal.jsx:369-373 | Build | 2 | ↔ duplicates QuickEdit Overview |
| Status SearchSelect, progress slider (Workflow) | Sets status/progress | src/components/modals/NodeModal.jsx:382-404 | Build | 2 | ⚠ writes data outside the tree when opened non-tree; ↔ duplicates QuickEdit Workflow |
| Phase list (Workflow) | Add/reorder/remove/status-toggle phases | src/components/modals/NodeModal.jsx:409-416 | Build | 2 | ⚠ writes data outside the tree when opened non-tree; reuses Phases.jsx; ↔ duplicates QuickEdit |
| Team SearchSelect, team-lock, parallel toggles (Workflow) | Sets team/teamLock/parallel | src/components/modals/NodeModal.jsx:418-447 | Build | 2 | 🔧 mechanics exposed (teamLock/parallel); ↔ duplicates QuickEdit |
| Assignee tags/add, AutoAssignHint accept (Workflow) | Sets assignees/team | src/components/modals/NodeModal.jsx:424-451 | Plan | 2 | ⚠ writes data outside the tree when opened non-tree; ↔ duplicates QuickEdit |
| Quick-estimate buttons, "Estimate now" (Effort) | Sets best/factor, opens EstimationWizard | src/components/modals/NodeModal.jsx:470-479 | Build | 2 | ↔ duplicates QuickEdit Effort |
| Best/factor/priority inputs (Effort) | Sets estimate fields | src/components/modals/NodeModal.jsx:482-487 | Build | 2 | ↔ duplicates QuickEdit Effort |
| Fixed-duration toggle+input, confidence (Effort) | Sets fixedDurationDays / confidence | src/components/modals/NodeModal.jsx:490-517 | Build | 2 | 🔧 mechanics exposed; ↔ duplicates QuickEdit Effort |
| Decide-by/due/pinned-start inputs + "Pin today" (Timing) | Sets those date fields | src/components/modals/NodeModal.jsx:533-550 | Plan | 2 | ⚠ writes data outside the tree when opened non-tree; 🔧 mechanics exposed; "Pin today" has no QuickEdit counterpart |
| Completed-start/end/at inputs (Timing) | Sets the actual completion window | src/components/modals/NodeModal.jsx:551-561 | Run | 2 | 🔧 mechanics exposed; ↔ duplicates QuickEdit Timing |
| Deadline-relevant toggle (Timing) | Sets deadlineRelevant | src/components/modals/NodeModal.jsx:565-584 | Plan | 2 | ↔ duplicates QuickEdit Timing |
| Predecessor list (remove/convert) + add (Timing) | Manages dependencies | src/components/modals/NodeModal.jsx:586-616 | Build | 2 | ⚠ writes data outside the tree when opened non-tree; 🔧 mechanics exposed; ↔ duplicates QuickEdit Timing |
| Successor list (navigate only) (Timing) | Opens a successor item | src/components/modals/NodeModal.jsx:618-637 | Build | 2 | ↔ duplicates QuickEdit Timing |
| History tab (ItemHistoryTimeline) | Shows/edits the item's change history | src/components/modals/NodeModal.jsx:641-645 | Review | 2 | not present in QuickEdit at all — unique to NodeModal |
| Advanced — parent SearchSelect (move node) | Moves the node to a new parent | src/components/modals/NodeModal.jsx:649-657 | Build | 2 | ⚠ writes data outside the tree when opened non-tree; 🔧 mechanics exposed; not present in QuickEdit |
| Advanced — seq number input | Sets the raw scheduler seq field | src/components/modals/NodeModal.jsx:658 | Build | 2 | 🔧 mechanics exposed (raw internal field); not present in QuickEdit |
| Footer — Delete | Deletes the item | src/components/modals/NodeModal.jsx:663 | Build | 2 | ⚠ writes data outside the tree when opened non-tree; ↔ duplicates QuickEdit |
| Footer — Duplicate | Duplicates the item + subtree | src/components/modals/NodeModal.jsx:664-668 | Build | 2 | ↔ duplicates QuickEdit |
| Footer — Split | Splits the task | src/components/modals/NodeModal.jsx:669-684 | Build | 2 | ↔ duplicates QuickEdit |
| Footer — Save (commits buffered `f` state) | Writes all buffered field changes at once | src/components/modals/NodeModal.jsx:687 | Build | 2 | ⚠ writes data outside the tree when opened non-tree; 🔧 different commit model than QuickEdit (batched vs. per-field) |

### AddModal (AddModal.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Parent SearchSelect | Picks the new item's parent | src/components/modals/AddModal.jsx:50 | Build | 2 | |
| Name input | Sets name | src/components/modals/AddModal.jsx:57 | Build | 2 | |
| Focus-type buttons (top level) | Sets goal/painpoint/deadline | src/components/modals/AddModal.jsx:64 | Build | 2 | |
| Severity SearchSelect (top level) | Sets severity | src/components/modals/AddModal.jsx:68 | Build | 2 | |
| Date input (top level, deadline) | Sets date | src/components/modals/AddModal.jsx:70 | Build | 2 | |
| Description input (top level) | Sets description | src/components/modals/AddModal.jsx:72 | Build | 2 | |
| Team SearchSelect | Sets team | src/components/modals/AddModal.jsx:74,95 | Build | 2 | |
| Assignee add/remove | Sets assignees | src/components/modals/AddModal.jsx:80-89,105-114 | Plan | 2 | |
| Status SearchSelect (child items) | Sets initial status | src/components/modals/AddModal.jsx:98 | Build | 2 | |
| Deadline-relevant toggle | Sets deadlineRelevant | src/components/modals/AddModal.jsx:118-130 | Build | 2 | |
| Workflow-template SearchSelect | Applies a template's phases | src/components/modals/AddModal.jsx:136-143 | Build | 2 | |
| Quick-estimate size buttons | Sets best/factor | src/components/modals/AddModal.jsx:150 | Build | 2 | |
| Best/factor/priority inputs | Sets estimate fields | src/components/modals/AddModal.jsx:155-159 | Build | 2 | |
| Notes textarea | Sets note | src/components/modals/AddModal.jsx:162 | Build | 2 | |
| "Add" button | Creates the item | src/components/modals/AddModal.jsx:166 | Build | 2 | ↔ duplicates TreeView's per-row quick-add and NetGraph's "Add first item" |
| "Cancel" button | Closes without creating (confirms if dirty) | src/components/modals/AddModal.jsx:164 | Build | 2 | |

### AssignModal (AssignModal.jsx) — entirely unreachable

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Entire modal (bulk team/person assignment) | Would set team/persons across a multi-selection | src/components/modals/AssignModal.jsx:9 | remove | — | both known call sites are dead: TreeView.jsx:577-599 and GanttView.jsx:3118-3141 both hold the component behind a `showAssignModal` flag that no button ever sets to `true` — the modal has no live trigger anywhere in the app |

### DLModal (DLModal.jsx) — orphaned

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Entire modal (goal/deadline type editor for tree roots) | Would set type/severity/date/description on root items | src/components/modals/DLModal.jsx:5 | remove | — | `grep -rn "DLModal" src/` finds only its own file — no importer anywhere; the same functionality is already covered by QuickEdit/NodeModal's "Focus type" controls |

### EstimationWizard (EstimationWizard.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Step indicator dots | Jumps to a step | src/components/modals/EstimationWizard.jsx:98 | Build | 2 | |
| Scope textarea (step 0) | Sets the scope note | src/components/modals/EstimationWizard.jsx:113 | Build | 2 | |
| Template SearchSelect (step 0, phases) | Applies a template's phases | src/components/modals/EstimationWizard.jsx:122-133 | Build | 2 | |
| "Clear phases" button (step 0) | Removes applied phases | src/components/modals/EstimationWizard.jsx:147-148 | Build | 2 | |
| T-shirt size cards (step 1) | Seeds optimistic/realistic/pessimistic from a size | src/components/modals/EstimationWizard.jsx:168-173 | Build | 2 | ↔ duplicates the quick-estimate buttons in QuickEdit/NodeModal Effort |
| Risk checkboxes (step 2) | Adds a risk to the PERT factor | src/components/modals/EstimationWizard.jsx:181-185 | Build | 2 | 🔧 mechanics exposed (risk weight shown as a % surcharge) |
| Optimistic/Realistic/Pessimistic inputs (step 3) | Feeds the PERT formula | src/components/modals/EstimationWizard.jsx:198-208 | Build | 2 | 🔧 mechanics exposed (PERT calculation visible) |
| Dependency add/remove (step 4) | Sets deps for the new estimate | src/components/modals/EstimationWizard.jsx:220-223 | Build | 2 | |
| Confidence cards (step 5) | Sets confidence | src/components/modals/EstimationWizard.jsx:238-243 | Build | 2 | |
| Back/Next navigation | Moves between steps | src/components/modals/EstimationWizard.jsx:276-277 | Build | 2 | |
| "Apply" button (step 6, summary) | Commits best/factor/deps/note/confidence/phases via onSave | src/components/modals/EstimationWizard.jsx:278 | Build | 2 | |
| "Cancel" button | Closes without saving (confirms if dirty) | src/components/modals/EstimationWizard.jsx:274 | Build | 2 | |

### ExportModal (ExportModal.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "Management Summary" PDF card (+ "plus Fahrplan"/"plus Projekt-Roadmaps" checkboxes) | Exports the management-summary PDF | src/components/modals/ExportModal.jsx:112-128 | Report | 2 | ↔ overlaps other summary-style exports below |
| "Gantt / Zeitplan" PDF card | Exports a Gantt image + schedule | src/components/modals/ExportModal.jsx:130-132 | Report | 2 | |
| "Was kommt wann" PDF card | Exports a horizon-aware what's-next PDF | src/components/modals/ExportModal.jsx:134-136 | Report | 2 | |
| "TODO / Sprint" PDF card + horizon-days select | Exports near-term tasks per person | src/components/modals/ExportModal.jsx:138-140 | Report | 2 | ↔ overlaps "Sprint (Markdown)" below |
| "Projektbericht" DOCX card | Exports the full Word report | src/components/modals/ExportModal.jsx:142-144 | Report | 2 | |
| "Jira-Export" card | Opens JiraExportModal | src/components/modals/ExportModal.jsx:146-148 | Report | 2 | |
| "Jira-Abgleich" card | Opens JiraSyncModal | src/components/modals/ExportModal.jsx:150-152 | Report | 2 | this is a Run-mode action surfaced from a Report-mode modal |
| "Sprint (Markdown)" card + horizon-days select | Exports a markdown TODO list | src/components/modals/ExportModal.jsx:154-156 | Report | 2 | ↔ overlaps "TODO / Sprint" PDF above |
| "Mermaid-Graph" card | Exports a Mermaid flowchart | src/components/modals/ExportModal.jsx:158-160 | Report | 2 | |
| "Netzwerk-Bild" PNG card (Net tab only) | Exports the current network graphic | src/components/modals/ExportModal.jsx:162-165 | Report | 2 | |
| "Gantt-Bild" PNG card (Gantt tab only) | Exports the current Gantt graphic | src/components/modals/ExportModal.jsx:167-170 | Report | 2 | |
| "Backup" JSON card | Exports the full project JSON | src/components/modals/ExportModal.jsx:172-174 | Settings | 2 | round-trippable backup, closer to Settings than Report |
| "Cancel"/close | Closes the modal | src/components/modals/ExportModal.jsx:178 | Report | 2 | |

### JiraExportModal (JiraExportModal.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Package (root) toggle buttons | Selects which projects to export | src/components/modals/JiraExportModal.jsx:81-89 | Report | 2 | |
| Hierarchy-mapping buttons (Level 1/Level 2/Leaves → Epic/Story/Task) | Sets the Jira type mapping | src/components/modals/JiraExportModal.jsx:94-111 | Report | 2 | 🔧 mechanics exposed (Jira issue-type mapping) |
| "Skip done" checkbox | Excludes finished items | src/components/modals/JiraExportModal.jsx:116-118 | Report | 2 | |
| "Include auto-assign" checkbox | Includes scheduler suggestions as assignee | src/components/modals/JiraExportModal.jsx:119-121 | Report | 2 | |
| "Export" button | Downloads the CSV | src/components/modals/JiraExportModal.jsx:143 | Report | 2 | |
| "Cancel" button | Closes the modal | src/components/modals/JiraExportModal.jsx:142 | Report | 2 | |

### JiraSyncModal (JiraSyncModal.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Tab "Check" / "Compare" | Switches section | src/components/modals/JiraSyncModal.jsx:133-136 | Run | 2 | |
| Duplicate row "Open" button (Check tab) | Opens the item | src/components/modals/JiraSyncModal.jsx:151-154 | Run | 2 | opens NodeModal |
| Unlinked-open row click (Check tab) | Opens the item | src/components/modals/JiraSyncModal.jsx:159-161 | Run | 2 | ⚠ opens NodeModal from a non-tree surface |
| Paste textarea (Compare tab) | Parses a pasted Jira table | src/components/modals/JiraSyncModal.jsx:183-190 | Run | 2 | |
| Status-diff row checkbox | Accepts/rejects one status change | src/components/modals/JiraSyncModal.jsx:209-218 | Run | 2 | |
| Status-diff row click | Opens the item | src/components/modals/JiraSyncModal.jsx:212 | Run | 2 | ⚠ opens NodeModal from a non-tree surface |
| Summary-drift row click | Opens the item | src/components/modals/JiraSyncModal.jsx:223-227 | Run | 2 | ⚠ opens NodeModal from a non-tree surface |
| "Only in Planr" row click | Opens the item | src/components/modals/JiraSyncModal.jsx:247-254 | Run | 2 | ⚠ opens NodeModal from a non-tree surface |
| "Close" button | Closes the modal | src/components/modals/JiraSyncModal.jsx:268 | Run | 2 | |
| "Apply" button (Compare tab) | Writes the accepted status changes | src/components/modals/JiraSyncModal.jsx:271-274 (writer: src/App.jsx:1858-1863) | Run | 2 | ⚠ writes data outside the tree — `onJiraApplyStatus` in App.jsx:1858 calls `setData` directly on the whole tree, bypassing `updateNode` entirely; the single largest batch-write path outside the tree editor |

### NewProjModal (NewProjModal.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Template picker cards | Picks a project template | src/components/modals/NewProjModal.jsx:74-88 | Settings | 2 | |
| Project-name input | Sets name | src/components/modals/NewProjModal.jsx:96 | Settings | 2 | |
| Plan-start/Plan-end inputs | Sets the plan window | src/components/modals/NewProjModal.jsx:99-100 | Settings | 2 | |
| Holidays select (NRW/None) | Seeds holidays | src/components/modals/NewProjModal.jsx:101-104 | Settings | 2 | |
| "+ Team" / id / name / color / "Entfernen" | Manages the initial team list | src/components/modals/NewProjModal.jsx:110-117 | Settings | 2 | |
| "Cancel" / "Weiter: Fokus" (step 1) | Closes or advances to step 2 | src/components/modals/NewProjModal.jsx:118-121 | Settings | 2 | |
| Add-goal buttons (goal/painpoint/deadline) (step 2) | Adds an initial goal card | src/components/modals/NewProjModal.jsx:127 | Settings | 2 | |
| Goal name/date/description inputs, "Entfernen" (step 2) | Edits/removes a goal card | src/components/modals/NewProjModal.jsx:132-136 | Settings | 2 | |
| "Back" / "Create project" (step 2) | Returns to step 1 or creates the project | src/components/modals/NewProjModal.jsx:140-141 | Settings | 2 | |

### SettingsModal (SettingsModal.jsx) — the Settings surface itself

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Language buttons (auto/en/de) | Sets UI language | src/components/modals/SettingsModal.jsx:106-108 | Settings | 3 | |
| Theme buttons (auto/dark/light) | Sets UI theme | src/components/modals/SettingsModal.jsx:113-115 | Settings | 3 | |
| Project-name input | Sets project name | src/components/modals/SettingsModal.jsx:123 | Settings | 3 | |
| Plan-start/Plan-end inputs | Sets the plan window | src/components/modals/SettingsModal.jsx:125-126 | Settings | 3 | |
| Work-days toggle buttons | Sets the scheduler's working days | src/components/modals/SettingsModal.jsx:131-137 | Settings | 3 | |
| Template list "Edit"/"×" | Opens/deletes a template | src/components/modals/SettingsModal.jsx:152-153 | Settings | 3 | |
| "New template" button | Creates a template | src/components/modals/SettingsModal.jsx:165 | Settings | 3 | |
| Template editor — name input, phase list | Edits the template's name and phases | src/components/modals/SettingsModal.jsx:171-181 | Settings | 3 | reuses Phases.jsx |
| Template editor — "Back" | Returns to the list | src/components/modals/SettingsModal.jsx:185 | Settings | 3 | |
| Size row — label/days/factor/description inputs, "×" | Edits/removes a T-shirt size | src/components/modals/SettingsModal.jsx:206-223 | Settings | 3 | |
| "Add size" / "Reset sizes" | Adds a size / resets to defaults | src/components/modals/SettingsModal.jsx:228-230 | Settings | 3 | |
| Custom field — name/type/URI-template/options inputs, "×" | Edits/removes a custom field definition | src/components/modals/SettingsModal.jsx:244-266 | Settings | 3 | |
| "Add field" button | Adds a custom field | src/components/modals/SettingsModal.jsx:266 | Settings | 3 | |
| Risk — name/weight inputs, "×" | Edits/removes a risk | src/components/modals/SettingsModal.jsx:277-286 | Settings | 3 | |
| "Add risk" / "Reset risks" | Adds a risk / resets to defaults | src/components/modals/SettingsModal.jsx:291-293 | Settings | 3 | |
| "Cancel" button | Closes without saving | src/components/modals/SettingsModal.jsx:298 | Settings | 3 | |
| "Save" button | Commits general+templates+customfields+sizes+risks in one call | src/components/modals/SettingsModal.jsx:299 | Settings | 3 | 🔧 all five sub-areas commit together — there is no per-tab autosave |

### SnapshotModal (SnapshotModal.jsx)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "↓ JSON" download button (per snapshot) | Downloads that snapshot as a JSON file | src/components/modals/SnapshotModal.jsx:75-77 | Settings | 3 | |
| "↶ Restore" button (per snapshot) | Replaces the entire current project with that snapshot | src/components/modals/SnapshotModal.jsx:78-80 | Settings | 3 | ⚠ a whole-project overwrite, not a field edit — still bypasses the tree as the single point of truth |
| "Clear all" button | Wipes the local snapshot history | src/components/modals/SnapshotModal.jsx:88 | Settings | 3 | destructive, no confirm beyond the one dialog shown |
| "Close" button | Closes the modal | src/components/modals/SnapshotModal.jsx:91 | Settings | 3 | |

### TemplatesModal (TemplatesModal.jsx) — orphaned

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Entire modal (template list + phase editor) | Would manage task templates | src/components/modals/TemplatesModal.jsx:6 | remove | — | `grep -rn "TemplatesModal" src/` finds only its own file — no importer anywhere; fully superseded by the "Templates" tab inside SettingsModal (SettingsModal.jsx:143-189), which is wired up and does the same job |

---

## ViewFilters popup (ViewFilters.jsx)

Content of the popup opened by the sub-toolbar's ⚙ trigger (already counted once in the Sub-toolbar table above).

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "Erledigte ausblenden" toggle (inside popup) | Sets hideDone | src/components/shared/ViewFilters.jsx:124-142 | Run | 2 | ↔ duplicates the standalone "Erledigte ausblenden" chip in the sub-toolbar — same state, two separate controls |
| Archive "show" toggle (inside popup) | Sets showArchived | src/components/shared/ViewFilters.jsx:153-163 | Review | 2 | ↔ duplicates the standalone archive chip in the sub-toolbar — same state, two separate controls |
| Archive "older than N days" preset buttons | Sets archiveDays | src/components/shared/ViewFilters.jsx:168-174 | Review | 2 | only inside the popup, no duplicate |
| Diff (Review) preset buttons (Off/7/14/30 days) | Sets the review-window cutoff | src/components/shared/ViewFilters.jsx:216-219 | Review | 2 | mutually exclusive with the horizon section below (turning one on clears the other) |
| Diff custom-date input | Sets an explicit cutoff date | src/components/shared/ViewFilters.jsx:222-226 | Review | 2 | |
| Diff "only changed" checkbox | Filters to items with a change in the window | src/components/shared/ViewFilters.jsx:228-235 | Review | 2 | |
| Horizon (Plan) preset buttons (Off/7/14/30/60 days) | Sets the forward planning horizon | src/components/shared/ViewFilters.jsx:253-259 | Plan | 2 | mutually exclusive with the diff section above |
| Horizon custom-date input | Sets an explicit horizon end date | src/components/shared/ViewFilters.jsx:260-266 | Plan | 2 | |
| Horizon "only planned" checkbox | Hides items outside the horizon instead of just dimming them | src/components/shared/ViewFilters.jsx:267-274 | Plan | 2 | |

## Roadmap controls (Roadmap.jsx — shared subway-map component, used inside SumView and PDF export)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Zoom "−" / "+" buttons | Steps zoom | src/components/shared/Roadmap.jsx:241-246 | Build | 2 | (also: Review, as used inside SumView) |
| "Fit" button (shown once zoomed) | Resets zoom to 100% | src/components/shared/Roadmap.jsx:251-252 | Build | 2 | |
| Ctrl/Cmd + mouse wheel | Zooms | src/components/shared/Roadmap.jsx:109-118 | Build | 2 | keyboard/mouse shortcut |
| Drag to pan (when zoomed) | Pans the map | src/components/shared/Roadmap.jsx:123-150 | Build | 2 | |
| Legend "show more/less" toggle | Expands/collapses a line's legend entry | src/components/shared/Roadmap.jsx:187-198 | Build | 2 | |
| Click a line/item | Opens that item | src/components/shared/Roadmap.jsx:200-204 | Build | 2 | ↔ duplicates the tree editor entry point |
| Assignment auto-persist (`onAssignmentChange`) | Silently writes the computed line/route/color layout back into the project | src/components/shared/Roadmap.jsx:55-69 | Build | 2 | ⚠ writes data outside the tree — persists `roadmapAssignment` automatically on drift, without an explicit user action or the tree editor; layout metadata rather than core plan data, so P2-relevance is uncertain |

## SelectionActionBar (shared shell, used by TreeView and GanttView's multi-select bars)

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "×" clear-selection button (shell) | Clears the multi-selection | src/components/shared/SelectionActionBar.jsx:18-23 | Build | 1 | ↔ duplicates the Gantt footer's "Clear selection" and the tree side panel's own × |

## SearchBox (SearchBox.jsx)

Sits directly in the sub-toolbar (not a popup); the text input itself is already counted once in the Sub-toolbar table above.

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| "▲" previous-match button | Jumps to the previous search hit | src/components/shared/SearchBox.jsx:55-57 | Build | 1 | shown only once text is entered |
| "▼" next-match button | Jumps to the next search hit | src/components/shared/SearchBox.jsx:58-60 | Build | 1 | |
| "×" clear-search button | Clears the search | src/components/shared/SearchBox.jsx:61-64 | Build | 1 | |
| Enter / Shift+Enter (inside the input) | Cycles to the next/previous match | src/components/shared/SearchBox.jsx:44-48 | Build | 1 | ↔ duplicates the ▲/▼ buttons and the global Ctrl/Cmd+↓/↑ shortcut |

## HorizonPicker (HorizonPicker.jsx) — orphaned

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Entire component (standalone planning-horizon filter trigger+popup) | Would show a horizon-only filter trigger | src/components/shared/HorizonPicker.jsx:7 | remove | — | `grep -rn "HorizonPicker" src/` finds no import anywhere, only comments in other files that mention its name — fully superseded by the Horizon section inside ViewFilters.jsx |

## DiffPicker (DiffPicker.jsx) — orphaned

| Element | What it does | File:Line | Mode | Tier | Note |
|---|---|---|---|---|---|
| Entire component (standalone sprint-review diff filter trigger+popup) | Would show a diff-only filter trigger | src/components/shared/DiffPicker.jsx:9 | remove | — | `grep -rn "DiffPicker" src/` finds no import anywhere, only comments in other files that mention its name — fully superseded by the Review section inside ViewFilters.jsx |

---

## Write paths today

Every place that mutates plan/task data (the explicit P2 audit). "Sanctioned" means the write happens only inside TreeView/QuickEdit, the single permitted editing surface; everything else is flagged ⚠ above and repeated here for completeness.

**Sanctioned (tree editor itself, TreeView.jsx + QuickEdit.jsx + reused Phases.jsx/TaskInsights.jsx):**
- Every field commit in QuickEdit.jsx (name, notes, status, progress, phases, team, assign, effort, dates, dependencies — see the QuickEdit table above), all via `patchNode`/`commitNode` → `onUpdate` (App.jsx `updateNode`, App.jsx:1833).
- TreeView.jsx row drag-reorder → `onReorder` (App.jsx `reorderSibling`, App.jsx:2159).
- TreeView.jsx per-row quick-add, contextual delete, SelectionActionBar bulk status → `onQuickAdd`/`onDelete`/`onTaskUpdate` (App.jsx `addNode`:2056, `deleteNode`:1907, `updateNode`:1833).
- TaskInsights.jsx "Split" buttons → `onSplitHandoff` (App.jsx:1915) / `onSplitTaskAtProgress` (App.jsx:1997), reached only from inside QuickEdit/NodeModal.

**Outside the tree (⚠, the actual P2 audit):**
- **GanttView.jsx** — by far the largest source: drag-to-reschedule (pinnedStart), drag-to-resize (fixedDurationDays / completedEnd / completedStart), drag-to-reorder (seq/prio), drag-to-link (deps), the pin-badge clear, the × dependency badge, and the entire multi-select toolbar (Link, reorder arrows, priority up/down, remove links) — all call `onSeqUpdate`/`onTaskUpdate`/`onAddDep`/`onRemoveDep`/`onReorderSibling` directly from the Gantt (see GanttView.jsx:1102-2129, 2817-3141 in the table above).
- **NetGraph.jsx:701** — context-menu "Delete" calls `onDeleteNode` directly, guarded only by `confirm()`.
- **PlanReview.jsx:119-124** (`acceptAuto`, triggered 216-218) — writes `node.assign`/`node.team` via `onUpdate`.
- **PlanReview.jsx:98-102** (`advancePhase`, triggered 255-256) — writes `node.phases` and derived status/progress via `onUpdate`.
- **NodeModal.jsx** — its entire field set (see its table above), whenever opened from Gantt (`onBarClick`), NetGraph (`onNodeClick`), PlanReview (`onOpenItem`), or JiraSyncModal (`openItem`) instead of from the tree's own "⊞ Full edit" button.
- **JiraSyncModal.jsx:271-274 → App.jsx:1858-1863** (`onJiraApplyStatus`) — applies accepted Jira status patches via `setData` directly on the whole tree, bypassing `updateNode` entirely. The single largest batch-write path outside the tree editor.
- **SnapshotModal.jsx:78-80** — "↶ Restore" replaces the entire project with a snapshot via `setData`, bypassing the tree editor (a whole-project operation, not a field edit, but still outside the sanctioned surface).
- **Roadmap.jsx:55-69** (`onAssignmentChange`) — auto-persists the computed subway-map line/route/color layout back into the project the first time it drifts from what's stored; layout metadata, uncertain P2 relevance.
- **App.jsx:2436** (`onRoadmapAssignmentChange`) — the App-level handler that receives the above and merges it into `data.roadmapAssignment`.

## Review pass

Every `remove` row was checked against `docs/principles.md` principle 6 — a
removal must prove **dead code** (no caller anywhere) or **duplication** (and
then name the path that stays). Two rows failed that check and were corrected
rather than accepted:

- **"? Tour"** was proposed for removal as "unsure, possibly Settings". No
  duplicate exists, so this is a capability, not a duplicate → Settings, tier 2.
- **HandoffPlanEditor** was proposed for removal as never rendered. But
  `handoffPlan` is parsed, written and round-tripped through markdown, so the
  component is the only UI for a live field → Plan, tier 2, to be re-rendered.

The remaining 12 removals each carry their proof: `DLModal`, `TemplatesModal`,
`HorizonPicker`, `DiffPicker`, `DLView` and `AssignModal` have no importer or
no live trigger anywhere, and each names the surface that already does the job
(SettingsModal's Templates tab, ViewFilters, QuickEdit's focus-type controls,
the sub-toolbar's bulk assign).

## Counts

| Mode | Tier 1 | Tier 2 | Tier 3 | Total |
|---|---:|---:|---:|---:|
| Build | 94 | 75 | 4 | 173 |
| Plan | 32 | 19 | 1 | 52 |
| Run | 14 | 13 | 0 | 27 |
| Review | 22 | 11 | 0 | 33 |
| Report | 1 | 18 | 0 | 19 |
| Settings | 8 | 15 | 90 | 113 |
| **remove** | — | — | — | 12 |

**Total controls inventoried today: 431** (419 assigned to a mode/tier + 12 controls/components proposed for removal, each with its proof).

Counts were tallied directly off this file's tables (one row = one control), not estimated — Build and Settings dominate because QuickEdit/NodeModal's ~65 duplicated fields and ResView's ~60 maintenance controls are each, correctly, one row per control.

**Build's 94 tier-1 controls are the headline finding.** Principle 4 budgets
tier 1 at one toolbar row, one core view and at most one side view per mode —
94 is roughly four times that, and it is not caused by 94 capabilities but by
one capability reachable from several places at once: QuickEdit and NodeModal
carry the same ~35 fields twice over, status can be set five ways, reordering
two ways, adding an item three ways. That is the case for phase 4 (the tree
editor) in one number, and it is why phase 4 removes *paths* while keeping
every field.

Second finding: **10 write paths outside the tree** (listed above). Principle 2
allows one. Phases 4 and 6 close them; the Gantt keeps drag as a *selection*
gesture and hands editing to the tree.

## Open questions

- Several controls in Gantt (drag a "done" bar, drag its edges) edit the *past* (completedStart/completedEnd) rather than the future — is that Run, Review, or does "editing the past" not belong in Plan mode's core surface at all? Could not be settled from the code alone.
- `AssignModal.jsx` has zero live callers (both TreeView and GanttView gate it behind a flag nothing ever sets true) — is this a half-shipped feature that should be finished, or dead code to delete? The UI need it would fill (bulk team/person assignment from a selection) is already covered by the bulk-edit modal's own team/assignee fields.
- `HandoffPlanEditor.jsx` is imported but explicitly commented out ("disabled") in both QuickEdit and NodeModal — is manual handoff-plan pre-authoring a feature to bring back, or should the import and the file be deleted along with it?
- `DLView.jsx` and `DLModal.jsx` are both fully orphaned (no importer). Is there a "Focus" surface that used to exist and was replaced by the goal-type controls now living in QuickEdit/NodeModal Overview, confirming they're safe to delete? Could not verify the history from the code alone.
- NodeModal exists in near-total field-for-field duplication of QuickEdit, but with three exceptions (History tab, Advanced tab/move-node, "Pin today" button) not present in QuickEdit. Is NodeModal meant to be the only editor going forward (with QuickEdit removed), or vice versa — or do the three NodeModal-only capabilities need a home inside QuickEdit before NodeModal can be removed?
- SettingsModal bundles five very different concerns (language/theme/project meta, templates, custom fields, sizes, risks) behind one "Save" that commits all of them together — is the one-Save-for-everything behavior intentional, or should each tab save independently?
- Several `(also: X)` mode assignments (e.g. Net = Build/also Plan, several SumView links = Review/also Plan or Report) reflect genuine dual-purpose surfaces the code doesn't disambiguate — a product decision, not something inferable from usage alone.
- Is the "Jira-Abgleich" (JiraSyncModal) meant to stay reachable only via the Export modal, or does its Run-mode nature (daily standup, Jira drift) argue for a more direct entry point given it is currently three clicks from the Run-mode tab (Briefing) it conceptually belongs with?
