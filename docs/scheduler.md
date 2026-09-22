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

For each scheduled leaf: `{ id, name, team, person, personId, startWi, endWi, startD, endD, calDays, capPct, vacDed, weeks, pinOverridden, deps, status, note, blockedBy, personPrevFree, ... }`.

`blockedBy` is populated **only** when the dep was the actual binding floor for this row's start — i.e. the chosen `bs` equals `depWi`. If the assignee's prior queue (or member start) pushed the start past the dep's end, `blockedBy` stays `null` so the UI doesn't blame a long-finished/done predecessor when the real reason is the person being busy.

Week indices (`startWi`, `endWi`) reference the precomputed week grid.

## Algorithm

### 1. Build the week grid

[`buildWeeks(planStart, planEnd, hm)`](../src/utils/holidays.js) produces `wks` — one entry per week with `mon` (Monday), working-day dates, and `hasH` (holiday flag).

### 2. Enumerate leaves

Only leaves are scheduled. Leaves are detected structurally via `isLeafNode(tree, id)` — no fixed depth.

### 3. Order of work

**The sequence in the tree is the sequence of the work.** What you move to the top with ⌥↑ starts first; what you push down waits. `treeOrderRank()` in [displayOrder.js](../src/utils/displayOrder.js) walks the tree depth-first and hands back a rank that compares across projects — `displayOrder` on its own counts 1..N inside each parent and cannot say whether the third task of one project comes before the first task of another.

Pinned tasks are considered first, and that is mechanics rather than intent: their capacity has to be on the books before auto-assigned work is placed, or both land in the same window on the same person.

`visit(id)` then walks effective dependencies (own + inherited from all ancestors) depth-first, accumulating into `ord[]`, so a link still overrides the tree order. Cycles are not explicitly detected — cyclic trees produce undefined ordering (tracked as a future improvement).

**Priority and due date do not reorder anything.** They used to: the sort was `priority → assigned-first → due date → seq → id`, with a `dueBump` that promoted anything due within 90 days toward critical. That is why work appeared at the front of the timeline that the planner had deliberately moved to the bottom of the tree — and why the Gantt grew a second ordering system (`seq` plus a "match the neighbour's priority" patch) to fight it back. Priority is importance and due date is a commitment; a deadline that will not hold is now a warning from [`timeline.js`](../src/utils/timeline.js)'s `deadlineStatus`, which you can act on, rather than a reshuffle you have to discover.

`seq` is gone as an input. It is still parsed from older plan files and ignored; it is no longer written.

### The one override: a person's own order

Depth-first makes a project a **block**. That is right until two projects run at once and one person is on both: she does all of A and then all of B, and there is no move in the tree that says "this one task from B, first" — the two are not siblings, so the only order between them is their projects'.

A queue ([`personQueue.js`](../src/utils/personQueue.js)) is the single override for that. It belongs to whoever owns the item — the person assigned to it, or the team it sits with when nobody is (`queueOwnerOf`), because early in a plan most items have a team and nobody, and those are exactly the ones where "which of these first" matters most. Assigning somebody moves the item out of the team's queue and into theirs, which is the right answer: it has an owner now. The override, and it is deliberately the narrowest one that answers the question: it permutes **only the slots that person's own work already holds** in the plan order. Nobody else's work moves, the plan's order is untouched, and dependencies and pinned dates still win, because those are facts rather than preferences.

Set it in the **Work order** view — the tab right after the work tree: one flat block per owner, their tasks in order as a two-line row (the path above the title, as the item dialog prints it), `⌥↑↓` and `⌥⇧↑↓`, or drag a row onto the place it should take. The rows are the tree's rows, so status, priority, size and the full editor are the same keys — deciding an order and adjusting what you are ordering is one sitting.

Flat, and that is the point. The schedule grouped by resource had the gesture for a while and it was the wrong home: there a person's work is still drawn as the project hierarchy it belongs to, which answers "what is this person carrying" and is the wrong shape for "in what order". It needed a paragraph of explanation in a header with no vertical space to spare, and its cursor could only be reached by pressing a key first — you could not click a row. The schedule keeps a read-only note on a person whose order is their own, because otherwise the bars would sit in an order nothing on screen explains.

It is stored against the person (`personQueues: { M1: [...] }`, a `planr-queues` block in the markdown) rather than as a number on every task — that is the difference from `seq`, which was a second global rank competing with the tree everywhere and propped up by a Gantt that rewrote priorities to make it stick. A hand-sorted person is marked on their own row in the schedule and reset in one click: an override nobody can see is the failure mode being avoided here.

### 4. Inherit deps from ancestors

