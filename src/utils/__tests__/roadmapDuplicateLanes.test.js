/** @vitest-environment happy-dom */
// Reported: in the summary PDF of a ten-project plan the top Subway lane had
// lost its title and ran into the page edge, and another line's title started
// past the left margin. Two faults, both covered here.
//
// 1. The plan's stored assignment still carried duplicates written by the old
//    eight-lane board (two projects on route 0, two on route 3). Honouring
//    both put two lines on one lane, and the spacing pass shoved one of each
//    pair off the board.
// 2. The PDF replaced the renderer's viewBox with a fixed `0 0 1400 800`,
//    which no longer describes a board that grows past eight lanes.
import { describe, expect, it, vi } from 'vitest';
import { computeRoadmapModel, mergeRoadmapAssignment, renderRoadmapSvg, splitSvgMarkup } from '../roadmap.js';
import { treeStats } from '../scheduler.js';
import { buildExportCtx } from '../exportCtx.js';

const captured = [];
vi.mock('pdfmake/build/pdfmake', () => ({
  default: {
    addVirtualFileSystem: () => {},
    createPdf: dd => { captured.push(dd); return { download: () => {} }; },
  },
}));
vi.mock('pdfmake/build/vfs_fonts', () => ({ default: { pdfMake: { vfs: {} } }, pdfMake: { vfs: {} }, vfs: {} }));

const d = iso => new Date(`${iso}T00:00:00`);
const NOW = d('2026-09-10');

// Ten projects of different lengths, so the longest-first order is fixed.
const TREE = [];
const SCHEDULED = [];
for (let i = 1; i <= 10; i++) {
  TREE.push({ id: `P${i}`, name: `Project ${i}`, type: 'goal', status: 'open', team: 'T1' });
  TREE.push({ id: `P${i}.1`, name: `Task ${i}`, status: 'open', best: 5, factor: 1, team: 'T1' });
  SCHEDULED.push({
    id: `P${i}.1`, treeId: `P${i}.1`, name: `Task ${i}`, status: 'open', team: 'T1', effort: 5,
    startD: d('2026-09-14'), endD: new Date(d('2026-09-14').getTime() + i * 7 * 864e5),
  });
}

// The shape the old board left in the reported file: every project mapped,
// two lanes and two colours held twice.
const STALE = {
  P1: { routeIdx: 1, colorIdx: 0 }, P2: { routeIdx: 3, colorIdx: 3 }, P3: { routeIdx: 2, colorIdx: 4 },
  P4: { routeIdx: 5, colorIdx: 5 }, P5: { routeIdx: 6, colorIdx: 6 }, P6: { routeIdx: 7, colorIdx: 7 },
  P7: { routeIdx: 3, colorIdx: 1 }, P8: { routeIdx: 4, colorIdx: 3 }, P9: { routeIdx: 0, colorIdx: 2 },
  P10: { routeIdx: 0, colorIdx: 0 },
};

const model = assignment => computeRoadmapModel({
  tree: TREE, scheduled: SCHEDULED, stats: treeStats(TREE), now: NOW, assignment,
});

