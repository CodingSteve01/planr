import { describe, expect, test } from 'vitest';
import { computeProjectRoadmap, renderProjectRoadmapSvg, projectRoadmapLeafIds } from '../projectRoadmap.js';
import { treeStats, leafNodes, descendantLeaves } from '../scheduler.js';
import { aggregateProgressPct, progressPctLabel } from '../progress.js';

const NOW = new Date('2026-09-10T12:00:00');
const d = isoStr => new Date(`${isoStr}T00:00:00`);

const tree = [
  { id: 'D1', name: 'E-Rechnungspflicht', type: 'deadline', status: 'wip', date: '2027-01-01' },
  { id: 'D1.1', name: 'Kurzfristig DMS', status: 'wip' },
  { id: 'D1.1.1', name: 'NAV-Zugferd', status: 'done', best: 8, factor: 1.5,
    completedStart: '2026-05-05', completedEnd: '2026-06-03', completedAt: '2026-06-03' },
  { id: 'D1.1.2', name: 'Masken UI', status: 'open', best: 4, factor: 1.5 },
  { id: 'D1.2', name: 'Langfristig Abrechnung', status: 'open' },
  { id: 'D1.2.1', name: 'Zugferd 2.5', status: 'open', best: 10, factor: 1.5 },
  { id: 'Other', name: 'Not this project', status: 'open', best: 5, factor: 1.5 },
];
const scheduled = [
  { id: 'D1.1.2', treeId: 'D1.1.2', endD: d('2026-10-16'), startD: d('2026-10-05'), effort: 6 },
  { id: 'D1.2.1', treeId: 'D1.2.1', endD: d('2026-12-11'), startD: d('2026-11-23'), effort: 15 },
  { id: 'Other', treeId: 'Other', endD: d('2027-06-01'), startD: d('2027-05-01'), effort: 7 },
];
const stats = treeStats(tree);

describe('computeProjectRoadmap', () => {
  const model = computeProjectRoadmap({ tree, scheduled, stats, rootId: 'D1', now: NOW });

  test('one row per direct child of the project, nothing from other projects', () => {
    expect(model.rows.map(r => r.id)).toEqual(['D1.1', 'D1.2']);
    expect(JSON.stringify(model.rows)).not.toContain('Other');
  });

  test('rows carry the shared progress figure and the real leaf counts', () => {
    const row = model.rows[0];
    expect(row.leafCount).toBe(2);
    expect(row.doneCount).toBe(1);
    expect(row.progress).toBeCloseTo(stats['D1.1']._progress, 6);
    expect(model.rows[1].allDone).toBe(false);
  });

  test('milestones are the row leaves, in date order', () => {
    expect(model.rows[0].milestones.map(m => m.id)).toEqual(['D1.1.1', 'D1.1.2']);
    expect(model.rows[0].milestones[0].status).toBe('done');
    // Recorded window for done work, scheduled window for the rest.
    expect(model.rows[0].milestones[0].end).toEqual(d('2026-06-03'));
    expect(model.rows[0].milestones[1].end).toEqual(d('2026-10-16'));
  });

  test('the axis spans every date on the board plus today and the deadline', () => {
    // Earliest is the recorded start in May 2026, latest the 2027-01-01
    // deadline — both snapped out to whole months.
    expect(model.axisStart).toEqual(new Date(2026, 4, 1));
    expect(model.axisEnd).toEqual(new Date(2027, 1, 1));
    expect(model.today).toEqual(NOW);
    expect(model.deadline).toEqual(d('2027-01-01'));
    expect(model.months).toHaveLength(9);
    expect(model.tickEvery).toBe(1);
  });

  test('long projects switch to quarterly ticks', () => {
    const long = [
      { id: 'L1', name: 'Long haul', status: 'open' },
      { id: 'L1.1', name: 'Start', status: 'open', best: 1 },
      { id: 'L1.2', name: 'End', status: 'open', best: 1 },
    ];
    const longSched = [
      { id: 'L1.1', endD: d('2026-01-15'), startD: d('2026-01-01'), effort: 1 },
      { id: 'L1.2', endD: d('2029-06-15'), startD: d('2029-06-01'), effort: 1 },
    ];
    const m = computeProjectRoadmap({ tree: long, scheduled: longSched, stats: treeStats(long), rootId: 'L1', now: NOW });
    expect(m.months.length).toBeGreaterThan(20);
    expect(m.tickEvery).toBe(3);
  });

  test('a project with no children still renders as a single row', () => {
    const lone = [{ id: 'S1', name: 'Solo task', status: 'wip', best: 3, factor: 1 }];
    const m = computeProjectRoadmap({
      tree: lone, scheduled: [{ id: 'S1', startD: d('2026-09-01'), endD: d('2026-09-30'), effort: 3 }],
      stats: treeStats(lone), rootId: 'S1', now: NOW,
    });
    expect(m.rows.map(r => r.id)).toEqual(['S1']);
    expect(m.rows[0].milestones.map(m2 => m2.id)).toEqual(['S1']);
  });

  test('an unknown project id yields nothing rather than throwing', () => {
    expect(computeProjectRoadmap({ tree, scheduled, stats, rootId: 'nope' })).toBe(null);
    expect(renderProjectRoadmapSvg({ tree, scheduled, stats, rootId: 'nope' })).toBe('');
  });

  test('height grows with the row count', () => {
    const single = computeProjectRoadmap({ tree, scheduled, stats, rootId: 'D1.2', now: NOW });
    expect(model.height).toBeGreaterThan(single.height);
  });
});

