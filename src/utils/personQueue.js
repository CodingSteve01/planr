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

/** The first assignee, or nobody. */
export function assigneeOf(leaf) {
  const assign = leaf?.assign;
  return Array.isArray(assign) && assign.length ? assign[0] : null;
}

/**
 * Whose order this item belongs to: the person on it, or failing that the
 * team it sits with.
 *
 * Early in a plan most items have a team and nobody on them yet, and those are
 * exactly the ones where "which of these first" matters most — the scheduler
 * puts them in that team's slots, so the team is who the order belongs to.
 * One mechanism and one map rather than a second kind of queue: assigning
 * somebody simply moves the item out of the team's queue and into theirs,
 * which is also the right answer, because it now has an owner.
 */
export function queueOwnerOf(leaf) {
  const person = assigneeOf(leaf);
  if (person) return person;
  const team = leaf?.team;
  return team ? `team:${team}` : null;
}

/**
 * A stored queue, made to fit the plan as it is now.
 *
 * A queue is written once and then the plan moves on: tasks get added,
 * finished, renamed, dropped. What was decided is kept, what is gone is
 * dropped, and what is NEW lands where the plan puts it.
 *
 * That last part is the whole division of labour: the tree sets the basic
 * order, the queue refines it for the items it names. A queue says nothing
 * about a task it has never seen, so the plan order is the only statement
 * anybody has made about it — appending new work to the back ignored that and
 * broke the model for the case every plan grows into. Add a task in the tree
 * right after A and it belongs after A here too.
 *
 * `ids` must arrive in plan order; the callers pass the tree's own order.
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

  // Each newcomer follows the last item the queue already knows that comes
  // before it in the plan — and goes first when nothing does.
  let lastKnown = null;
  for (const id of present) {
    if (seen.has(id)) { lastKnown = id; continue; }
    const at = lastKnown === null ? 0 : out.indexOf(lastKnown) + 1;
    out.splice(at, 0, id);
    seen.add(id);
    lastKnown = id;
  }
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
      if (queueOwnerOf(leaf) !== personId) return;
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
 * The queue after moving `id` to sit before (or `position` 'after') `targetId`. Returns the new
 * order — the caller stores it. This is the drag; `moveInQueue` is the keys.
 */
export function placeInQueue(order, ids, targetId, position = 'before') {
  const list = Array.isArray(order) ? [...order] : [];
  const moving = (Array.isArray(ids) ? ids : [ids]).filter(id => list.includes(id));
  if (!moving.length || !list.includes(targetId) || moving.includes(targetId)) return list;
  const block = list.filter(id => moving.includes(id));
  const rest = list.filter(id => !moving.includes(id));
  const found = rest.indexOf(targetId);
  if (found < 0) return list;
  const at = found + (position === 'after' ? 1 : 0);
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/**
 * The queue after moving one item, or a whole selection, within it.
 *
 * A selection moves as a block and keeps its own internal order: five items
 * dragged up are still those five in the same sequence, one place earlier.
 * Moving them one at a time would be five keystrokes and a different result —
 * each would step over the next.
 */
export function moveInQueue(order, ids, direction) {
  const list = Array.isArray(order) ? [...order] : [];
  const moving = (Array.isArray(ids) ? ids : [ids]).filter(id => list.includes(id));
  if (!moving.length || list.length < 2) return list;

  // In queue order, whatever order they were selected in.
  const block = list.filter(id => moving.includes(id));
  const rest = list.filter(id => !moving.includes(id));
  if (!rest.length) return list;

  const firstAt = list.indexOf(block[0]);
  const lastAt = list.indexOf(block[block.length - 1]);

  let at;
  if (direction === 'first') at = 0;
  else if (direction === 'last') at = rest.length;
  else if (direction === 'up') {
    // The item above the block, wherever the block's holes are.
    const above = list.slice(0, firstAt).filter(id => !moving.includes(id)).pop();
    if (above === undefined) return list;
    at = rest.indexOf(above);
  } else if (direction === 'down') {
    const below = list.slice(lastAt + 1).find(id => !moving.includes(id));
    if (below === undefined) return list;
    at = rest.indexOf(below) + 1;
  } else return list;

  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}