describe('a stored assignment with duplicate lanes', () => {
  it('gives every line a lane of its own', () => {
    const routes = Object.values(model(STALE)._assignment).map(a => a.routeIdx);
    expect(new Set(routes).size).toBe(10);
  });

  it('keeps every lane on the board, titles included', () => {
    const svg = splitSvgMarkup(renderRoadmapSvg({
      tree: TREE, scheduled: SCHEDULED, stats: treeStats(TREE), now: NOW, assignment: STALE,
    }))[0];
    const [, vx, vy] = svg.match(/viewBox="([-\d.]+) ([-\d.]+)/).map(Number);
    const names = [...svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" class="rm-line-name"/g)]
      .map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
    expect(names).toHaveLength(10);
    names.forEach(n => {
      expect(n.x, 'a line title starts past the left edge').toBeGreaterThanOrEqual(vx);
      expect(n.y - 16, 'a line title sits above the top edge').toBeGreaterThanOrEqual(vy);
    });
    // One common left edge: no line was pushed sideways.
    expect(new Set(names.map(n => n.x)).size).toBe(1);
  });

  it('uses a free colour for the second holder while the palette has one', () => {
    // Three lines, eight colours: a shared colour here is a leftover, not a
    // necessity.
    const three = TREE.filter(n => /^P[123](\.|$)/.test(n.id));
    const { _assignment } = computeRoadmapModel({
      tree: three, scheduled: SCHEDULED.filter(s => /^P[123]\./.test(s.id)), stats: treeStats(three), now: NOW,
      assignment: { P1: { routeIdx: 0, colorIdx: 4 }, P2: { routeIdx: 1, colorIdx: 4 }, P3: { routeIdx: 2, colorIdx: 1 } },
    });
    expect(new Set(Object.values(_assignment).map(a => a.colorIdx)).size).toBe(3);
  });

  it('leaves a clean assignment exactly as stored', () => {
    const clean = model(null)._assignment;
    expect(model(clean)._assignment).toEqual(clean);
  });
});

describe('mergeRoadmapAssignment', () => {
  const rootIds = new Set(Object.keys(STALE));

  it('takes the repaired slot over a stored duplicate', () => {
    const computed = model(STALE)._assignment;
    const merged = mergeRoadmapAssignment(STALE, computed, rootIds);
    expect(new Set(Object.values(merged).map(a => a.routeIdx)).size).toBe(10);
    // Once repaired, the next render agrees with the file — no loop.
    expect(mergeRoadmapAssignment(merged, model(merged)._assignment, rootIds)).toEqual(merged);
  });

  it('never lets a filtered render overwrite a clean stored slot', () => {
    const stored = { A: { routeIdx: 5, colorIdx: 2 }, B: { routeIdx: 1, colorIdx: 0 } };
    const merged = mergeRoadmapAssignment(stored, { A: { routeIdx: 0, colorIdx: 0 } }, new Set(['A', 'B']));
    expect(merged).toEqual(stored);
  });

  it('fills a root that has no mapping yet', () => {
    const merged = mergeRoadmapAssignment({}, { A: { routeIdx: 0, colorIdx: 0 } }, new Set(['A']));
    expect(merged.A).toEqual({ routeIdx: 0, colorIdx: 0 });
  });
});

describe('the summary PDF', () => {
  it('embeds the map with the viewBox the renderer chose, fitted to the page', async () => {
    const { exportSummaryPDF } = await import('../pdfExports.js');
    const data = {
      meta: { name: 'Lanes', planStart: '2026-09-01', planEnd: '2027-12-31', version: '2' },
      tree: TREE, members: [], teams: [{ id: 'T1', name: 'Backend', color: '#2563eb' }],
      vacations: [], holidays: [], roadmapAssignment: STALE,
    };
    const ctx = buildExportCtx({
      data, scheduled: SCHEDULED, weeks: [], cpSet: new Set(), goalPaths: {},
      stats: treeStats(TREE), confidence: {}, lang: 'de',
    });
    captured.length = 0;
    await exportSummaryPDF(ctx, { includeTimetable: false, includeProjectRoadmaps: false });
    const nodes = [];
    const walk = n => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (typeof n.svg === 'string' && n.svg.includes('rm-line-name')) nodes.push(n);
      Object.values(n).forEach(walk);
    };
    walk(captured.at(-1).content);
    expect(nodes).toHaveLength(1);
    const vb = nodes[0].svg.match(/^<svg [^>]*viewBox="([^"]+)"/)[1].split(' ').map(Number);
    // Ten lanes: taller than the old fixed 800, and not starting at 0.
    expect(vb[3]).toBeGreaterThan(800);
    expect(vb[1]).toBeGreaterThan(0);
    expect(nodes[0].svg).toMatch(new RegExp(`^<svg [^>]*width="${vb[2]}" height="${vb[3]}"`));
    expect(nodes[0].fit).toEqual([770, expect.any(Number)]);
  });
});
