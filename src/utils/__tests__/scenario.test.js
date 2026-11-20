import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  applyPatch, deepEqual, describeChanges, diffPlan, formatScenariosBlock, fromPortablePatch,
  isEmptyPatch, newScenarioId, parseScenariosBlock, revertChange, toPortablePatch,
  uniqueScenarioName, withScenarioPatch,
} from '../scenario.js';
import { buildMarkdownText } from '../markdown.js';
import { parseMdToProject } from '../markdownParse.js';

const plan = () => ({
  meta: { name: 'X', planStart: '2026-01-05', version: '2' },
  teams: [{ id: 'T1', name: 'Backend', color: '#10b981' }, { id: 'T2', name: 'Frontend', color: '#3b82f6' }],
  members: [
    { id: 'm1', name: 'Alex Noor', team: 'T1', cap: 1, vac: 25 },
    { id: 'm2', name: 'Bo Lund', team: 'T2', cap: 1, vac: 25 },
  ],
  tree: [
    { id: 'P1', name: 'Project', status: 'open', type: 'goal' },
    { id: 'P1.1', name: 'Build', status: 'open', team: 'T1', best: 5, factor: 1.5, prio: 2, assign: ['m1'], deps: [] },
    { id: 'P1.2', name: 'Ship', status: 'open', team: 'T2', best: 3, factor: 1.5, prio: 2, assign: ['m2'], deps: ['P1.1'] },
  ],
  vacations: [{ person: 'm1', from: '2026-03-02', to: '2026-03-06', note: '' }],
  holidays: [],
  historyEvents: [{ ts: '2026-01-01T00:00:00.000Z', id: 'P1.1', kind: 'added' }],
});

const edit = (data, id, patch) => ({ ...data, tree: data.tree.map(n => (n.id === id ? { ...n, ...patch } : n)) });
const byId = list => Object.fromEntries(list.map(e => [e.id, e]));

