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
import { reconcileQueue, applyPersonQueues, assigneeOf, queueOwnerOf, moveInQueue } from '../personQueue.js';
import { buildMarkdownText } from '../markdown.js';

const leaf = (id, person) => ({ id, assign: person ? [person] : [] });

describe('a queue that outlives the plan it was written for', () => {
  test('keeps the order it was given', () => {
    expect(reconcileQueue(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  test('drops what is gone rather than carrying a ghost', () => {
    expect(reconcileQueue(['c', 'gone', 'a'], ['a', 'c'])).toEqual(['c', 'a']);
  });

  test('appends what is new, in the order it arrived', () => {
    // New work goes to the back of a hand-sorted queue: it was not part of
    // the decision, so it must not silently jump it.
    expect(reconcileQueue(['c', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd']);
  });

  test('is nothing at all when nothing was sorted', () => {
    expect(reconcileQueue(null, ['a', 'b'])).toEqual(['a', 'b']);
    expect(reconcileQueue([], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('applying a queue to the plan order', () => {
  const leaves = [leaf('A.1', 'M1'), leaf('A.2', 'M1'), leaf('B.1', 'M1'), leaf('B.2', 'M1')];

  test('permutes only that person\'s own slots', () => {
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
    expect(out.map(l => l.id)).toEqual(['B.1', 'A.1', 'A.2', 'B.2']);
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
