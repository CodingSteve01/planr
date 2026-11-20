# Dated changes

"From March, Noah works 60 %." "From the second quarter the dev stand-up is
twice a week." A change that takes effect on a date.

## One mechanism

```js
data.changes = [{ from: 'YYYY-MM-DD', patch }]   // ascending by `from`
```

`patch` has the shape of a scenario's patch ([scenarios.md](scenarios.md)) and
uses only its `set` part, on the fields that can honestly differ by date:

| List | Fields that can carry a date |
|---|---|
| `members` | `cap`, `weeklyHours`, `meetings`, `meetingPlanIds` |
| `teams` | `meetingPlanIds` |
| `meetingPlans` | `meetings` |

Everything else about a person, a team or a meeting plan is timeless and is
edited as always. Joining and leaving are not in here: they are `start` and
`end` on the person, which is what they always were.

A scenario is a patch *beside* the plan; a dated change is a patch *along* it.
The code is `src/utils/effective.js`.

### What this replaced

Two list editors inside each person's dialog — `capChanges` and
`meetingChanges` on the member. One editor per field, for people only: a team's
meeting plans or a plan's content could not change on a date at all. And the
scheduler lost every meeting plan after the first dated meeting change, because
it was handed the entry's raw plan ids and has no catalogue to resolve them in
— capacity jumped up on exactly the day it should have gone down.

`migrateLegacyChanges` moves those lists into `data.changes` on load. The
Markdown parser still reads the old `*Capacity plan:*` / `*Meeting plan:*`
lines; the writer no longer has anything to write them from.

## Three readers

- **`resourcesAsOf(data, date)`** — people, teams and meeting plans as they are
  on a date: the base with every change up to that day applied. This is the
  lens the Resources view shows *and edits through*; without a date chosen the
  date is today.
- **`foldEdit(data, kind, edited, date)`** — an entity as it was edited through
  that lens, put where it belongs. Timeless fields go to the base. Dated fields
  go into the change at that date, as far as they differ from what held the day
  before; set back to that earlier value, they leave the change again.
  With no date ("now"), dated fields are written to the base and any change up
  to today that set them is cleared of them — otherwise the edit would be
  overruled by an older change and appear to do nothing. A field that only
  *looks* current because of a change is never copied down into the base.
- **`compileMembers(data)`** — the people as the scheduler reads them. The
  scheduler knows one way for a person to differ by date: per-person
  `capChanges` / `meetingChanges`, read through `memberAtDate`. So the whole
  timeline is flattened into exactly that, per person, at every date on which
  anything that reaches them changes — their own values, the plans of a team
  they are in, the content of a plan they attend — with the meetings already
  resolved. `App.jsx` (`enrichedMembers`) and the scenario comparison
  (`schedulePlanData`) both use it, so the two schedules cannot drift.

## On the surface

Built on the scenarios' pattern, because it is the same kind of thing: not a
place in the app but a state of what you are editing.

| Element | Says |
|---|---|
| Switch in the top bar | Which day you are working on. "Today" and quiet by default; its menu lists the dates something changes on and takes a new one. |
| Bar under the top bar | "Effective date · from 01.03.2027", how many things change that day, and which fields that covers. |
| The dialogs | A person's, a team's and a meeting plan's dialog are the editors, unchanged. While a date is on, a line in the dialog says so; "Planned changes" lists what is planned for this entity and takes you to that day. |

Picking a date opens the Resources view, the only place the lens applies.
Removing somebody while a date is on makes them leave the day before; adding
somebody makes them join on that day.

The colour is the accent, not the scenario's violet: a scenario is another
truth, this is the same truth further along. The date is not persisted —
like backdating, a date you forgot about would quietly send every later edit
to the wrong place.

Inside a scenario it works the same: the scenario's dated changes are part of
what differs from the plan.

## In the file

````
## Changes

```planr-changes
v1
{"from":"2027-03-01","patch":{"members":{"set":{"@Noah Berg":{"weeklyHours":24}}}}}
```
````

One JSON line per date. People, teams and meeting plans are named, not
numbered (`@`, `#`, `$`), for the reason given in
[scenarios.md](scenarios.md#in-the-file): a Markdown plan has no ids for them
that survive a reload. A name the plan no longer has takes its change with it
(`pruneChanges`).

## Not covered

- **Changing team on a date.** The scheduler's team pools do not vary over
  time; a person is in a team or is not. Until that changes, a team switch is
  timeless.
- **`capMode`** (manual or derived) is timeless.
