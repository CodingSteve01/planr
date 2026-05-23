import { describe, expect, test } from 'vitest';
import { computeRoadmapModel, renderRoadmapSvg } from '../roadmap.js';
import { treeStats } from '../scheduler.js';

function d(iso) {
  return new Date(`${iso}T00:00:00`);
}

function modelFor(tree, scheduled) {
  return computeRoadmapModel({
    tree,
    scheduled,
    stats: treeStats(tree),
    now: d('2026-01-01'),
  });
}

describe('computeRoadmapModel progress semantics', () => {
  test('a non-done task at 100% progress is not marked as reached', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'open', best: 0 },
      { id: 'P1.1', name: 'Almost', status: 'wip', progress: 100, best: 4, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Almost', status: 'wip', progress: 100, effort: 4, startD: d('2026-01-05'), endD: d('2026-01-08') },
    ];

    const model = modelFor(tree, scheduled);
    const line = model.lines[0];
    const station = line.majorStations[0];

    expect(line.progress).toBeLessThan(1);
    expect(station.allDone).toBe(false);
    expect(station.prog).toBeLessThan(1);
  });

  test('station progress uses partial task progress weighted by effort', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'open', best: 0 },
      { id: 'P1.1', name: 'Half done big task', status: 'wip', progress: 50, best: 10, factor: 1 },
      { id: 'P1.2', name: 'Open small task', status: 'open', progress: 0, best: 10, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Half done big task', status: 'wip', effort: 10, startD: d('2026-01-05'), endD: d('2026-01-06') },
      { id: 'P1.2', name: 'Open small task', status: 'open', effort: 10, startD: d('2026-01-07'), endD: d('2026-01-08') },
    ];

    const model = modelFor(tree, scheduled);
    const station = model.lines[0].majorStations[0];

    expect(station.done).toBe(0);
    expect(station.allDone).toBe(false);
    expect(station.prog).toBeCloseTo(0.25, 4);
  });

  test('station is reached only when every clustered item is actually done', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'open', best: 0 },
      { id: 'P1.1', name: 'Done', status: 'done', progress: 100, best: 1, factor: 1 },
      { id: 'P1.2', name: 'Open', status: 'open', progress: 0, best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Done', status: 'done', effort: 1, startD: d('2026-01-05'), endD: d('2026-01-05') },
      { id: 'P1.2', name: 'Open', status: 'open', effort: 1, startD: d('2026-01-06'), endD: d('2026-01-06') },
    ];

    const model = modelFor(tree, scheduled);
    const station = model.lines[0].majorStations[0];

    expect(station.done).toBe(1);
    expect(station.total).toBe(2);
    expect(station.allDone).toBe(false);
    expect(station.prog).toBeCloseTo(0.5, 4);
  });

  test('reached route cannot pass the first not-done station even when effort progress is high', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'open', best: 0 },
      { id: 'P1.1', name: 'Large done task', status: 'done', progress: 100, best: 100, factor: 1 },
      { id: 'P1.2', name: 'Small future task', status: 'open', progress: 0, best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Large done task', status: 'done', effort: 100, startD: d('2026-01-05'), endD: d('2026-01-05') },
      { id: 'P1.2', name: 'Small future task', status: 'open', effort: 1, startD: d('2026-03-02'), endD: d('2026-03-02') },
    ];

    const model = modelFor(tree, scheduled);
    const line = model.lines[0];
    const firstOpenStation = [...line.majorStations, ...line.minorStations]
      .filter(station => !station.allDone)
      .sort((a, b) => a.t - b.t)[0];

    expect(line.progress).toBeGreaterThan(0.9);
    expect(line.reachedT).toBeLessThan(firstOpenStation.t);
    expect(line.trainT).toBeGreaterThanOrEqual(line.reachedT);
  });

  test('station placement follows weighted scope progress instead of calendar time', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'done', best: 0 },
      { id: 'P1.1', name: 'Small first', status: 'done', progress: 100, best: 1, factor: 1 },
      { id: 'P1.2', name: 'Large later', status: 'done', progress: 100, best: 99, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Small first', status: 'done', effort: 1, startD: d('2026-01-01'), endD: d('2026-01-01') },
      { id: 'P1.2', name: 'Large later', status: 'done', effort: 99, startD: d('2026-12-31'), endD: d('2026-12-31') },
    ];

    const model = modelFor(tree, scheduled);
    const firstStation = model.lines[0].majorStations.sort((a, b) => a.t - b.t)[0];

    expect(firstStation.id).toBe('P1.1');
    expect(firstStation.t).toBeLessThan(0.08);
  });

  test('legend exposes current, past-delta and future total progress percentages', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Done half', status: 'done', progress: 100, best: 1, factor: 1 },
      { id: 'P1.2', name: 'Open half', status: 'open', progress: 0, best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Done half', status: 'done', effort: 1, startD: d('2026-01-01'), endD: d('2026-01-01') },
      { id: 'P1.2', name: 'Open half', status: 'open', effort: 1, startD: d('2026-02-01'), endD: d('2026-02-01') },
    ];

    const svg = renderRoadmapSvg({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
      diff: { pastProgressByRootId: { P1: 0.25 }, doneInWindowIds: [], changedInWindowIds: [] },
      futureProgressByRootId: { P1: 0.75 },
    });

    expect(svg).toContain('50%');
    expect(svg).toContain('+25%');
    expect(svg).toContain('Plan 75% +25%');
  });

  test('legend keeps sub-percent progress deltas visible as permille', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Tiny movement', status: 'wip', progress: 50.04, best: 100, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Tiny movement', status: 'wip', effort: 100, startD: d('2026-01-01'), endD: d('2026-01-31') },
    ];

    const svg = renderRoadmapSvg({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
      diff: { pastProgressByRootId: { P1: 0.5 }, doneInWindowIds: [], changedInWindowIds: [] },
    });

    expect(svg).toContain('+0.4‰');
  });
});
