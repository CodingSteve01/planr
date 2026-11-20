import { beforeAll, describe, test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  baselineWindows,
  compareScenario,
  schedulePlanData,
  shiftDays,
  projectDiffers,
  teamDiffers,
  teamStory,
} from '../scenarioCompare.js';
import { applyPatch, diffPlan } from '../scenario.js';
import { parseMdToProject } from '../markdownParse.js';

// The scheduler plans from the real today, so the fixture's dates hang off it.
const NOW = new Date();
const day = n => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const plan = () => ({
  meta: { name: 'X', planStart: day(0), version: '2' },
  teams: [{ id: 'T1', name: 'Dev', color: '#10b981' }],
  members: [
    { id: 'm1', name: 'Alex', team: 'T1', cap: 1, vac: 0 },
    { id: 'm2', name: 'Bo', team: 'T1', cap: 1, vac: 0 },
  ],
  tree: [
    // 15 working days of work, a date five weeks out: held, with a week to spare.
    { id: 'P1', name: 'Launch', status: 'open', type: 'goal', date: day(35) },
    { id: 'P1.1', name: 'Build', status: 'open', team: 'T1', best: 10, factor: 1, prio: 2, assign: ['m1'], deps: [] },
    { id: 'P1.2', name: 'Ship', status: 'open', team: 'T1', best: 5, factor: 1, prio: 2, assign: ['m1'], deps: ['P1.1'] },
    { id: 'P2', name: 'Other', status: 'open', type: 'goal' },
    { id: 'P2.1', name: 'Side work', status: 'open', team: 'T1', best: 5, factor: 1, prio: 2, assign: ['m2'], deps: [] },
  ],
  vacations: [],
  holidays: [],
});
const compare = (base, work) =>
  compareScenario({ base, work, baseScheduled: schedulePlanData(base, NOW), workScheduled: schedulePlanData(work, NOW) });
const edit = (data, id, patch) => ({ ...data, tree: data.tree.map(n => (n.id === id ? { ...n, ...patch } : n)) });

