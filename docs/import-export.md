# Import / Export

Planr supports two persistent formats (`.json` and `.md`) and several export-only formats (PDF, DOCX, CSV, Sprint MD, Mermaid, SVG, PNG).

All export operations are reached through a single **Export…** dialog in the topbar (`src/components/modals/ExportModal.jsx`). Every PDF carries the project name, export kind and generation date in the footer.

## Persistent formats

### JSON — full fidelity

The `.json` format is the internal data shape serialized directly via `JSON.stringify(data, null, 2)`. Everything round-trips exactly: IDs, field names, optional fields, everything.

**When to prefer JSON:**
- You want stable, hand-crafted team/member IDs (e.g. `FE`, `alex`)
- You're diffing project files in git and want a predictable format
- You won't be editing the file by hand

### Markdown — human-readable

The `.md` format is human-editable and renders nicely in any Markdown viewer (GitHub, Obsidian, etc.). The parser is `parseMdToProject` and the writer is `buildMarkdownText`, both in `src/utils/markdown.js`.

**Sections:**

- `# Project Name` — becomes `meta.name`
- `## Plan` — `Start` / `End` key-value table → `meta.planStart` / `meta.planEnd`
- `## Teams` — `Name | Color` table
- `## Resources` — bulleted list: `- **Full Name** \`SHORT\` — Team, Role (cap%), 40h/w, 25d/y, ab YYYY-MM-DD, bis YYYY-MM-DD`. A person in several teams writes them joined by ` + `, primary first: `— Backend + Frontend, Dev`. Older files with one team read unchanged.
  - `(cap%)` is omitted when the member is in derived-capacity mode (see next field)
  - `40h/w` appears only when `capMode === 'derived'` — signals the weekly-hours baseline
  - `bis DATE` is the offboarding date (inclusive)
  - Sub-bullet `*Meetings: Standup 0.25h/d, Retro 0.5h/2w, Allhands 1h/mo*` lists recurring meetings (frequency shorthand: `d` daily · `w` weekly · `2w` biweekly · `mo` monthly)
- `## Vacation Weeks` — `Person | Week (Mon) | Note` table
- `## Holidays` — `Date | Name | Source` table
- `## Work Tree` — nested bullet list with inline metadata

**Work tree bullet format:**

```
- **ID** Name [type] (date) (SIZE Nd ×factor) NN% — Team [assignees] {tags} ⏰decide:DATE 📌DATE ≡
  *Requires: depA (label), depB*
  *note*
```

- `type`: `[deadline]`, `[painpoint]`, `[goal]` — the root's focus type.
  Files written before this carried `⏰` / `⚡` / `🎯` here and still read
  correctly (`GT_MARKS` in `constants.js` lists every accepted form). The
  writer used to emit `⏰` for a deadline while the reader looked for a
  different marker, so a save-then-load moved the emoji into the project's
  **name** and dropped the type; plans carrying that damage are repaired on
  load.
- `SIZE`: T-shirt label (XS/S/M/L/XL/XXL) — derived, not stored
- `×factor`: only if factor != 1.5
- `NN%`: progress (only if 1–99)
- `[assignees]`: short names, comma-separated
- `{tags}`: `prio:N`, `ord:N` (the order of the work — see docs/scheduler.md; `seq:N` is still accepted on read from older files and ignored), `team-lock:true`, severity, `conf:committed`/`conf:estimated`/`conf:exploratory` (only when non-default)
- `⏰decide:DATE` / `📌DATE` / `≡`: decide-by, pinned start, parallel flag
- Sub-bullets: `*Requires: ...*` for deps (soft-deps prefixed with `~`, e.g. `~P1.2`; the pre-rename tag `*Benötigt:*` still reads correctly), `*Phases: ...*` for phases (`*Phasen:*` still reads correctly), `*Handoff: → Name (Team); → Name2*` for explicit handoff-plan stages, `*…*` for notes
- Member sub-bullets: `*Capacity plan: YYYY-MM-DD→NN%, YYYY-MM-DD→NN%HHh/w*` and `*Meeting plan: YYYY-MM-DD→[Name Xh/freq, ...]*` for time-shifted profile changes (the pre-rename tags `*Cap-Plan:*` / `*Meeting-Plan:*` still read correctly)