describe('diffPlan / applyPatch', () => {
  test('an untouched plan is no scenario at all', () => {
    const base = plan();
    expect(diffPlan(base, base)).toBeNull();
    expect(diffPlan(base, { ...base, tree: base.tree.map(n => ({ ...n })) })).toBeNull();
    expect(applyPatch(base, null).data).toBe(base);
  });

  test('a patch holds only the fields that differ', () => {
    const base = plan();
    const work = edit(base, 'P1.2', { assign: ['m1'], best: 8 });
    const patch = diffPlan(base, work);
    expect(patch).toEqual({ tree: { set: { 'P1.2': { assign: ['m1'], best: 8 } } } });
  });

  test('applying the diff gives back the scenario, for every kind of change', () => {
    const base = plan();
    let work = edit(base, 'P1.1', { best: 10, pinnedStart: '2026-02-02' });
    work = { ...work, tree: [...work.tree.filter(n => n.id !== 'P1.2').map(n => { if (n.id !== 'P1.1') return n; const { prio: _p, ...rest } = n; return rest; }), { id: 'P1.3', name: 'New', status: 'open', best: 2, assign: ['m3'] }] };
    work = { ...work, members: [...work.members.map(m => (m.id === 'm2' ? { ...m, cap: 0.5 } : m)), { id: 'm3', name: 'Cy New', team: 'T1', cap: 1 }] };
    work = { ...work, vacations: [{ person: 'm2', from: '2026-04-06', to: '2026-04-17', note: 'what if' }] };
    work = { ...work, personQueues: { m1: ['P1.3', 'P1.1'] }, meta: { ...work.meta, planStart: '2026-02-02' }, sizes: [{ label: 'M', days: 7 }] };
    const patch = diffPlan(base, work);
    const { data, conflicts } = applyPatch(base, patch);
    expect(conflicts).toEqual([]);
    expect(byId(data.tree)).toEqual(byId(work.tree));
    expect(byId(data.members)).toEqual(byId(work.members));
    expect(data.vacations).toEqual(work.vacations);
    expect(data.personQueues).toEqual(work.personQueues);
    expect(data.meta).toEqual(work.meta);
    expect(data.sizes).toEqual(work.sizes);
    // A removed field is really gone, not undefined-but-present.
    expect('prio' in data.tree.find(n => n.id === 'P1.1')).toBe(false);
  });

  test('history never enters a patch — a what-if records nothing as having happened', () => {
    const base = plan();
    const work = { ...edit(base, 'P1.1', { status: 'done' }), historyEvents: [...base.historyEvents, { ts: 'x', id: 'P1.1', status: 'done' }], scenarios: [{ id: 's1' }], roadmapAssignment: { P1: { routeIdx: 0, colorIdx: 0 } } };
    const patch = diffPlan(base, work);
    expect(Object.keys(patch)).toEqual(['tree']);
  });

  test('progress recorded in the plan afterwards shows through the scenario', () => {
    const base = plan();
    const patch = diffPlan(base, edit(base, 'P1.2', { assign: ['m1'] }));
    const later = edit(base, 'P1.1', { status: 'done', progress: 100 });
    const { data } = applyPatch(later, patch);
    expect(data.tree.find(n => n.id === 'P1.1').status).toBe('done');
    expect(data.tree.find(n => n.id === 'P1.2').assign).toEqual(['m1']);
  });

  test('a change to something the plan has since removed is reported, not applied blind', () => {
    const base = plan();
    const patch = diffPlan(base, edit(base, 'P1.2', { best: 9 }));
    const later = { ...base, tree: base.tree.filter(n => n.id !== 'P1.2') };
    const { data, conflicts } = applyPatch(later, patch);
    expect(data.tree.map(n => n.id)).toEqual(['P1', 'P1.1']);
    expect(conflicts).toEqual([{ kind: 'tree', id: 'P1.2', why: 'gone' }]);
  });

  test('a task added in the scenario steps aside when the plan takes its id', () => {
    const base = plan();
    const work = {
      ...base,
      tree: [
        ...base.tree.map(n => (n.id === 'P1.2' ? { ...n, deps: ['P1.1', 'P1.3'] } : n)),
        { id: 'P1.3', name: 'Scenario task', status: 'open', best: 2 },
        { id: 'P1.3.1', name: 'Its child', status: 'open', best: 1, deps: ['P1.3'] },
      ],
      personQueues: { m1: ['P1.3.1', 'P1.1'] },
    };
    const patch = diffPlan(base, work);
    const later = { ...base, tree: [...base.tree, { id: 'P1.3', name: 'Real task', status: 'open', best: 4 }] };
    const { data, conflicts } = applyPatch(later, patch);
    expect(conflicts).toEqual([]);
    const names = Object.fromEntries(data.tree.map(n => [n.id, n.name]));
    expect(names['P1.3']).toBe('Real task');
    expect(names['P1.4']).toBe('Scenario task');
    expect(names['P1.4.1']).toBe('Its child');
    expect(data.tree.find(n => n.id === 'P1.4.1').deps).toEqual(['P1.4']);
    expect(data.tree.find(n => n.id === 'P1.2').deps).toEqual(['P1.1', 'P1.4']);
    expect(data.personQueues.m1).toEqual(['P1.4.1', 'P1.1']);
  });
});

