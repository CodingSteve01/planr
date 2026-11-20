# Scenarios

A scenario is a second version of the plan: reassign work, enter an absence,
hire somebody, move a date — and see what that does, without the plan having
changed. When the answer is good, the scenario becomes the plan. When it is
not, it is discarded, or kept for the next meeting.

## The model: a scenario is a patch

A scenario is **not a copy** of the plan. It is the list of what differs
(`utils/scenario.js`, `diffPlan`), and the scenario on screen is the plan with
that list applied (`applyPatch`).

This is the decision everything else follows from. A copy goes stale the first
time somebody finishes a task: next week the "comparison" would report a
week's progress as something the scenario did. With a patch, progress recorded
in the plan is in the scenario too — it never had an opinion about it — and a
scenario stays comparable for as long as it is kept.

```
plan (in the file)  ──┬──────────────────────────────►  what every load reads
                      │
scenario = patch  ────┘  applyPatch(plan, patch)  ───►  what is on screen
```

What a patch holds, per part of the plan:

| Part | Compared by | Stored as |
|---|---|---|
| `tree`, `members`, `teams` | `id`, then field by field | `add` (whole entries), `del` (ids), `set` (id → changed fields), `unset` (id → removed fields) |
| `vacations`, `holidays` | the entry itself | `add` / `del` |
| `personQueues`, `meta` | key | `set` / `del` |
| everything else (`sizes`, `risks`, …) | the whole value | `top` / `topDel` |

Never in a patch: `historyEvents` (a what-if records nothing as having
happened), `roadmapAssignment` (derived layout) and `scenarios` itself.

### When the plan moves on underneath

- A change to something the plan no longer has (an item deleted since) cannot
  be applied. It is left out and **counted**: the bar and the comparison say
  "2 no longer fit" rather than quietly showing less than was saved.
- A task the scenario added may meet a task the plan has added since under the
  same id. The plan's keeps the id; the scenario's moves to the next free one,
  with its children and every reference the scenario makes to it
  (`renumberTakenAdds`).
- Re-parenting inside a scenario renumbers ids, as it does in the plan, so the
  list of changes shows it as "removed" plus "new". The result is correct; the
  description is blunt.

## In the App

`App.jsx` keeps one extra piece of state, `scn = { id, base, conflicts }`.
While it is set:

- `data` **is the scenario** — every view, edit, undo step and export works on
  it exactly as on the plan. There is no second editing path and no
  scenario-aware view code beyond two overlays (below).
- `scn.base` is the plan, untouched, waiting.
- `fileData` is what goes into the file, the local cache and the snapshot
  ring: the plan plus each scenario as its patch. The scenario on screen has
  its patch recomputed from `diffPlan(scn.base, data)` on every change. A
  reload therefore always opens on the plan.
- Looking is not changing: while a visit has not altered what the scenario
  amounts to (`scn.entryPatch`), its stored entry is written back exactly as it
  was — patch, date and the count of changes that no longer fit. Otherwise
  opening a scenario whose plan has moved on would save the shortened patch on
  sight and lose the record that something was left out.
- No history events are written. `lastSavedLeavesRef` keeps pointing at the
  plan, so the first save after **applying** a scenario records its effects as
  what they are: changes to the plan, dated then.

