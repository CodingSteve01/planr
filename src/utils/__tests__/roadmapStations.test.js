// A station is a station, and a finished line says so.
//
// Reported from the map, and all three are the same complaint seen from
// different sides: a finished line was hard to recognise AS finished.
//
//   * Its train disappeared. The train was suppressed at 100 %, so a line
//     that had arrived looked exactly like one that had never left — the
//     only difference left was a slightly dimmer colour, which a DROPPED
//     project has too.
//   * Its stops were only "darker". A reached stop was a filled circle and
//     an unreached one an outlined circle, which reads on a line that has
//     some of each and says nothing on a line where every one is filled.
//   * And the two were not even the same size: reached r=9, unreached r=5.
//     A line visibly shrank towards its future, and the two read as two
//     kinds of thing rather than one thing in two states.
import { describe, it, expect } from 'vitest';
import { computeRoadmapModel, renderRoadmapSvg } from '../roadmap.js';
import { treeStats } from '../scheduler.js';

const d = iso => new Date(`${iso}T00:00:00`);

// Two projects: one finished outright, one halfway.
const TREE = [
  { id: 'P1', name: 'Finished project', status: 'done' },
  { id: 'P1.1', name: 'First package', status: 'done', progress: 100, best: 4, factor: 1, completedStart: '2026-01-05', completedEnd: '2026-01-09' },
  { id: 'P1.2', name: 'Second package', status: 'done', progress: 100, best: 4, factor: 1, completedStart: '2026-02-02', completedEnd: '2026-02-06' },
  { id: 'P2', name: 'Live project', status: 'wip' },
  { id: 'P2.1', name: 'Done bit', status: 'done', progress: 100, best: 5, factor: 1, completedStart: '2026-01-05', completedEnd: '2026-01-09' },
  { id: 'P2.2', name: 'Open bit', status: 'open', progress: 0, best: 5, factor: 1 },
];
const SCHEDULED = [
  { id: 'P1.1', name: 'First package', status: 'done', effort: 4, startD: d('2026-01-05'), endD: d('2026-01-09') },
  { id: 'P1.2', name: 'Second package', status: 'done', effort: 4, startD: d('2026-02-02'), endD: d('2026-02-06') },
  { id: 'P2.1', name: 'Done bit', status: 'done', effort: 5, startD: d('2026-01-05'), endD: d('2026-01-09') },
  { id: 'P2.2', name: 'Open bit', status: 'open', effort: 5, startD: d('2026-03-02'), endD: d('2026-03-06') },
];

const render = (tree = TREE, scheduled = SCHEDULED) => {
  const model = computeRoadmapModel({ tree, scheduled, stats: treeStats(tree), now: d('2026-02-20') });
  return { model, svg: renderRoadmapSvg({ tree, scheduled, stats: treeStats(tree), now: d('2026-02-20') }) };
};

// Every drawn circle's OUTER edge: r plus half its stroke, which is what the
// eye measures. A ring drawn at r=5 with a 2px stroke and a disc drawn at r=9
// are not the same size, however the two numbers are written.
function outerRadii(markup) {
  // Only the drawing. `renderRoadmapSvg` returns the map AND the legend below
  // it, and the legend has its own small status circles.
  const svg = markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>') + 6)
    // The trains are not stations, and an arrived one wears a tick badge of
    // its own; this is about the stops.
    .replace(/<g id="rm-train-\d+"[\s\S]*?<\/g>/g, '');
  const found = new Set();
  for (const m of svg.matchAll(/<circle\b([^>]*)>/g)) {
    const attrs = m[1];
    const r = parseFloat(/\br="([\d.]+)"/.exec(attrs)?.[1] ?? 'NaN');
    if (!Number.isFinite(r) || r < 5) continue;         // the inner dot is not a stop
    if (/fill="transparent"/.test(attrs)) continue;      // the hit area
    if (/<animate/.test(attrs)) continue;
    const sw = parseFloat(/stroke-width="([\d.]+)"/.exec(attrs)?.[1] ?? '0');
    found.add(+(r + sw / 2).toFixed(2));
  }
  return [...found];
}