describe('describeChanges / revertChange', () => {
  test('lists what the user did and leaves out what the app derived', () => {
    const base = plan();
    let work = edit(base, 'P1.1', { status: 'done', completedAt: '2026-02-01', completedStart: '2026-01-20' });
    work = edit(work, 'P1', { status: 'wip' }); // derived from its children
    work = { ...work, vacations: [...work.vacations, { person: 'm2', from: '2026-05-04', to: '2026-05-08', note: '' }] };
    const changes = describeChanges(base, work);
    expect(changes.map(c => `${c.kind}:${c.op}:${c.id}`)).toEqual(['item:change:P1.1', 'absence:add:m2|2026-05-04|2026-05-08|']);
    expect(changes[0].fields).toEqual([{ key: 'status', from: 'open', to: 'done' }]);
  });

  test('taking one change back leaves the others', () => {
    const base = plan();
    let work = edit(base, 'P1.1', { best: 10 });
    work = edit(work, 'P1.2', { assign: ['m1'] });
    work = { ...work, vacations: [...work.vacations, { person: 'm2', from: '2026-05-04', to: '2026-05-08', note: '' }] };
    const patch = diffPlan(base, work);
    const changes = describeChanges(base, work, patch);
    const without = revertChange(patch, changes.find(c => c.id === 'P1.1'));
    const { data } = applyPatch(base, without);
    expect(data.tree.find(n => n.id === 'P1.1').best).toBe(5);
    expect(data.tree.find(n => n.id === 'P1.2').assign).toEqual(['m1']);
    expect(data.vacations).toHaveLength(2);
    const none = changes.reduce((p, c) => revertChange(p, c), patch);
    expect(isEmptyPatch(none)).toBe(true);
  });

  test('taking back a change to a parent leaves what was added and removed below it', () => {
    const base = plan();
    let work = edit(base, 'P1', { name: 'Renamed project' });
    work = { ...work, tree: [...work.tree.filter(n => n.id !== 'P1.2'), { id: 'P1.3', name: 'New below', best: 2 }] };
    const patch = diffPlan(base, work);
    const changes = describeChanges(base, work, patch);
    expect(changes.map(c => `${c.op}:${c.id}`).sort()).toEqual(['add:P1.3', 'change:P1', 'remove:P1.2']);
    const { data } = applyPatch(base, revertChange(patch, changes.find(c => c.id === 'P1')));
    expect(data.tree.find(n => n.id === 'P1').name).toBe('Project');
    expect(data.tree.map(n => n.id).sort()).toEqual(['P1', 'P1.1', 'P1.3']);
  });

  test('taking back a removed parent brings its children back, and only those', () => {
    const base = { ...plan(), tree: [...plan().tree, { id: 'P2', name: 'Other' }, { id: 'P2.1', name: 'Other task', best: 1 }] };
    const work = { ...base, tree: base.tree.filter(n => !n.id.startsWith('P2') && n.id !== 'P1.2') };
    const patch = diffPlan(base, work);
    const { data } = applyPatch(base, revertChange(patch, { kind: 'item', op: 'remove', id: 'P2' }));
    expect(data.tree.map(n => n.id).sort()).toEqual(['P1', 'P1.1', 'P2', 'P2.1']);
  });

  test('taking back an added parent takes its children with it', () => {
    const base = plan();
    const work = { ...base, tree: [...base.tree, { id: 'P2', name: 'New project' }, { id: 'P2.1', name: 'Child', best: 1 }] };
    const patch = diffPlan(base, work);
    expect(revertChange(patch, { kind: 'item', op: 'add', id: 'P2' })).toBeNull();
  });
});

