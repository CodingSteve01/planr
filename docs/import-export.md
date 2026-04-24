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
- `## Resources` — bulleted list: `- **Full Name** \`SHORT\` — Team, Role (cap%), 25d/y, ab YYYY-MM-DD`
- `## Vacation Weeks` — `Person | Week (Mon) | Note` table
- `## Holidays` — `Date | Name | Source` table
- `## Work Tree` — nested bullet list with inline metadata

**Work tree bullet format:**

```
- **ID** Name [type-emoji] (date) (SIZE Nd ×factor) NN% — Team [assignees] {tags} ⏰decide:DATE 📌DATE ≡
  *Benötigt: depA (label), depB*
  *note*
```

- `type-emoji`: `⏰` deadline, `⚡` painpoint, `🎯` goal
- `SIZE`: T-shirt label (XS/S/M/L/XL/XXL) — derived, not stored
- `×factor`: only if factor != 1.5
- `NN%`: progress (only if 1–99)
- `[assignees]`: short names, comma-separated
- `{tags}`: `prio:N`, `seq:N`, severity, `conf:committed`/`conf:estimated`/`conf:exploratory` (only when non-default)
- `⏰decide:DATE` / `📌DATE` / `≡`: decide-by, pinned start, parallel flag
- Sub-bullets: `*Benötigt: ...*` for deps (with optional labels), `*Phasen: ...*` for phases, `*…*` for notes

**Phases line format:**

```
*Phasen: ✅RE, 🟡Development(Frontend), ○Test(QA)*
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
| All tree item fields (name, status, team, best, factor, prio, seq, severity, progress, type, date, decideBy, pinnedStart, parallel, confidence, deps, dep-labels, assign, note, description, phases, templateId) | ✓ | ✓ | ✓ (via name-lookup) |
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

## Export-only formats

### CSV

Tabular export. One row per leaf with columns for ID, name, team, assignee, estimate, dates, etc. Good for spreadsheet post-processing.

### Sprint Markdown

`exportSprintMarkdown()` — Markdown list of upcoming tasks within a chosen horizon (days), grouped by person, ordered by start date. Intended to paste into a stand-up agenda.

### Mermaid

`exportMermaid()` — dependency graph as a Mermaid diagram. Paste into any Mermaid-capable viewer (GitHub, Notion, etc.) to render a static topology.

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
| `exportSummaryPDF` | Management summary, shareable | KPIs, risks, planning confidence, roadmap image, goals/deadlines, team-capacity cards, critical path |
| `exportGanttPDF` | Full schedule handoff | Hi-res Gantt image (page size picked automatically: A4 / A3 / A2 landscape based on native width) + schedule table grouped by team |
| `exportWhatWhenPDF` | "What comes when" — horizon-aware | Items grouped into buckets (week / month / quarter). Near-term items show exact dates, far-term or uncertain items collapse to coarser granularity |
| `exportTodoPDF` | Sprint / TODO list for a chosen horizon | Tasks per person within N days, with horizon-adjusted date labels and confidence badges (●/◐/○) |

**Horizon-aware date labels** (`horizonLabel`, `horizonBucket` in `pdfExports.js`): the label granularity is the *fuzzier* of (distance from today) and (planning confidence). Rules:

- `committed` and ≤14 days away → exact `YYYY-MM-DD`
- `committed` and 15–60 days → `KW 17, Apr 2026` / `Week 17, Apr 2026`
- `estimated` or 60–180 days → `April 2026`
- `exploratory` or >180 days → `Q2 2026`

This keeps near-term plans concrete without forcing false precision on long-horizon or low-confidence items.

### Word Report (`src/utils/exports.js` → `exportReportDocx`)

Runs the same `generateReport()` HTML through [`@turbodocx/html-to-docx`](https://github.com/TurboDocx/html-to-docx). Output is one-to-one with the Management Summary PDF: key figures, risks, planning confidence, roadmap (rasterized to a hi-res PNG and embedded as `<img>`), goals/deadlines, team capacity cards, critical path, detailed schedule per team.

Fonts are scrubbed to the universally-available `Inter → system-ui` for text and `Consolas / Courier New` for monospace cells — Mac's Office will no longer show a "missing font" warning.

Why HTML → DOCX instead of hand-rolling `docx` paragraphs? Writing every paragraph/table by hand required DXA width arithmetic that Word interpreted inconsistently — tables collapsed to one-character columns, shredding the layout. Routing through HTML gives Word natural table autosizing and eliminates the width math entirely.

## Data location (local)

The repo's `data/` directory is gitignored. Place your own `.json` or `.md` project files there and mount them via **Open File…** — they will never be committed to git.