describe('a stop on the map', () => {
  it('is the same size whether it has been reached or not', () => {
    const { svg } = render();
    // The hit area (r=14, transparent) and the train halo (r=16) are not
    // stops; everything else that is drawn as a circle is one.
    const radii = outerRadii(svg).filter(r => r !== 14 && r !== 16 && r !== 8);
    expect(radii, `more than one station size: ${radii.join(', ')}`).toEqual([9]);
  });

  it('carries a tick once it is reached', () => {
    // A filled circle alone is only darker than its neighbour — and on a
    // finished line every circle is filled and nothing says why.
    const { svg } = render();
    const stops = svg.match(/<g class="rm-stop"[\s\S]*?<\/g>/g) || [];
    expect(stops.length).toBeGreaterThan(0);
    const ticked = stops.filter(g => g.includes('<path'));
    expect(ticked.length, 'no reached stop carries a tick').toBeGreaterThan(0);
    // …and an unreached one does not, or the tick would mean nothing.
    expect(ticked.length).toBeLessThan(stops.length);
  });
});

describe('a finished line', () => {
  it('keeps its train, standing at the terminus', () => {
    // It used to lose it at 100 %, which left "arrived" and "never started"
    // looking the same.
    const { model, svg } = render();
    const finished = model.lines.find(l => l.root.id === 'P1');
    expect(finished.progress).toBeGreaterThanOrEqual(1);
    const trains = svg.match(/<g id="rm-train-\d+"[\s\S]*?<\/g>/g) || [];
    expect(trains).toHaveLength(model.lines.length);
  });

  it('parks the train with a tick and stops it pulsing', () => {
    // A project that is finished is not asking for attention.
    const { svg } = render();
    const trains = svg.match(/<g id="rm-train-\d+"[\s\S]*?<\/g>/g) || [];
    const parked = trains.filter(g => !g.includes('<animate'));
    expect(parked, 'the finished line has no parked train').toHaveLength(1);
    expect(parked[0]).toContain('<path');
    const running = trains.filter(g => g.includes('<animate'));
    expect(running).toHaveLength(1);
    expect(running[0], 'a running train must not wear the arrived tick').not.toContain('<path');
  });

  it('is bigger than a station, so the two are never confused', () => {
    const { svg } = render();
    const width = /<rect[^>]*width="(\d+)"[^>]*rx="4.5"/.exec(svg);
    expect(width, 'no train car found').toBeTruthy();
    expect(Number(width[1])).toBeGreaterThan(9 * 2);
  });
});

describe('the order of the stops', () => {
  it('follows the tree ahead of the train, not the end date', () => {
    // The plan is the only statement anybody has made about work not yet
    // done; an end date is a consequence of that order rather than the order
    // itself. One long package finishing after a later short one used to
    // swap two stations, and the map then disagreed with the tree, the work
    // order and the Gantt about what comes next.
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip' },
      { id: 'P1.1', name: 'First in the tree, ends last', status: 'open', best: 20, factor: 1 },
      { id: 'P1.2', name: 'Second in the tree, ends first', status: 'open', best: 1, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'First in the tree, ends last', status: 'open', effort: 20, startD: d('2026-03-01'), endD: d('2026-04-30') },
      { id: 'P1.2', name: 'Second in the tree, ends first', status: 'open', effort: 1, startD: d('2026-03-01'), endD: d('2026-03-02') },
    ];
    const model = computeRoadmapModel({ tree, scheduled, stats: treeStats(tree), now: d('2026-02-20') });
    const line = model.lines[0];
    const first = line.majorStations.find(s => s.id === 'P1.1');
    const second = line.majorStations.find(s => s.id === 'P1.2');
    expect(first.t).toBeLessThan(second.t);
  });

  it('still follows what actually happened behind the train', () => {
    // History is not a plan. Re-sorting completed work by the tree would show
    // a sequence that never occurred — see the sibling case in roadmap.test.js.
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip' },
      { id: 'P1.1', name: 'First in the tree, finished later', status: 'done', progress: 100, best: 1, factor: 1, completedStart: '2026-03-01', completedEnd: '2026-03-01' },
      { id: 'P1.2', name: 'Second in the tree, finished first', status: 'done', progress: 100, best: 1, factor: 1, completedStart: '2026-01-01', completedEnd: '2026-01-01' },
      { id: 'P1.3', name: 'Still open', status: 'open', best: 8, factor: 1 },
    ];
    const scheduled = [
      { id: 'P1.1', name: 'First in the tree, finished later', status: 'done', effort: 1, startD: d('2026-01-01'), endD: d('2026-01-01') },
      { id: 'P1.2', name: 'Second in the tree, finished first', status: 'done', effort: 1, startD: d('2026-03-01'), endD: d('2026-03-01') },
    ];
    const model = computeRoadmapModel({ tree, scheduled, stats: treeStats(tree), now: d('2026-03-15') });
    const line = model.lines[0];
    expect(line.majorStations.find(s => s.id === 'P1.2').t)
      .toBeLessThan(line.majorStations.find(s => s.id === 'P1.1').t);
  });
});


