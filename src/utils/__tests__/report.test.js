import { describe, expect, test } from 'vitest';
import { buildReportModel } from '../report.js';
import { deliveredEffort, effortWeightedProgress, progressPctLabel, totalEffort } from '../progress.js';
import { leafNodes, treeStats } from '../scheduler.js';

function d(isoStr) {
  return new Date(`${isoStr}T00:00:00`);
}

// A tree where done-counting and effort-weighted progress disagree hard:
// one tiny done task, one big half-finished task, one big untouched task.
const TREE = [
  { id: 'P1', name: 'Project', status: 'open' },
  { id: 'P1.1', name: 'Tiny done', status: 'done', best: 1, factor: 1, team: 'T1', assign: ['m1'] },
  { id: 'P1.2', name: 'Big half', status: 'wip', progress: 50, best: 20, factor: 1, team: 'T1', assign: ['m1'] },
  { id: 'P1.3', name: 'Big open', status: 'open', best: 20, factor: 1, team: 'T1' },
];

function ctx(tree = TREE) {
  const scheduled = tree
    .filter(r => r.id.includes('.'))
    .map((r, i) => ({
      id: r.id, name: r.name, status: r.status, team: r.team, person: 'M1', personId: 'm1',
      effort: r.best, startD: d('2026-01-05'), endD: d(`2026-01-${String(6 + i).padStart(2, '0')}`),
    }));
  return {
    tree,
    scheduled,
    members: [{ id: 'm1', name: 'M1', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team One', color: '#2563eb' }],
    weeks: [],
    cpSet: new Set(),
    goalPaths: {},
    stats: treeStats(tree),
    confidence: {},
    meta: { name: 'Test', planStart: '2026-01-05' },
    lang: 'de',
    data: {},
  };
}

describe('buildReportModel progress parity with the on-screen KPI row', () => {
  test('progress is effort-weighted and phase-aware, not done-count based', () => {
    const m = buildReportModel(ctx());
    const lvs = leafNodes(TREE);
    const expected = effortWeightedProgress(lvs).pct;

    expect(m.prog).toBeCloseTo(expected, 10);
    expect(m.progLabel).toBe(progressPctLabel(expected));
    // 1 of 3 leaves done would be 33 % — the old, wrong export figure.
    expect(Math.round(m.prog)).not.toBe(33);
    // (1 + 10) / 41 realistic PT ≈ 26.8 %
    expect(m.prog).toBeCloseTo(11 / 41 * 100, 6);
  });

  test('delivered and total PT match the shared helpers', () => {
    const m = buildReportModel(ctx());
    const lvs = leafNodes(TREE);
    expect(m.donePt).toBeCloseTo(deliveredEffort(lvs), 10);
    expect(m.totalPt).toBeCloseTo(totalEffort(lvs), 10);
  });

  test('fixed-duration tasks count with their duration, like scheduleEffort on screen', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'open' },
      { id: 'P1.1', name: 'Fixed window', status: 'open', best: 0, fixedDurationDays: 10, team: 'T1' },
    ];
    const m = buildReportModel(ctx(tree));
    expect(m.totalPt).toBeCloseTo(totalEffort(leafNodes(tree)), 10);
    expect(m.totalPt).toBeGreaterThan(0);
  });

  test('per-goal progress stays the N/M ratio shown on the goal cards', () => {
    const m = buildReportModel(ctx());
    const root = m.rootData.find(r => r.id === 'P1');
    expect(root.doneCount).toBe(1);
    expect(root.leafCount).toBe(3);
    expect(root.prog).toBe(33);
    expect(root.progEffort).toBeCloseTo(11 / 41 * 100, 6);
  });
});
