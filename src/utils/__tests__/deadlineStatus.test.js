import { describe, expect, test } from 'vitest';
import { deadlineStatus } from '../timeline.js';
import { buildReportModel } from '../report.js';
import { computeRoadmapModel } from '../roadmap.js';
import { treeStats } from '../scheduler.js';

function d(isoStr) { return new Date(`${isoStr}T00:00:00`); }

// A deadline whose work finished AFTER the date: historically missed, but
// nothing is at risk any more.
const LATE_DONE = [
  { id: 'D1', name: 'Umfirmierung', type: 'deadline', date: '2026-07-01', status: 'done' },
  { id: 'D1.1', name: 'Register', status: 'done', best: 4, factor: 1, team: 'T1',
    completedStart: '2026-03-26', completedEnd: '2026-07-09' },
];
const LATE_DONE_SCHEDULED = [
  { id: 'D1.1', treeId: 'D1.1', name: 'Register', status: 'done', team: 'T1', effort: 4,
    startD: d('2026-03-26'), endD: d('2026-07-09') },
];

// Same shape, still open → genuinely at risk.
const LATE_OPEN = [
  { id: 'D1', name: 'Umfirmierung', type: 'deadline', date: '2026-07-01', status: 'wip' },
  { id: 'D1.1', name: 'Register', status: 'wip', best: 4, factor: 1, team: 'T1' },
];
const LATE_OPEN_SCHEDULED = [
  { id: 'D1.1', treeId: 'D1.1', name: 'Register', status: 'wip', team: 'T1', effort: 4,
    startD: d('2026-03-26'), endD: d('2026-07-09') },
];

const ON_TIME_DONE = [
  { id: 'D1', name: 'E-Rechnung', type: 'deadline', date: '2027-01-01', status: 'done' },
  { id: 'D1.1', name: 'Rollout', status: 'done', best: 4, factor: 1, team: 'T1',
    completedStart: '2026-01-19', completedEnd: '2026-06-03' },
];
const ON_TIME_DONE_SCHEDULED = [
  { id: 'D1.1', treeId: 'D1.1', name: 'Rollout', status: 'done', team: 'T1', effort: 4,
    startD: d('2026-01-19'), endD: d('2026-06-03') },
];

function ctx(tree, scheduled) {
  return {
    data: {}, tree, scheduled, members: [{ id: 'm1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team One', color: '#2563eb' }], weeks: [],
    cpSet: new Set(), goalPaths: {}, stats: treeStats(tree), confidence: {},
    meta: { name: 'X', planStart: '2026-01-05' }, lang: 'de',
  };
}

describe('deadlineStatus', () => {
  test('finished work past its date reports doneLate, never atRisk', () => {
    const ds = deadlineStatus(LATE_DONE, LATE_DONE_SCHEDULED, 'D1');
    expect(ds.allDone).toBe(true);
    expect(ds.state).toBe('doneLate');
    expect(ds.isLate).toBe(false);
    expect(ds.missed).toBe(true);
  });

  test('unfinished work past its date stays atRisk', () => {
    const ds = deadlineStatus(LATE_OPEN, LATE_OPEN_SCHEDULED, 'D1');
    expect(ds.state).toBe('atRisk');
    expect(ds.isLate).toBe(true);
  });

  test('finished work within its date reports done', () => {
    const ds = deadlineStatus(ON_TIME_DONE, ON_TIME_DONE_SCHEDULED, 'D1');
    expect(ds.state).toBe('done');
    expect(ds.isLate).toBe(false);
    expect(ds.missed).toBe(false);
  });
});

describe('exports inherit the same deadline state', () => {
  test('a completed deadline produces no "at risk" entry in the report risks', () => {
    const m = buildReportModel(ctx(LATE_DONE, LATE_DONE_SCHEDULED));
    expect(m.deadlineStates.D1.state).toBe('doneLate');
    expect(m.risks.filter(r => /Deadline/.test(r.text))).toHaveLength(0);
  });

  test('an open late deadline still produces the critical risk entry', () => {
    const m = buildReportModel(ctx(LATE_OPEN, LATE_OPEN_SCHEDULED));
    expect(m.deadlineStates.D1.state).toBe('atRisk');
    const dlRisk = m.risks.find(r => /Deadline/.test(r.text));
    expect(dlRisk?.severity).toBe('critical');
  });

  test('the Subway-Map line drops its at-risk flag once the work is done', () => {
    const done = computeRoadmapModel({
      tree: LATE_DONE, scheduled: LATE_DONE_SCHEDULED, stats: treeStats(LATE_DONE), now: d('2026-07-30'),
    });
    const open = computeRoadmapModel({
      tree: LATE_OPEN, scheduled: LATE_OPEN_SCHEDULED, stats: treeStats(LATE_OPEN), now: d('2026-07-30'),
    });
    expect(done.lines[0].atRisk).toBe(false);
    expect(open.lines[0].atRisk).toBe(true);
  });
});
