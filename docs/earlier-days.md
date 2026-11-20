# Earlier days

The date switch in the top bar goes both ways. A day after today is where a
change to people, teams and meeting plans takes effect
([dated-changes.md](dated-changes.md)). A day before today puts the whole plan
on screen as it stood that evening, to look at and to correct.

## What you see

Everything: the tree with its names, estimates, assignments and dependencies,
people and teams, vacations, settings. Tasks that were added later are not
there yet. The schedule is computed as of that day. Status, progress and
completion come from the history log, by the day each entry counts for. In an
item's history, entries after the day on screen are greyed.

A bar under the header says which day is on screen for as long as it is.
Scenarios are not offered meanwhile: a scenario has no past.

## What an edit does

An edit made on an earlier day counts from that day until today. It is applied
to every later day and to today's plan; a later change to the same field is
overridden by it. A status or progress change is written to the history on
that day (later entries it contradicts are removed), and a task finished there
is finished on that day. A task added there exists from that day on.

Undo works as always while the day is on screen. A visit that changed nothing
gives the plan its undo stack back on return; one that did change the plan
starts a new stack, because the earlier snapshots no longer lead to it.

## How far back

The full record starts with the first save made by a version that writes it
(1.7.0). Before that day the file only knows status and progress: an earlier
day then shows those as they were, and everything else as it stood on the
first recorded day. The bar says so.

A change made to the file outside Planr (another device, an editor) belongs to
the day Planr picks it up: when the changed file is reloaded, the plan as it
was here stays what the next save measures against, so that save records the
difference in today's entry. People, teams and meeting plans are matched by
name for this (`inIdsOf`), since a Markdown plan hands out new ids on every
load. A file that changed while Planr was closed is not compared with anything.

"Go to an earlier day…" in the palette and the File menu opens the date switch.
There is no separate backdating mode any more: an edit on an earlier day is
what it did, with the plan of that day on screen while you make it.

## How it is stored

`data.dayLog` holds one entry per day on which the plan changed:
`{ day, back }`, where `back` is a patch (as in [scenarios.md](scenarios.md))
that turns the plan at the end of that day into the plan at its start. The
plan at the end of any day is today's plan with the `back` of every later
entry applied, newest first. A day on which nothing changed costs nothing, and
a day that ends as it began leaves no entry.

In a Markdown file this is the `## Log` section, a `planr-log` block with one
JSON line per day. People, teams and meeting plans are named there, not
numbered, for the same reason as in scenarios.

While an earlier day is on screen, `data` is that day's plan (as with a
scenario). The real plan waits in `past.base`, and what is saved is
`applyPastEdit(base, baseScreen, data, day)`: the edit, taken as the
difference between what was on screen when the visit started and what is
there now, applied to today and to the state at the end of every logged day
since, with the log entries rebuilt from those states. Rebuilding from states
instead of editing patches keeps the log consistent by construction.

Code: `src/utils/dayLog.js`. Tests: `src/utils/__tests__/dayLog.test.js`,
`src/__tests__/pastDay.app.test.jsx`.
