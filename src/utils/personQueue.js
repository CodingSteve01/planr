// The order one person works through their own tasks.
//
// The plan has ONE order: the tree, depth-first (utils/displayOrder.js,
// `treeOrderRank`). That is what you arrange, and it is what the schedule
// follows. It has one shape it cannot express, and the shape matters as soon
// as two projects run at once: depth-first makes a project a BLOCK. Two
// projects, one shared person, and she does all of A and then all of B — a
// task in B cannot be pulled forward, because it and the A tasks are not
// siblings and there is no move in the tree that says "this one, first".
//
// This is the one override, and it is deliberately the narrowest one that
// answers that: a person's queue permutes ONLY the slots that person's work
// already occupies in the plan order. Nobody else's work moves. The work does
// not move in the plan. Dependencies and pinned dates still win, because they
// are facts rather than preferences.
//
// What this must not become is `seq`, which it replaces the need for: a second
// GLOBAL rank, competing with the tree everywhere, invisible, and propped up
// by a Gantt that rewrote priorities to make it stick. The difference is not
// good intentions — it is scope. A queue belongs to one person, orders only
// their own work, and can be handed back ("reset to plan order") in one click.

/** Whose queue a task belongs to: the first assignee, or nobody. */
export function assigneeOf(leaf) {
  const assign = leaf?.assign;
  return Array.isArray(assign) && assign.length ? assign[0] : null;
}

/**
 * A stored queue, made to fit the plan as it is now.
 *
 * A queue is written once and then the plan moves on: tasks get added,
 * finished, renamed, dropped. What was decided is kept, what is gone is
 * dropped, and what is new goes to the BACK — new work was not part of the
 * decision, so it must not silently jump it.
 */
export function reconcileQueue(queue, ids) {
  const present = Array.isArray(ids) ? ids : [];
  if (!Array.isArray(queue) || !queue.length) return present;
  const known = new Set(present);
  const seen = new Set();
  const out = [];
  for (const id of queue) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of present) if (!seen.has(id)) out.push(id);
  return out;
}

/**
 * Apply every person's queue to a list of leaves already in plan order.
 *
 * The slots are the positions that person's work occupies in that list; the
 * queue decides which of their tasks sits in which of their slots. That is
 * what keeps this from being a second global order: the list's shape is the
 * plan's, and only the contents of one person's own positions are theirs to
 * rearrange.
 */
export function applyPersonQueues(leaves, queues) {
  const list = Array.isArray(leaves) ? leaves : [];
  if (!queues || !Object.keys(queues).length || !list.length) return leaves;

  const out = list.slice();
  for (const [personId, queue] of Object.entries(queues)) {
    if (!Array.isArray(queue) || !queue.length) continue;
    const slots = [];
    const byId = new Map();
    list.forEach((leaf, i) => {
      if (assigneeOf(leaf) !== personId) return;
      slots.push(i);
      byId.set(leaf.id, leaf);
    });
    if (slots.length < 2) continue;
    const order = reconcileQueue(queue, [...byId.keys()]);
    order.forEach((id, i) => { out[slots[i]] = byId.get(id); });
  }
  return out;
}

/**
 * The queue after moving `id` one place, or to either end, within its own
 * person's list. Returns the new order — the caller stores it.
 */
export function moveInQueue(order, id, direction) {
  const list = Array.isArray(order) ? [...order] : [];
  const from = list.indexOf(id);
  if (from < 0 || list.length < 2) return list;
  let to = from;
  if (direction === 'up') to = from - 1;
  else if (direction === 'down') to = from + 1;
  else if (direction === 'first') to = 0;
  else if (direction === 'last') to = list.length - 1;
  to = Math.max(0, Math.min(list.length - 1, to));
  if (to === from) return list;
  list.splice(to, 0, list.splice(from, 1)[0]);
  return list;
}
