import { describe, it, expect } from 'vitest';
import { buildAllItems, buildSearchTextById, filterDisplayItems, buildChildrenByParent } from '../gantt/items.js';

const tree = [
  { id: 'P1', name: 'Kundenbereich', team: 'fe', note: 'Launch', deps: [], assign: [] },
  { id: 'P1.1', name: 'Alpha Task', team: 'fe', deps: ['P2.1'], assign: ['m1'], customValues: { risk: 'Gamma' } },
  { id: 'P1.2', name: 'Beta Task', team: 'be', deps: [], assign: ['m2'], status: 'done', completedAt: '2020-03-04' },
  { id: 'P2', name: 'Rechnungen', deps: [], assign: [] },
  { id: 'P2.1', name: 'Delta Task', deps: [], assign: [], status: 'open' },
];
const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
const memberById = { m1: { id: 'm1', name: 'Anna Noor' }, m2: { id: 'm2', name: 'Ben Ortiz' } };
const teamById = { fe: { id: 'fe', name: 'Frontend' }, be: { id: 'be', name: 'Backend' } };

describe('gantt items', () => {
  const leafIdSet = new Set(['P1.1', 'P1.2', 'P2.1']);
  const scheduled = [{ id: 'P1.1', name: 'Alpha Task', team: 'fe', assign: ['m1'], personId: 'm1', person: 'Anna Noor', status: 'open' }];
  const build = extra =>
    buildAllItems({
      scheduled,
      tree,
      leafIdSet,
      memberById,
      rootFilter: '',
      teamFilter: '',
      personFilter: '',
      workDays: [1, 2, 3, 4, 5],
      UNASSIGNED_LABEL: 'Unassigned',
      weekIndexOfDate: () => 0,
      ...extra,
    });

  it('adds finished and unscheduled leaves to the scheduled items', () => {
    const items = build();
    expect(items.map(i => i.id)).toEqual(['P1.1', 'P1.2', 'P2.1']);
    const done = items.find(i => i.id === 'P1.2');
    expect(done._completed).toBe(true);
    expect(done.person).toBe('Ben Ortiz');
    const open = items.find(i => i.id === 'P2.1');
    expect(open._unestimated).toBe(true);
    expect(open.person).toBe('Unassigned');
  });

  it('narrows the scope by root, team and person', () => {
    expect(build({ rootFilter: 'P2' }).map(i => i.id)).toEqual(['P2.1']);
    expect(build({ teamFilter: 'be' }).map(i => i.id)).toEqual(['P1.2']);
    expect(build({ personFilter: 'm1' }).map(i => i.id)).toEqual(['P1.1']);
  });

  it('builds the search text of a task from its own fields and its ancestors', () => {
    const text = buildSearchTextById({ tree, iMap, teamById, memberById });
    expect(text['P1.1']).toContain('kundenbereich');
    expect(text['P1.1']).toContain('alpha task');
    expect(text['P1.1']).toContain('anna noor');
    expect(text['P1.1']).toContain('frontend');
    expect(text['P1.1']).toContain('gamma');
    expect(text['P1.1']).toContain('p2.1');
    expect(text['P2.1']).not.toContain('kundenbereich');
  });

  it('filters by hide-done and by search, and keeps a done item changed in the diff', () => {
    const allItems = build();
    const searchTextById = buildSearchTextById({ tree, iMap, teamById, memberById });
    const run = extra =>
      filterDisplayItems({
        allItems,
        hideDone: false,
        _diffActive: false,
        _diffChangedSet: new Set(),
        searchNeedle: '',
        searchTextById,
        iMap,
        teamById,
        memberById,
        ...extra,
      }).map(i => i.id);
    expect(run({})).toEqual(['P1.1', 'P1.2', 'P2.1']);
    expect(run({ hideDone: true })).toEqual(['P1.1', 'P2.1']);
    expect(run({ hideDone: true, _diffActive: true, _diffChangedSet: new Set(['P1.2']) })).toEqual(['P1.1', 'P1.2', 'P2.1']);
    expect(run({ searchNeedle: 'kundenbereich' })).toEqual(['P1.1', 'P1.2']);
    expect(run({ searchNeedle: 'ben ortiz' })).toEqual(['P1.2']);
  });

  it('lists children by parent in tree order, display order first', () => {
    const t = [{ id: 'A' }, { id: 'A.1' }, { id: 'A.2', displayOrder: 1 }, { id: 'A.3', displayOrder: 0 }];
    const ordMap = Object.fromEntries(t.map((r, idx) => [r.id, { idx, ord: typeof r.displayOrder === 'number' ? r.displayOrder : null }]));
    const map = buildChildrenByParent({ tree: t, ordMap });
    expect(map['']).toEqual(['A']);
    expect(map['A']).toEqual(['A.1', 'A.3', 'A.2']);
  });
});
