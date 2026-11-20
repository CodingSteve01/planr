import { describe, it, expect } from 'vitest';
import { buildDepLines, buildHoverLines } from '../gantt/depLines.js';

const tree = [
  { id: 'P1', name: 'Kundenbereich' },
  { id: 'P1.1', name: 'Alpha Task', parent: 'P1' },
  { id: 'P1.2', name: 'Beta Task', parent: 'P1' },
  { id: 'P2', name: 'Rechnungen', deps: ['P1'] },
];
const iMap = Object.fromEntries(tree.map(n => [n.id, n]));
const sMap = {
  'P1.1': { id: 'P1.1', endD: new Date(2030, 0, 30) },
  'P1.2': { id: 'P1.2', endD: new Date(2030, 1, 6) },
  P2: { id: 'P2', endD: new Date(2030, 1, 10) },
};
const allItems = Object.values(sMap);
const rowIdx = { 'P1.1': [0], 'P1.2': [1], P2: [2] };
const resD = id => (tree.some(n => n.parent === id) ? tree.filter(n => n.parent === id).map(n => n.id) : [id]);
const geo = { depX1: s => s.id.length * 10, depX2: s => s.id.length * 10 + 1, rowCenterY: r => r * 30 + 15 };
const base = { tree, allItems, sMap, iMap, rowIdx, resD, ...geo };

describe('buildDepLines', () => {
  it('draws one line from the latest-finishing child when a dependency targets a parent', () => {
    const lines = buildDepLines({ ...base, cpEdgeSet: new Set() });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      srcId: 'P1.2',
      tgtId: 'P2',
      removeFromId: 'P2',
      removeDepId: 'P1',
      isCp: false,
      isSoft: false,
      y1: 45,
      y2: 75,
    });
  });

  it('adds a separate line for a critical edge from an earlier child', () => {
    const lines = buildDepLines({ ...base, cpEdgeSet: new Set(['P1.1->P2']) });
    expect(lines.map(l => [l.srcId, l.isCp])).toEqual([
      ['P1.2', false],
      ['P1.1', true],
    ]);
  });

  it('returns nothing without a tree', () => {
    expect(buildDepLines({ ...base, tree: null, cpEdgeSet: new Set() })).toEqual([]);
  });
});

describe('buildHoverLines', () => {
  it('shows incoming and outgoing lines of the hovered task and the rows they touch', () => {
    const out = buildHoverLines({ ...base, hoverDepId: 'P1.2' });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toMatchObject({ kind: 'out', removeFromId: 'P2', removeDepId: 'P1' });
    expect([...out.rowIds].sort()).toEqual(['P1.2', 'P2']);
    const back = buildHoverLines({ ...base, hoverDepId: 'P2' });
    expect(back.lines[0]).toMatchObject({ kind: 'in', removeFromId: 'P2' });
  });

  it('is empty when nothing is hovered', () => {
    expect(buildHoverLines({ ...base, hoverDepId: null }).lines).toEqual([]);
  });
});
