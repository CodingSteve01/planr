import { describe, test, expect } from 'vitest';
import { schedule, re } from '../scheduler.js';
import { iso } from '../date.js';

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
  options = {},
}) {
  // Pin `now` to planStart so tests stay deterministic regardless of when
  // they run. Auto-advance + WIP-discount are still exercised — tests that
  // need to verify those pass `now` / `discountProgress` through `options`.
  // autoCascade defaults true here so the existing handoff suite stays
  // valid — those tests exercise cascade mechanics. App-side default is
  // false (user explicitly splits via the Insights ↳ Split button).
  const opts = { now: planStart, anchorToToday: false, discountProgress: false, autoCascade: true, ...options };
  return schedule(tree, members, vacations, planStart, planEnd, holidays, workDays, planStart, opts);
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

// `parallel` flag removed from the data model — parallelism is now expressed
// by the absence of dep edges between tasks (per-person capacity still
// queues, but tasks on different people / no shared deps run concurrently).

describe('schedule(): fan-out auto-parallel (shared capacity)', () => {
  const alex = { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' };

  test('N successors with same predecessor + same assignee share start, span = N × eff', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Pred', team: 'T1', best: 1, factor: 1, assign: ['M1'], status: 'open' },
      { id: 'P1.2', name: 'A', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: ['P1.1'], status: 'open' },
      { id: 'P1.3', name: 'B', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: ['P1.1'], status: 'open' },
      { id: 'P1.4', name: 'C', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: ['P1.1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    const a = results.find(s => s.id === 'P1.2');
    const b = results.find(s => s.id === 'P1.3');
    const c = results.find(s => s.id === 'P1.4');
    // All three share the same start (= predecessor's end + 1 day, rounded
    // to the week-grid the scheduler operates on).
    expect(a.startD.getTime()).toBe(b.startD.getTime());
    expect(a.startD.getTime()).toBe(c.startD.getTime());
    // Calendar span covers all three efforts back-to-back (shared cap = 1/3
    // throughput on each → identical end for all three).
    expect(a.endD.getTime()).toBe(b.endD.getTime());
    expect(a.endD.getTime()).toBe(c.endD.getTime());
  });

  test('singleton successor stays on regular per-person path', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Pred', team: 'T1', best: 1, factor: 1, assign: ['M1'], status: 'open' },
      { id: 'P1.2', name: 'Only', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: ['P1.1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex] });
    const t = results.find(s => s.id === 'P1.2');
    expect(t).toBeDefined();
    expect(t._autoParallel).toBeFalsy();
  });

  test('different assignees keep the regular sequential per-person schedule', () => {
    const max = { id: 'M2', name: 'Max', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' };
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Pred', team: 'T1', best: 1, factor: 1, assign: ['M1'], status: 'open' },
      { id: 'P1.2', name: 'A', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: ['P1.1'], status: 'open' },
      { id: 'P1.3', name: 'B', team: 'T1', best: 5, factor: 1, assign: ['M2'], deps: ['P1.1'], status: 'open' },
    ];
    const { results } = runSchedule({ tree, members: [alex, max] });
    const a = results.find(s => s.id === 'P1.2');
    const b = results.find(s => s.id === 'P1.3');
    // Different people → no batching. They may still start at the same time
    // because both wait on the same predecessor, but neither is marked auto-
    // parallel because the grouping requires identical assignee sets.
    expect(a._autoParallel).toBeFalsy();
    expect(b._autoParallel).toBeFalsy();
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

describe('schedule(): cyclic deps', () => {
  const alex = { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' };

  test('cycle does not throw; both nodes appear', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'A', team: 'T1', best: 2, factor: 1, assign: ['M1'], deps: ['P1.2'], status: 'open' },
      { id: 'P1.2', name: 'B', team: 'T1', best: 2, factor: 1, assign: ['M1'], deps: ['P1.1'], status: 'open' },
    ];
    const run = () => runSchedule({ tree, members: [alex] });
    expect(run).not.toThrow();
    const { results } = run();
    expect(results.find(s => s.id === 'P1.1')).toBeDefined();
    expect(results.find(s => s.id === 'P1.2')).toBeDefined();
  });
});

describe('schedule(): cascade respects dep earliest-start', () => {
  // Regression: Primary offboarded BEFORE the task's dep was ready.
  // Cascade used to start at primary.end + 1, ignoring dep.end → successor
  // reported "Dep violation" in console. Fix: cascade clamps nextStart to
  // max(primary.end + 1, dep.nextDate).
  test('handoff does not start before its dep is free', () => {
    const warn = [];
    const origWarn = console.warn;
    console.warn = (...args) => { warn.push(args.join(' ')); };
    try {
      const members = [
        // M1 offboards very early; assigned to the LATE task. Pool member M2
        // takes over via cascade.
        { id: 'M1', name: 'Early-Out', team: 'T1', cap: 1, vac: 0,
          start: '2026-01-01', end: '2026-01-16' },
        { id: 'M2', name: 'Stayer', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
        // M3 runs the long predecessor.
        { id: 'M3', name: 'Blocker', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
      ];
      const tree = [
        { id: 'P1', name: 'Root', team: '', best: 0 },
        // Predecessor: 40 work days; ends late March/April.
        { id: 'P1.1', name: 'Long', team: 'T1', best: 40, factor: 1,
          assign: ['M3'], status: 'open' },
        // Successor assigned to M1 who is already offboarded by then. Without
        // the fix, the cascade would start at Jan 17 (M1.end + 1) instead of
        // after P1.1 finishes.
        { id: 'P1.2', name: 'After', team: 'T1', best: 5, factor: 1,
          assign: ['M1'], deps: ['P1.1'], status: 'open' },
      ];
      const { results } = runSchedule({ tree, members });
      // No dep-violation warning emitted.
      expect(warn.find(m => /Dep violation/.test(m))).toBeUndefined();
      // Successor actually starts >= predecessor end.
      const pre = results.find(s => s.id === 'P1.1');
      const suc = results.find(s => s.id === 'P1.2');
      expect(suc.startD >= pre.endD).toBe(true);
    } finally {
      console.warn = origWarn;
    }
  });
});

describe('schedule(): pinned + offboard cascade', () => {
  test('pinned task whose assignee offboards still hands off', () => {
    const members = [
      { id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01', end: '2026-03-13' },
      { id: 'M2', name: 'Sam',  team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
    ];
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Pinned+long', team: 'T1', best: 50, factor: 1,
        assign: ['M1'], pinnedStart: '2026-02-02', status: 'open' },
    ];
    const { results } = runSchedule({ tree, members });
    const primary = results.find(s => s.id === 'P1.1');
    const handoff = results.find(s => s.isHandoff && !s.unscheduled);
    // Primary starts no earlier than pin.
    expect(primary.startD >= new Date(2026, 1, 2)).toBe(true);
    // Handoff triggers on M1 offboard and falls to M2.
    expect(handoff?.personId).toBe('M2');
  });
});

describe('schedule(): meeting-plan capacity reduction end-to-end', () => {
  test('team-inherited plan reduces scheduled throughput', () => {
    // Same task scheduled twice: once with a heavy team plan, once without.
    // The one with plans should take more calendar days.
    const makeMembers = (withPlan) => ([{
      id: 'M1', name: 'Alex', team: 'T1', cap: 1, vac: 0, start: '2026-01-01',
      capMode: 'derived', weeklyHours: 40,
      // Manual enrichment (scheduler reads member.meetings directly; App.jsx
      // does this via resolveMemberMeetings at call-site).
      meetings: withPlan
        ? [{ id: 'm', name: 'Heavy', hours: 20, frequency: 'weekly' }]
        : [],
    }]);
    const tree = [
      { id: 'P1', name: 'Root', team: '', best: 0 },
      { id: 'P1.1', name: 'Task', team: 'T1', best: 10, factor: 1, assign: ['M1'], status: 'open' },
    ];
    const withPlan = runSchedule({ tree, members: makeMembers(true) });
    const withoutPlan = runSchedule({ tree, members: makeMembers(false) });
    const a = withPlan.results.find(s => s.id === 'P1.1');
    const b = withoutPlan.results.find(s => s.id === 'P1.1');
    expect(a.calDays).toBeGreaterThan(b.calDays);
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

describe('schedule(): anchor to today', () => {
  test('non-pinned tasks slide forward when today > planStart', () => {
    const tree = [{ id: 'A', name: 'A', team: 'T', best: 5, factor: 1, status: 'open' }];
    const members = [{ id: 'm', name: 'M', team: 'T', cap: 1 }];
    // planStart way in the past, "today" 60 days later. Without anchorToToday,
    // task would start on planStart. With it, task starts on or after today.
    const r = runSchedule({
      tree, members,
      planStart: '2026-01-05',
      planEnd: '2026-12-31',
      options: { now: '2026-03-09', anchorToToday: true },
    });
    const item = r.results.find(x => x.id === 'A');
    expect(item).toBeTruthy();
    expect(item.startD).toBeInstanceOf(Date);
    // Should start no earlier than the synthetic "today" (compare via the
    // local-TZ iso() helper so we don't hit UTC-midnight skew).
    expect(iso(item.startD) >= '2026-03-09').toBe(true);
  });

  test('pinned tasks ignore the today-floor', () => {
    const tree = [{ id: 'A', name: 'A', team: 'T', best: 5, factor: 1, status: 'open', pinnedStart: '2026-02-01' }];
    const members = [{ id: 'm', name: 'M', team: 'T', cap: 1 }];
    const r = runSchedule({
      tree, members,
      planStart: '2026-01-05',
      planEnd: '2026-12-31',
      options: { now: '2026-03-09', anchorToToday: true },
    });
    const item = r.results.find(x => x.id === 'A');
    // Pinned start kept even though "today" is later.
    expect(iso(item.startD) < '2026-03-09').toBe(true);
  });
});

describe('schedule(): WIP progress discount', () => {
  test('half-done WIP task uses half the effort', () => {
    const tree = [{ id: 'A', name: 'A', team: 'T', best: 10, factor: 1, status: 'wip', progress: 50 }];
    const members = [{ id: 'm', name: 'M', team: 'T', cap: 1 }];
    const r = runSchedule({ tree, members, options: { discountProgress: true } });
    const item = r.results.find(x => x.id === 'A');
    expect(item.effort).toBeCloseTo(5, 1);
  });

  test('open task is unaffected by progress discount', () => {
    const tree = [{ id: 'A', name: 'A', team: 'T', best: 10, factor: 1, status: 'open' }];
    const members = [{ id: 'm', name: 'M', team: 'T', cap: 1 }];
    const r = runSchedule({ tree, members, options: { discountProgress: true } });
    const item = r.results.find(x => x.id === 'A');
    expect(item.effort).toBeCloseTo(10, 1);
  });

  test('disabled discount keeps full effort even on wip', () => {
    const tree = [{ id: 'A', name: 'A', team: 'T', best: 10, factor: 1, status: 'wip', progress: 50 }];
    const members = [{ id: 'm', name: 'M', team: 'T', cap: 1 }];
    const r = runSchedule({ tree, members, options: { discountProgress: false } });
    const item = r.results.find(x => x.id === 'A');
    expect(item.effort).toBeCloseTo(10, 1);
  });
});

describe('schedule(): auto-assign respects committed assigned work', () => {
  // Regression — venneker dataset 2026-05-05. SL has a heavy explicit-assign
  // queue (cap=0.5, ~50 effort committed). MZ and JF are full-cap and free.
  // A due-bumped UNASSIGNED task sorted before SL's queue used to land on SL
  // because pF[SL] was still empty at sort time → unassigned starved on the
  // slowest body. Fix: virtual fd/fw floor from committedRem so SL looks as
  // loaded as he actually is.
  const SL = { id: 'SL', name: 'Steffen', team: 'T', cap: 0.5, vac: 0, start: '2026-01-01' };
  const MZ = { id: 'MZ', name: 'Marco',   team: 'T', cap: 1,   vac: 0, start: '2026-01-01' };
  const JF = { id: 'JF', name: 'Jonas',   team: 'T', cap: 1,   vac: 0, start: '2026-01-05' };

  test('due-bumped unassigned task lands on free body, not slow committed assignee', () => {
    // SL: 5 explicit assigned tasks of 10d each = 50d committed → ~100 work
    // days at cap 0.5. MZ and JF: zero committed work. A small unassigned
    // task with a near-term due gets dueBumped (effectivePrio < default 4)
    // so it sorts before SL's prio=4 stack.
    const tree = [
      { id: 'P', name: 'Root', team: '', best: 0 },
      { id: 'P.A', name: 'SL-1', team: 'T', best: 10, factor: 1, assign: ['SL'], prio: 4, seq: 10 },
      { id: 'P.B', name: 'SL-2', team: 'T', best: 10, factor: 1, assign: ['SL'], prio: 4, seq: 20 },
      { id: 'P.C', name: 'SL-3', team: 'T', best: 10, factor: 1, assign: ['SL'], prio: 4, seq: 30 },
      { id: 'P.D', name: 'SL-4', team: 'T', best: 10, factor: 1, assign: ['SL'], prio: 4, seq: 40 },
      { id: 'P.E', name: 'SL-5', team: 'T', best: 10, factor: 1, assign: ['SL'], prio: 4, seq: 50 },
      // Unassigned, due in 60 days → bumped to prio 3, sorts BEFORE SL stack.
      { id: 'P.U', name: 'urgent', team: 'T', best: 5, factor: 1, prio: 4, seq: 5, due: '2026-03-06' },
    ];
    const r = runSchedule({
      tree,
      members: [SL, MZ, JF],
      planStart: '2026-01-05',
      options: { now: '2026-01-05', anchorToToday: true },
    });
    const urgent = r.results.find(x => x.id === 'P.U');
    expect(urgent).toBeDefined();
    // The unassigned urgent task MUST go to a full-cap body (MZ or JF), not
    // SL whose committed queue would push the urgent task past its due.
    expect(['MZ', 'JF']).toContain(urgent.personId);
    // And it must finish before its due date.
    expect(iso(urgent.endD) <= '2026-03-06').toBe(true);
  });

  test('all SL committed work still lands on SL (auto-assign does not steal)', () => {
    const tree = [
      { id: 'P', name: 'Root', team: '', best: 0 },
      { id: 'P.A', name: 'SL-1', team: 'T', best: 10, factor: 1, assign: ['SL'], prio: 4, seq: 10 },
      { id: 'P.U', name: 'fill', team: 'T', best: 5, factor: 1, prio: 4, seq: 20 },
    ];
    const r = runSchedule({
      tree,
      members: [SL, MZ, JF],
      planStart: '2026-01-05',
      options: { now: '2026-01-05', anchorToToday: true },
    });
    const aTask = r.results.find(x => x.id === 'P.A');
    expect(aTask.personId).toBe('SL');
  });

  test('dep-blocked task carries blockedBy so UI can explain the gap', () => {
    const SLfull = { id: 'SLf', name: 'Steffen', team: 'TT', cap: 1, vac: 0, start: '2026-01-01' };
    const JFfree = { id: 'JFf', name: 'Jonas',   team: 'TT', cap: 1, vac: 0, start: '2026-01-01' };
    const tree = [
      { id: 'P', name: 'Root', team: '', best: 0 },
      { id: 'P.SL', name: 'long', team: 'TT', best: 30, factor: 1, assign: ['SLf'], prio: 4, seq: 5 },
      { id: 'P.D', name: 'dep-blocked', team: 'TT', best: 5, factor: 1, prio: 4, seq: 10, deps: ['P.SL'] },
    ];
    const r = runSchedule({
      tree,
      members: [SLfull, JFfree],
      planStart: '2026-01-05',
      options: { now: '2026-01-05', anchorToToday: true },
    });
    const dep = r.results.find(x => x.id === 'P.D');
    expect(dep.blockedBy).toBeTruthy();
    expect(dep.blockedBy.id).toBe('P.SL');
    expect(dep.blockedBy.endD).toBeInstanceOf(Date);
  });

  test('done dep does NOT flag blockedBy when the assignee queue is the real binder', () => {
    // Regression: P.T depends on a long-completed predecessor (P.D). The actual
    // reason P.T sits far in the future is that its assignee is buried under an
    // earlier long task. Surfacing blockedBy here would lie ("Waiting for P.D")
    // when P.D finished months ago. Rule: blockedBy fires only when the dep was
    // the binding floor (bs === depWi).
    const SLfull = { id: 'SLf', name: 'Steffen', team: 'TT', cap: 1, vac: 0, start: '2026-01-01' };
    const tree = [
      { id: 'P', name: 'Root', team: '', best: 0 },
      // Done predecessor — finished well before plan start.
      { id: 'P.D', name: 'done predecessor', team: 'TT', best: 5, factor: 1, status: 'done', completedAt: '2025-12-01' },
      // Assignee's long earlier task — eats their queue until well past P.D's end.
      { id: 'P.LONG', name: 'long earlier', team: 'TT', best: 60, factor: 1, assign: ['SLf'], prio: 4, seq: 5 },
      // Target task: depends on the done predecessor, same assignee as the long task.
      { id: 'P.T', name: 'target', team: 'TT', best: 5, factor: 1, assign: ['SLf'], prio: 4, seq: 10, deps: ['P.D'] },
    ];
    const r = runSchedule({
      tree,
      members: [SLfull],
      planStart: '2026-01-05',
      options: { now: '2026-01-05', anchorToToday: true },
    });
    const target = r.results.find(x => x.id === 'P.T');
    expect(target).toBeTruthy();
    // Assignee queue is the binder — done predecessor must not be flagged.
    expect(target.blockedBy).toBeNull();
  });

  test('dep-blocked task picks busier candidate so freer body keeps no-dep slot', () => {
    // Forward-pass scheduler can't gap-fill. If a dep-blocked task lands on
    // the freest body, that body's pF jumps past the dep — wasting weeks of
    // pre-dep idle time. Tiebreak fix: when fw + fd are equal, pick the
    // BUSIER candidate (highest personFree.nextDate). The dep-blocked task
    // goes to whoever is barely free in time, leaving the genuinely-free
    // body for later no-dep tasks.
    const SLfull = { id: 'SLf', name: 'Steffen', team: 'TT', cap: 1, vac: 0, start: '2026-01-01' };
    const MZmid  = { id: 'MZm', name: 'Marco',   team: 'TT', cap: 1, vac: 0, start: '2026-01-01' };
    const JFfree = { id: 'JFf', name: 'Jonas',   team: 'TT', cap: 1, vac: 0, start: '2026-01-01' };
    const tree = [
      { id: 'P', name: 'Root', team: '', best: 0 },
      // SL: 40-day task → finishes ~Mar 2 (40 working days from Jan 5).
      { id: 'P.SL', name: 'long', team: 'TT', best: 40, factor: 1, assign: ['SLf'], prio: 4, seq: 5 },
      // MZ: 15-day task → finishes ~Jan 23.
      { id: 'P.MZ', name: 'mid',  team: 'TT', best: 15, factor: 1, assign: ['MZm'], prio: 4, seq: 6 },
      // Dep-blocked: depends on P.SL, can't start before P.SL ends (~Mar 2).
      { id: 'P.D', name: 'dep-blocked', team: 'TT', best: 5, factor: 1, prio: 4, seq: 10, deps: ['P.SL'] },
      // No-dep task — should fill JF's earlier free slot, not be pushed late.
      { id: 'P.U', name: 'no-dep', team: 'TT', best: 5, factor: 1, prio: 4, seq: 20 },
    ];
    const r = runSchedule({
      tree,
      members: [SLfull, MZmid, JFfree],
      planStart: '2026-01-05',
      options: { now: '2026-01-05', anchorToToday: true },
    });
    const noDep = r.results.find(x => x.id === 'P.U');
    const depBlocked = r.results.find(x => x.id === 'P.D');
    // No-dep must land on JF (freest) and start in mid-January.
    expect(noDep.personId).toBe('JFf');
    expect(iso(noDep.startD) < '2026-02-01').toBe(true);
    // Dep-blocked must NOT land on JF — JF's pre-dep slot stays available.
    expect(depBlocked.personId).not.toBe('JFf');
  });
});
