import { describe, it, expect } from 'vitest';
import { buildStructure } from '../gantt/structure.js';
import { buildChildrenByParent } from '../gantt/items.js';

const tree = [
  { id: 'P1', name: 'Kundenbereich', team: 'fe' },
  { id: 'P1.1', name: 'Alpha Task', team: 'fe' },
  { id: 'P1.2', name: 'Beta Task', team: 'be' },
];
const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
const ordMap = Object.fromEntries(tree.map((r, idx) => [r.id, { idx, ord: null }]));
const childrenByParent = buildChildrenByParent({ tree, ordMap });
const item = (id, team, startD, endD) => ({ id, name: iMap[id].name, team, status: 'open', best: 2, startD, endD, assign: [] });
const items = [
  item('P1.1', 'fe', new Date(2030, 0, 28), new Date(2030, 0, 30)),
  item('P1.2', 'be', new Date(2030, 1, 4), new Date(2030, 1, 6)),
];
const teams = [
  { id: 'fe', name: 'Frontend', color: '#111111' },
  { id: 'be', name: 'Backend', color: '#222222' },
];

const run = groupBy =>
  buildStructure({
    treeRank: new Map(tree.map((r, i) => [r.id, i])),
    iMap,
    childrenByParent,
    rootIds: childrenByParent[''],
    tree,
    teams,
    memberById: {},
    teamById: Object.fromEntries(teams.map(t => [t.id, t])),
    confidence: {},
    t: key => key,
    threadStructure: [],
    allItems: items,
    displayItems: items,
    groupBy,
    weekIndexOfDate: () => 0,
    UNASSIGNED_LABEL: 'Unassigned',
  });

describe('gantt structure', () => {
  it('nests tasks under their work package in project grouping, folded when all children are tasks', () => {
    const { nodes, defaultCollapsed } = run('project');
    expect(nodes).toHaveLength(1);
    const pkg = nodes[0];
    expect(pkg.type).toBe('summary');
    expect(pkg.children.map(c => c.s.id)).toEqual(['P1.1', 'P1.2']);
    expect(pkg.s._summaryCount).toBe(2);
    expect(defaultCollapsed).toEqual([pkg.collapseKey]);
  });

  it('makes one group per team in team grouping, in team order', () => {
    const { nodes } = run('team');
    expect(nodes.map(n => [n.type, n.label])).toEqual([
      ['group', 'Frontend'],
      ['group', 'Backend'],
    ]);
    expect(nodes[0].count).toBe(1);
    expect(nodes[0].color).toBe('#111111');
  });

  it('spans a summary over the dates of its children', () => {
    const { nodes } = run('project');
    expect(nodes[0].s.startD).toEqual(new Date(2030, 0, 28));
    expect(nodes[0].s.endD).toEqual(new Date(2030, 1, 6));
  });
});