describe('the Markdown file: people and teams by name', () => {
  const scenarioWork = base => {
    let work = edit(base, 'P1.2', { assign: ['m1', 'm9'], team: 'T1', phases: [{ id: 'ph1', name: 'Dev', team: 'T2', teams: ['T2'], assign: ['m2'] }] });
    work = { ...work, members: [...work.members.map(m => (m.id === 'm2' ? { ...m, cap: 0.5, teams: ['T2', 'T1'] } : m)), { id: 'm9', name: 'Cy New', team: 'T1', cap: 1 }] };
    work = { ...work, vacations: [...work.vacations, { person: 'm9', from: '2026-05-04', to: '2026-05-08', note: '' }] };
    work = { ...work, personQueues: { m1: ['P1.2', 'P1.1'], 'team:T2': ['P1.2'] } };
    return work;
  };

  test('no id of a person or team is written to the file', () => {
    const base = plan();
    const portable = toPortablePatch(diffPlan(base, scenarioWork(base)), base);
    const text = JSON.stringify(portable);
    for (const id of ['"m1"', '"m2"', '"m9"', '"T1"', '"T2"', 'team:T2']) expect(text).not.toContain(id);
    expect(text).toContain('@Alex Noor');
    expect(text).toContain('team:#Frontend');
  });

  test('a reload that hands out different ids still gets the same scenario', () => {
    const base = plan();
    const work = scenarioWork(base);
    const portable = toPortablePatch(diffPlan(base, work), base);
    // The same plan, read again: every person and team has a new id.
    const rename = { m1: 'mA', m2: 'mB', T1: 'T2', T2: 'T1' };
    const swap = v => rename[v] || v;
    const reloaded = {
      ...base,
      teams: base.teams.map(t => ({ ...t, id: swap(t.id) })),
      members: base.members.map(m => ({ ...m, id: swap(m.id), team: swap(m.team) })),
      tree: base.tree.map(n => ({ ...n, ...(n.team ? { team: swap(n.team) } : {}), ...(n.assign ? { assign: n.assign.map(swap) } : {}) })),
      vacations: base.vacations.map(v => ({ ...v, person: swap(v.person) })),
    };
    const { patch, lost } = fromPortablePatch(portable, reloaded);
    expect(lost).toBe(0);
    const { data, conflicts } = applyPatch(reloaded, patch);
    expect(conflicts).toEqual([]);
    const cy = data.members.find(m => m.name === 'Cy New');
    expect(cy).toBeTruthy();
    expect(cy.team).toBe('T2'); // Backend, under its new id
    const ship = data.tree.find(n => n.id === 'P1.2');
    expect(ship.assign).toEqual(['mA', cy.id]);
    expect(ship.team).toBe('T2');
    expect(ship.phases[0]).toMatchObject({ team: 'T1', teams: ['T1'], assign: ['mB'] });
    expect(data.members.find(m => m.id === 'mB')).toMatchObject({ cap: 0.5, teams: ['T1', 'T2'] });
    expect(data.vacations.at(-1).person).toBe(cy.id);
    expect(data.personQueues).toEqual({ mA: ['P1.2', 'P1.1'], 'team:T1': ['P1.2'] });
  });

  test('a person the plan no longer has drops out of the scenario and is counted', () => {
    const base = plan();
    const work = edit(base, 'P1.1', { assign: ['m2'] });
    const portable = toPortablePatch(diffPlan(base, work), base);
    const later = { ...base, members: base.members.filter(m => m.id !== 'm2') };
    const { patch, lost } = fromPortablePatch(portable, later);
    expect(lost).toBe(1);
    expect(patch.tree.set['P1.1'].assign).toEqual([]);
  });

  test('two people with one name stay two people', () => {
    const base = { ...plan(), members: [{ id: 'm1', name: 'Sam', team: 'T1' }, { id: 'm2', name: 'Sam', team: 'T2' }] };
    const work = edit(base, 'P1.1', { assign: ['m2'] });
    const portable = toPortablePatch(diffPlan(base, work), base);
    expect(portable.tree.set['P1.1'].assign).toEqual(['@Sam~2']);
    expect(fromPortablePatch(portable, base).patch.tree.set['P1.1'].assign).toEqual(['m2']);
  });

  test('the block round-trips through the real writer and parser', () => {
    const base = plan();
    const work = scenarioWork(base);
    const scenarios = [{ id: 's1', name: 'Bo halbtags, Cy kommt', createdAt: '2026-11-20T08:00:00.000Z', patch: diffPlan(base, work) }, { id: 's2', name: 'leer', patch: null }];
    const md = buildMarkdownText({ tree: base.tree, members: base.members, teams: base.teams, vacations: base.vacations, meta: base.meta, data: { ...base, scenarios } });
    expect(md).toContain('## Scenarios');
    const parsed = parseMdToProject(md);
    expect(parsed.scenarios.map(s => s.name)).toEqual(['Bo halbtags, Cy kommt', 'leer']);
    expect(parsed.scenarios[1].patch).toBeNull();
    const { data, conflicts } = applyPatch(parsed, parsed.scenarios[0].patch);
    expect(conflicts).toEqual([]);
    const nameOf = id => data.members.find(m => m.id === id)?.name;
    const ship = data.tree.find(n => n.id === 'P1.2');
    expect(ship.assign.map(nameOf)).toEqual(['Alex Noor', 'Cy New']);
    expect(data.members.find(m => m.name === 'Bo Lund').cap).toBe(0.5);
    expect(data.vacations.map(v => nameOf(v.person))).toEqual(['Alex Noor', 'Cy New']);
    // Writing it again from the reloaded plan gives the same block: the format is stable.
    const again = buildMarkdownText({ tree: parsed.tree, members: parsed.members, teams: parsed.teams, vacations: parsed.vacations, meta: parsed.meta, data: parsed });
    const block = text => text.slice(text.indexOf('```planr-scenarios'));
    const stripStamps = text => text.replace(/s\d{13,}\d*/g, 'sN');
    expect(stripStamps(block(again))).toBe(stripStamps(block(md)));
    // A plan without scenarios writes no section.
    expect(buildMarkdownText({ tree: base.tree, members: base.members, teams: base.teams, vacations: base.vacations, meta: base.meta, data: base })).not.toContain('Scenarios');
  });

  test('a damaged line costs one scenario, not the file', () => {
    const base = plan();
    const text = `v1\n${formatScenariosBlock([{ id: 's1', name: 'ok', patch: null }], base)}\n{"id":"s2","name":"cut off`;
    expect(parseScenariosBlock(text, base).map(s => s.id)).toEqual(['s1']);
  });
});

