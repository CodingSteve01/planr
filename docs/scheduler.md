# Scheduler

The auto-scheduler lives in [src/utils/scheduler.js](../src/utils/scheduler.js) and runs automatically on every change to `tree`, `members`, `vacations`, `planStart`, `planEnd`, or the holiday map. There is no manual "schedule" button.

## Inputs

| Input | Purpose |
|---|---|
| `tree` | The full work breakdown — parents and leaves |
| `members` | People with per-person capacity (`cap`), vacation days (`vac`), and availability start |
| `vacations` | Explicit vacation weeks (person + week) — zero capacity that week |
| `planStart` / `planEnd` | The window to schedule into |
| `hm` (holiday map) | Holidays reduce the working-day count of affected weeks |

## Output

For each scheduled leaf: `{ id, name, team, person, personId, startWi, endWi, startD, endD, calDays, capPct, vacDed, weeks, pinOverridden, deps, status, note, ... }`.

Week indices (`startWi`, `endWi`) reference the precomputed week grid.

## Algorithm

### 1. Build the week grid

[`buildWeeks(planStart, planEnd, hm)`](../src/utils/holidays.js) produces `wks` — one entry per week with `mon` (Monday), working-day dates, and `hasH` (holiday flag).

### 2. Enumerate leaves

Only leaves are scheduled. Leaves are detected structurally via `isLeafNode(tree, id)` — no fixed depth.

### 3. Topological order

`visit(id)` walks effective dependencies (own + inherited from all ancestors) depth-first, accumulating into `ord[]`. Cycles are not explicitly detected — cyclic trees produce undefined ordering (tracked as a future improvement).

### 4. Inherit deps from ancestors

A parent's `deps` block every leaf under it. Example: if `P1` depends on `D1`, all of `P1.1`, `P1.2.3`, etc. inherit that dependency. This is intentional — it lets you gate a whole sub-project on a single prerequisite.

### 5. Schedule each leaf

For each leaf in topological order:

**a. Earliest start from deps**

Walk all effective deps (resolved to leaf IDs). Take the max `endWi` across them, plus one. No buffer week is added.

**b. Respect pinned start**

If `pinnedStart` is set, take `max(depEarly, pinWeek)`. Pinning can only **delay** (push right), never pull earlier.

**c. Branch on assignment**

- **No `assign`** + team has **exactly 1 member** → auto-promote: the single member is treated as assigned. Routes through the per-person path (step d) so vacation weeks and the `pF[person]` counter apply precisely. Picking "team only" in the UI produces the same schedule as picking that member directly.
- **No `assign`** + multi-member team → schedule into a **team slot** (see "Team slots" below)
- **With `assign`** → pick the earliest available assignee, respecting their capacity counter

**d. Consume capacity**

Walk forward week-by-week, subtracting the assignee's weekly capacity from the realistic effort (`best × factor`) until zero. Capacity is reduced by:

- Explicit vacation that week → zero
- Availability `start` that falls mid-week → partial
- `cap` (the member's fractional capacity, e.g. 0.5)
- Blanket vacation deduction — remaining unplanned vacation days distributed across the whole horizon

**e. Advance the person's cursor**

If not `parallel`, set `pF[assignee] = endWi + 1` so their next assigned task can't overlap.

## Team slots (multi-member unassigned tasks)

Unassigned leaves used to schedule in parallel from the same start — a known critical bug. The current fix:

```
tSlots[team] = new Array(team.memberCount).fill(0)
```

Each multi-member team has a slot array the size of the team. An unassigned task takes the earliest free slot. Slots occupy until `endWi + 1`. Effort is scheduled against the team's average cap and average vacation-info multiplier.

Trade-off: the slot count defaults to the team's member count. A team of three can run three unassigned tasks in parallel. If the team has no members, a single virtual slot is created.

**Single-member teams are NOT routed through this path** — see step 5c above. They use the precise per-person scheduler instead, which handles explicit vacation weeks and the per-person sequencing counter. This avoids a subtle accuracy gap where "pick the team" (slot path) and "pick the sole member" (person path) produced different schedules.

## Pinning semantics

`pinnedStart` is a hard **floor** on the start date:

- Deps that finish later will push the task beyond the pin (not violation)
- Capacity that only frees up after the pin will push it (not violation)
- `pinOverridden: true` is set in the output when capacity pushed it past the pin — the UI marks this with `⚠📌`

Pinning never pulls a task earlier than its natural deps/capacity allow.

## Parallel flag

`parallel: true` on a leaf bypasses the assignee's `pF` counter — the task does NOT advance the person's cursor. This is a legacy field kept for Markdown round-tripping. It's not exposed in the UI to prevent accidental misuse.

## Holidays

A holiday reduces the working-day count of that week (`w.wds.length`). A week can be fully blocked (Christmas week in NRW) or only partially. Explicit vacation weeks for a person zero that person's capacity for that week outright.

## Vacation model

Each member has `vac` (total vacation days per year). Planr separates:

- **Explicit vacation weeks** — full weeks with zero capacity
- **Remaining unplanned vacation** — spread as a **blanket deduction** across the horizon: `vacInfo[m.id] = 1 - remainingDays / totalWorkingDays`

So a 25 d/y member with 10 days booked explicitly has 15 remaining, spread thinly across the rest of the plan.

## Fall-off behavior

If capacity runs out before the effort is consumed, the task's `endWi` is capped at `weeks.length - 1`. The task appears at the end of the plan and the Gantt shows a compressed bar.

If an assignee is impossible (e.g. no team capacity at all), `tEW[id]` is pinned at the earliest-possible index and the task is dropped from the results.

## `computeConfidence()`

Also in `scheduler.js`, `computeConfidence()` auto-derives a confidence level for each item in the tree. It runs alongside the scheduler and produces a confidence map consumed by the Gantt, Planning Review tab, and export functions.

### Logic

For each **leaf**:

- **Committed** — the item has an assignee (`assign` is non-empty), an estimate (`best > 0`), and no high-risk indicators
- **Estimated** — the item has an estimate but no assignee
- **Exploratory** — the item has no estimate, or has high-risk indicators (scope unclear)

A manual `confidence` field on the item overrides the auto-derived value.

For each **parent**:

- Inherits the **worst** confidence from its children. The ordering is: exploratory (worst) > estimated > committed (best). If any child is exploratory, the parent is exploratory.

### Output

Returns a map: `{ [itemId]: "committed" | "estimated" | "exploratory" }`. This is memoized in `App.jsx` alongside the other derived values.

## Known limitations

- **No cycle detection** — a cyclic dep graph will behave unpredictably
- **One member = one team** — can't split a person across teams with different capacities; workaround is multiple resource entries
- **Weekly granularity only** — the scheduler reasons in weeks, not days. Sub-week precision is a future upgrade
