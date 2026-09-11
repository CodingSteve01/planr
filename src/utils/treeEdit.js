// Pure logic for the tree editor's keyboard model (Phase 4 — see
// docs/principles.md, principle 5 "Fast means reversible"). Nothing here
// touches React state or calls into App.jsx's mutate()-backed callbacks;
// every function takes plain data in and returns plain data (or `null` for
// "this is a no-op"), so it's cheap to unit-test and cheap to reason about.
// TreeView.jsx is the only caller — it turns these answers into calls to
// onMove/onReorder/onTaskUpdate/etc.
import { nextChildId, parentId } from './scheduler.js';
import { DEFAULT_SIZES } from './sizes.js';
import { statusChangePatch } from './completion.js';
import { advancePhases, statusFromPhases, phaseProgress } from './phases.js';

// ── Visible row order ───────────────────────────────────────────────────
// Sorts a flat tree into parent-then-children order, honouring displayOrder
// where present and falling back to the numeric id suffix — the same rule
// TreeView has always used to lay out rows. Extracted here so it's testable
// without mounting the component, and so TreeView has one place (not two)
// that decides "what order do siblings render in".
// THE rule for what order siblings appear in. Exported because more than one
// place needs it, and the two that had their own copy disagreed:
//
//   sortTree compared displayOrder only when BOTH rows had one, falling back
//   to the number in the id otherwise. reorderSibling put displayOrder and
//   that number on ONE scale. On a set where only some siblings carry a
//   displayOrder — which is every set until something has been reordered —
//   they produce different orders. reorderSibling then computed "move it
//   before Pr1" against an order the user never saw, arrived at the index the
//   row already had, and returned unchanged. The button was enabled, the
//   press did nothing, and there was nothing to see.
//
// So: one comparator, both callers.
export function compareSiblings(a, b) {
  const da = typeof a.displayOrder === 'number' ? a.displayOrder : null;
  const db = typeof b.displayOrder === 'number' ? b.displayOrder : null;
  if (da != null && db != null && da !== db) return da - db;
  const aLast = a.id.split('.').pop(), bLast = b.id.split('.').pop();
  const an = parseInt(aLast.replace(/\D/g, '')) || 0, bn = parseInt(bLast.replace(/\D/g, '')) || 0;
  return an !== bn ? an - bn : aLast.localeCompare(bLast);
}

export function sortTree(tree) {
  const byParent = {};
  (tree || []).forEach(r => {
    const pid = parentId(r.id);
    (byParent[pid] || (byParent[pid] = [])).push(r);
  });
  Object.values(byParent).forEach(arr => arr.sort(compareSiblings));
  const result = [];
  const visit = pid => { (byParent[pid] || []).forEach(r => { result.push(r); visit(r.id); }); };
  visit('');
  return result;
}

// Drops every row that has a collapsed ancestor. `rows` is expected to
// already be in sortTree() order (or any order — the ancestor check doesn't
// care), and may already have been narrowed by search/team/etc. filters;
// this is deliberately the LAST step so those filters keep working exactly
// as they did before this module existed.
export function filterCollapsedRows(rows, collapsedIds) {
  const collapsed = collapsedIds instanceof Set ? collapsedIds : new Set(collapsedIds || []);
  if (!collapsed.size) return rows;
  return (rows || []).filter(r => {
    const parts = r.id.split('.');
    for (let i = 1; i < parts.length; i++) {
      if (collapsed.has(parts.slice(0, i).join('.'))) return false;
    }
    return true;
  });
}

