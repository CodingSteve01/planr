// Pure logic for the tree editor's keyboard model (Phase 4 — see
// docs/principles.md, principle 5 "Fast means reversible"). Nothing here
// touches React state or calls into App.jsx's mutate()-backed callbacks;
// every function takes plain data in and returns plain data (or `null` for
// "this is a no-op"), so it's cheap to unit-test and cheap to reason about.
// TreeView.jsx is the only caller — it turns these answers into calls to
// onMove/onReorder/onTaskUpdate/etc.
import { nextChildId, parentId } from './scheduler.js';
import { DEFAULT_SIZES } from './sizes.js';

// ── Visible row order ───────────────────────────────────────────────────
// Sorts a flat tree into parent-then-children order, honouring displayOrder
// where present and falling back to the numeric id suffix — the same rule
// TreeView has always used to lay out rows. Extracted here so it's testable
// without mounting the component, and so TreeView has one place (not two)
// that decides "what order do siblings render in".
export function sortTree(tree) {
  const byParent = {};
  (tree || []).forEach(r => {
    const pid = parentId(r.id);
    (byParent[pid] || (byParent[pid] = [])).push(r);
  });
  Object.values(byParent).forEach(arr => arr.sort((a, b) => {
    const da = typeof a.displayOrder === 'number' ? a.displayOrder : null;
    const db = typeof b.displayOrder === 'number' ? b.displayOrder : null;
    if (da != null && db != null && da !== db) return da - db;
    const aLast = a.id.split('.').pop(), bLast = b.id.split('.').pop();
    const an = parseInt(aLast.replace(/\D/g, '')) || 0, bn = parseInt(bLast.replace(/\D/g, '')) || 0;
    return an !== bn ? an - bn : aLast.localeCompare(bLast);
  }));
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

// ── Field shortcuts: 1–4 priority, S/M/L/X size, Space status ─────────────
export const STATUS_CYCLE = { open: 'wip', wip: 'done', done: 'open' };

export function nextStatus(status) {
  return STATUS_CYCLE[status || 'open'] || 'open';
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
export function fieldPatchForKey(node, key, sizes) {
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
    const status = nextStatus(node.status);
    return status === node.status ? null : { status };
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
    const node = { id, name, status: 'open', team: '', best: 0, factor: 1.5, prio: 2, deps: [], note: '', assign: [], lvl };
    created.push(node);
    working.push(node);
    stack[depth + 1] = id;
    stack.length = depth + 2;
  });
  return created;
}
