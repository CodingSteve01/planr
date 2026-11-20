// What a queue cannot decide.
//
// The plan has one order — the tree — and a person's queue refines it for
// their own work. That is the whole model, and it was the model somebody had
// in mind when they arranged the tree and then the queues. What it leaves out
// is dependencies: they are facts rather than preferences, so the schedule
// honours them ahead of both, and until now the queue said nothing about it.
// You could put a task first, look at the list, and have no way of knowing it
// waits for something four rows below it.
//
// Measured on a real plan: 17 of 145 leaves carry a dependency, and 83 end up
// placed more than five positions from where the tree puts them once those
// few are pulled forward. Not a footnote.
//
// Nothing here changes an order. It only names what already overrules it.
const parentOf = id => id.split('.').slice(0, -1).join('.');

/**
 * Every dependency that applies to a node: its own, plus the ones its
 * ancestors carry — a dependency on a package blocks everything inside it.
 * The same union `schedule()` walks, so this view and the schedule cannot
 * disagree about what waits for what.
 */
export function effectiveDepsOf(id, byId) {
  const node = byId.get?.(id) ?? byId[id];
  if (!node) return [];
  const own = [...(node.deps || []), ...(node.softDeps || [])];
  const inherited = [];
  for (let p = parentOf(id); p; p = parentOf(p)) {
    const anc = byId.get?.(p) ?? byId[p];
    if (anc) inherited.push(...(anc.deps || []), ...(anc.softDeps || []));
  }
  return [...new Set([...own, ...inherited])].filter(d => d && d !== id);
}

/** Finished work blocks nothing. A dropped predecessor blocks nothing either. */
const stillOpen = node => !!node && node.status !== 'done' && !node.dropped;

/**
 * What holds each row of one queue, in that queue's own order.
 *
 * Returns a Map of id → { waitsFor, later }:
 *   waitsFor — dependencies that have not been delivered yet, as ids.
 *   later    — those of them that sit FURTHER DOWN this same queue. That is
 *              the case worth a mark of its own: the order you arranged
 *              cannot happen, and the row will move whatever you do here.
 *
 * Rows with nothing holding them are absent from the map, so a plan without
 * dependencies costs nothing to draw.
 */
export function queueBlockers(orderedIds, byId) {
  const ids = Array.isArray(orderedIds) ? orderedIds : [];
  const place = new Map(ids.map((id, i) => [id, i]));
  const out = new Map();
  ids.forEach((id, i) => {
    const waitsFor = effectiveDepsOf(id, byId)
      .filter(d => stillOpen(byId.get?.(d) ?? byId[d]));
    if (!waitsFor.length) return;
    const later = waitsFor.filter(d => (place.get(d) ?? -1) > i);
    out.set(id, { waitsFor, later });
  });
  return out;
}
