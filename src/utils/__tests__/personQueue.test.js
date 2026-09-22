// "Was ist, wenn ich mehrere große Projekte parallel bearbeite? Würde man
//  dann nicht im Gantt oder der Roadmap genau so einfach wie im Tree eben die
//  Reihenfolge festlegen wollen?"
//
// Yes — and the reason it cannot just be "drag it anywhere" is that the tree
// is depth-first, so a project is a block: two projects and one shared person
// means all of A, then all of B, and a priority-1 task in B waits. The tree
// has no way to say "this one B task first" because the two are not siblings.
//
// The trap is the system this replaces. `seq` was a second GLOBAL rank that
// competed with the tree everywhere, invisibly, and the Gantt had to rewrite
// priorities to make it stick. So this one is deliberately narrow: a person's
// queue permutes ONLY the slots that person's work already occupies in the
// tree order. Nothing else moves, nobody else's work moves, and a person
// without a hand-sorted queue is exactly as they were.

import { describe, test, expect } from 'vitest';
import { reconcileQueue, applyPersonQueues, assigneeOf, queueOwnerOf, moveInQueue, placeInQueue } from '../personQueue.js';
import { buildMarkdownText } from '../markdown.js';

const leaf = (id, person) => ({ id, assign: person ? [person] : [] });

