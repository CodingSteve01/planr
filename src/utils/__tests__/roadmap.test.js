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

  test('done and open tasks are not clustered into one reached station', () => {
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
    const stations = model.lines[0].majorStations.sort((a, b) => a.t - b.t);

    expect(stations).toHaveLength(2);
    expect(stations[0].done).toBe(1);
    expect(stations[0].total).toBe(1);
    expect(stations[0].allDone).toBe(true);
    expect(stations[1].allDone).toBe(false);
  });

  test('done and unfinished work close in time become separate stations', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Done predecessor', status: 'done', progress: 100, best: 8, factor: 1 },
      { id: 'P1.2', name: 'Active successor', status: 'wip', progress: 25, best: 8, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Done predecessor', status: 'done', effort: 8, startD: d('2026-01-01'), endD: d('2026-01-10') },
      { id: 'P1.2', name: 'Active successor', status: 'wip', effort: 8, startD: d('2026-01-11'), endD: d('2026-01-12') },
    ];

    const model = modelFor(tree, scheduled);
    const stations = model.lines[0].majorStations.sort((a, b) => a.t - b.t);

    expect(stations).toHaveLength(2);
    expect(stations[0].id).toBe('P1.1');
    expect(stations[0].allDone).toBe(true);
    expect(stations[1].allDone).toBe(false);
  });

  test('long chains of completed work are split into multiple stations', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'done', best: 0 },
      { id: 'P1.1', name: 'Step 1', status: 'done', progress: 100, best: 2, factor: 1 },
      { id: 'P1.2', name: 'Step 2', status: 'done', progress: 100, best: 2, factor: 1 },
      { id: 'P1.3', name: 'Step 3', status: 'done', progress: 100, best: 2, factor: 1 },
      { id: 'P1.4', name: 'Step 4', status: 'done', progress: 100, best: 2, factor: 1 },
      { id: 'P1.5', name: 'Step 5', status: 'done', progress: 100, best: 2, factor: 1 },
      { id: 'P1.6', name: 'Step 6', status: 'done', progress: 100, best: 2, factor: 1 },
    ];
    const scheduled = ['2026-01-05', '2026-01-15', '2026-01-26', '2026-02-05', '2026-02-16', '2026-02-26']
      .map((day, idx) => ({
        id: `P1.${idx + 1}`,
        name: `Step ${idx + 1}`,
        status: 'done',
        effort: 2,
        startD: d(day),
        endD: d(day),
      }));

    const model = modelFor(tree, scheduled);
    const stations = model.lines[0].majorStations;

    expect(stations.length).toBeGreaterThan(1);
    expect(Math.max(...stations.map(station => station.clusterSize))).toBeLessThan(6);
  });

  test('live train sits at the reached route end and cannot pass the first not-done station', () => {
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
    expect(line.trainT).toBe(line.reachedT);
    expect(line.trainT).toBeLessThan(firstOpenStation.t);
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

    const model = computeRoadmapModel({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2027-01-15'),
    });
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
    expect(svg).toContain('Plan 75%');
    expect(svg).toContain('Differenz: +25%');
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

    expect(svg).toContain('+0.04%');
  });

  test('new lines stripe only the reached segment, not the entire future route', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Done half', status: 'done', progress: 100, best: 1, factor: 1 },
      { id: 'P1.2', name: 'Open half', status: 'open', progress: 0, best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Done half', status: 'done', effort: 1, startD: d('2026-01-01'), endD: d('2026-01-01') },
      { id: 'P1.2', name: 'Open half', status: 'open', effort: 1, startD: d('2026-02-01'), endD: d('2026-02-01') },
    ];

    const model = computeRoadmapModel({ tree, scheduled, stats: treeStats(tree), now: d('2026-01-15') });
    const line = model.lines[0];
    const fullRoutePath = line.route.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const svg = renderRoadmapSvg({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
      diff: { newRootIds: ['P1'], pastProgressByRootId: {}, doneInWindowIds: [], changedInWindowIds: [] },
    });

    const fullStripe = `<path d="${fullRoutePath}" fill="none" stroke="url(#rm-past-stripe)"`;
    expect(line.trainT).toBeLessThan(0.96);
    expect(svg).not.toContain(fullStripe);
    expect(svg).toContain('stroke="url(#rm-past-stripe)"');
  });

  test('route progress percentages stay in tooltips and legend, while diff labels stay visible on map lanes', () => {
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
    expect(svg).toContain('Differenz: +25%');
    expect(svg).toMatch(/>\+25%<\/text>/);
    expect(svg).not.toMatch(/>50%<\/text>/);
  });

  test('route progress percentages are hidden on map lanes outside diff overlays', () => {
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
    });

    expect(svg).toContain('50%');
    expect(svg).not.toMatch(/>[+-]?\d+(?:\.\d+)?%<\/text>/);
  });

  test('done stations with invalid future completion dates are capped at now before placement', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      {
        id: 'P1.1',
        name: 'Already done but dated too late',
        status: 'done',
        progress: 100,
        best: 1,
        factor: 1,
        completedStart: '2026-03-02',
        completedEnd: '2026-03-02',
      },
      { id: 'P1.2', name: 'Future open', status: 'open', progress: 0, best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.2', name: 'Future open', status: 'open', effort: 1, startD: d('2026-02-01'), endD: d('2026-02-01') },
    ];

    const model = computeRoadmapModel({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
    });
    const stations = model.lines[0].majorStations.sort((a, b) => a.t - b.t);
    const doneStation = stations.find(station => station.id === 'P1.1');
    const openStation = stations.find(station => station.id === 'P1.2');

    expect(doneStation.allDone).toBe(true);
    expect(doneStation.endDate).toEqual(d('2026-01-15'));
    expect(doneStation.t).toBeLessThan(openStation.t);
  });

  test('scheduled done stations are capped at now even without explicit completion metadata', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Done with stale future plan', status: 'done', progress: 100, best: 1, factor: 1 },
      { id: 'P1.2', name: 'Open future', status: 'open', progress: 0, best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Done with stale future plan', status: 'done', effort: 1, startD: d('2026-08-01'), endD: d('2026-08-05') },
      { id: 'P1.2', name: 'Open future', status: 'open', effort: 1, startD: d('2026-02-01'), endD: d('2026-02-01') },
    ];

    const model = computeRoadmapModel({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
    });
    const doneStation = model.lines[0].majorStations.find(station => station.id === 'P1.1');

    expect(doneStation.allDone).toBe(true);
    expect(doneStation.endDate).toEqual(d('2026-01-15'));
  });

  test('done station order uses actual completion date instead of stale future plan', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      {
        id: 'P1.1',
        name: 'Finished early',
        status: 'done',
        progress: 100,
        best: 2,
        factor: 1,
        completedStart: '2026-04-01',
        completedEnd: '2026-04-03',
      },
      { id: 'P1.2', name: 'Current planned work', status: 'open', progress: 0, best: 2, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Finished early', status: 'done', effort: 2, startD: d('2026-08-01'), endD: d('2026-08-05') },
      { id: 'P1.2', name: 'Current planned work', status: 'open', effort: 2, startD: d('2026-05-01'), endD: d('2026-05-02') },
    ];

    const model = computeRoadmapModel({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-05-15'),
    });
    const stations = model.lines[0].majorStations.sort((a, b) => a.t - b.t);

    expect(stations[0].id).toBe('P1.1');
    expect(stations[0].endDate).toEqual(d('2026-04-03'));
    expect(stations[1].id).toBe('P1.2');
  });

  test('completed stations cannot move ahead of the train when future scope is unscheduled', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      {
        id: 'P1.1',
        name: 'Completed package',
        status: 'done',
        progress: 100,
        best: 10,
        factor: 1,
        completedStart: '2026-01-01',
        completedEnd: '2026-01-05',
      },
      { id: 'P1.2', name: 'Unscheduled future scope', status: 'open', progress: 0, best: 90, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Completed package', status: 'done', effort: 10, startD: d('2026-01-01'), endD: d('2026-01-05') },
    ];

    const model = computeRoadmapModel({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
    });
    const line = model.lines[0];
    const doneStation = line.majorStations.find(station => station.id === 'P1.1');

    expect(line.progress).toBeCloseTo(0.1, 4);
    expect(doneStation.allDone).toBe(true);
    expect(doneStation.t).toBeLessThanOrEqual(line.trainT + 0.0001);
  });

  test('anti-collision spacing cannot push completed stations ahead of the train', () => {
    const doneDates = ['2025-08-01', '2025-08-21', '2025-09-10', '2025-09-30', '2025-10-20', '2025-11-09', '2025-11-29', '2025-12-19'];
    const doneLeaves = Array.from({ length: 8 }, (_, idx) => ({
      id: `P1.${idx + 1}`,
      name: `Completed ${idx + 1}`,
      status: 'done',
      progress: 100,
      best: 1,
      factor: 1,
      completedStart: doneDates[idx],
      completedEnd: doneDates[idx],
    }));
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      ...doneLeaves,
      { id: 'P1.99', name: 'Large unscheduled future scope', status: 'open', progress: 0, best: 92, factor: 1 },
    ];
    const scheduled = doneLeaves.map((item, idx) => ({
      id: item.id,
      name: item.name,
      status: 'done',
      effort: 1,
      startD: d(doneDates[idx]),
      endD: d(doneDates[idx]),
    }));

    const model = computeRoadmapModel({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
    });
    const line = model.lines[0];
    const doneStations = line.majorStations.filter(station => station.allDone);

    expect(line.progress).toBeCloseTo(0.08, 4);
    expect(doneStations.length).toBeGreaterThan(1);
    doneStations.forEach(station => {
      expect(station.t).toBeLessThanOrEqual(line.trainT + 0.0001);
    });
  });

  test('diff mode uses static station halos instead of pulsing rings', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Changed done', status: 'done', progress: 100, best: 1, factor: 1 },
      { id: 'P1.2', name: 'Open', status: 'open', progress: 0, best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Changed done', status: 'done', effort: 1, startD: d('2026-01-01'), endD: d('2026-01-01') },
      { id: 'P1.2', name: 'Open', status: 'open', effort: 1, startD: d('2026-02-01'), endD: d('2026-02-01') },
    ];

    const svg = renderRoadmapSvg({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
      diff: { pastProgressByRootId: { P1: 0 }, doneInWindowIds: ['P1.1'], changedInWindowIds: ['P1.1'] },
    });

    expect(svg).not.toContain('values="10;13;10"');
    expect(svg).not.toContain('values="6;9;6"');
  });

  test('diff legend hides untouched future stations but keeps current context', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Changed done', status: 'done', progress: 100, best: 1, factor: 1 },
      { id: 'P1.2', name: 'Current open', status: 'open', progress: 0, best: 1, factor: 1 },
      { id: 'P1.3', name: 'Untouched future', status: 'open', progress: 0, best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Changed done', status: 'done', effort: 1, startD: d('2026-01-01'), endD: d('2026-01-01') },
      { id: 'P1.2', name: 'Current open', status: 'open', effort: 1, startD: d('2026-02-01'), endD: d('2026-02-01') },
      { id: 'P1.3', name: 'Untouched future', status: 'open', effort: 1, startD: d('2026-03-01'), endD: d('2026-03-01') },
    ];

    const svg = renderRoadmapSvg({
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
      diff: { pastProgressByRootId: { P1: 0 }, doneInWindowIds: ['P1.1'], changedInWindowIds: ['P1.1'] },
    });

    expect(svg).toContain('data-item-id="P1.1"');
    expect(svg).toContain('data-item-id="P1.2"');
    expect(svg).not.toContain('data-item-id="P1.3"');
  });

  test('diff legend can expand hidden untouched stations', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Changed done', status: 'done', progress: 100, best: 1, factor: 1 },
      { id: 'P1.2', name: 'Current open', status: 'open', progress: 0, best: 1, factor: 1 },
      { id: 'P1.3', name: 'Untouched future', status: 'open', progress: 0, best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'Changed done', status: 'done', effort: 1, startD: d('2026-01-01'), endD: d('2026-01-01') },
      { id: 'P1.2', name: 'Current open', status: 'open', effort: 1, startD: d('2026-02-01'), endD: d('2026-02-01') },
      { id: 'P1.3', name: 'Untouched future', status: 'open', effort: 1, startD: d('2026-03-01'), endD: d('2026-03-01') },
    ];
    const base = {
      tree,
      scheduled,
      stats: treeStats(tree),
      now: d('2026-01-15'),
      diff: { pastProgressByRootId: { P1: 0 }, doneInWindowIds: ['P1.1'], changedInWindowIds: ['P1.1'] },
      labels: { showMore: '+{0} more', showLess: 'Show fewer' },
    };

    const collapsedSvg = renderRoadmapSvg(base);
    const expandedSvg = renderRoadmapSvg({ ...base, expandedLegendIds: new Set(['P1']) });

    expect(collapsedSvg).not.toContain('data-item-id="P1.3"');
    expect(collapsedSvg).toContain('data-rm-toggle="P1"');
    expect(collapsedSvg).toContain('+1 more');
    expect(expandedSvg).toContain('data-item-id="P1.3"');
    expect(expandedSvg).toContain('Show fewer');
  });

  test('legend progress pill keeps readable contrast on light route colors', () => {
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
      assignment: { P1: { routeIdx: 1, colorIdx: 2 } },
    });

    expect(svg).toContain('background:#f59e0b;color:#111318');
  });
});
