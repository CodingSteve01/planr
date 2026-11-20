import { describe, test, expect } from 'vitest';
import { monthAgo } from '../effective.js';
import { inIdsOf, recordToday, planAtEndOf, planOn, statusAsOf, applyPastEdit, formatDayLogBlock, parseDayLogBlock, logStart } from '../dayLog.js';

const node = (id, extra = {}) => ({ id, name: id, status: 'open', progress: 0, best: 1, factor: 1, deps: [], assign: [], ...extra });
const plan = (tree, extra = {}) => ({ meta: { name: 'P' }, tree, members: [{ id: 'm1', name: 'Anna', short: 'AN', team: 'T1', cap: 1 }], teams: [{ id: 'T1', name: 'Dev' }], vacations: [], ...extra });
const upd = (data, id, patch) => ({ ...data, tree: data.tree.map(n => (n.id === id ? { ...n, ...patch } : n)) });
const names = data => Object.fromEntries(data.tree.map(n => [n.id, n.name]));

// Three days of work: each `save` is what the app does on a file write.
function threeDays() {
  let saved = plan([node('P1'), node('P1.1', { name: 'Alpha' }), node('P1.2', { name: 'Beta' })]);
  const save = (next, day) => { saved = recordToday(saved, { ...next, dayLog: saved.dayLog }, day); return saved; };
  save(upd(saved, 'P1.1', { name: 'Alpha 2', best: 3 }), '2026-11-10');
  save({ ...saved, tree: [...saved.tree, node('P1.3', { name: 'Gamma' })] }, '2026-11-12');
  save(upd(saved, 'P1.1', { name: 'Alpha 3' }), '2026-11-12'); // a second save the same day
  save(upd(saved, 'P1.2', { name: 'Beta 2' }), '2026-11-15');
  return saved;
}

describe('the plan on an earlier day', () => {
  test('one entry per day that changed, and every day can be read back', () => {
    const real = threeDays();
    expect(real.dayLog.map(e => e.day)).toEqual(['2026-11-10', '2026-11-12', '2026-11-15']);
    expect(logStart(real)).toBe('2026-11-10');
    expect(names(planAtEndOf(real, '2026-11-20'))).toEqual({ P1: 'P1', 'P1.1': 'Alpha 3', 'P1.2': 'Beta 2', 'P1.3': 'Gamma' });
    expect(names(planAtEndOf(real, '2026-11-14'))).toEqual({ P1: 'P1', 'P1.1': 'Alpha 3', 'P1.2': 'Beta', 'P1.3': 'Gamma' });
    expect(names(planAtEndOf(real, '2026-11-11'))).toEqual({ P1: 'P1', 'P1.1': 'Alpha 2', 'P1.2': 'Beta' });
    expect(names(planAtEndOf(real, '2026-11-09'))).toEqual({ P1: 'P1', 'P1.1': 'Alpha', 'P1.2': 'Beta' });
    expect(planAtEndOf(real, '2026-11-09').tree.find(n => n.id === 'P1.1').best).toBe(1);
    expect(planAtEndOf(real, '2026-11-11').dayLog).toBeUndefined();
  });

  test('a day that ends as it began leaves no entry', () => {
    let saved = plan([node('P1'), node('P1.1', { name: 'Alpha' })]);
    saved = recordToday(saved, upd(saved, 'P1.1', { name: 'X' }), '2026-11-10');
    expect(saved.dayLog).toHaveLength(1);
    saved = recordToday(saved, upd(saved, 'P1.1', { name: 'Alpha' }), '2026-11-10');
    expect(saved.dayLog || []).toEqual([]);
    const untouched = plan([node('P1')]);
    expect(recordToday(untouched, untouched, '2026-11-10')).toBe(untouched);
  });

  test('status comes from the history log, by the day an entry counts for', () => {
    const tree = [node('P1.1', { status: 'done', progress: 100, completedAt: '2026-11-14' }), node('P1.2', { status: 'wip', progress: 50 }), node('P1.9')];
    const events = [
      { ts: '2026-11-01T09:00:00.000Z', id: 'P1.1', kind: 'added', status: 'open', progress: 0 },
      { ts: '2026-11-16T09:00:00.000Z', id: 'P1.1', status: 'wip', progress: 30, effectiveAt: '2026-11-05' },
      { ts: '2026-11-16T09:00:00.000Z', id: 'P1.1', status: 'done', progress: 100, completedAt: '2026-11-14' },
      { ts: '2026-11-12T09:00:00.000Z', id: 'P1.2', kind: 'added', status: 'wip', progress: 50 },
    ];
    const at = day => Object.fromEntries(statusAsOf(tree, events, day).map(n => [n.id, `${n.status} ${n.progress}${n.completedAt ? ' ' + n.completedAt : ''}`]));
    expect(at('2026-11-20')).toEqual({ 'P1.1': 'done 100 2026-11-14', 'P1.2': 'wip 50', 'P1.9': 'open 0' });
    expect(at('2026-11-10')).toEqual({ 'P1.1': 'wip 30', 'P1.2': 'open 0', 'P1.9': 'open 0' });
    expect(at('2026-11-03')).toEqual({ 'P1.1': 'open 0', 'P1.2': 'open 0', 'P1.9': 'open 0' });
    expect(statusAsOf(tree, events, '2026-11-20')).toBe(tree);
  });
});