describe('compareScenario', () => {
  test('an untouched scenario moves nothing', () => {
    const base = plan();
    const c = compare(base, { ...base });
    expect(c.items).toEqual([]);
    expect(c.projects.every(p => !p.shift)).toBe(true);
    expect(c.totals).toMatchObject({ later: 0, earlier: 0, newlyLate: 0, rescued: 0, endShift: 0 });
    expect(baselineWindows(c).size).toBe(0);
  });

  test("an absence pushes the person's project, and only that one", () => {
    const base = plan();
    const work = { ...base, vacations: [{ person: 'm1', from: day(7), to: day(27), note: '' }] };
    const c = compare(base, work);
    const p1 = c.projects.find(p => p.id === 'P1'),
      p2 = c.projects.find(p => p.id === 'P2');
    expect(p1.shift).toBeGreaterThanOrEqual(10);
    expect(p2.shift).toBe(0);
    expect(c.totals.later).toBe(1);
    // The launch date was held in the plan and is missed in the scenario.
    expect(p1.baseLate).toBe(false);
    expect(p1.workLate).toBe(true);
    expect(c.totals.newlyLate).toBe(1);
    expect(c.items.map(i => i.id).sort()).toEqual(['P1.1', 'P1.2']);
    expect(c.items.every(i => i.endShift > 0)).toBe(true);
    const ghost = baselineWindows(c);
    expect([...ghost.keys()].sort()).toEqual(['P1.1', 'P1.2']);
    expect(ghost.get('P1.2').shift).toBe(c.items.find(i => i.id === 'P1.2').endShift);
  });

  test('handing work to someone free pulls the project in, and shows on both people', () => {
    const base = plan();
    const work = edit(base, 'P1.1', { assign: ['m2'] });
    const c = compare(base, work);
    const moved = c.items.find(i => i.id === 'P1.1');
    expect(moved.peopleChanged).toBe(true);
    expect(moved.basePeople).toEqual(['m1']);
    expect(moved.workPeople).toEqual(['m2']);
    const alex = c.people.find(p => p.id === 'm1'),
      bo = c.people.find(p => p.id === 'm2');
    expect(alex.effortShift).toBeLessThan(0);
    expect(bo.effortShift).toBeGreaterThan(0);
    expect(alex.effortShift + bo.effortShift).toBeCloseTo(0, 5);
  });

  test('a longer estimate that breaks the date is "newly late"; fixing a late plan is "rescued"', () => {
    const base = plan();
    const late = edit(base, 'P1.1', { best: 30 });
    expect(compare(base, late).totals).toMatchObject({ newlyLate: 1, rescued: 0 });
    expect(compare(late, base).totals).toMatchObject({ newlyLate: 0, rescued: 1 });
  });

  test('added and removed work is named as such', () => {
    const base = plan();
    const work = {
      ...base,
      tree: [
        ...base.tree.filter(n => n.id !== 'P2.1'),
        { id: 'P1.3', name: 'Extra', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['m2'], deps: [] },
      ],
    };
    const c = compare(base, work);
    expect(c.items.find(i => i.id === 'P1.3').presence).toBe('added');
    expect(c.items.find(i => i.id === 'P2.1').presence).toBe('removed');
  });

  test('someone hired in the scenario appears with the work they take', () => {
    const base = plan();
    let work = { ...base, members: [...base.members, { id: 'm3', name: 'Cy', team: 'T1', cap: 1, vac: 0 }] };
    work = edit(work, 'P1.2', { assign: ['m3'], deps: [] });
    const c = compare(base, work);
    expect(c.people.find(p => p.id === 'm3')).toMatchObject({ presence: 'added', baseTasks: 0, workTasks: 1 });
    expect(c.projects.find(p => p.id === 'P1').shift).toBeLessThan(0);
  });

  test('taking a person out is a statement about their team: fewer people, less capacity, all of its work later', () => {
    // Two people in one team, four tasks with the team and nobody on them.
    const base = {
      ...plan(),
      tree: [
        { id: 'P1', name: 'Launch', status: 'open', type: 'goal' },
        ...[1, 2, 3, 4].map(i => ({
          id: `P1.${i}`,
          name: `Task ${i}`,
          status: 'open',
          team: 'T1',
          best: 10,
          factor: 1,
          prio: 2,
          assign: [],
          deps: [],
        })),
      ],
    };
    const work = { ...base, members: base.members.filter(m => m.id !== 'm2') };
    const c = compare(base, work);
    const dev = c.teams.find(tm => tm.id === 'T1');
    expect(dev).toMatchObject({ basePeople: 2, workPeople: 1, capShiftPct: -50, capNew: false, total: 4, gone: 0, added: 0 });
    expect(dev.untilShift).toBeGreaterThan(0);
    // One person does four tasks in a row where two did two each: the first
    // stays where it was, the other three move — including the ones the
    // scheduler had given to the person who stays.
    expect(dev.moved).toBe(3);
    expect(dev.workEffort).toBe(dev.baseEffort);
    expect(teamStory(c.teams)).toEqual([
      {
        id: 'T1',
        name: 'Dev',
        people: [2, 1],
        capPct: -50,
        capNew: false,
        moved: 3,
        total: 4,
        gone: 0,
        added: 0,
        movedProjects: 1,
        end: 'later',
        shift: dev.untilShift,
      },
    ]);
  });

  test('a team whose work all goes has no end to compare, and is not said to finish "the same day"', () => {
    const base = plan();
    const work = { ...base, tree: base.tree.map(n => (n.id.startsWith('P1.') ? { ...n, dropped: true } : n)) };
    const c = compare(base, work);
    const dev = c.teams.find(tm => tm.id === 'T1');
    expect(dev.gone).toBe(2);
    const [fact] = teamStory(c.teams);
    expect(fact).toMatchObject({ gone: 2, moved: 0 });
    // P2.1 is still Dev's and has not moved, so Dev's work now ends when it
    // does: earlier than before, by exactly the difference of the two ends.
    expect(fact.end).toBe('earlier');
    expect(fact.shift).toBe(dev.untilShift);
    expect(dev.untilShift).toBeLessThan(0);
    // And with nothing left at all: no end on one side, so no claim about it.
    const none = { ...base, tree: base.tree.map(n => (n.id.includes('.') ? { ...n, dropped: true } : n)) };
    const gone = teamStory(compare(base, none).teams)[0];
    expect(gone).toMatchObject({ gone: 3, moved: 0, end: null, shift: null });
  });

  test('a team that is new has capacity where there was none, not "±0"', () => {
    const base = plan();
    let work = {
      ...base,
      teams: [...base.teams, { id: 'T2', name: 'Ops', color: '#8b5cf6' }],
      members: [...base.members, { id: 'm3', name: 'Cy', team: 'T2', cap: 1, vac: 0 }],
    };
    work = edit(work, 'P2.1', { team: 'T2', assign: ['m3'] });
    const c = compare(base, work);
    const ops = c.teams.find(tm => tm.id === 'T2');
    expect(ops).toMatchObject({ presence: 'added', basePeople: 0, workPeople: 1, capShiftPct: null, capNew: true });
    expect(teamDiffers(ops)).toBe(true);
    expect(teamStory(c.teams).find(f => f.id === 'T2')).toMatchObject({ people: [0, 1], capNew: true, capPct: null });
  });

  test('a task handed to another team counts once, with the team it had in the plan', () => {
    const base = {
      ...plan(),
      teams: [...plan().teams, { id: 'T2', name: 'Ops', color: '#8b5cf6' }],
      members: [...plan().members, { id: 'm3', name: 'Cy', team: 'T2', cap: 1, vac: 0 }],
    };
    const work = edit(base, 'P1.2', { team: 'T2', assign: ['m3'], deps: [] });
    const c = compare(base, work);
    const dev = c.teams.find(tm => tm.id === 'T1'),
      ops = c.teams.find(tm => tm.id === 'T2');
    expect(dev.total).toBe(3);
    expect(ops.total).toBe(0);
    for (const tm of c.teams) expect(tm.moved + tm.gone + tm.added).toBeLessThanOrEqual(tm.total);
  });

  test('a task that only changes hands on the same days has not moved', () => {
    const base = plan();
    // P2.1 goes from Bo to somebody equally free, same days.
    const work = { ...base, members: [...base.members, { id: 'm3', name: 'Cy', team: 'T1', cap: 1, vac: 0 }] };
    const c = compare(base, edit(work, 'P2.1', { assign: ['m3'] }));
    const item = c.items.find(i => i.id === 'P2.1');
    expect(item).toMatchObject({ peopleChanged: true, endShift: 0 });
    expect(c.teams.find(tm => tm.id === 'T1').moved).toBe(0);
  });

  test('a project whose end holds while its tasks slip is still an affected project', () => {
    // Dev has two short tasks in the project; Ops has one long one that ends
    // it either way. Half of Dev goes: Dev's tasks slip, the end does not.
    const base = {
      ...plan(),
      teams: [...plan().teams, { id: 'T2', name: 'Ops', color: '#8b5cf6' }],
      members: [...plan().members, { id: 'm3', name: 'Cy', team: 'T2', cap: 1, vac: 0 }],
      tree: [
        { id: 'P1', name: 'Launch', status: 'open', type: 'goal' },
        { id: 'P1.1', name: 'Dev one', status: 'open', team: 'T1', best: 5, factor: 1, prio: 2, assign: [], deps: [] },
        { id: 'P1.2', name: 'Dev two', status: 'open', team: 'T1', best: 5, factor: 1, prio: 2, assign: [], deps: [] },
        { id: 'P1.3', name: 'Ops long', status: 'open', team: 'T2', best: 60, factor: 1, prio: 2, assign: ['m3'], deps: [] },
      ],
    };
    const work = { ...base, members: base.members.filter(m => m.id !== 'm2') };
    const c = compare(base, work);
    const p1 = c.projects.find(p => p.id === 'P1');
    expect(p1.shift).toBe(0);
    expect(p1).toMatchObject({ total: 3, moved: 1, gone: 0, added: 0 });
    expect(p1.maxItemLater).toBeGreaterThan(0);
    expect(p1.maxItemEarlier).toBe(0);
    expect(projectDiffers(p1)).toBe(true);
    expect(c.totals).toMatchObject({ later: 0, earlier: 0, affected: 1, affectedSameEnd: 1 });
    expect(teamStory(c.teams)[0]).toMatchObject({ id: 'T1', moved: 1, movedProjects: 1 });
  });

  test('one task earlier does not hide another that is later', () => {
    const base = plan();
    // Build gets longer (Ship slips behind it); Side work is pulled in front of nothing new but shortened.
    let work = edit(base, 'P1.1', { best: 14 });
    work = {
      ...work,
      tree: [
        ...work.tree,
        { id: 'P1.3', name: 'Quick', status: 'open', team: 'T1', best: 2, factor: 1, prio: 1, assign: ['m2'], deps: [] },
      ],
    };
    work = edit(work, 'P2.1', { assign: ['m1'], deps: [] });
    const c = compare(base, work);
    const later = c.items.filter(i => i.presence === 'both' && (i.endShift || i.startShift) > 0);
    expect(later.length).toBeGreaterThan(0);
    const p1 = c.projects.find(p => p.id === 'P1');
    expect(p1.maxItemLater).toBe(Math.max(...later.filter(i => i.id.startsWith('P1.')).map(i => i.endShift || i.startShift)));
    for (const p of c.projects) {
      expect(p.maxItemLater).toBeGreaterThanOrEqual(0);
      expect(p.maxItemEarlier).toBeLessThanOrEqual(0);
    }
  });

  test('a team nothing happened to reads the same on both sides', () => {
    const base = plan();
    const c = compare(base, { ...base });
    expect(c.teams).toHaveLength(1);
    expect(c.teams[0]).toMatchObject({ basePeople: 2, workPeople: 2, capShiftPct: 0, moved: 0, untilShift: 0 });
    expect(teamDiffers(c.teams[0])).toBe(false);
    expect(teamStory(c.teams)).toEqual([]);
  });

  test('somebody who has already left does not count as team capacity', () => {
    const base = { ...plan(), members: [...plan().members, { id: 'm9', name: 'Gone', team: 'T1', cap: 1, vac: 0, end: day(-30) }] };
    expect(compare(base, { ...base }).teams[0].basePeople).toBe(2);
    // Leaving today-ish in the scenario is the same statement as being removed.
    const work = { ...base, members: base.members.map(m => (m.id === 'm2' ? { ...m, end: day(-1) } : m)) };
    expect(compare(base, work).teams[0]).toMatchObject({ basePeople: 2, workPeople: 1, capShiftPct: -50 });
  });

  test('shiftDays counts calendar days and survives a clock change', () => {
    expect(shiftDays(new Date(2026, 2, 27), new Date(2026, 2, 30))).toBe(3); // across the DST switch
    expect(shiftDays(new Date(2026, 0, 10), new Date(2026, 0, 3))).toBe(-7);
    expect(shiftDays(null, new Date())).toBeNull();
  });
});

