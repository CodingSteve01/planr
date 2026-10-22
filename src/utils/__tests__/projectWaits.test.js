// "What is this project waiting on?" — a project can be late because of work
// that sits in ANOTHER project: the person who decides its end is busy with
// that first. On the venneker plan P8 was 91 days late while 42 PT of P10 sat
// ahead of it on the only Backend developer, and no view said so.
//
// The answer is a chain of what-ifs: take out the earlier project that gains
// the most, schedule again, repeat. Two causes that only help together (each
// one alone leaves the other in the way) are caught by a pair check.
import { describe, test, expect } from 'vitest';
import { schedule } from '../scheduler.js';
import { projectWaits } from '../projectWaits.js';
import { iso } from '../date.js';

const PS = '2026-01-05'; // Monday
const members = [
  { id: 'X', name: 'Xaver', team: 'B', cap: 1, vac: 0, start: '2026-01-01' },
  { id: 'Y', name: 'Yvonne', team: 'F', cap: 1, vac: 0, start: '2026-01-01' },
];
const reschedule = tree => schedule(tree, members, [], PS, '2027-12-31', {}, [1, 2, 3, 4, 5], PS,
  { now: PS, anchorToToday: false, discountProgress: false }).results;
const leaf = (id, team, best, extra = {}) => ({ id, name: `Task ${id}`, team, best, factor: 1, status: 'open', ...extra });
const analyse = (tree, rootId) => projectWaits({ tree, scheduled: reschedule(tree), rootId, reschedule, members, today: new Date(2026, 0, 5) });

describe('what a project waits on', () => {
  test('names the earlier project that holds its person, and what taking it out gains', () => {
    const tree = [
      { id: 'P1', name: 'Bookkeeping' }, leaf('P1.1', 'B', 20),
      { id: 'P2', name: 'Billing', date: '2026-01-30' }, leaf('P2.1', 'B', 10),
    ];
    const w = analyse(tree, 'P2');
    expect(w.bottleneck).toMatchObject({ personId: 'X', name: 'Xaver', lastTaskId: 'P2.1', alone: true });
    expect(w.lateDays).toBeGreaterThan(0);
    expect(w.chain).toHaveLength(1);
    expect(w.chain[0]).toMatchObject({ ids: ['P1'], person: { id: 'X' } });
    expect(Math.round(w.chain[0].pt)).toBe(20);
    expect(w.chain[0].gainDays).toBeGreaterThan(20);
    const alone = reschedule(tree.map(n => (n.id.startsWith('P1') ? { ...n, dropped: true } : n)));
    expect(iso(w.chain[0].endAfter)).toBe(iso(alone.find(r => r.id === 'P2.1').endD));
  });

  test('never blames a project that comes later in the plan', () => {
    const tree = [
      { id: 'P2', name: 'Billing' }, leaf('P2.1', 'B', 10),
      { id: 'P3', name: 'Later' }, leaf('P3.1', 'B', 30),
    ];
    expect(analyse(tree, 'P2').chain).toEqual([]);
  });

  test('chains causes: after the biggest one, the next one that still gains', () => {
    const tree = [
      { id: 'P1', name: 'Big', displayOrder: 1 }, leaf('P1.1', 'B', 20),
      { id: 'P3', name: 'Small', displayOrder: 2 }, leaf('P3.1', 'B', 5),
      { id: 'P2', name: 'Billing', displayOrder: 3 }, leaf('P2.1', 'B', 10),
    ];
    const w = analyse(tree, 'P2');
    expect(w.chain.map(c => c.ids)).toEqual([['P1'], ['P3']]);
    expect(w.chain[1].totalGainDays).toBeGreaterThan(w.chain[0].totalGainDays);
  });

  test('finds two causes that only help together', () => {
    const tree = [
      { id: 'P1', name: 'Backend side', displayOrder: 1 }, leaf('P1.1', 'B', 20),
      { id: 'P3', name: 'Frontend side', displayOrder: 2 }, leaf('P3.1', 'F', 20),
      { id: 'P2', name: 'Billing', displayOrder: 3 }, leaf('P2.1', 'B', 5), leaf('P2.2', 'F', 5),
    ];
    const w = analyse(tree, 'P2');
    expect(w.chain).toHaveLength(1);
    expect([...w.chain[0].ids].sort()).toEqual(['P1', 'P3']);
    expect(w.chain[0].gainDays).toBeGreaterThan(20);
  });

  test('walks the path that sets the end, across projects', () => {
    const tree = [
      { id: 'P1', name: 'Bookkeeping' }, leaf('P1.1', 'B', 10),
      { id: 'P2', name: 'Billing' }, leaf('P2.1', 'B', 5), leaf('P2.2', 'B', 5, { deps: ['P2.1'] }),
    ];
    const w = analyse(tree, 'P2');
    expect(w.path.map(p => p.id)).toEqual(['P1.1', 'P2.1', 'P2.2']);
    expect(w.path.map(p => p.foreign)).toEqual([true, false, false]);
  });

  test('a project nothing holds back has an empty chain and no lateness', () => {
    const tree = [{ id: 'P2', name: 'Billing', date: '2026-12-31' }, leaf('P2.1', 'B', 5)];
    const w = analyse(tree, 'P2');
    expect(w.chain).toEqual([]);
    expect(w.lateDays).toBe(0);
  });

  test('a colleague who has left does not count as a second person in the team', () => {
    const left = { id: 'Z', name: 'Zora', team: 'B', cap: 1, vac: 0, start: '2025-01-01', end: '2025-12-31' };
    const tree = [{ id: 'P2', name: 'Billing', date: '2026-01-09' }, leaf('P2.1', 'B', 10, { assign: ['X'] })];
    const w = projectWaits({ tree, scheduled: reschedule(tree), rootId: 'P2', reschedule, members: [...members, left], today: new Date(2026, 0, 5) });
    expect(w.bottleneck.alone).toBe(true);
  });

  test('the path shows one line per package and person, so the other project stays in view', () => {
    const tree = [
      { id: 'P1', name: 'Bookkeeping' }, leaf('P1.1', 'B', 5),
      { id: 'P2', name: 'Billing' },
      { id: 'P2.1', name: 'Masks' },
      ...Array.from({ length: 12 }, (_, i) => leaf(`P2.1.${i + 1}`, 'B', 1)),
    ];
    const w = analyse(tree, 'P2');
    expect(w.path.map(p => [p.id, p.count, p.foreign])).toEqual([['P1.1', 1, true], ['P2.1', 12, false]]);
  });
});