Every operation is a transformation of that file-shaped document followed by
`showDocument(fd, scenarioId)`: switch, create (`patch: null`), duplicate,
apply (the scenario's data becomes the plan, the scenario leaves the list),
delete. Apply and delete pass the previous document as an undo step, so ⌘Z
takes either back — which is why neither asks "are you sure?" (principle 5) —
and both leave a notice where the bar was that says what happened and carries
the undo button, because three different ways out of a scenario must not end
on the same silent screen.

### Undo across a visit

"No confirmation, because undo" is only true while the undo is there, so a
visit to a scenario must not cost the plan its history:

- The plan's stack is set aside on entering a scenario (`planHistoryRef`) and
  comes back on leaving.
- Each of its snapshots has its scenario list brought up to date first
  (`carryScenarioList`). Without that, undoing an edit made to the plan before
  the visit would also throw away everything done in the scenario during it.
- A scenario starts each visit with an empty stack: its earlier snapshots were
  measured against a plan that may have moved since.

`resetHistory()` — called wherever a different document is loaded — also
leaves the scenario.

## Comparing

`utils/scenarioCompare.js` schedules the plan a second time
(`schedulePlanData`, the same inputs App.jsx derives for the screen) and lays
the two side by side:

- **Projects** — each root's end in the plan and in the scenario, the shift in
  calendar days, and whether a target date is newly missed or newly held
  (`deadlineStatus`, the same source every other surface uses).
  And beside the end, how many of the project's open tasks move and by how
  much at most. A project's end is set by whatever finishes last in it, so
  twenty tasks can slip by months while the end holds because another team was
  always going to finish later. Judged by its end alone that project is "not
  affected"; here it is listed, marked "end holds", and counted in "projects
  affected" on the bar.
- **Teams** — people and capacity in each team today, how many of its open
  tasks move, and when the last of its work ends, before and after. This is
  the level at which a change to one person becomes a statement about the
  work: "Ben is out" is one line in the list of changes; what it means is
  that Frontend has three people instead of four and nearly everything that
  sits with Frontend finishes later, whoever it was assigned to. The top of
  the dialog says exactly that in a sentence per affected team. A person in
  two teams counts in both — their one capacity is not split
  ([scheduler.md](scheduler.md#multi-team-members)). People who have left or
  not yet started do not count.
- **People** — open work and "busy until", before and after. Deliberately not
  coloured: somebody free earlier is not good news, it is unplanned capacity.
- **Tasks** — every leaf whose window or person differs, largest shift first.
- **Changes** — what was done to the scenario (`describeChanges`), one entry
  per thing the user did, each with a "take back" (`revertChange`). Fields the
  app derives on its own (a parent's status, a finished task's window) travel
  in the patch but are not listed.

Both schedules are computed on the same day from the same inputs but for the
patch, so a difference is the patch's. The test for that is the plan compared
with itself: it must be silent (`scenarioCompare.test.js`, also against a real
plan file when `PLANR_REAL_FILE` points at one).

Overlays put the comparison into the views:

- **Schedule** — a dashed ghost bar where a task sits in the plan, behind the
  bar that shows where the scenario puts it. Only for bars that moved.
- **Work tree** — a stripe on the leading edge of rows the scenario changed.
- **Overview** — in the timetable, a station whose work moves carries the
  scenario's colour and the furthest shift ("+13 wk"), with the count in its
  tooltip; on the subway map the same stations get a dashed ring.

**The review window is paused while a scenario is open.** Its amber rows
("progressed since the 5th") sat beside the scenario's marks and were read as
the scenario's effect — on a real plan, as "taking a Frontend person out
affects Backend". The window is not cleared: the filter keeps it and says
"paused", and it paints again on the way back to the plan. Two overlays at
once answer two questions at once, which is none (principles.md, "overlays
belong to a moment").

## On the surface

| Element | Where | Says |
|---|---|---|
| Switch | top bar | Which truth is on screen. Quiet for the plan, in the scenario colour otherwise. Its menu lists the scenarios and starts a new one. |
| Bar | under the top bar, only in a scenario | Name, number of changes, what they come to; compare, apply, back to the plan, and behind "more": rename, duplicate, delete. |
| Frame | over the whole app | That this is not the plan, even with the bar scrolled out of mind. An overlay, not a shadow — every pane paints an opaque ground. |
| Notice | where the bar was, for a few seconds | "X is now the plan" / "X deleted", with Undo. |
| Comparison | dialog | The four tabs above. Remembers its tab between openings. |

The bar answers to **its own width**, not the window's (a container query):
an Obsidian split is 700 px wide in a window twice that. What gives way, in
order: the sentence, the Compare button (the count next to the name opens the
same dialog), the long form of "apply". The way back to the plan keeps its
place and its label at every width.

Deleting is called deleting, not "discard": in most editors that word means
"drop my unsaved changes", which is exactly what somebody leaving a scenario
without applying it is looking for — and it would have cost them the scenario.
It sits behind "more", away from the two buttons used most.

Red and green in the comparison mean one thing: a target date crossed, in
either direction. A bar that merely moves is in neither colour, and neither is
a person who is booked longer or shorter.

`--sc` is the one colour that means "a scenario" and it means nothing else
(docs/design-tokens.md). An export made from a scenario carries the scenario's
name in its title, because a PDF travels without the bar.

Palette: "New scenario…", one entry per scenario, and while one is open
"back to plan", "compare", "apply".

## As a report

**PDF** in the comparison dialog, the "Scenario comparison" card in the Report
view (there only while a scenario is on screen) and "Scenario: comparison as
PDF" in the palette all produce the same document: what the scenario assumes,
the sentence per affected team, the figures, and the tables for projects,
teams, people and the forty tasks that move furthest.

It is built from the same model as the dialog (`useScenarioReport` beside
`ScenarioCompare`) and only laid out in `utils/scenarioReport.js`, so the paper
cannot say something the screen did not. What the paper has to do that the
screen does not is say on every page that this is a scenario: a PDF is
forwarded without the bar and the frame. Hence the tag beside the title, the
scenario's name in the footer of every page, the scenario colour — which no
other export uses — and a closing line that nothing in it has been decided.

The ordinary exports made while a scenario is open (Management Summary, Gantt,
…) describe the scenario and carry its name in title, footer and file name.

## In the file

Markdown plans get a section at the end:

````
## Scenarios

```planr-scenarios
v1
{"id":"s1","name":"Team at half strength","createdAt":"…","patch":{…}}
```
````

One JSON line per scenario. People, teams and meeting plans are written **by
name** (`@Anna Noor`, `#Backend`, `$dev`), not by id: a Markdown plan hands out
fresh ids for them on every load, so an id in the file would point at nobody
the next time it is read (`toPortablePatch` / `fromPortablePatch`). A name the
plan no longer has drops out of the scenario and is counted, like any other
change that no longer fits. Two people with one name are told apart by order
(`@Sam`, `@Sam~2`).

JSON plans keep their ids; `data.scenarios` is stored as it is.

Everything above the section is byte-identical to the file without scenarios,
which is what makes the feature safe to try on a real plan — and safe for the
Obsidian plugin, which reads and writes the same file through the same code.
