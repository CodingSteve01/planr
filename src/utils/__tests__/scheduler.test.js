import { describe, test, expect } from 'vitest';
import { schedule, re } from '../scheduler.js';

// Minimal project builder — returns the canonical `schedule()` invocation so
// tests can focus on scenario state, not boilerplate.
function runSchedule({
  tree,
  members,
  vacations = [],
  planStart = '2026-01-05',   // Monday
  planEnd = '2026-12-31',
  holidays = {},
  workDays = [1, 2, 3, 4, 5],
}) {
  return schedule(tree, members, vacations, planStart, planEnd, holidays, workDays, planStart);
}

describe('re() effort calculation', () => {
  test('best × factor', () => {
    expect(re(10, 1.5)).toBe(15);
  });
  test('zero best → 0', () => {
    expect(re(0, 1.5)).toBe(0);
  });
  test('undefined best → 0', () => {
    expect(re(undefined, 1.5)).toBe(0);
  });
});

describe('schedule(): basic single-task scenarios', () => {
  const alex = { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 25, start: '2026-01-01' };

  test('empty tree returns empty results', () => {
    const { results } = runSchedule({ tree: [], members: [alex] });
    expect(results).toEqual([]);
  });

  test('single 5-day task assigned to full-time member', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Task', team: 'T1', best: 5, factor: 1, assign: ['M1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('P1.1');
    expect(results[0].personId).toBe('M1');
  });

  test('auto-assign picks team member when no explicit assign', () => {
    // Need 2+ team members to exercise the auto-assign branch (the single-
    // member shortcut short-circuits to the explicit-assign path).
    const sam = { id: 'M2', name: 'Sam', team: 'T1', cap: 1, vac: 25, start: '2026-01-01' };
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Task', team: 'T1', best: 3, factor: 1, assign: [], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex, sam] });
    expect(['M1', 'M2']).toContain(results[0].personId);
    expect(results[0].autoAssigned).toBe(true);
  });
});

describe('schedule(): offboard cascade', () => {
  // Two members, same team. M1 offboards mid-task, M2 is available.
  const members = [
    { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01', end: '2026-02-13' },
    { id: 'M2', name: 'Sam',  team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
  ];

  test('single-assign task cascades to same-team member on offboard', () => {
    // 60-day task, M1 offboards Feb 13 mid-task → remainder picks up by M2.
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Long', team: 'T1', best: 60, factor: 1, assign: ['M1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members });
    const primary = results.find(s => s.id === 'P1.1');
    const handoff = results.find(s => s.isHandoff && !s.unscheduled);
    expect(primary.hasHandoffSegments).toBe(true);
    expect(handoff).toBeDefined();
    expect(handoff.personId).toBe('M2');
    expect(handoff.unscheduled).toBeFalsy();
  });

  test('truncation when no team member can absorb remainder', () => {
    // Only M1, offboards mid-task, 60d task → ghost tail
    const soloTeam = [members[0]];
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Long', team: 'T1', best: 60, factor: 1, assign: ['M1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: soloTeam });
    const primary = results.find(s => s.id === 'P1.1');
    const ghost = results.find(s => s.isHandoff && s.unscheduled);
    expect(primary.truncatedByOffboard).toBeTruthy();
    expect(ghost).toBeDefined();
    expect(ghost.personId).toBeNull();
    expect(ghost.effort).toBeGreaterThan(0);
  });

  test('cross-team cascade when same-team exhausted', () => {
    const cross = [
      { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01', end: '2026-02-13' },
      { id: 'M2', name: 'Sam',  team: 'T2', cap: 1, vac: 0, start: '2026-01-01' },
    ];
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Long', team: 'T1', best: 60, factor: 1, assign: ['M1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: cross });
    const handoff = results.find(s => s.isHandoff && !s.unscheduled);
    expect(handoff?.personId).toBe('M2');
    expect(handoff?.crossTeam).toBe(true);
  });

  test('handoffPlan override forces specific assignee', () => {
    const trio = [
      { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01', end: '2026-02-13' },
      { id: 'M2', name: 'Sam',  team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
      { id: 'M3', name: 'Robin', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
    ];
    // Without override Scheduler might pick either M2 or M3 (earliest-free).
    // With override → must be M3.
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Long', team: 'T1', best: 60, factor: 1,
        assign: ['M1'], status: 'open',
        handoffPlan: [{ assign: ['M3'] }] },
    ];
    const { results } = runSchedule({ tree, members: trio });
    const handoff = results.find(s => s.isHandoff && !s.unscheduled);
    expect(handoff?.personId).toBe('M3');
    expect(handoff?.plannedHandoff).toBe(true);
  });
});

