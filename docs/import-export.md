# Import / Export

Planr supports two persistent formats (`.json` and `.md`) and several export-only formats (CSV, Sprint MD, Mermaid, SVG, PNG, Print).

## Persistent formats

### JSON — full fidelity

The `.json` format is the internal data shape serialized directly via `JSON.stringify(data, null, 2)`. Everything round-trips exactly: IDs, field names, optional fields, everything.

**When to prefer JSON:**
- You want stable, hand-crafted team/member IDs (e.g. `FE`, `georg`)
- You're diffing project files in git and want a predictable format
- You won't be editing the file by hand

### Markdown — human-readable

The `.md` format is human-editable and renders nicely in any Markdown viewer (GitHub, Obsidian, etc.). The parser is [`parseMdToProject`](../src/App.jsx#L315) and the writer is [`buildMarkdownText`](../src/App.jsx#L1125), both in `App.jsx`.

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
- `{tags}`: `prio:N`, `seq:N`, severity (only when non-default)
- `⏰decide:DATE` / `📌DATE` / `≡`: decide-by, pinned start, parallel flag
- Sub-bullets: `*Benötigt: ...*` for deps (with optional labels), `*…*` for notes

**When to prefer Markdown:**
- You want to review/edit the plan in a text editor or on GitHub
- You want diffs to read as English, not JSON
- You don't mind if internal team/member IDs get renamed on round-trip

### Round-trip: what's preserved

| Field group | JSON ↔ JSON | MD ↔ MD | JSON → MD → JSON |
|---|---|---|---|
| All tree item fields (name, status, team, best, factor, prio, seq, severity, progress, type, date, decideBy, pinnedStart, parallel, deps, dep-labels, assign, note, description) | ✓ | ✓ | ✓ (via name-lookup) |
| Member fields (name, team, role, cap, vac, start) | ✓ | ✓ | ✓ |
| Team fields (name, color) | ✓ | ✓ | ✓ |
| Vacations | ✓ | ✓ | ✓ |
| Holidays array | ✓ | ✓ | ✓ |
| Plan start/end | ✓ | ✓ | ✓ |
| **Team IDs** (e.g. `FE`, `BE`) | ✓ | ✓ | ✗ regenerated as `T1, T2, …` |
| **Member IDs** (e.g. `georg`) | ✓ | ✓ | ✗ regenerated as `m{timestamp}{i}` |
| `meta.holidays` preset marker (e.g. `"NRW"`) | ✓ | — | ✗ lost (but the holiday array itself is preserved) |

**Mixed-workflow implication:** if you pair a human-edited MD with a JSON-editing workflow (or vice versa), expect Team/Member IDs to drift. The semantic data stays intact because all references (`tree.team`, `tree.assign`, `vacations.person`) are re-resolved through name-lookup. If stable IDs matter to you, stick to one format.

## Auto-save and file mount

- **localStorage** (`planr_v2`) is always the fallback
- Mount a file via **Open File…** or the New Project Wizard's "save as" step
- Mounted files use the **File System Access API** — no copies, no conversions
- Auto-save is debounced and runs on change
- **External change polling** — every 5 s, Planr reads the mounted file's timestamp; if it's newer than the last save, the external content is loaded (so you can edit the file in another app and the changes pick up)

The auto-save format follows the mounted extension: mounted `.md` → writes MD, mounted `.json` → writes JSON.

### The "click to grant" indicator

If the File System Access API loses write permission (e.g. after a reload), a yellow indicator appears in the header. Click it to re-grant. Data is never lost — it stays in localStorage.

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

### Print / PDF

`exportPDF()` — triggers the browser print dialog with a Planr-tuned print CSS. Save as PDF from there.

## Data location (local)

The repo's private project data lives in `data/` (gitignored):

- `data/venneker.planr.json` — the main working file
- `data/venneker-project-plan.md` — the Markdown twin

Only the meta shape is public. Actual project content is not version-controlled.