A parent's `deps` block every leaf under it. Example: if `P1` depends on `D1`, all of `P1.1`, `P1.2.3`, etc. inherit that dependency. This is intentional — it lets you gate a whole sub-project on a single prerequisite.

### 5. Schedule each leaf

For each leaf in topological order:

**a. Earliest start from deps**

Walk all effective deps — `deps ∪ softDeps`, resolved to leaf IDs. Hard and soft deps block identically (a soft predecessor IS waited for); the distinction is purely visual in Gantt/NetGraph. Take the max `endWi` across them, plus one. No buffer week is added.

**a*. Fan-out auto-parallel batching**

Before step (a), the scheduler runs a pre-pass that groups leaves with
identical effective predecessor set, identical single assignee, and identical
pinnedStart. These are treated as "obvious siblings" of a fan-out from one
upstream task and scheduled as a batch:

- The lowest-id member (in topo order) becomes the **leader**; the others
  are **followers**.
- The leader is scheduled with the SUM of all members' effort, so the
  assignee's per-person counter reserves the whole batch span.
- Followers are skipped in the main loop. After the loop completes the
  scheduler replicates the leader's `startD` / `endD` / `weeks` onto each
  follower in `res`, and mirrors `tEW` so successors of any follower wait
  on the same batch-end position.
- Each follower carries `_autoParallel: true` for debugging.

The semantic: a single person works on N parallel tasks at once with 1/N
throughput per task → all N share the same calendar span. Multi-assign,
team slots, and handoff cascades stay on the regular path and are
unaffected.

**a′. Snapshot member profile at task start**

After the assignee is picked (or team slot resolved to a member), the scheduler calls `memberAtDate(member, monOfStartWeek)` and uses that snapshot for capacity + meetings. `capChanges` / `meetingChanges` therefore land at the correct point on the timeline — a 2027 task sees the 2027 profile, not the import-time one.

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

Default behaviour: every leaf queues on its assignee's `pF` cursor, in tree order. One person, one thing at a time, in the order the plan says.

`parallel: true` is the explicit opt-out: the leaf bypasses the queue and starts from its earliest legal floor (planStart / today / member-start), overlapping whatever the assignee is already doing. It only applies to a leaf without `deps` / `softDeps` — once a dependency is present the dep is the binding floor. Set per item in the node editor and in multi-select; it round-trips as `{parallel:true}` and shows as `≡` on the bar.

A pinned task bypasses the queue too, so a manual date stays visible as a conflict instead of being silently moved.

> This section described the opposite until September 2026 — "sequencing is link-driven", dep-free leaves run in parallel by default, and the UI auto-sets `parallel` when the last link goes. The code had moved on; the documentation had not, and it sent at least one planner looking for links to express an order the scheduler was never going to read. `docs/` is part of the change, not a follow-up to it.

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

## Offboard cascade & handoff

When a member's `end` date is set and their primary run on a task would need to extend past that day, the scheduler doesn't silently truncate the work. It runs a cascade:

1. **Primary segment** — the initially-picked member works up to and **including** their end date (end-dates are inclusive).
2. **`r.handoffPlan` overrides (optional)** — for each configured stage, the scheduler picks from the specified `assign[]` / `team`. Used when the user wants to name the successor explicitly.
3. **Auto-cascade, same team** — next available member from the same team, sorted by earliest-free date.
4. **Auto-cascade, cross-team** — any other team's members, tagged `crossTeam: true` so views can colour-code the step.
5. **Unscheduled tail** — if nobody absorbs the remainder, a synthetic segment with `personId: null` extends the bar past the last offboard at unit capacity. Renders as a red hatched stripe in the Gantt and surfaces as a `critical` risk in the report.

### Output

Each cascaded task has a `segments[]` array on the primary `scheduled` row:

```js
segments: [
  { personId, personName, startD, endD, effort, offboarded, handoff, crossTeam?, planned?, unscheduled? },
  ...
]
```

**Segments are also emitted as independent scheduled rows** (`id: "${origId}#2"`, `treeId: origId`, `isHandoff: true`) so every downstream consumer — person filters, TODO lists, ResView workload, Gantt rows, critical path — treats each offcut as its own schedulable item belonging to the same tree node. The primary row's `effort` / `endD` are clamped to its own segment; sums across `scheduled` no longer double-count.

## Known limitations

- **No cycle detection** — a cyclic dep graph will behave unpredictably
- **One member = one team** — can't split a person across teams with different capacities; workaround is multiple resource entries
- **Weekly granularity only** — the scheduler reasons in weeks, not days. Sub-week precision is a future upgrade
- **Handoff on pair-programming tasks** — multi-assign (`isMulti`) tasks are not cascaded. The scheduler flags the remainder as `truncatedByOffboard` instead.