// ── Sibling order (shared by the "First/Up/Down/Last" toolbar, ⌥↑/⌥↓, and
// Tab-indent's "previous sibling" lookup) ──────────────────────────────────
// Root items are grouped by their leading letter prefix (P1/P2 are siblings,
// a G1 goal is not) — this mirrors reorderSibling in App.jsx, which persists
// displayOrder per prefix group. Nested items are grouped by literal parent.
function siblingGroupKey(id) {
  const pid = parentId(id);
  if (pid) return pid;
  return `root:${id.match(/^[A-Za-z]+/)?.[0] || ''}`;
}
function rankOf(r) {
  const explicit = typeof r.displayOrder === 'number' ? r.displayOrder : null;
  if (explicit != null) return explicit;
  return parseInt(r.id.split('.').pop().replace(/\D/g, ''), 10) || 0;
}
export function siblingsOf(tree, id) {
  const key = siblingGroupKey(id);
  return (tree || [])
    .filter(r => siblingGroupKey(r.id) === key)
    .sort((a, b) => rankOf(a) - rankOf(b) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

// ── Tab / ⇧Tab — structure by keyboard ──────────────────────────────────
// Returns the new parent id to pass to onMove(id, newParentId), or `null`
// when the move is a no-op (indenting the first child of its group has no
// "previous sibling" to nest under).
export function indentTarget(tree, id) {
  const siblings = siblingsOf(tree, id);
  const idx = siblings.findIndex(r => r.id === id);
  if (idx <= 0) return null;
  return siblings[idx - 1].id;
}

// Returns the new parent id ('' for top-level) to pass to onMove(id, ''),
// or `null` when the move is a no-op (id is already a root item).
export function outdentTarget(id) {
  const pid = parentId(id);
  if (!pid) return null;
  return parentId(pid);
}

// The same correction for indenting. `indentTarget` above asks the whole
// tree "which sibling precedes this row", so with finished tasks hidden (or
// an archived project, or a collapsed branch) Tab could subordinate a row
// under something you cannot see — you moved it behind the task you meant,
// pressed Tab, and it landed somewhere else entirely.
//
// Returns the id of the preceding VISIBLE sibling — the new parent — or null
// when there is none (the row is already first in its visible run).
export function visibleIndentTarget(visibleIds, id) {
  const parent = id.split('.').slice(0, -1).join('.');
  const sameParent = visibleIds.filter(v => v.split('.').slice(0, -1).join('.') === parent);
  const idx = sameParent.indexOf(id);
  if (idx <= 0) return null;
  return sameParent[idx - 1];
}

// ── ⌥↑ / ⌥↓ — move within the sibling order ────────────────────────────
// Returns 'up'/'down' (to pass straight to onReorder(id, direction)) or
// `null` when the row is already first/last in its group.
export function moveStep(tree, id, direction) {
  const siblings = siblingsOf(tree, id);
  const idx = siblings.findIndex(r => r.id === id);
  if (idx < 0 || siblings.length <= 1) return null;
  if (direction === 'up' && idx === 0) return null;
  if (direction === 'down' && idx === siblings.length - 1) return null;
  return direction;
}

// Where ⌥↑/⌥↓ should actually put a row, computed from the rows that are ON
// SCREEN rather than from the whole tree.
//
// `moveStep` above answers "is a move possible" against every sibling in the
// plan, including the ones the current filters hide — finished tasks,
// archived projects, a collapsed branch, anything outside a search. So a
// press would swap the row with an invisible neighbour and look like nothing
// happened; you had to press again, and again, once per hidden sibling. That
// is the "stumbling over completed tasks" this replaces: one press, one
// visible move.
//
// `visibleIds` is the on-screen row order (TreeView's `filt`). Returns a
// `{ targetId, position }` for reorderSibling, or null when the row is
// already at that end of its visible sibling run.
export function visibleSiblingTarget(visibleIds, id, direction) {
  const parent = id.split('.').slice(0, -1).join('.');
  const sameParent = visibleIds.filter(v => v.split('.').slice(0, -1).join('.') === parent);
  const idx = sameParent.indexOf(id);
  if (idx < 0 || sameParent.length <= 1) return null;
  if (direction === 'up') {
    if (idx === 0) return null;
    return { targetId: sameParent[idx - 1], position: 'before' };
  }
  if (direction === 'down') {
    if (idx === sameParent.length - 1) return null;
    return { targetId: sameParent[idx + 1], position: 'after' };
  }
  // 'first' / 'last' — all the way, in one press. Expressed as a target too,
  // so the endpoint is a VISIBLE row: 'first'/'last' over the whole sibling
  // list would land the row above or below rows you cannot see.
  if (direction === 'first') {
    if (idx === 0) return null;
    return { targetId: sameParent[0], position: 'before' };
  }
  if (direction === 'last') {
    if (idx === sameParent.length - 1) return null;
    return { targetId: sameParent[sameParent.length - 1], position: 'after' };
  }
  return null;
}

// ── Keeping the cursor on screen ─────────────────────────────────────────
// How far to scroll so a row is comfortably inside its scroll container.
// Pure geometry, because the version this replaces got the geometry wrong
// in a way no test could see: it asked whether the row was inside the
// WINDOW, but the tree scrolls a container that starts below the topbar,
// the tab bar and the sub-toolbar. A row that had scrolled up behind that
// chrome still reported `top >= 0` and counted as visible — moving the
// cursor up, it just vanished and nothing scrolled (measured: container
// top at y=160, cursor row at y=36).
//
// `headBottom` is the sticky table head, which hides rows just as
// effectively as the chrome above the container. `margin` leaves a row's
// worth of room so the cursor is not glued to the edge with nothing
// visible after it.
//
// Returns the delta to add to scrollTop — 0 when the row already sits in
// the comfortable band.
export function scrollAdjustment({ rowTop, rowBottom, boxTop, boxBottom, headBottom = null, margin = 0 }) {
  const obstructed = headBottom != null && headBottom > boxTop ? headBottom : boxTop;
  const topLimit = obstructed + margin;
  const bottomLimit = boxBottom - margin;
  if (rowTop < topLimit) return -(topLimit - rowTop);
  if (rowBottom > bottomLimit) return rowBottom - bottomLimit;
  return 0;
}

// ── Field shortcuts: 1–4 priority, S/M/L/X size, Space status ─────────────
export const STATUS_CYCLE = { open: 'wip', wip: 'done', done: 'open' };
const STATUS_CYCLE_BACK = { open: 'done', wip: 'open', done: 'wip' };

export function nextStatus(status) {
  return STATUS_CYCLE[status || 'open'] || 'open';
}

export function prevStatus(status) {
  return STATUS_CYCLE_BACK[status || 'open'] || 'done';
}

// Resolves a size key (S/M/L/X/…) against the project's size catalogue
// (falling back to utils/sizes.js DEFAULT_SIZES), case-insensitively.
// Returns { best, factor } to patch onto the node(s), or `null` when the
// project defines no size with that label — the shortcut is then a no-op,
// per docs/principles.md "subtractive means fewer paths, never fewer
// capabilities": we don't invent a size the project doesn't have.
export function resolveSize(sizes, key) {
  const catalogue = sizes?.length ? sizes : DEFAULT_SIZES;
  const wanted = String(key || '').toUpperCase();
  const size = catalogue.find(s => String(s.label || '').toUpperCase() === wanted);
  if (!size) return null;
  return { best: size.days, factor: size.factor };
}

// Builds the field patch for a priority/size/status keyboard shortcut, or
// `null` if the key isn't one of the field shortcuts, or if applying it
// would be a no-op (node already has that value). Centralised so TreeView's
// keydown handler and its tests share one source of truth for "what does
// this key do to a node".
export function fieldPatchForKey(node, key, sizes, { back = false } = {}) {
  if (['1', '2', '3', '4'].includes(key)) {
    const prio = Number(key);
    return node.prio === prio ? null : { prio };
  }
  if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    const size = resolveSize(sizes, key);
    if (!size) return null;
    return (node.best === size.best && node.factor === size.factor) ? null : size;
  }
  if (key === ' ' || key === 'Spacebar') {
    // A task with phases is walked phase by phase: its progress comes from
    // them, so cycling only `status` wrote a number nothing reads. See
    // advancePhases() for the serial model.
    if (node.phases?.length) {
      const phases = advancePhases(node.phases, back);
      if (!phases) return null;
      const phaseStatus = statusFromPhases(phases);
      return {
        ...statusChangePatch(node, phaseStatus),
        phases,
        // Keep the stored number in step with what leafProgress derives, so
        // the two can never disagree in an export or a stale read.
        progress: phaseProgress(phases),
      };
    }
    const status = back ? prevStatus(node.status) : nextStatus(node.status);
    if (status === node.status) return null;
    // The full patch, not just `{ status }`. Moving a task to wip or done
    // also stamps the actual start/end dates and progress — that is what
    // feeds the Soll/Ist comparison. The dropdown in QuickEdit always did
    // this; the keyboard did not, so a task cycled with Space silently
    // skipped its Ist-start and the comparison quietly had a hole in it.
    return statusChangePatch(node, status);
  }
  return null;
}

// ── Paste a list ────────────────────────────────────────────────────────
// Parses pasted multi-line text into { name, depth } rows: blank lines are
// dropped, a single leading "-", "*" or "•" bullet (plus its following
// space) is stripped, and leading whitespace (tabs, or runs of 2+ spaces)
// becomes a nesting depth RELATIVE to the first non-blank line. A line
// can never nest more than one level deeper than the line before it —
// pasted text can't invent an ancestor that isn't there.
export function parsePastedRows(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const rows = [];
  let baseIndent = null;
  let prevDepth = 0;
  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const lead = rawLine.match(/^[ \t]*/)[0];
    const tabCount = (lead.match(/\t/g) || []).length;
    const spaceCount = (lead.match(/ /g) || []).length;
    const indentLevel = tabCount + Math.floor(spaceCount / 2);
    const name = rawLine.slice(lead.length).replace(/^[-*•]\s+/, '').trim();
    if (!name) continue;
    if (baseIndent === null) baseIndent = indentLevel;
    let depth = rows.length === 0 ? 0 : Math.min(Math.max(0, indentLevel - baseIndent), prevDepth + 1);
    rows.push({ name, depth });
    prevDepth = depth;
  }
  return rows;
}

