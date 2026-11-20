// Guardrail: every surface that prints an aggregate "x %" must print the SAME
// number for the same scope.
//
// This is the regression that broke trust in the tool: the tree grid and the
// Subway-Map showed effort-weighted progress (P1 = 44.5 %), while the Overview
// goal cards, the task detail panel, the HTML report and the Management-Summary
// PDF each recomputed done/total (P1 = 41 %). Four surfaces, two formulas, one
// set of numbers reported to management.
//
// The formula now lives exactly once, in utils/progress.js. This test pins
// every consumer to it. If a view grows its own inline percentage again, one of
// these assertions fails.
import { describe, expect, test } from 'vitest';
import { aggregateProgressPct, effortWeightedProgress } from '../progress.js';
import { leafNodes, treeStats } from '../scheduler.js';
import { computeRoadmapModel } from '../roadmap.js';
import { buildReportModel } from '../report.js';

function d(isoStr) {
  return new Date(`${isoStr}T00:00:00`);
}

// Sizes deliberately lopsided: counting tasks and weighing work must diverge.
// P1: 3 of 5 leaves done (60 % by count) but only 6 of 76 PT (7.9 % by effort).
const TREE = [
  { id: 'P1', name: 'Heavy tail', type: 'painpoint', status: 'open', team: 'T1' },
  { id: 'P1.1', name: 'Small A', status: 'done', best: 2, factor: 1, team: 'T1', assign: ['m1'], completedStart: '2026-01-05', completedEnd: '2026-01-06' },
  { id: 'P1.2', name: 'Small B', status: 'done', best: 2, factor: 1, team: 'T1', assign: ['m1'], completedStart: '2026-01-07', completedEnd: '2026-01-08' },
  { id: 'P1.3', name: 'Small C', status: 'done', best: 2, factor: 1, team: 'T1', assign: ['m1'], completedStart: '2026-01-09', completedEnd: '2026-01-12' },
  { id: 'P1.4', name: 'Rebuild', status: 'open', best: 45, factor: 1, team: 'T1' },
  { id: 'P1.5', name: 'Migration', status: 'open', best: 25, factor: 1, team: 'T1' },
  // P2: the mirror image — most tasks open, but the delivered one is the whale.
  { id: 'P2', name: 'Front-loaded', type: 'goal', status: 'open', team: 'T1' },
  { id: 'P2.1', name: 'Whale', status: 'done', best: 60, factor: 1, team: 'T1', assign: ['m1'], completedStart: '2026-01-05', completedEnd: '2026-02-05' },
  { id: 'P2.2', name: 'Half done', status: 'wip', best: 10, factor: 1, team: 'T1', assign: ['m1'], phases: [{ name: 'A', status: 'done' }, { name: 'B', status: 'open' }] },
  { id: 'P2.3', name: 'Tiny open', status: 'open', best: 1, factor: 1, team: 'T1' },
];

const TEAMS = [{ id: 'T1', name: 'Team One', color: '#2563eb' }];
const MEMBERS = [{ id: 'm1', name: 'Anna', team: 'T1', cap: 1, vac: 25 }];

const SCHEDULED = TREE.filter(r => r.id.includes('.')).map((r, i) => ({
  id: r.id, treeId: r.id, name: r.name, status: r.status, team: 'T1',
  person: 'Anna', personId: 'm1', effort: r.best,
  startD: d('2026-01-05'), endD: d(`2026-02-${String(1 + i).padStart(2, '0')}`),
  workingDaysInWindow: r.best,
}));

function ctx() {
  return {
    data: {}, tree: TREE, members: MEMBERS, teams: TEAMS, scheduled: SCHEDULED,
    weeks: [], cpSet: new Set(), goalPaths: {}, stats: treeStats(TREE),
    confidence: {}, meta: { name: 'Parity', planStart: '2026-01-05' }, lang: 'de',
  };
}

function leavesOf(rootId) {
  return leafNodes(TREE).filter(l => l.id.startsWith(rootId + '.'));
}

describe('one aggregate progress formula across every surface', () => {
  test('the fixture actually separates counting tasks from weighing work', () => {
    const p1 = leavesOf('P1');
    const byCount = Math.round(p1.filter(l => l.status === 'done').length / p1.length * 100);
    expect(byCount).toBe(60);
    expect(Math.round(aggregateProgressPct(p1))).toBe(8);

    const p2 = leavesOf('P2');
    expect(Math.round(p2.filter(l => l.status === 'done').length / p2.length * 100)).toBe(33);
    expect(Math.round(aggregateProgressPct(p2))).toBe(92);
  });

  test('tree grid (treeStats._progress) matches the shared helper', () => {
    const stats = treeStats(TREE);
    ['P1', 'P2'].forEach(id => {
      expect(stats[id]._progress).toBeCloseTo(aggregateProgressPct(leavesOf(id)), 10);
    });
  });

  test('treeStats carries the unfiltered leaf/done counts for labels', () => {
    const stats = treeStats(TREE);
    expect(stats.P1._leafCount).toBe(5);
    expect(stats.P1._doneCount).toBe(3);
    expect(stats['P1.4']._leafCount).toBe(1);
    expect(stats['P1.4']._doneCount).toBe(0);
  });

  test('Subway-Map line progress matches the shared helper', () => {
    const model = computeRoadmapModel({ tree: TREE, scheduled: SCHEDULED, stats: treeStats(TREE) });
    expect(model.lines.length).toBeGreaterThan(0);
    model.lines.forEach(line => {
      const expected = aggregateProgressPct(leavesOf(line.root.id)) / 100;
      expect(line.progress).toBeCloseTo(expected, 10);
    });
  });

  test('report / PDF per-goal progress matches the shared helper', () => {
    const m = buildReportModel(ctx());
    ['P1', 'P2'].forEach(id => {
      const rd = m.rootData.find(r => r.id === id);
      expect(rd.prog).toBeCloseTo(aggregateProgressPct(leavesOf(id)), 10);
      // The count is still reported — as a count, next to the percentage.
      expect(rd.leafCount).toBe(leavesOf(id).length);
    });
  });

  test('the project headline matches the shared helper too', () => {
    const m = buildReportModel(ctx());
    expect(m.prog).toBeCloseTo(aggregateProgressPct(leafNodes(TREE)), 10);
  });

  test('an aggregate never reads 100 % while a leaf is still open', () => {
    const nearlyDone = [
      { id: 'X.1', status: 'done', best: 1000, factor: 1 },
      { id: 'X.2', status: 'open', best: 0.01, factor: 1 },
    ];
    // Raw effort weighting rounds to 100 %; the aggregate must not claim it.
    expect(Math.round(effortWeightedProgress(nearlyDone).pct)).toBe(100);
    expect(aggregateProgressPct(nearlyDone)).toBe(99);

    const allDone = [{ id: 'Y.1', status: 'done', best: 3, factor: 1 }];
    expect(aggregateProgressPct(allDone)).toBe(100);
  });

  test('empty scope is 0 %, not NaN', () => {
    expect(aggregateProgressPct([])).toBe(0);
    expect(aggregateProgressPct(null)).toBe(0);
  });
});
