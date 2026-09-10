import { describe, expect, test } from 'vitest';
import { computeRoadmapModel, placeStationLabels } from '../roadmap.js';
import { schedule, treeStats, enrichParentSchedules } from '../scheduler.js';

const NOW = new Date('2026-09-10T12:00:00');

// A plan shaped like a real one: unevenly sized projects, mixed done/open,
// dependencies — that is what produces crowded regions on the canvas.
function busyPlan() {
  const tree = [];
  const shape = { F1: 9, P2: 11, P3: 4, M1: 8, A1: 3, B1: 3, D1: 2, Pr1: 2 };
  Object.entries(shape).forEach(([root, packages], ri) => {
    tree.push({ id: root, name: `Projekt ${root}`, type: 'goal', status: 'wip' });
    for (let a = 1; a <= packages; a++) {
      tree.push({ id: `${root}.${a}`, name: `Paket ${a}`, status: 'wip' });
      for (let b = 1; b <= 4; b++) {
        const done = ri < 3 && a <= 3;
        tree.push({
          id: `${root}.${a}.${b}`, name: `Aufgabe ${a}.${b}`, team: 'T1',
          status: done ? 'done' : b === 1 ? 'wip' : 'open',
          best: 2 + ((a * b) % 9), factor: 1.4, assign: ['M1'],
          deps: b > 1 ? [`${root}.${a}.${b - 1}`] : [],
          progress: done ? 100 : b === 1 ? 40 : 0,
          ...(done ? {
            completedStart: '2026-01-05',
            completedEnd: `2026-0${2 + (a % 5)}-14`,
            completedAt: `2026-0${2 + (a % 5)}-14`,
          } : {}),
        });
      }
    }
  });
  const members = [{ id: 'M1', name: 'Anna', team: 'T1', cap: 6, vac: 0 }];
  const { results } = schedule(tree, members, [], '2026-09-01', '2031-12-31', {}, [1, 2, 3, 4, 5], '2026-09-01');
  const stats = treeStats(tree);
  enrichParentSchedules(stats, tree, results);
  return { tree, stats, scheduled: results };
}

const { tree, stats, scheduled } = busyPlan();
const model = computeRoadmapModel({ tree, scheduled, stats, now: NOW });
const stationsOf = line => [...line.majorStations, ...line.minorStations];
const allStations = model.lines.flatMap((line, lineIdx) => stationsOf(line).map(station => ({ station, lineIdx, line })));

const CH_W = 6.4;
const LABEL_H = 12;
const boxFor = (pos, abbrev) => {
  const width = String(abbrev || '').length * CH_W + 4;
  const x0 = pos.anchor === 'start' ? pos.x : pos.anchor === 'end' ? pos.x - width : pos.x - width / 2;
  return { x0: x0 - 2, x1: x0 + width + 2, y0: pos.y - LABEL_H + 2, y1: pos.y + 3 };
};
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('stations of different lines do not sit on top of each other', () => {
  test('no cross-line pair is closer than the dot size', () => {
    const close = [];
    for (let i = 0; i < allStations.length; i++) {
      for (let j = i + 1; j < allStations.length; j++) {
        if (allStations[i].lineIdx === allStations[j].lineIdx) continue;
        const a = allStations[i].station;
        const b = allStations[j].station;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < 18) close.push(`${a.id}~${b.id} ${dist.toFixed(1)}px`);
      }
    }
    expect(close).toEqual([]);
  });

  test('separating them never reorders a line', () => {
    // Stations are nudged ALONG their route, so the chronological sequence
    // along each line has to come out exactly as it went in.
    model.lines.forEach(line => {
      const ts = stationsOf(line).map(s => s.t).sort((a, b) => a - b);
      const byDate = stationsOf(line)
        .slice()
        .sort((a, b) => (+(a.milestoneDate || a.endDate) || 0) - (+(b.milestoneDate || b.endDate) || 0));
      // Same set of positions, and done work still sits before open work.
      expect(stationsOf(line).map(s => s.t).slice().sort((a, b) => a - b)).toEqual(ts);
      const firstOpenIdx = byDate.findIndex(s => !s.allDone);
      if (firstOpenIdx > 0) {
        const lastDoneT = Math.max(...byDate.slice(0, firstOpenIdx).map(s => s.t));
        const firstOpenT = Math.min(...byDate.slice(firstOpenIdx).map(s => s.t));
        expect(lastDoneT).toBeLessThanOrEqual(firstOpenT);
      }
    });
  });

  test('done stations stay behind the train, unfinished ones ahead of it', () => {
    model.lines.forEach(line => {
      stationsOf(line).forEach(station => {
        if (station.allDone) expect(station.t).toBeLessThanOrEqual(line.trainT + 1e-6);
        else expect(station.t).toBeGreaterThanOrEqual(line.trainT - 1e-6);
      });
    });
  });

  test('every station stays on its own route', () => {
    // A nudge changes `t`, never x/y directly — so x/y must still be a point
    // of the polyline. Check by distance to the nearest route segment.
    model.lines.forEach(line => {
      stationsOf(line).forEach(station => {
        let best = Infinity;
        for (let i = 1; i < line.route.length; i++) {
          const a = line.route[i - 1];
          const b = line.route[i];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((station.x - a.x) * dx + (station.y - a.y) * dy) / len2));
          best = Math.min(best, Math.hypot(station.x - (a.x + t * dx), station.y - (a.y + t * dy)));
        }
        expect(best).toBeLessThan(0.5);
      });
    });
  });
});