describe('an edit made on an earlier day', () => {
  test('counts from that day on: later days and today have it, earlier days do not', () => {
    const real = threeDays();
    const day = '2026-11-11';
    const screen0 = planOn(real, day);
    const screen1 = upd(screen0, 'P1.2', { note: 'call the customer' });
    const next = applyPastEdit(real, screen0, screen1, day);
    const note = d => planAtEndOf(next, d).tree.find(n => n.id === 'P1.2')?.note;
    expect(next.tree.find(n => n.id === 'P1.2').note).toBe('call the customer');
    expect([note('2026-11-09'), note('2026-11-10'), note('2026-11-11'), note('2026-11-13'), note('2026-11-20')])
      .toEqual([undefined, undefined, 'call the customer', 'call the customer', 'call the customer']);
    // Everything else reads back exactly as before.
    for (const d of ['2026-11-09', '2026-11-11', '2026-11-14']) {
      const strip = s => s.tree.map(({ note: _n, ...rest }) => rest);
      expect(strip(planAtEndOf(next, d)), d).toEqual(strip(planAtEndOf(real, d)));
    }
  });

  test('overrides what the same field was changed to later', () => {
    const real = threeDays(); // P1.1 is "Alpha 2" on the 11th and "Alpha 3" from the 12th
    const day = '2026-11-11';
    const screen0 = planOn(real, day);
    const next = applyPastEdit(real, screen0, upd(screen0, 'P1.1', { name: 'Renamed' }), day);
    const name = d => planAtEndOf(next, d).tree.find(n => n.id === 'P1.1').name;
    expect([name('2026-11-09'), name('2026-11-10'), name('2026-11-11'), name('2026-11-12'), name('2026-11-20')])
      .toEqual(['Alpha', 'Alpha 2', 'Renamed', 'Renamed', 'Renamed']);
    expect(next.tree.find(n => n.id === 'P1.1').name).toBe('Renamed');
    // The task added on the 12th is still added on the 12th.
    expect(planAtEndOf(next, '2026-11-11').tree.some(n => n.id === 'P1.3')).toBe(false);
    expect(planAtEndOf(next, '2026-11-12').tree.some(n => n.id === 'P1.3')).toBe(true);
  });

  test('a task added on an earlier day exists from that day', () => {
    const real = threeDays();
    const day = '2026-11-10';
    const screen0 = planOn(real, day);
    const next = applyPastEdit(real, screen0, { ...screen0, tree: [...screen0.tree, node('P1.7', { name: 'Late idea' })] }, day);
    const has = d => planAtEndOf(next, d).tree.some(n => n.id === 'P1.7');
    expect([has('2026-11-09'), has('2026-11-10'), has('2026-11-13'), has('2026-11-20')]).toEqual([false, true, true, true]);
    expect(next.tree.some(n => n.id === 'P1.7')).toBe(true);
  });

  test('a status change becomes today\'s state and waits, dated, for the save', () => {
    const real = { ...threeDays() };
    real.tree = real.tree.map(n => (n.id === 'P1.2' ? { ...n, status: 'done', progress: 100, completedAt: '2026-11-18', completedEnd: '2026-11-18' } : n));
    const day = '2026-11-11';
    const screen0 = planOn(real, day);
    const next = applyPastEdit(real, screen0, upd(screen0, 'P1.1', { status: 'done', progress: 100, completedAt: '2026-11-20' }), day);
    const done = next.tree.find(n => n.id === 'P1.1');
    expect([done.status, done.completedAt, done.completedEnd]).toEqual(['done', day, day]);
    expect(next.asOfPending['P1.1']).toEqual({ day, status: 'done', progress: 100 });
    // Taking a task back to "in progress" on that day takes its completion along.
    const screenB = { ...screen0, tree: screen0.tree.map(n => (n.id === 'P1.2' ? { ...n, status: 'done', progress: 100, completedAt: '2026-11-18' } : n)) };
    const back = applyPastEdit(real, screenB, upd(screenB, 'P1.2', { status: 'wip', progress: 40 }), day);
    const wip = back.tree.find(n => n.id === 'P1.2');
    expect([wip.status, wip.progress, wip.completedAt]).toEqual(['wip', 40, undefined]);
    expect(back.asOfPending['P1.2']).toEqual({ day, status: 'wip', progress: 40 });
  });

  test('nothing edited gives back the same plan', () => {
    const real = threeDays();
    const screen0 = planOn(real, '2026-11-11');
    expect(applyPastEdit(real, screen0, screen0, '2026-11-11')).toBe(real);
  });
});