const REAL = process.env.PLANR_REAL_FILE || '';
describe.skipIf(!REAL || !existsSync(REAL))('a real plan file', () => {
  // Read inside the tests, never here: a skipped describe still runs its
  // body to collect them, and without the file that is an ENOENT for the
  // whole suite — which is how a release without this file failed.
  const now = new Date();
  let base, baseScheduled;
  beforeAll(() => {
    base = parseMdToProject(readFileSync(REAL, 'utf8'));
    baseScheduled = schedulePlanData(base, now);
  });

  test('the plan compared with itself is silent — the two schedules are the same schedule', () => {
    const { data } = applyPatch(base, null);
    const c = compareScenario({ base, work: data, baseScheduled, workScheduled: schedulePlanData(data, now) });
    expect(c.items).toEqual([]);
    expect(c.totals.later + c.totals.earlier).toBe(0);
    expect(baseScheduled.length).toBeGreaterThan(20);
  });

  test('three weeks off for the busiest person moves real dates, and reverting the patch moves them back', () => {
    const load = new Map();
    for (const s of baseScheduled) if (s.personId) load.set(s.personId, (load.get(s.personId) || 0) + (s.effort || 0));
    const [busiest] = [...load.entries()].sort((a, b) => b[1] - a[1])[0];
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 20);
    const day = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const work = { ...base, vacations: [...base.vacations, { person: busiest, from: day(start), to: day(end), note: 'Szenario' }] };
    const patch = diffPlan(base, work);
    expect(Object.keys(patch)).toEqual(['vacations']);
    const c = compareScenario({ base, work, baseScheduled, workScheduled: schedulePlanData(work, now) });
    expect(c.items.length).toBeGreaterThan(0);
    expect(c.items.some(i => i.endShift > 0)).toBe(true);
    const person = c.people.find(p => p.id === busiest);
    expect(person.untilShift).toBeGreaterThan(0);
  });
});