describe('nothing falls off the board', () => {
  test('every leaf of the project appears exactly once as a milestone', () => {
    const model = computeProjectRoadmap({ tree, scheduled, stats, rootId: 'D1', now: NOW });
    const onBoard = model.rows.flatMap(row => row.milestones.map(m => m.id));

    expect(onBoard.slice().sort()).toEqual(projectRoadmapLeafIds(tree, 'D1').slice().sort());
    expect(new Set(onBoard).size).toBe(onBoard.length);
    // ...and that is genuinely every leaf under D1.
    expect(projectRoadmapLeafIds(tree, 'D1').sort())
      .toEqual(descendantLeaves(tree, 'D1').map(l => l.id).sort());
  });

  test('a leaf with no date at all is not silently dropped from the count', () => {
    const undated = [
      { id: 'U1', name: 'Project', status: 'open' },
      { id: 'U1.1', name: 'Package', status: 'open' },
      { id: 'U1.1.1', name: 'Undated task', status: 'open', best: 0 },
    ];
    const m = computeProjectRoadmap({ tree: undated, scheduled: [], stats: treeStats(undated), rootId: 'U1', now: NOW });
    // No stop can be drawn without a date, but the row still reports it.
    expect(m.rows[0].milestones).toEqual([]);
    expect(m.rows[0].leafCount).toBe(1);
  });
});

describe('renderProjectRoadmapSvg', () => {
  const svg = renderProjectRoadmapSvg({
    tree, scheduled, stats, rootId: 'D1', color: '#ef4444', now: NOW,
    labels: { months: 'Jan,Feb,Mär,Apr,Mai,Jun,Jul,Aug,Sep,Okt,Nov,Dez', today: 'heute', tasks: 'Aufgaben' },
  });

  test('is a self-contained svg with the project header', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('D1 · E-Rechnungspflicht');
    expect(svg).toContain('#ef4444');
  });

  test('prints the same percentage the rest of the app prints', () => {
    // This is the figure the Overview headline, the report and the PDFs use.
    const shared = progressPctLabel(aggregateProgressPct(descendantLeaves(tree, 'D1')));
    expect(svg).toContain(`${shared}%`);
    expect(shared).toBe(progressPctLabel(stats.D1._progress));
  });

  test('the today marker does not share a baseline with the month axis', () => {
    // They used to overlap into "Sepday".
    const todayY = Number(svg.match(/y="([\d.]+)" text-anchor="middle" fill="#22c55e"/)[1]);
    const monthY = Number(svg.match(/class="pr-axis" x="[\d.]+" y="([\d.]+)" fill="var\(--tx3/)[1]);
    expect(Math.abs(todayY - monthY)).toBeGreaterThan(6);
  });

  test('marks today and the deadline, in the caller language', () => {
    expect(svg).toContain('heute');
    expect(svg).toContain('2027-01-01');
    expect(svg).toContain('Mai');   // localized month axis
    expect(svg).not.toContain('May');
  });

  test('every row and every stop is clickable and has a tooltip', () => {
    const model = computeProjectRoadmap({ tree, scheduled, stats, rootId: 'D1', now: NOW });
    const ids = [...svg.matchAll(/data-item-id="([^"]+)"/g)].map(m => m[1]);
    model.rows.forEach(row => expect(ids).toContain(row.id));
    model.rows.flatMap(r => r.milestones).forEach(stop => expect(ids).toContain(stop.id));
    // Roadmap.jsx injects data-tip into innerHTML directly — a literal "html:"
    // marker (the data-htip convention) would be printed as text.
    expect(svg).toContain('data-tip="&lt;div&gt;');
    expect(svg).not.toContain('html:');
  });

  test('escapes names instead of letting them break the svg', () => {
    const nasty = [
      { id: 'X1', name: 'A & B <script>', status: 'open' },
      { id: 'X1.1', name: '"quoted"', status: 'open', best: 1 },
    ];
    const out = renderProjectRoadmapSvg({
      tree: nasty, scheduled: [{ id: 'X1.1', startD: d('2026-09-01'), endD: d('2026-09-05'), effort: 1 }],
      stats: treeStats(nasty), rootId: 'X1', now: NOW,
    });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&amp;');
    expect(out).toContain('&lt;script&gt;');
  });

  test('milestone labels are dropped rather than overlapped when space runs out', () => {
    // Five stops inside one week, all on ONE row: only the first can be
    // labelled, the rest would print on top of each other.
    const dense = [
      { id: 'C1', name: 'Crowded', status: 'open' },
      { id: 'C1.1', name: 'One package', status: 'open' },
    ];
    const denseSched = [];
    for (let i = 1; i <= 5; i++) {
      dense.push({ id: `C1.1.${i}`, name: `Aufgabe Nummer ${i}`, status: 'open', best: 1 });
      denseSched.push({ id: `C1.1.${i}`, startD: d(`2026-09-0${i}`), endD: d(`2026-09-0${i + 1}`), effort: 1 });
    }
    const out = renderProjectRoadmapSvg({ tree: dense, scheduled: denseSched, stats: treeStats(dense), rootId: 'C1', now: NOW });
    // Count drawn stop labels only — the names also appear inside tooltips.
    const drawn = [...out.matchAll(/<text class="pr-axis"[^>]*fill="var\(--tx2[^>]*>([^<]*)<\/text>/g)]
      .map(m => m[1]);

    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(5);
    expect(drawn.every(label => label.startsWith('Aufgabe'))).toBe(true);
    // Every stop is still on the board and still hoverable.
    expect([...out.matchAll(/data-item-id="C1\.1\.\d"/g)]).toHaveLength(5);
  });
});

describe('the full-map renderer is untouched by all this', () => {
  test('leafNodes still sees every leaf of the whole tree', () => {
    expect(leafNodes(tree).map(l => l.id))
      .toEqual(['D1.1.1', 'D1.1.2', 'D1.2.1', 'Other']);
  });
});