describe('the log in the file', () => {
  test('survives a round trip, with people named instead of numbered', () => {
    let saved = plan([node('P1'), node('P1.1')]);
    saved = recordToday(saved, upd(saved, 'P1.1', { assign: ['m1'], team: 'T1' }), '2026-11-10');
    const text = formatDayLogBlock(saved.dayLog, saved);
    expect(text).not.toContain('"m1"');
    const renumbered = { ...saved, members: [{ ...saved.members[0], id: 'm7' }], teams: [{ id: 'T4', name: 'Dev' }] };
    const read = parseDayLogBlock(text, renumbered);
    expect(read).toHaveLength(1);
    expect(read[0].day).toBe('2026-11-10');
    expect(parseDayLogBlock('v1\nnot json\n{"day":"soon"}\n', saved)).toEqual([]);
  });
});

describe('a month ago', () => {
  test('is the same day of the month before, or its last day', () => {
    expect(monthAgo(new Date(2026, 10, 20))).toBe('2026-10-20');
    expect(monthAgo(new Date(2026, 2, 31))).toBe('2026-02-28');
    expect(monthAgo(new Date(2026, 0, 15))).toBe('2025-12-15');
  });
});

describe('a plan loaded again', () => {
  test('is compared with what was here before by name, not by the ids a load hands out', () => {
    const before = { meta: { name: 'P' }, teams: [{ id: 'T1', name: 'Dev' }], meetingPlans: [{ id: 'mp-old', name: 'Standup', meetings: [] }],
      members: [{ id: 'm-old', name: 'Anna Noor', team: 'T1', cap: 1, meetingPlanIds: ['mp-old'] }],
      tree: [{ id: 'P1', name: 'Project' }, { id: 'P1.1', name: 'Old name', team: 'T1', assign: ['m-old'], best: 2 }],
      vacations: [{ person: 'm-old', from: '2026-12-01', to: '2026-12-05' }], personQueues: { 'm-old': ['P1.1'] },
      dayLog: [{ day: '2026-11-10', back: { tree: { set: { 'P1.1': { best: 1 } } } } }] };
    const loaded = { ...before, teams: [{ id: 'T9', name: 'Dev' }], meetingPlans: [{ id: 'mp-new', name: 'Standup', meetings: [] }],
      members: [{ id: 'm-new', name: 'Anna Noor', team: 'T9', cap: 1, meetingPlanIds: ['mp-new'] }],
      tree: [{ id: 'P1', name: 'Project' }, { id: 'P1.1', name: 'New name', team: 'T9', assign: ['m-new'], best: 2 }],
      vacations: [{ person: 'm-new', from: '2026-12-01', to: '2026-12-05' }], personQueues: { 'm-new': ['P1.1'] } };
    const saved = recordToday(inIdsOf(before, loaded), loaded, '2026-11-20');
    // Only the rename is what changed outside; the people are the same people.
    expect(saved.dayLog.map(e => e.day)).toEqual(['2026-11-10', '2026-11-20']);
    expect(saved.dayLog[1].back).toEqual({ tree: { set: { 'P1.1': { name: 'Old name' } } } });
    expect(planAtEndOf(saved, '2026-11-19').tree[1].name).toBe('Old name');
    expect(planAtEndOf(saved, '2026-11-19').tree[1].assign).toEqual(['m-new']);
  });

  test('an entry for today that was saved before the reload stays in the ids of this load', () => {
    const people = id => [{ id, name: 'Anna Noor', team: 'T1', cap: 1 }];
    const base = { meta: { name: 'P' }, teams: [{ id: 'T1', name: 'Dev' }], vacations: [] };
    // Saved here earlier today: Anna was assigned.
    const morning = { ...base, members: people('m-old'), tree: [{ id: 'P1', name: 'Project' }, { id: 'P1.1', name: 'Task', best: 2 }] };
    const saved = recordToday(morning, { ...morning, tree: [morning.tree[0], { ...morning.tree[1], assign: ['m-old'] }] }, '2026-11-20');
    expect(saved.dayLog).toHaveLength(1);
    // The file comes back from outside, renamed, with new ids and its log read in them.
    const loaded = { ...base, members: people('m-new'), tree: [{ id: 'P1', name: 'Project' }, { id: 'P1.1', name: 'Task renamed', best: 2, assign: ['m-new'] }],
      dayLog: [{ day: '2026-11-20', back: { tree: { unset: { 'P1.1': ['assign'] } } } }] };
    const next = recordToday(inIdsOf(saved, loaded), loaded, '2026-11-20');
    const yesterday = planAtEndOf(next, '2026-11-19');
    expect(yesterday.tree[1].name).toBe('Task');
    expect(yesterday.tree[1].assign).toBeUndefined();
    expect(JSON.stringify(next.dayLog)).not.toContain('m-old');
  });
});