// Turns parsed { name, depth } rows into full tree node objects, nested
// under `parentIdVal` (the active row's parent — pasted rows land as
// siblings of the active row, not children of it). IDs are computed against
// a local working copy of the tree so a whole pasted block gets correct,
// non-colliding ids in one pass without touching React state. The caller
// (App.jsx) is expected to splice the result into the tree in ONE mutate()
// call, so the whole paste is a single undo step.
export function buildPasteNodes(tree, parentIdVal, rows) {
  const working = (tree || []).slice();
  const stack = [parentIdVal || ''];
  const created = [];
  (rows || []).forEach(({ name, depth }) => {
    const pid = stack[depth] ?? (parentIdVal || '');
    const id = nextChildId(working, pid);
    const lvl = pid ? pid.split('.').length + 1 : 1;
    // No priority. A row you just typed has not been prioritised yet, and
    // pre-filling "high" makes the whole plan look urgent while saying
    // nothing — you cannot tell what you actually decided from what the
    // editor guessed. Unset renders no glyph and the dropdown reads "—".
    const node = { id, name, status: 'open', team: '', best: 0, factor: 1.5, deps: [], note: '', assign: [], lvl };
    created.push(node);
    working.push(node);
    stack[depth + 1] = id;
    stack.length = depth + 2;
  });
  return created;
}