describe('the list of scenarios', () => {
  test('ids and names do not collide', () => {
    const list = [{ id: 's1', name: 'Plan B' }, { id: 's3', name: 'Plan B 2' }];
    expect(newScenarioId(list)).toBe('s4');
    expect(newScenarioId([{ id: 's1' }, { id: 's2' }])).toBe('s3');
    expect(uniqueScenarioName('plan b', list)).toBe('plan b 3');
    expect(uniqueScenarioName('Plan B', list, 's1')).toBe('Plan B');
  });

  test('an unchanged patch keeps the scenario object — no phantom save', () => {
    const list = [{ id: 's1', name: 'A', patch: { tree: { del: ['X'] } } }];
    expect(withScenarioPatch(list, 's1', { tree: { del: ['X'] } })[0]).toBe(list[0]);
    expect(withScenarioPatch(list, 's1', null)[0].patch).toBeNull();
  });
});

// The owner's real plan, when it is there: the format has to survive the file
// it was built for, not only the three-task fixture above.
const REAL = process.env.PLANR_REAL_FILE || '';
describe.skipIf(!REAL || !existsSync(REAL))('a real plan file', () => {
  const load = () => parseMdToProject(readFileSync(REAL, 'utf8'));
  const write = d => buildMarkdownText({ tree: d.tree, members: d.members, teams: d.teams, vacations: d.vacations, meta: d.meta, data: d });

  test('a broad scenario survives save and reload with new ids', () => {
    const base = load();
    const open = base.tree.filter(n => n.assign?.length && n.status !== 'done' && !base.tree.some(o => o.id.startsWith(n.id + '.')));
    expect(open.length).toBeGreaterThan(5);
    const [a, b] = base.members;
    let work = { ...base, tree: base.tree.map(n => (open.slice(0, 5).some(o => o.id === n.id) ? { ...n, assign: [b.id], best: (n.best || 1) + 3 } : n)) };
    work = { ...work, members: work.members.map(m => (m.id === a.id ? { ...m, cap: 0.5 } : m)) };
    work = { ...work, vacations: [...work.vacations, { person: a.id, from: '2027-02-01', to: '2027-02-12', note: 'Szenario' }] };
    const patch = diffPlan(base, work);
    const md = write({ ...base, scenarios: [{ id: 's1', name: 'Test', patch }] });
    const text = md.slice(md.indexOf('```planr-scenarios'));
    for (const m of base.members) expect(text).not.toContain(`"${m.id}"`);

    const again = parseMdToProject(md);
    expect(again.scenarios[0].lost).toBeUndefined();
    const { data, conflicts } = applyPatch(again, again.scenarios[0].patch);
    expect(conflicts).toEqual([]);
    const nameIn = (d, id) => d.members.find(m => m.id === id)?.name;
    for (const o of open.slice(0, 5)) {
      const n = data.tree.find(x => x.id === o.id);
      expect(n.assign.map(id => nameIn(data, id))).toEqual([b.name]);
      expect(n.best).toBe((o.best || 1) + 3);
    }
    expect(data.members.find(m => m.name === a.name).cap).toBe(0.5);
    expect(data.vacations.some(v => nameIn(data, v.person) === a.name && v.from === '2027-02-01')).toBe(true);
    // Everything the scenario did not touch is the plan's, to the field.
    const touched = new Set(open.slice(0, 5).map(o => o.id));
    const strip = n => { const { assign: _a, ...rest } = n; return rest; };
    for (const n of again.tree) if (!touched.has(n.id)) expect(deepEqual(strip(n), strip(data.tree.find(x => x.id === n.id)))).toBe(true);
    // And the plan itself is written exactly as it was without the scenario.
    expect(md.slice(0, md.indexOf('\n## Scenarios'))).toBe(write(base));
  });
});