describe('the at-risk marker', () => {
  // Reported as overlapping the line's own name and looking "stuck on". Both
  // were true: a bare polygon with a 6px "!" typed into it, positioned at a
  // fixed offset past a badge that had been clamped independently — so its
  // left corner sat three pixels ON the badge.
  const riskTree = [
    { id: 'P1', name: 'Late project', type: 'deadline', date: '2026-01-31', status: 'wip' },
    { id: 'P1.1', name: 'Slipping', status: 'open', best: 40, factor: 1 },
  ];
  const riskScheduled = [
    { id: 'P1.1', name: 'Slipping', status: 'open', effort: 40, startD: d('2026-02-01'), endD: d('2026-06-30') },
  ];

  const markup = () => renderRoadmapSvg({
    tree: riskTree, scheduled: riskScheduled, stats: treeStats(riskTree), now: d('2026-02-20'),
  });

  const boxes = svg => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*rx="5"[^>]*>/g)]
    .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], tag: m[0] }));

  it('never sits on the badge that carries the line name', () => {
    const svg = markup();
    const all = boxes(svg);
    const risk = all.find(b => b.tag.includes('rm-risk-tri'));
    expect(risk, 'no at-risk marker drawn').toBeTruthy();
    const sameRow = all.filter(b => b !== risk && Math.abs(b.y - risk.y) < 2);
    expect(sameRow.length).toBeGreaterThan(0);
    for (const badge of sameRow) {
      const overlaps = risk.x < badge.x + badge.w && risk.x + risk.w > badge.x;
      expect(overlaps, `marker at ${risk.x} overlaps a badge at ${badge.x}..${badge.x + badge.w}`).toBe(false);
    }
  });

  it('is a badge in the same family as the one beside it, not a loose glyph', () => {
    const svg = markup();
    const all = boxes(svg);
    const risk = all.find(b => b.tag.includes('rm-risk-tri'));
    const idBadge = all.find(b => b !== risk && Math.abs(b.y - risk.y) < 2);
    // Same height, same corner radius, same row — so the two read as a pair.
    expect(risk.h).toBe(idBadge.h);
  });

  it('stays inside the canvas', () => {
    const svg = markup();
    const width = Number(/viewBox="0 \d+ (\d+)/.exec(svg)?.[1]);
    const risk = boxes(svg).find(b => b.tag.includes('rm-risk-tri'));
    expect(width).toBeGreaterThan(0);
    expect(risk.x + risk.w).toBeLessThanOrEqual(width);
  });
});

describe('an arrived train', () => {
  it('is still drawn as a train, with the tick as a badge on it', () => {
    // Swapping the windows for a tick made the car unrecognisable — reported
    // as "nobody can tell it is a train any more".
    const { svg } = render();
    const trains = svg.match(/<g id="rm-train-\d+"[\s\S]*?<\/g>/g) || [];
    const parked = trains.find(g => !g.includes('<animate'));
    expect(parked).toBeTruthy();
    // The car plus two window slits, the same as a running one.
    expect((parked.match(/<rect/g) || []).length).toBe(3);
    expect(parked, 'no tick badge on the arrived train').toContain('<circle');
  });

  it('does not stand on the stop it has just reached', () => {
    // The train parks at the terminus and the last station was anchored to
    // the same point, so the car covered it.
    const { model } = render();
    const finished = model.lines.find(l => l.root.id === 'P1');
    const last = finished.majorStations[finished.majorStations.length - 1];
    expect(finished.trainT - last.t).toBeGreaterThan(0.02);
  });
});