**Phases line format:**

```
*Phases: ✅RE, 🟡Development(Frontend), ○Test(QA)*
```

- `✅` = done, `🟡` = wip, `○` = open
- Team in parentheses after the name (only if set, resolved by name)

**Task Templates section** (optional, after Work Tree):

```markdown
## Task Templates

### Full-Stack Programming
1. RE
2. Detail Planning
3. Development — Frontend
4. Test — QA
```

Each `###` heading starts a template, numbered lines are phases. Team after ` — `.

**When to prefer Markdown:**
- You want to review/edit the plan in a text editor or on GitHub
- You want diffs to read as English, not JSON
- You don't mind if internal team/member IDs get renamed on round-trip

### Round-trip: what's preserved

| Field group | JSON ↔ JSON | MD ↔ MD | JSON → MD → JSON |
|---|---|---|---|
| All tree item fields (name, status, team, best, factor, prio, displayOrder, severity, progress, type, date, decideBy, pinnedStart, parallel, confidence, deps, softDeps, dep-labels, teamLock, assign, note, description, phases, templateId) | ✓ | ✓ | ✓ (via name-lookup) |
| Member time-shifted profile (capChanges, meetingChanges) | ✓ | ✓ | ✓ |
| Task templates | ✓ | ✓ | ✓ |
| Member fields (name, team, role, cap, vac, start) | ✓ | ✓ | ✓ |
| Team fields (name, color) | ✓ | ✓ | ✓ |
| Vacations | ✓ | ✓ | ✓ |
| Holidays array | ✓ | ✓ | ✓ |
| Plan start/end | ✓ | ✓ | ✓ |
| **Team IDs** (e.g. `FE`, `BE`) | ✓ | ✓ | ✗ regenerated as `T1, T2, …` |
| **Member IDs** (e.g. `alex`) | ✓ | ✓ | ✗ regenerated as `m{timestamp}{i}` |
| `meta.holidays` preset marker (e.g. `"NRW"`) | ✓ | — | ✗ lost (but the holiday array itself is preserved) |

**Mixed-workflow implication:** if you pair a human-edited MD with a JSON-editing workflow (or vice versa), expect Team/Member IDs to drift. The semantic data stays intact because all references (`tree.team`, `tree.assign`, `vacations.person`) are re-resolved through name-lookup. If stable IDs matter to you, stick to one format.

## Auto-save and file mount

- **localStorage** (`planr_v2`) is always the fallback — every edit lands there immediately (300 ms debounce) so nothing is lost on refresh even without a mounted file
- Mount a file via **Open File…** or the New Project Wizard's "save as" step
- Mounted files use the **File System Access API** — no copies, no conversions
- **Debounced auto-save**: the file on disk is written 5 s after your last edit; rapid edits coalesce into one write
- **External change polling** — every 5 s, Planr reads the mounted file's timestamp; if it's newer than the last save, the external content is loaded (so you can edit the file in another app and the changes pick up)

The auto-save format follows the mounted extension: mounted `.md` → writes MD, mounted `.json` → writes JSON.

### Save status pill

One consolidated indicator in the topbar replaces the prior three-item status row. Possible states:

| State | Label | Color | Meaning |
|---|---|---|---|
| No file mounted | `no file mounted` | grey | localStorage only; data is safe but not on disk |
| Synced | `all saved · 14:32` | green | Disk and app match |
| Pending | `unsaved · saving in 4s` | amber | Debounce countdown, ticks down live |
| Writing | `saving…` | blue | Write in flight |
| Permission lost | `⚠ click to re-mount` | amber, clickable | Browser dropped the handle — click to re-pick |
| Auto off | `auto-save off · last saved HH:MM` | grey | Use 💾 or `Ctrl+S` |

Tooltip on each state explains the underlying mechanic.

### Re-mounting after lost permission

