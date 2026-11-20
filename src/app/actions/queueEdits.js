// A person's own order of work. Same context convention as nodeEdits.js.
import { moveInQueue, placeInQueue, queueOwnerOf, reconcileQueue } from '../../utils/personQueue.js';

export function onQueueReset(ctx, personId) {
  const { mutate } = ctx;
  mutate(d => {
    const queues = d.personQueues || {};
    if (!queues[personId]) return d;
    const { [personId]: _gone, ...rest } = queues;
    return { ...d, personQueues: Object.keys(rest).length ? rest : undefined };
  });
}

// Move a task within its assignee's own queue. The plan's order is the
// tree's and this does not touch it: the queue permutes only the slots that
// person's work already holds (utils/personQueue.js). It is stored against
// the person for the same reason — a rank smeared over every task is what
// `seq` was, and what competed with the tree everywhere.
export function onQueueReorder(ctx, taskIds, direction) {
  const { tree, leaves, mutate } = ctx;
  // One id or a selection. The owner is taken from the first — a selection
  // spanning two owners is not one move, and the rest is ignored rather than
  // half-applied.
  const ids = Array.isArray(taskIds) ? taskIds : [taskIds];
  const node = tree.find(r => r.id === ids[0]);
  const person = queueOwnerOf(node);
  if (!person) return;
  const mine = leaves.filter(l => queueOwnerOf(l) === person).map(l => l.id);
  if (mine.length < 2) return;
  const moving = ids.filter(id => mine.includes(id));
  mutate(d => {
    const queues = d.personQueues || {};
    const current = reconcileQueue(queues[person], mine);
    // `direction` is either a key's word — up/down/first/last — or the id a
    // drag was dropped on.
    const next =
      typeof direction === 'object' && (direction?.before || direction?.after)
        ? placeInQueue(current, moving, direction.before || direction.after, direction.after ? 'after' : 'before')
        : moveInQueue(current, moving, direction);
    if (next.join() === current.join() && queues[person]) return d;
    return { ...d, personQueues: { ...queues, [person]: next } };
  });
}
