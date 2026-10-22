// "Work out the order": Planr tries other orders of the projects and shows the
// best few with what each one costs, instead of only drawing the order the
// tree happens to have. On the venneker plan P10 sat ahead of P8 and took the
// only Backend developer for three months; moving it behind P8 held P8's
// date far better, and nothing suggested it.
//
// Only the order of projects changes. Dependencies, pinned dates and the order
// inside a project are facts and stay. What counts as better, in this order:
// more deadlines held, less lateness (projects higher up weigh more), earlier
// ends weighted the same way, fewer moves.
import { describe, test, expect } from 'vitest';
import { schedule } from '../scheduler.js';
import { searchOrders, applyRootOrder } from '../orderSearch.js';
import { sortTree } from '../treeEdit.js';

const PS = '2026-01-05';
const members = [{ id: 'X', name: 'Xaver', team: 'B', cap: 1, vac: 0, start: '2026-01-01' }];
const reschedule = tree => schedule(tree, members, [], PS, '2027-12-31', {}, [1, 2, 3, 4, 5], PS,
  { now: PS, anchorToToday: false, discountProgress: false }).results;
const leaf = (id, best, extra = {}) => ({ id, name: id, team: 'B', best, factor: 1, status: 'open', ...extra });
const rootOrder = tree => sortTree(tree).filter(n => !n.id.includes('.')).map(n => n.id);
const run = async (tree, opts = {}) => {
  const out = [];
  for await (const step of searchOrders({ tree, reschedule, ...opts })) out.push(step);
  return out[out.length - 1];
};

describe('working out the order of projects', () => {
  test('moves a project without a date behind the late one it holds back', async () => {
    const tree = [
      { id: 'P1', name: 'Bookkeeping', displayOrder: 1 }, leaf('P1.1', 20),
      { id: 'P2', name: 'Billing', date: '2026-01-30', displayOrder: 2 }, leaf('P2.1', 10),
    ];
    const result = await run(tree);
    expect(result.done).toBe(true);
    const best = result.alternatives[0];
    expect(best.order).toEqual(['P2', 'P1']);
    expect(best.missedAfter).toBe(0);
    expect(best.missedBefore).toBe(1);
    expect(best.ends.P2.deltaDays).toBeLessThan(0);
    expect(best.ends.P1.deltaDays).toBeGreaterThan(0);
    expect(best.moves).toEqual([{ id: 'P2', before: 'P1' }]);
  });

  test('proposes nothing when a dependency makes the order a fact', async () => {
    const tree = [
      { id: 'P1', name: 'Bookkeeping', displayOrder: 1 }, leaf('P1.1', 20),
      { id: 'P2', name: 'Billing', date: '2026-01-30', displayOrder: 2 }, leaf('P2.1', 10, { deps: ['P1.1'] }),
    ];
    const result = await run(tree);
    expect(result.alternatives).toEqual([]);
  });

  test('stops at its run budget and says how far it got', async () => {
    const tree = [
      ...['P1', 'P2', 'P3', 'P4', 'P5'].flatMap((id, i) => [
        { id, name: id, displayOrder: i + 1, ...(i === 4 ? { date: '2026-01-20' } : {}) }, leaf(`${id}.1`, 5),
      ]),
    ];
    const steps = [];
    for await (const step of searchOrders({ tree, reschedule, maxRuns: 6 })) steps.push(step);
    const last = steps[steps.length - 1];
    expect(last.runs).toBeLessThanOrEqual(6);
    expect(last.done).toBe(true);
    expect(steps.some(s => !s.done)).toBe(true);
  });

  test('applying an order writes it into the tree', () => {
    const tree = [
      { id: 'P1', name: 'A', displayOrder: 1 }, leaf('P1.1', 1),
      { id: 'P2', name: 'B', displayOrder: 2 }, leaf('P2.1', 1),
      { id: 'P3', name: 'C', displayOrder: 3, status: 'done' },
    ];
    expect(rootOrder(applyRootOrder(tree, ['P2', 'P1']))).toEqual(['P3', 'P2', 'P1']);
  });
});

describe('moving a project to the very end', () => {
  test('is one of the orders tried', async () => {
    const tree = [
      { id: 'P1', name: 'Big', displayOrder: 1 }, leaf('P1.1', 20),
      { id: 'P2', name: 'Billing', date: '2026-01-23', displayOrder: 2 }, leaf('P2.1', 5),
      { id: 'P3', name: 'Billing too', date: '2026-01-30', displayOrder: 3 }, leaf('P3.1', 5),
    ];
    const result = await run(tree);
    expect(result.alternatives[0].order).toEqual(['P2', 'P3', 'P1']);
    expect(result.alternatives[0].moves).toEqual([{ id: 'P1', after: 'P3' }]);
  });
});

describe('orders with the same outcome', () => {
  test('are shown once, with the fewest moves', async () => {
    const two = [
      { id: 'X', name: 'Xaver', team: 'B', cap: 1, vac: 0, start: '2026-01-01' },
      { id: 'Y', name: 'Yvonne', team: 'F', cap: 1, vac: 0, start: '2026-01-01' },
    ];
    const resched = tree => schedule(tree, two, [], PS, '2027-12-31', {}, [1, 2, 3, 4, 5], PS,
      { now: PS, anchorToToday: false, discountProgress: false }).results;
    const tree = [
      { id: 'P1', name: 'Big', displayOrder: 1 }, leaf('P1.1', 20),
      { id: 'P2', name: 'Billing', date: '2026-01-30', displayOrder: 2 }, leaf('P2.1', 10),
      { id: 'P3', name: 'Elsewhere', displayOrder: 3 }, { ...leaf('P3.1', 5), team: 'F' },
    ];
    const out = [];
    for await (const s of searchOrders({ tree, reschedule: resched })) out.push(s);
    const alts = out[out.length - 1].alternatives;
    const outcomes = alts.map(a => JSON.stringify(Object.values(a.ends).map(e => e.after)));
    expect(new Set(outcomes).size).toBe(outcomes.length);
    expect(alts[0].moves).toHaveLength(1);
  });
});

describe('the moves of an order', () => {
  test('are named against projects that stay where they are', async () => {
    const { movesBetween } = await import('../orderSearch.js');
    expect(movesBetween(['A', 'B', 'C', 'D'], ['B', 'A', 'D', 'C'])).toEqual([
      { id: 'B', before: 'A' }, { id: 'D', before: 'C' },
    ]);
    expect(movesBetween(['A', 'B', 'C'], ['B', 'C', 'A'])).toEqual([{ id: 'A', after: 'C' }]);
  });
});
