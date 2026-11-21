import { hasChildren } from '../scheduler.js';

// Every filter EXCEPT the collapse state (see TreeView's `filt`).
export function filterRows(sorted, { rootFilter, teamFilter, personFilter, search, diffKeepIds, horizonIds, horizonOnlyPlanned }) {
  let f = sorted;
  if (rootFilter) {
    f = f.filter(r => r.id === rootFilter || r.id.startsWith(rootFilter + '.'));
  }
  if (teamFilter) {
    const matchIds = new Set();
    f.forEach(r => {
      if ((r.team || '') === teamFilter) {
        matchIds.add(r.id);
        const parts = r.id.split('.');
        for (let i = 1; i < parts.length; i++) {
          matchIds.add(parts.slice(0, i).join('.'));
        }
      }
    });
    f = f.filter(r => matchIds.has(r.id));
  }
  if (personFilter) {
    const matchIds = new Set();
    f.forEach(r => {
      if ((r.assign || []).includes(personFilter)) {
        matchIds.add(r.id);
        const parts = r.id.split('.');
        for (let i = 1; i < parts.length; i++) {
          matchIds.add(parts.slice(0, i).join('.'));
        }
      }
    });
    f = f.filter(r => matchIds.has(r.id));
  }
  if (search) {
    const q = search.toLowerCase();
    f = f.filter(r => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.note || '').toLowerCase().includes(q));
  }
  if (diffKeepIds) {
    f = f.filter(r => diffKeepIds.has(r.id));
  }
  // Planning-horizon filter: only narrows the row list when the user has
  // turned "Only planned in window" on. Without the toggle the rest of
  // the UI (badges, dimming) still reacts to the horizon, but nothing
  // is hidden from the tree.
  if (horizonIds && horizonOnlyPlanned) {
    const keep = new Set();
    for (const r of f) {
      if (horizonIds.has(r.id)) {
        keep.add(r.id);
        const parts = r.id.split('.');
        for (let i = 1; i < parts.length; i++) keep.add(parts.slice(0, i).join('.'));
      }
    }
    f = f.filter(r => keep.has(r.id));
  }
  return f;
}

// If there's a selection, collapse/expand only acts on selected items + their descendants. Otherwise, all items.
export function collapseTargets(tree, multiSel) {
  if (!multiSel || multiSel.size === 0) return tree.filter(r => hasChildren(tree, r.id)).map(r => r.id);
  const ids = new Set();
  multiSel.forEach(id => {
    if (hasChildren(tree, id)) ids.add(id);
    tree.forEach(r => {
      if (r.id.startsWith(id + '.') && hasChildren(tree, r.id)) ids.add(r.id);
    });
  });
  return [...ids];
}

// Where the cursor goes after a delete: the row above, else the row below,
// else nothing. Landing on `null` meant every delete cost you a mouse trip
// back into the tree — and with ⌫ now one keystroke, that is most of the
// work. Computed BEFORE the delete, from the rows as they are on screen.
export function rowAfterDeleting(visibleIds, filt, ids) {
  const gone = new Set(ids);
  const idx = visibleIds.findIndex(id => gone.has(id));
  if (idx < 0) return null;
  for (let i = idx - 1; i >= 0; i--) if (!gone.has(visibleIds[i])) return filt[i];
  for (let i = idx + 1; i < visibleIds.length; i++) if (!gone.has(visibleIds[i])) return filt[i];
  return null;
}
