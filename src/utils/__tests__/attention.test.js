import { describe, test, expect } from 'vitest';
import { computeAttention, attentionCounts } from '../attention.js';

const NOW = new Date(2026, 0, 15); // 2026-01-15, local midnight

function baseTree() {
  return [
    { id: 'P1', name: 'Billing', status: 'wip' },
    { id: 'P1.1', name: 'Ready leaf', status: 'open', best: 5, factor: 1.5, deps: [], team: 'T1', assign: ['M1'] },
    { id: 'P1.2', name: 'No size', status: 'open', best: 0, factor: 1.5, deps: [], team: 'T1' },
    { id: 'P1.3', name: 'Waits on P1.1', status: 'open', best: 3, factor: 1.5, deps: ['P1.1'], team: 'T2' },
    { id: 'P1.4', name: 'Past decision', status: 'open', best: 2, factor: 1.5, deps: [], decideBy: '2026-01-01' },
    { id: 'P1.5', name: 'Done already', status: 'done', best: 2, factor: 1.5, deps: [] },
  ];
}

describe('computeAttention', () => {
  test('flags an unset estimate as unestimated, not blocked', () => {
    const items = computeAttention({ tree: baseTree(), scheduled: [], now: NOW });
    const p12 = items.filter(i => i.id === 'P1.2');
    expect(p12).toHaveLength(1);
    expect(p12[0].kind).toBe('unestimated');
  });

  test('flags an estimated leaf with an unmet dependency as blocked', () => {
    const items = computeAttention({ tree: baseTree(), scheduled: [], now: NOW });
    expect(items.find(i => i.id === 'P1.3' && i.kind === 'blocked')).toBeTruthy();
  });

  test('does not flag a ready, estimated leaf', () => {
    const items = computeAttention({ tree: baseTree(), scheduled: [], now: NOW });
    expect(items.find(i => i.id === 'P1.1')).toBeUndefined();
  });

  test('a satisfied dependency clears the blocked flag', () => {
    const tree = baseTree().map(n => n.id === 'P1.1' ? { ...n, status: 'done' } : n);
    const items = computeAttention({ tree, scheduled: [], now: NOW });
    expect(items.find(i => i.id === 'P1.3')).toBeUndefined();
  });

  test('flags a past decide-by date as overdue', () => {
    const items = computeAttention({ tree: baseTree(), scheduled: [], now: NOW });
    expect(items.find(i => i.id === 'P1.4' && i.kind === 'overdue')).toBeTruthy();
  });

  test('never flags a done leaf', () => {
    const items = computeAttention({ tree: baseTree(), scheduled: [], now: NOW });
    expect(items.find(i => i.id === 'P1.5')).toBeUndefined();
  });

  test('a deadline root whose projected end slips past its date is at risk', () => {
    const tree = [
      { id: 'D1', name: 'Launch', type: 'deadline', date: '2026-02-01', status: 'open' },
      { id: 'D1.1', name: 'Work', status: 'open', best: 5, factor: 1.5, deps: [] },
    ];
    const scheduled = [{ id: 'D1.1', endD: new Date(2026, 1, 10) }]; // past the deadline
    const items = computeAttention({ tree, scheduled, now: NOW });
    expect(items.find(i => i.id === 'D1' && i.kind === 'atRisk')).toBeTruthy();
  });

  test('a deadline root that will land on time is not at risk', () => {
    const tree = [
      { id: 'D1', name: 'Launch', type: 'deadline', date: '2026-02-01', status: 'open' },
      { id: 'D1.1', name: 'Work', status: 'open', best: 5, factor: 1.5, deps: [] },
    ];
    const scheduled = [{ id: 'D1.1', endD: new Date(2026, 0, 20) }];
    const items = computeAttention({ tree, scheduled, now: NOW });
    expect(items.find(i => i.id === 'D1')).toBeUndefined();
  });

  test('respects rootFilter/teamFilter/personFilter scoping', () => {
    const tree = baseTree();
    const scopedToT2 = computeAttention({ tree, scheduled: [], now: NOW, teamFilter: 'T2' });
    // Only P1.3 carries team T2; P1.2's unestimated flag should not appear.
    expect(scopedToT2.find(i => i.id === 'P1.2')).toBeUndefined();
    expect(scopedToT2.find(i => i.id === 'P1.3')).toBeTruthy();
  });

  test('readiness ignores the active scope — a filtered-out predecessor still counts as done', () => {
    const tree = baseTree().map(n => n.id === 'P1.1' ? { ...n, status: 'done' } : n);
    // Filter down to team T2 only (P1.3's team); P1.1 (team T1) is out of
    // scope but must still count as done for the readiness check.
    const items = computeAttention({ tree, scheduled: [], now: NOW, teamFilter: 'T2' });
    expect(items.find(i => i.id === 'P1.3')).toBeUndefined();
  });

  test('merges caller-supplied drift rows and ranks overdue > drift > atRisk > blocked > unestimated', () => {
    const items = computeAttention({
      tree: baseTree(),
      scheduled: [],
      now: NOW,
      driftItems: [{ id: 'P1.9', name: 'Ticket moved on', key: 'NA-1', target: 'done' }],
    });
    const kinds = items.map(i => i.kind);
    // overdue (P1.4) before drift (P1.9) before blocked (P1.3) before unestimated (P1.2)
    expect(kinds.indexOf('overdue')).toBeLessThan(kinds.indexOf('drift'));
    expect(kinds.indexOf('drift')).toBeLessThan(kinds.indexOf('blocked'));
    expect(kinds.indexOf('blocked')).toBeLessThan(kinds.indexOf('unestimated'));
  });
});

describe('attentionCounts', () => {
  test('tallies by kind', () => {
    const items = [{ kind: 'overdue' }, { kind: 'overdue' }, { kind: 'blocked' }];
    expect(attentionCounts(items)).toEqual({ overdue: 2, drift: 0, atRisk: 0, blocked: 1, unestimated: 0 });
  });
});