describe('schedule(): dependencies', () => {
  const alex = { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' };

  test('dependent task starts after predecessor finishes', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'First', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: [], status: 'open' },
      { id: 'P1.2', name: 'Second', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: ['P1.1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    const first = results.find(s => s.id === 'P1.1');
    const second = results.find(s => s.id === 'P1.2');
    expect(second.startD >= first.endD).toBe(true);
  });

  test('inherited dep from parent blocks all children', () => {
    // P2 depends on P1. Leaves under P2 inherit the dependency and all must
    // start after P1.1 finishes.
    const tree = [
      { id: 'P1', name: 'Gate', team: '', best: 0 },
      { id: 'P1.1', name: 'Gate task', team: 'T1', best: 3, factor: 1, assign: ['M1'], deps: [], status: 'open' },
      { id: 'P2', name: 'Next', team: '', best: 0, deps: ['P1'] },
      { id: 'P2.1', name: 'After gate', team: 'T1', best: 2, factor: 1, assign: ['M1'], deps: [], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    const gate = results.find(s => s.id === 'P1.1');
    const after = results.find(s => s.id === 'P2.1');
    expect(after.startD >= gate.endD).toBe(true);
  });

  test('done tasks are not scheduled', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Already done', team: 'T1', best: 5, factor: 1, assign: ['M1'], status: 'done' },
      { id: 'P1.2', name: 'Still open', team: 'T1', best: 5, factor: 1, assign: ['M1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    expect(results.find(s => s.id === 'P1.1')).toBeUndefined();
    expect(results.find(s => s.id === 'P1.2')).toBeDefined();
  });
});

describe('schedule(): pinned starts', () => {
  const alex = { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' };

  test('pinned task starts on its pin date (not earlier)', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Pinned', team: 'T1', best: 3, factor: 1,
        assign: ['M1'], pinnedStart: '2026-03-02', status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    const s = results.find(r => r.id === 'P1.1');
    expect(s.startD >= new Date(2026, 2, 2)).toBe(true);
  });

  test('pinned task does not consume queue slot before its pin', () => {
    // P1.1 pinned in March doesn't block P1.2 (un-pinned) from running
    // earlier on the same person.
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Pinned', team: 'T1', best: 3, factor: 1,
        assign: ['M1'], pinnedStart: '2026-03-02', status: 'open' },
      { id: 'P1.2', name: 'Early', team: 'T1', best: 2, factor: 1, assign: ['M1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    const early = results.find(s => s.id === 'P1.2');
    expect(early.startD < new Date(2026, 2, 2)).toBe(true);
  });
});

describe('schedule(): parallel flag', () => {
  const alex = { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' };

  test('parallel flag persists to scheduled output', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Review', team: 'T1', best: 10, factor: 1,
        assign: ['M1'], parallel: true, status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    const review = results.find(s => s.id === 'P1.1');
    expect(review).toBeDefined();
    expect(review.parallel).toBe(true);
  });

  test('two parallel tasks on same person overlap in time', () => {
    // Both parallel: neither blocks the primary queue, so they can overlap.
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Review-A', team: 'T1', best: 5, factor: 1,
        assign: ['M1'], parallel: true, status: 'open' },
      { id: 'P1.2', name: 'Review-B', team: 'T1', best: 5, factor: 1,
        assign: ['M1'], parallel: true, status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    const a = results.find(s => s.id === 'P1.1');
    const b = results.find(s => s.id === 'P1.2');
    // Start days match (both planStart) — true concurrency.
    expect(a.startD.getTime()).toBe(b.startD.getTime());
  });
});

describe('schedule(): vacations', () => {
  test('explicit vacation days lower effective capacity', () => {
    const alex = { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 25, start: '2026-01-01' };
    const explicitVac = [{ person: 'M1', from: '2026-01-19', to: '2026-01-23', note: '' }];
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Task', team: 'T1', best: 10, factor: 1, assign: ['M1'], status: 'open' },
    ];
    const withVac = runSchedule({ tree, members: [alex], vacations: explicitVac });
    const withoutVac = runSchedule({ tree, members: [{ ...alex, vac: 0 }], vacations: [] });
    const a = withVac.results.find(s => s.id === 'P1.1');
    const b = withoutVac.results.find(s => s.id === 'P1.1');
    // With vacation + annual allowance the task spans more calendar days.
    expect(a.calDays).toBeGreaterThan(b.calDays);
  });
});

describe('schedule(): multi-assign (pair programming)', () => {
  const m1 = { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' };
  const m2 = { id: 'M2', name: 'Sam',  team: 'T1', cap: 1, vac: 0, start: '2026-01-01' };

  test('both members are booked on the task window', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Pair', team: 'T1', best: 5, factor: 1,
        assign: ['M1', 'M2'], status: 'open' },
      { id: 'P1.2', name: 'Other-A', team: 'T1', best: 3, factor: 1, assign: ['M1'], status: 'open' },
      { id: 'P1.3', name: 'Other-B', team: 'T1', best: 3, factor: 1, assign: ['M2'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [m1, m2] });
    const pair = results.find(s => s.id === 'P1.1');
    const a = results.find(s => s.id === 'P1.2');
    const b = results.find(s => s.id === 'P1.3');
    // Both follow-up tasks start at or after the pair task's end — the pair
    // blocked both members.
    expect(a.startD >= pair.endD).toBe(true);
    expect(b.startD >= pair.endD).toBe(true);
  });
});

describe('schedule(): cross-team + planned handoff layered', () => {
  const t1 = { id: 'M1', name: 'T1-out', team: 'T1', cap: 1, vac: 0, start: '2026-01-01', end: '2026-02-13' };
  const t1b = { id: 'M2', name: 'T1-stay', team: 'T1', cap: 1, vac: 0, start: '2026-01-01', end: '2026-02-13' };
  const t2 = { id: 'M3', name: 'T2', team: 'T2', cap: 1, vac: 0, start: '2026-01-01' };

  test('falls through to cross-team when team exhausted', () => {
    // Both T1 members offboard early; T2 member is only path.
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Long', team: 'T1', best: 60, factor: 1, assign: ['M1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [t1, t1b, t2] });
    const handoffs = results.filter(s => s.isHandoff && !s.unscheduled);
    const crossRow = handoffs.find(s => s.crossTeam);
    expect(crossRow).toBeDefined();
    expect(crossRow.personId).toBe('M3');
  });
});

describe('schedule(): segment sums are conservative', () => {
  // Primary + handoff effort should sum to original task effort.
  test('segments sum equals eff', () => {
    const members = [
      { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01', end: '2026-02-13' },
      { id: 'M2', name: 'Sam',  team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
    ];
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Long', team: 'T1', best: 40, factor: 1.5, assign: ['M1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members });
    const all = results.filter(s => (s.treeId || s.id) === 'P1.1');
    const sumEffort = all.reduce((s, r) => s + (r.effort || 0), 0);
    // Effort = best*factor = 40*1.5 = 60
    expect(sumEffort).toBeCloseTo(60, 1);
  });
});