Browsers drop `FileSystemFileHandle` write permission on page reload and in some other scenarios. Planr detects this and shows `⚠ click to re-mount`. A click opens a Save-As dialog with the original filename pre-selected — confirm and the handle is re-created with a fresh permission grant.

Why not just re-request permission silently? The browser's `requestPermission()` call requires an unbroken user-gesture context; any `await` before it typically invalidates that context, and the prompt never appears. Going straight to Save-As is the reliable path.

### Disk icon (💾)

Appears next to the filename whenever there's anything to save — **dirty** (localStorage ahead of disk) **or** pending (debounce window not yet elapsed). One click skips the countdown and writes immediately. `Ctrl/Cmd+S` does the same.

## Importing a Jira board

Both existing Jira paths went outwards: the CSV export creates the tickets, and
the reconcile half (Run mode's drift section, `jiraSync.js`) keeps the plan
honest against them afterwards. The direction everybody actually starts in was
missing — the tickets are already in Jira, and nobody retypes two hundred of
them to try a planner.

**Where**: the onboarding screen ("Stattdessen aus Jira importieren"), the File
menu, and the `/` palette. The first two are the same dialog; the difference is
that without a plan it creates one, and with a plan it appends to it.

**What goes in**: Jira's own *Export → CSV (all fields)*, or a copied search
result. Parsing is `parseJiraTable()` from [`jiraSync.js`](../src/utils/jiraSync.js)
— the same forgiving one reconciliation uses, so a paste that works for one
works for the other. It finds its columns by alias in both languages and gives
up on a row rather than on the file.

**What comes across** ([`jiraImport.js`](../src/utils/jiraImport.js)):

| Jira | plan | notes |
|---|---|---|
| `Parent` / `Epic Link` | tree position | `Parent` wins when both are filled. A parent outside the paste makes the row a root rather than losing it; a cycle is refused rather than followed. |
| `Summary` | name | |
| `Status` | status + progress | via `mapJiraStatus` — the same word list reconciliation uses, German included. Anything unrecognised is open, never done. |
| `Priority` | `prio` 1–4 | an unknown word lands at 3. Guessing "critical" out of a word we do not know would put work at the front of the schedule on no evidence. |
| `Original Estimate` | `best` (days) | seconds (28800 = 1d), `3d 4h`, `2w`, or a bare story-point number. A parent's estimate is dropped: the plan derives it from its children, so keeping Jira's would double-count. |
| `Assignee` | `assign` | matched against the plan's people by name, by the local part of an email, or by id. **No fuzzy match** — a wrong assignee is worse than none, because the scheduler acts on it. |
| `Issue key` | `customValues.jira` | which is exactly where `linkHealth()` looks. Import on Monday, reconcile on Friday. |

**What does not**: everything the plan is for — dependencies, capacity, dates,
teams. Those are the work the import saves you time for.

Two choices, both in the dialog and both visible in the preview before anything
is written: whether to wrap the import in one project (on by default, so an
import never scatters loose projects into a plan that has its own), and whether
to create the people the paste names that nobody on the plan matches (off by
default — importing a board can name a dozen people who are not on this team,
and a resource list quietly filled with them makes the capacity numbers wrong
in a way nobody would think to look for).

Numbering starts past whatever the plan already has, so an import cannot land
on top of an existing project, and the whole thing goes through `mutate()` —
one ⌘Z takes it back, which is the only thing that makes trying it safe.


## Export-only formats

### CSV

Tabular export. One row per item with columns for ID, level, name, status,
`Dropped`, team, estimate, factor, priority, dependencies, phases and notes.
Good for spreadsheet post-processing. The `Dropped` column carries `yes` for
dropped work, so a round trip through a spreadsheet cannot revive it as
ordinary open work.

### Sprint Markdown

`exportSprintMarkdown()` — Markdown list of upcoming tasks within a chosen horizon (days), grouped by person, ordered by start date. Intended to paste into a stand-up agenda.

### Mermaid

`exportMermaid()` — dependency graph as a Mermaid diagram. Paste into any Mermaid-capable viewer (GitHub, Notion, etc.) to render a static topology. Dropped
items get their own `dropped` class (grey, dashed), applied after the status
classes so it wins — they are part of the structure but not work ahead of the
team.

### SVG

Two flavors:

- `exportSVG()` — network graph SVG
- `exportGanttSVG()` — Gantt chart SVG (scheduled bars per team/person, date axis, week scale)

Both use `XMLSerializer` to dump the live SVG DOM.

### PNG

- `exportNetworkPNG()` and `exportGanttPNG()` — rasterize the SVG via a canvas and download as PNG

### PDF exports (`src/utils/pdfExports.js`)

All PDFs are generated client-side via [`pdfmake`](https://pdfmake.github.io/) (dynamically imported, so the ~500 kB payload is only fetched on first use). Text is fully selectable, images are embedded as high-resolution PNGs (3× scale) so small labels stay readable.

Four PDF variants:

| Export | Purpose | Content |
|---|---|---|
| `exportSummaryPDF` | Management summary, shareable | Per-project status table, findings, roadmap image, goals/deadlines, team-capacity cards, critical path |
| `exportGanttPDF` | Full schedule handoff | Hi-res Gantt image (page size picked automatically: A4 / A3 / A2 landscape based on native width) + schedule table grouped by team |
| `exportWhatWhenPDF` | "What comes when" — horizon-aware | Items grouped into buckets (week / month / quarter). Near-term items show exact dates, far-term or uncertain items collapse to coarser granularity |
| `exportTodoPDF` | Sprint / TODO list for a chosen horizon | Tasks per person within N days, with horizon-adjusted date labels and confidence badges (●/◐/○) |

#### Numbers must match the screen

### Page 1 of the management summary

It opens with a verdict sentence and one status word, then one row per project
— forecast, target date, deviation, progress and that project's own confidence
split. It used to lead with nine KPIs and a single programme-wide end date,
which is the slowest project's date wearing every other project's name: true,
and no use to anyone deciding about any one of them.

Below that, at most three findings, sorted by severity and then by magnitude,
each split into what it is, what it costs and what is being asked. The
remainder is counted in one line rather than listed.

Three things that layout depends on, all of them learned the hard way:

- The findings heading is the **first row of the findings table**, not a
  heading above it. `STYLES.h2` carries `headlineLevel`, which asks pdfmake to
  break the page *before* a heading so it stays with what follows; inside a
  table that threw the whole table onto the next page.
- A cell that a `colSpan` swallows still has to carry `text`. An object of
  nothing but `border` is rejected with *Unrecognized document structure* and
  the export produces no file at all. `pdfGlyphs.test.jsx` walks every node of
  all four documents against pdfmake's own rule, because pdfmake is mocked in
  the suite and never validates anything itself.
- Embedded SVG is drawn by svg-to-pdfkit against pdfmake's bundled **Roboto**,
  not the Plex faces the document body uses. Roboto has no arrows, so `→` —
  the character `PDF_GLYPH_MAP` maps *towards* — prints as an empty box in
  there. `SVG_ONLY_SWAPS` in `pdfExports.js` is the second pass that fixes it.

Confidence is counted on **remaining** effort. Counting the whole of a
half-finished item made the three buckets sum past the open total, and two
figures that do not reconcile on one board page cost more than the precision
is worth.

Every export gets its aggregate figures from `buildReportModel()` (`src/utils/report.js`), which in turn uses `src/utils/progress.js` — the same module the Overview KPI row renders from. That module owns both the maths and the formatting:

| Figure | Definition | Helper |
|---|---|---|
| Progress % | effort-weighted, phase-aware: weight = `scheduleEffort` (fixed duration days, else realistic PT), per-leaf progress = `leafProgress` (phases > manual `progress` > status, capped at 99 % while not done) | `effortWeightedProgress()` |
| PT done | same weighting, absolute — only ever grows, so scope growth doesn't hide delivery | `deliveredEffort()` |
| Total PT | sum of `scheduleEffort` over all leaves | `totalEffort()` |
| Label format | one decimal, trailing `.0` trimmed (`26.8%`, `40%`) | `progressPctLabel()` |

Deadline/goal badges follow the same rule via `deadlineStates` (from `deadlineStatus()`, `src/utils/timeline.js`): the exported Risk column and the risk list show `at risk` only for *open* work, and `done` / `done · late` for finished work — identical to the Overview cards.

Per-goal figures stay the `N/M done` ratio (`rootData.prog`) because the Overview goal cards and the "Top items" table show that ratio; the effort-weighted variant is available as `rootData.progEffort`.

Never compute an aggregate percentage inline in an export. Counting done leaves (`done / total`) is *not* the headline figure — that mismatch once made the Management Summary PDF disagree with the screen (regression test: `src/utils/__tests__/report.test.js`).

**Horizon-aware date labels** (`horizonLabel`, `horizonBucket` in `pdfExports.js`): the label granularity is the *fuzzier* of (distance from today) and (planning confidence). Rules:

- `committed` and ≤14 days away → exact `YYYY-MM-DD`
- `committed` and 15–60 days → `KW 17, Apr 2026` / `Week 17, Apr 2026`
- `estimated` or 60–180 days → `April 2026`
- `exploratory` or >180 days → `Q2 2026`

This keeps near-term plans concrete without forcing false precision on long-horizon or low-confidence items.

### The Subway-Map page (Management Summary)

The map is embedded as vector SVG with the **renderer's own viewBox**: it is
cropped to the lanes in use and grows past 1400×800 once a plan has more than
eight projects. It used to be pinned to `0 0 1400 800`, which on a ten-project
plan pressed the top lane against the page edge. The node is `fit` into
770×470pt, so a tall board shrinks onto the page under its heading instead of
running off it.

Lanes and colours are locked per project in the plan file (`## Roadmap`,
`planr-roadmap` block). A lane or colour stored for **two** projects — the old
eight-lane board wrote such duplicates once a plan outgrew it — is honoured
only for the first (longest project first); the second gets a free slot, and
`mergeRoadmapAssignment` writes that repair back to the file on the next
render. A clean stored slot is never overwritten, including by a filtered
render. Covered by
[`roadmapDuplicateLanes.test.js`](../src/utils/__tests__/roadmapDuplicateLanes.test.js).

### Project roadmap pages (Management Summary)

After the Subway-Map, the Management Summary appends one **project roadmap**
page per top-level project — the same calendar view the Overview shows for a
single project (`utils/projectRoadmap.js`): packages as rows on a month axis,
tasks as stops, today and the deadline as lines. Toggle: `+ project roadmaps`
on the Management Summary card, on by default.

Rendered for *every* root, never only the one currently picked on screen —
see the scope rule below. `prepareProjectRoadmapSvg` pins the SVG size and
rewrites the theme variables and web fonts to print colours and Roboto,
because pdfmake's SVG renderer resolves neither and silently blanks the text
otherwise; a test asserts no `var(--…)` or unregistered font survives into the
document.

### The printed palette

The PDFs and the HTML report draw from
[`printPalette.js`](../src/utils/printPalette.js), which mirrors the **light**
block of `App.css` — print is always on white. They used to carry a palette of
their own, left over from before the rebuild: ink at `#1a1e2a`, headings in
`#1d4ed8`, tables banded `#edf2fa`, greens at `#16a34a`, ambers at `#d97706` —
the Tailwind-ish blues the screen no longer uses. A management summary that
does not look like the tool it came out of reads as a different document, and
the figures on it read as different figures.

The screen resolves its colours through CSS variables and a PDF cannot, so the
values are written out once, in one module.
[`printPalette.test.js`](../src/utils/__tests__/printPalette.test.js) holds
each of them to its token in the stylesheet, and fails on any colour written
into `pdfExports.js` or `report.js` that is not in the palette — comments may
still name the old values, which is the record of what changed.

**What is NOT aligned**: the typeface. The screen is IBM Plex Sans / Mono with
Instrument Serif for the headline figure; the PDF is Roboto, because that is
the only family in pdfmake's bundled font store (see below). Matching it means
embedding Plex as base64 in the bundle, which is a separate decision about
download size.

### The typeface: IBM Plex Sans, embedded

pdfmake bundles exactly one family — Roboto — and a PDF cannot resolve a
webfont, so a document that should look like the app has to carry the app's
face with it. The PDFs are set in **IBM Plex Sans**, the screen's own, embedded
and subsetted in [`pdfFonts.js`](../src/utils/pdfFonts.js).

**Subsetted, because the full faces are ~218 KB each.** Cut to exactly the code
points the PDF layer promises to render, Regular and Bold together are 143 KB
of base64, landing in their own lazily-loaded chunk (75 KB gzipped) that is
fetched only when somebody exports. Regenerate with
[`tools/build-pdf-fonts.mjs`](../tools/build-pdf-fonts.mjs), which reads the
promise out of `pdfGlyphs.js` and subsets to it — so the font and the promise
define each other rather than drifting.

**Sans only.** Plex Mono is not embedded: pdfmake's `mono` style is defined and
applied by no export, and Mono's coverage is narrower than Sans's — carrying it
would have cost 94 KB and forced the supported set down to the intersection,
which loses modern Greek. The script will generate it the day something needs
it.

### What the font can draw

pdfmake draws a missing-glyph box — silently — for anything the face does not
cover, so [`pdfGlyphs.js`](../src/utils/pdfGlyphs.js) holds the **real cmap of
the embedded faces** (the intersection of Plex Sans Regular and Bold: 804 code
points, 74 ranges) plus a substitution table checked against it.
`sanitizePdfDoc` runs over every docDefinition right before `createPdf`; the
roadmap SVG preparers apply the same table by hand, because embedded SVG
deliberately bypasses the doc pass (svg-to-pdfkit does its own text handling).

The swap from Roboto's 927 code points is **not one-sided**. Plex has real
arrows and a real tick, which Roboto did not — `→` and `✓` now print as
themselves instead of as `»` and `√`, which read as typos in a document you
hand to somebody. What it lacks is the geometric shapes `● ○ ■`, so the status
triple keeps its meaning through fill instead: `•` for work under way or done,
`◊` for work not started. Also gone: archaic Cyrillic and a handful of rare
typographic symbols. Every modern Greek and Cyrillic letter is still there.

`src/__tests__/pdfGlyphs.test.jsx` walks all four PDFs and fails on any
character outside the set.

To regenerate the ranges after changing the embedded font, read the cmap of
both subsetted faces in `pdfFonts.js` (base64 TTF), intersect them, and re-emit
the sorted code points as ranges.

**Still Roboto**: the text *inside* embedded SVG images — the subway map's
station labels. svg-to-pdfkit resolves font names through pdfkit's own registry
rather than pdfmake's, and pinning those to a family it may not find is how you
get an invisible label in a picture nobody checks. One picture's labels, noted
rather than quietly left.

### Scope: exports describe the plan, not the screen

Every export goes through `buildExportCtx` / `projectScopedCtx`
([`src/utils/exportCtx.js`](../src/utils/exportCtx.js)), which take the
plan-shaped fields from `data` rather than from whatever the views are
rendering. So none of the display filters — hide-done, root/team/person, the
archive filter, single-project roadmap mode — can shrink a PDF, the HTML
report or the Word export.

This is enforced rather than documented-and-hoped: `App._exportCtx` cannot pass
a tree at all, the four PDF entry points and `buildReportModel` re-derive it
defensively (and `console.warn` if they had to), and
[`src/__tests__/exportScope.test.jsx`](../src/__tests__/exportScope.test.jsx)
asserts that a deliberately filtered context produces byte-identical output.

The reason is asymmetric risk: a reader of a PDF has no way to notice that a
project is missing or that a percentage was taken over a subset.

The same reasoning covers the two things that change the numbers rather than
the scope. The per-person **work order** reaches every export, because App
computes `scheduled` once — with the queues — and hands that one array to all
of them. **Dropped** work leaves every export: out of the report, the DOCX, the
four PDFs, the forward "Plan" projection and the Jira CSV, and marked rather
than silently omitted in the two structural exports (a `dropped` class in
Mermaid, a `Dropped` column in the plain CSV). Both are pinned through the real
App in
[`src/__tests__/exportQueueParity.app.test.jsx`](../src/__tests__/exportQueueParity.app.test.jsx)
and [`src/__tests__/jiraExportDropped.test.jsx`](../src/__tests__/jiraExportDropped.test.jsx).

### Jira reconcile (`src/utils/jiraSync.js`)

Not an export — the way back. It used to live behind its own **Export… →
Jira-Abgleich** dialog; that dialog is gone, and the two halves below now
render inline in **Run mode's Jira drift section** (`BriefingView.jsx`) —
link health is always visible, a collapsible paste box replaces the
"Compare" tab. Nothing about the parsing or matching changed, only where the
result is shown; Phase 7 is expected to make Jira a real connected source,
at which point this paste step goes away entirely.

**Link health** needs no input. It reads the Jira-key custom field
(auto-detected: a field whose id or name matches `jira` / `issue key` / `ticket`
/ `vorgang`, else whatever key the tree already uses) and reports:

- how many plan items carry a key,
- open **leaves** without one — these can never appear in Jira; parents are
  epic-level and legitimately unlinked, done items are history nobody looks up,
- the same key sitting on two plan items, whose status will always disagree with
  one of them. Keys are compared upper-cased and trimmed, so `na-266` and
  `NA-266` are one ticket.

**Compare** takes a pasted Jira table:

```
Issue key,Summary,Status,Assignee
NA-385,"DMS anpassen, inkl. Zugferd",Done,Steffen Lüling
```

Parsing is deliberately forgiving — refusing input over a delimiter guess would
defeat the point:

| Input | Handled |
|---|---|
| Delimiter | tab, `;`, `,` or `|`, guessed from the header line outside quotes |
| Quoting | `"a, b"` and `""` escapes |
| Column names | EN + DE (`Issue key` / `Vorgangsschlüssel`, `Summary` / `Zusammenfassung`, `Status`, `Assignee` / `Bearbeiter`, plus the `Planr ID` the Jira export writes) |
| Ambiguity | exact alias beats contains-match, so `Status Category` never wins over `Status` |
| No header | first column that looks like `ABC-123` becomes the key column; a two-column paste is read as key + status |
| Junk | non-key and duplicate lines are counted as skipped, never fatal |

Jira status text maps onto Planr's three states by substring, in both languages
(`done/erledigt/closed/resolved/abgeschlossen/released/…` → `done`;
`progress/arbeit/bearbeitung/review/test/…` → `wip`). **Anything unrecognised
falls back to `open`** — the conservative direction, since it can never silently
mark work as finished.

The result lists status drift (Jira treated as the source of truth, each row
opt-out via checkbox), renamed tickets (reported only — never auto-applied),
tickets with no plan item, and linked plan items missing from the paste. Applying
writes `status` + `progress` on the affected leaves (`done` → 100, `open` → 0,
`wip` → keeps recorded partial progress, else 50); parent statuses and the
done-window metadata are then derived by the same effects that handle a hand
edit.

### Word Report (`src/utils/exports.js` → `exportReportDocx`)

Runs the same `generateReport()` HTML through [`@turbodocx/html-to-docx`](https://github.com/TurboDocx/html-to-docx). Output is one-to-one with the Management Summary PDF: key figures, risks, planning confidence, roadmap (rasterized to a hi-res PNG and embedded as `<img>`), goals/deadlines, team capacity cards, critical path, detailed schedule per team.

Fonts are scrubbed to the universally-available `Inter → system-ui` for text and `Consolas / Courier New` for monospace cells — Mac's Office will no longer show a "missing font" warning.

Why HTML → DOCX instead of hand-rolling `docx` paragraphs? Writing every paragraph/table by hand required DXA width arithmetic that Word interpreted inconsistently — tables collapsed to one-character columns, shredding the layout. Routing through HTML gives Word natural table autosizing and eliminates the width math entirely.

## Data location (local)

The repo's `data/` directory is gitignored. Place your own `.json` or `.md` project files there and mount them via **Open File…** — they will never be committed to git.