describe('station labels', () => {
  const visible = (line, station) => station.kind === 'major' || station.id === line.currentId;
  const placement = placeStationLabels(model.lines, visible);
  const candidates = allStations.filter(({ station, line }) => visible(line, station));

  test('places a label for every candidate on this plan', () => {
    expect(candidates.length).toBeGreaterThan(20);
    expect(placement.size).toBe(candidates.length);
  });

  test('no two labels overlap', () => {
    const boxes = [...placement.entries()].map(([id, pos]) => {
      const found = allStations.find(entry => entry.station.id === id);
      return { id, box: boxFor(pos, found.station.abbrev) };
    });
    const clashes = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (overlaps(boxes[i].box, boxes[j].box)) clashes.push(`${boxes[i].id}~${boxes[j].id}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  test('no label covers another station dot', () => {
    const clashes = [];
    placement.forEach((pos, id) => {
      const owner = allStations.find(entry => entry.station.id === id).station;
      const box = boxFor(pos, owner.abbrev);
      allStations.forEach(({ station }) => {
        if (station.id === id) return;   // its own dot is allowed to be adjacent
        const dot = { x0: station.x - 9, x1: station.x + 9, y0: station.y - 9, y1: station.y + 9 };
        if (overlaps(box, dot)) clashes.push(`${id} over ${station.id}`);
      });
    });
    expect(clashes).toEqual([]);
  });

  test('a label stays next to the station it names', () => {
    placement.forEach((pos, id) => {
      const owner = allStations.find(entry => entry.station.id === id).station;
      expect(Math.hypot(pos.x - owner.x, pos.y - owner.y)).toBeLessThan(30);
    });
  });

  test('two stations at the same spot get labels that do not collide', () => {
    const fake = [
      {
        currentId: null,
        majorStations: [{ id: 'A.1', abbrev: 'ABC', kind: 'major', t: 0.5, x: 700, y: 400, allDone: false }],
        minorStations: [],
        route: [],
      },
      {
        currentId: null,
        majorStations: [{ id: 'B.1', abbrev: 'XYZ', kind: 'major', t: 0.5, x: 701, y: 401, allDone: false }],
        minorStations: [],
        route: [],
      },
    ];
    const placed = placeStationLabels(fake);

    expect(placed.size).toBe(2);
    const boxA = boxFor(placed.get('A.1'), 'ABC');
    const boxB = boxFor(placed.get('B.1'), 'XYZ');
    expect(overlaps(boxA, boxB)).toBe(false);
  });

  test('drops a label rather than printing it on top of something', () => {
    // Twelve stations packed into a 30px square: most labels cannot fit.
    const crowd = Array.from({ length: 12 }, (_, i) => ({
      id: `C.${i}`, abbrev: 'LONGISH', kind: 'major', t: 0.5,
      x: 700 + (i % 4) * 8, y: 400 + Math.floor(i / 4) * 8, allDone: false,
    }));
    const placed = placeStationLabels(
      crowd.map(station => ({ currentId: null, majorStations: [station], minorStations: [], route: [] })),
    );

    expect(placed.size).toBeGreaterThan(0);
    expect(placed.size).toBeLessThan(12);
  });

  test('the station the train is approaching gets a slot before the others', () => {
    const crowd = Array.from({ length: 8 }, (_, i) => ({
      id: `C.${i}`, abbrev: 'WIDELABEL', kind: 'major', t: 0.5,
      x: 700 + (i % 3) * 9, y: 400 + Math.floor(i / 3) * 9, allDone: false,
    }));
    const lines = crowd.map(station => ({
      currentId: station.id === 'C.7' ? 'C.7' : null,
      majorStations: [station], minorStations: [], route: [],
    }));

    expect(placeStationLabels(lines).has('C.7')).toBe(true);
  });
});