describe('carryScenarioList', () => {
  const a1 = { id: 's1', name: 'A', patch: null };
  const a2 = { id: 's1', name: 'A', patch: { tree: { del: ['X'] } } };
  const b = { id: 's2', name: 'B', patch: null };
  const c = { id: 's3', name: 'C', patch: null };

  test('a scenario the snapshot knows takes its current content', async () => {
    const { carryScenarioList } = await import('../scenario.js');
    const snap = { tree: [], scenarios: [a1] };
    expect(carryScenarioList(snap, [a2], new Set(['s1'])).scenarios).toEqual([a2]);
  });

  test('one deleted during the visit is gone from the snapshot too', async () => {
    const { carryScenarioList } = await import('../scenario.js');
    // B was there when the visit began and was deleted from the menu during it.
    const snap = { tree: [], scenarios: [a1, b] };
    const out = carryScenarioList(snap, [a2], new Set(['s1', 's2']));
    expect(out.scenarios.map(s => s.id)).toEqual(['s1']);
    expect(carryScenarioList({ tree: [], scenarios: [b] }, [], new Set(['s2']))).toEqual({ tree: [] });
  });

  test('one created during the visit is added; one deleted before it stays', async () => {
    const { carryScenarioList } = await import('../scenario.js');
    // The snapshot is from before B was deleted in the plan; C was created in the visit.
    const snap = { tree: [], scenarios: [a1, b] };
    const out = carryScenarioList(snap, [a2, c], new Set(['s1']));
    expect(out.scenarios.map(s => s.id)).toEqual(['s1', 's2', 's3']);
    expect(out.scenarios[0]).toBe(a2);
  });

  test('nothing to carry leaves the snapshot itself', async () => {
    const { carryScenarioList } = await import('../scenario.js');
    const snap = { tree: [], scenarios: [a1] };
    expect(carryScenarioList(snap, [a1], new Set(['s1']))).toBe(snap);
    const bare = { tree: [] };
    expect(carryScenarioList(bare, [], new Set())).toBe(bare);
  });
});