describe('a queue that outlives the plan it was written for', () => {
  test('keeps the order it was given', () => {
    expect(reconcileQueue(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  test('drops what is gone rather than carrying a ghost', () => {
    expect(reconcileQueue(['c', 'gone', 'a'], ['a', 'c'])).toEqual(['c', 'a']);
  });

  test('puts what is new where the plan puts it', () => {
    // "Ich lege im Tree die grundsätzliche Reihenfolge fest und in der Queue
    //  die Detail-Reihenfolge."
    //
    // That is the model, and appending new work to the back broke it for
    // exactly the case a plan grows into: add a task in the tree right after
    // A, and it belongs after A here too. The queue is a statement about the
    // items it names; for one it has never seen, the plan order is the only
    // thing anybody has said, so it is what decides.
    //
    // Stored ['c','a'], plan [a,b,c,d]: 'b' follows 'a' in the plan and lands
    // after it; 'd' follows 'c' and lands after it.
    expect(reconcileQueue(['c', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'd', 'a', 'b']);
  });

  test('a new item with nothing before it in the plan goes first', () => {
    expect(reconcileQueue(['c', 'a'], ['new', 'a', 'c'])).toEqual(['new', 'c', 'a']);
  });

  test('and the decided order among the known items is untouched', () => {
    // The point of the override: what was decided stays decided.
    expect(reconcileQueue(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  test('is nothing at all when nothing was sorted', () => {
    expect(reconcileQueue(null, ['a', 'b'])).toEqual(['a', 'b']);
    expect(reconcileQueue([], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('applying a queue to the plan order', () => {
  const leaves = [leaf('A.1', 'M1'), leaf('A.2', 'M1'), leaf('B.1', 'M1'), leaf('B.2', 'M1')];

  test('permutes only that person\'s own slots', () => {
    // The queue names all four, so it decides all four.
    const out = applyPersonQueues(leaves, { M1: ['B.1', 'A.1', 'A.2', 'B.2'] });
    expect(out.map(l => l.id)).toEqual(['B.1', 'A.1', 'A.2', 'B.2']);
  });

  test('leaves everyone else exactly where they were', () => {
    const mixed = [leaf('A.1', 'M1'), leaf('X.1', 'M2'), leaf('A.2', 'M1'), leaf('X.2', 'M2')];
    const out = applyPersonQueues(mixed, { M1: ['A.2', 'A.1'] });
    // M1's two slots are positions 0 and 2; M2 has not moved off 1 and 3.
    expect(out.map(l => l.id)).toEqual(['A.2', 'X.1', 'A.1', 'X.2']);
  });

  test('changes nothing for a person who never sorted anything', () => {
    expect(applyPersonQueues(leaves, {}).map(l => l.id)).toEqual(['A.1', 'A.2', 'B.1', 'B.2']);
    expect(applyPersonQueues(leaves, null)).toBe(leaves);
  });

  test('ignores a queue for somebody who is not on this work', () => {
    expect(applyPersonQueues(leaves, { M9: ['B.2'] }).map(l => l.id))
      .toEqual(['A.1', 'A.2', 'B.1', 'B.2']);
  });

  test('takes the first assignee, which is who the queue belongs to', () => {
    expect(assigneeOf({ assign: ['M2', 'M3'] })).toBe('M2');
    expect(assigneeOf({ assign: [] })).toBeNull();
    expect(assigneeOf({})).toBeNull();
  });

  test('does not let a stale queue duplicate or lose work', () => {
    const out = applyPersonQueues(leaves, { M1: ['B.1', 'ghost', 'A.1'] });
    expect(out).toHaveLength(leaves.length);
    expect(new Set(out.map(l => l.id)).size).toBe(leaves.length);
    // Decided: B.1 before A.1. The two the queue never named follow their own
    // plan-predecessors — B.2 goes with B.1, A.2 with A.1.
    expect(out.map(l => l.id)).toEqual(['B.1', 'B.2', 'A.1', 'A.2']);
  });
});

// Moving one task within its own queue. The same four directions the tree's
// ⌥↑↓ / ⌥⇧↑↓ use, because it is the same gesture on a different list.
describe('moving a task in a queue', () => {
  const q = ['a', 'b', 'c', 'd'];

  test('up and down by one', () => {
    expect(moveInQueue(q, 'c', 'up')).toEqual(['a', 'c', 'b', 'd']);
    expect(moveInQueue(q, 'b', 'down')).toEqual(['a', 'c', 'b', 'd']);
  });

  test('to either end', () => {
    expect(moveInQueue(q, 'd', 'first')).toEqual(['d', 'a', 'b', 'c']);
    expect(moveInQueue(q, 'a', 'last')).toEqual(['b', 'c', 'd', 'a']);
  });

  test('stops at the ends instead of wrapping around', () => {
    expect(moveInQueue(q, 'a', 'up')).toEqual(q);
    expect(moveInQueue(q, 'd', 'down')).toEqual(q);
  });

  test('says nothing about a task that is not in it', () => {
    expect(moveInQueue(q, 'zzz', 'up')).toEqual(q);
  });
});

// A queue that does not survive the file is a setting you have to make again
// every morning. It rides in the markdown the way the roadmap assignment does
// — a fenced block, one person per line.
describe('a queue in the file', () => {
  test('round-trips through markdown', () => {
    const tree = [
      { id: 'A', name: 'Projekt A', best: 0 },
      { id: 'A.1', name: 'A eins', best: 5, factor: 1, assign: ['M1'] },
      { id: 'B', name: 'Projekt B', best: 0 },
      { id: 'B.1', name: 'B eins', best: 5, factor: 1, assign: ['M1'] },
    ];
    const data = { tree, personQueues: { M1: ['B.1', 'A.1'] } };
    const md = buildMarkdownText({
      tree, members: [{ id: 'M1', name: 'Anna', team: 'T1' }],
      teams: [{ id: 'T1', name: 'Team A' }], vacations: [], data,
      meta: { name: 'Queue', planStart: '2026-01-01', planEnd: '2027-01-01' },
    });
    expect(md).toContain('```planr-queues');
    expect(md).toMatch(/M1 B\.1 A\.1/);
  });

  test('writes nothing when nobody has sorted anything', () => {
    const tree = [{ id: 'A', name: 'Projekt A', best: 0 }];
    const md = buildMarkdownText({
      tree, members: [], teams: [], vacations: [], data: { tree, personQueues: {} },
      meta: { name: 'Queue', planStart: '2026-01-01', planEnd: '2027-01-01' },
    });
    expect(md).not.toContain('planr-queues');
  });
});

// "Wie geht das mit WorkItems die nur einem Team zugeordnet sind usw?"
//
// It did not. The queue keyed on the first assignee, so an item with a team
// and nobody on it had no queue to be in — and those are exactly the items a
// plan has most of early on, when the question "which of these first" matters
// most. The scheduler puts them in that team's slots, so the team is who the
// order belongs to.
//
// One mechanism, one map: the owner is the person if there is one, otherwise
// the team. Not a second kind of queue with its own rules.
describe('who an item\'s order belongs to', () => {
  test('the person, when somebody is on it', () => {
    expect(queueOwnerOf({ assign: ['M1'], team: 'T1' })).toBe('M1');
  });

  test('the team, when nobody is', () => {
    expect(queueOwnerOf({ assign: [], team: 'T1' })).toBe('team:T1');
  });

  test('nobody, when there is neither', () => {
    expect(queueOwnerOf({ assign: [], team: '' })).toBeNull();
    expect(queueOwnerOf({})).toBeNull();
  });

  test('a team queue orders the team\'s own work, and nothing else', () => {
    const rows = [
      { id: 'A.1', assign: [], team: 'T1' },
      { id: 'X.1', assign: ['M1'], team: 'T1' },
      { id: 'A.2', assign: [], team: 'T1' },
    ];
    const out = applyPersonQueues(rows, { 'team:T1': ['A.2', 'A.1'] });
    // The team's two slots (0 and 2) swap; the assigned row does not move.
    expect(out.map(r => r.id)).toEqual(['A.2', 'X.1', 'A.1']);
  });

  test('assigning somebody takes the item out of the team\'s queue', () => {
    // Otherwise a stale team queue would keep ordering work that has an owner
    // now — two queues quietly claiming the same task.
    const rows = [{ id: 'A.1', assign: ['M1'], team: 'T1' }, { id: 'A.2', assign: [], team: 'T1' }];
    const out = applyPersonQueues(rows, { 'team:T1': ['A.2', 'A.1'] });
    expect(out.map(r => r.id)).toEqual(['A.1', 'A.2']);
  });
});

// The drag, as a function. `moveInQueue` is what the keys do; this is what a
// drop does — land on the place you pointed at.
describe('dropping a task onto a place', () => {
  const q = ['a', 'b', 'c', 'd'];

  test('takes the place it was dropped on, pushing the rest down', () => {
    expect(placeInQueue(q, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  test('works downwards too, and means the same thing', () => {
    // The dropped item takes the target's place in both directions. The other
    // reading — "after the target when dragging down, before it when dragging
    // up" — makes the result depend on where you started, which is not
    // something a drop should have to remember.
    expect(placeInQueue(q, 'a', 'c')).toEqual(['b', 'a', 'c', 'd']);
  });

  test('a selection lands as a block, in its own order', () => {
    expect(placeInQueue(q, ['c', 'd'], 'b')).toEqual(['a', 'c', 'd', 'b']);
  });

  test('a drop onto a member of the selection changes nothing', () => {
    expect(placeInQueue(q, ['b', 'c'], 'c')).toEqual(q);
  });

  test('a drop on itself changes nothing', () => {
    expect(placeInQueue(q, 'b', 'b')).toEqual(q);
  });

  test('a drop on something that is not in the list changes nothing', () => {
    expect(placeInQueue(q, 'b', 'zzz')).toEqual(q);
    expect(placeInQueue(q, 'zzz', 'b')).toEqual(q);
  });
});

// Moving several at once. The selection keeps its own order and lands as a
// block; doing it one item at a time would be a different result, because each
// would step over the next.
describe('moving a selection', () => {
  const q = ['a', 'b', 'c', 'd', 'e'];

  test('up by one, as a block', () => {
    expect(moveInQueue(q, ['c', 'd'], 'up')).toEqual(['a', 'c', 'd', 'b', 'e']);
  });

  test('down by one, as a block', () => {
    expect(moveInQueue(q, ['b', 'c'], 'down')).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  test('a selection with gaps closes up and keeps its order', () => {
    // The block moves past the item below the WHOLE block — 'e' — not past
    // whatever happened to follow its first member. Anything else would make
    // the result depend on which gap you selected around.
    expect(moveInQueue(q, ['a', 'd'], 'down')).toEqual(['b', 'c', 'e', 'a', 'd']);
  });

  test('to either end', () => {
    expect(moveInQueue(q, ['d', 'e'], 'first')).toEqual(['d', 'e', 'a', 'b', 'c']);
    expect(moveInQueue(q, ['a', 'b'], 'last')).toEqual(['c', 'd', 'e', 'a', 'b']);
  });

  test('already at the top stays put', () => {
    expect(moveInQueue(q, ['a', 'b'], 'up')).toEqual(q);
  });

  test('selecting everything is a no-op, not an empty list', () => {
    expect(moveInQueue(q, [...q], 'up')).toEqual(q);
  });

  test('a single id still works, spelled either way', () => {
    expect(moveInQueue(q, 'c', 'up')).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(moveInQueue(q, ['c'], 'up')).toEqual(['a', 'c', 'b', 'd', 'e']);
  });
});
