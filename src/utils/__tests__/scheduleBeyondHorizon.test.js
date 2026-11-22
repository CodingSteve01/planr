import { describe, test, expect } from 'vitest';
import { schedule } from '../scheduler.js';

// A task for which no working day fits before the plan horizon must neither
// end before it starts nor look like an ordinary one-day task.
const run = (tree, members, vacations = []) =>
  schedule(tree, members, vacations, '2026-01-05', '2026-01-23', {}, [1, 2, 3, 4, 5], '2026-01-05', {
    now: '2026-01-05',
    anchorToToday: false,
    discountProgress: false,
  });

const anna = { id: 'M1', name: 'Anna Noor', team: 'Frontend', cap: 1, vac: 25, start: '2026-01-01' };
const ben = { id: 'M2', name: 'Ben Ortiz', team: 'Frontend', cap: 1, vac: 25, start: '2026-01-01' };
const root = { id: 'P1', name: 'Rechnungen', team: '', best: 0 };
const first = (assign, best) => ({ id: 'P1.1', name: 'Layout', team: 'Frontend', best, factor: 1, assign, status: 'open' });
const second = assign => ({ id: 'P1.2', name: 'Polish', team: 'Frontend', best: 3, factor: 1, assign, deps: ['P1.1'], status: 'open' });
const away = people => people.map(person => ({ person, from: '2026-01-12', to: '2026-01-23', note: '' }));

const branches = [
  ['assigned task', [anna], ['M1']],
  ['team-slot task', [anna, ben], []],
];
// "horizon": the predecessor eats the whole plan, so the start lies past it.
// "absence": the start lies inside the plan, but everyone is away from then on.
const scenarios = [
  ['dependency ends at the horizon', 30, () => []],
  ['everyone is away for the rest of the plan', 5, members => away(members.map(m => m.id))],
];

describe.each(branches)('%s', (_branch, members, assign) => {
  describe.each(scenarios)('when %s', (_scenario, effort, vacationsOf) => {
    const go = () => {
      const { results, weeks } = run([root, first(assign, effort), second(assign)], members, vacationsOf(members));
      return { results, weeks, r: results.find(x => x.id === 'P1.2') };
    };

    test('ends no earlier than it starts', () => {
      const { r } = go();
      expect(r.startD <= r.endD).toBe(true);
    });

    test('week fields are clamped to the grid, dates stay real, and the span is consistent', () => {
      const { r, weeks } = go();
      const last = weeks.length - 1;
      const inGrid = weeks.findIndex(w => +r.endD >= +w.mon && +r.endD < +w.mon + 7 * 864e5);
      // Contract: endWi is the week of endD, or the last grid week when endD lies past the grid.
      expect(r.endWi).toBe(inGrid >= 0 ? inGrid : last);
      const startIn = weeks.findIndex(w => +r.startD >= +w.mon && +r.startD < +w.mon + 7 * 864e5);
      expect(r.startWi).toBe(startIn >= 0 ? startIn : last);
      expect(r.startWi).toBeLessThanOrEqual(r.endWi);
      expect(r.startWi).toBeLessThanOrEqual(last);
      expect(r.weeks).toBe(r.endWi - r.startWi + 1);
      expect(r.calDays).toBe(Math.round((r.endD - r.startD) / 864e5) + 1);
    });

    test('counts as overdue when it has a due date', () => {
      const dated = { ...second(assign), due: '2030-12-31' };
      const { results } = run([root, first(assign, effort), dated], members, vacationsOf(members));
      expect(results.find(x => x.id === 'P1.2').dueOverdue).toBe(true);
    });

    test('is marked as beyond the horizon', () => {
      expect(go().r.beyondHorizon).toBe(true);
    });
  });
});

// Effort that starts inside the plan but only partly fits before its end.
describe.each(branches)('%s with a task that fits only partly', (_branch, members, assign) => {
  test('a task that fits completely is not marked', () => {
    const { results } = run([root, first(assign, 5), second(assign)], members);
    expect(results.find(x => x.id === 'P1.1').beyondHorizon).toBeFalsy();
    expect(results.find(x => x.id === 'P1.2').beyondHorizon).toBeFalsy();
  });

  test('is marked when the grid runs out before its effort does', () => {
    const { results, weeks } = run([root, first(assign, 30)], members);
    const r = results.find(x => x.id === 'P1.1');
    expect(r.beyondHorizon).toBe(true);
    expect(r.endWi).toBe(weeks.length - 1);
    expect(r.weeks).toBe(r.endWi - r.startWi + 1);
  });

  test('a fixed-duration task running past the grid is marked, one inside is not', () => {
    const fixed = days => ({ ...first(assign, 0), fixedDurationDays: days });
    const over = run([root, fixed(30)], members).results.find(x => x.id === 'P1.1');
    const inside = run([root, fixed(5)], members).results.find(x => x.id === 'P1.1');
    expect(over.beyondHorizon).toBe(true);
    expect(inside.beyondHorizon).toBeFalsy();
  });
});

describe('fan-out batches', () => {
  test('followers carry the leader beyondHorizon marker', () => {
    const sibling = id => ({ id, name: id, team: 'Frontend', best: 20, factor: 1, assign: ['M1'], deps: ['P1.1'], status: 'open' });
    const { results } = run([root, first(['M1'], 2), sibling('P1.2'), sibling('P1.3')], [anna]);
    const rows = ['P1.2', 'P1.3'].map(id => results.find(x => x.id === id));
    expect(rows.some(x => x._autoParallel)).toBe(true);
    expect(rows.map(x => x.beyondHorizon)).toEqual([true, true]);
  });
});

// An end date only is an offboard cut when it falls before the end of the grid.
describe.each(branches)('%s with an end date', (_branch, members, assign) => {
  const only = end => {
    const people = members.map(m => ({ ...m, end }));
    return run([root, first(assign, 30)], people).results.find(x => x.id === 'P1.1');
  };

  test('after the plan end, the grid runs out first: horizon overrun, not an offboard cut', () => {
    const r = only('2030-01-01');
    expect(r.beyondHorizon).toBe(true);
    expect(r.truncatedByOffboard).toBeFalsy();
  });

  // The plan ends on Friday 2026-01-23. Leaving on that day or on the weekend
  // after it takes no working day out of the grid.
  test.each(['2026-01-23', '2026-01-24'])('on the last grid day or just after (%s): horizon overrun', end => {
    const r = only(end);
    expect(r.beyondHorizon).toBe(true);
    expect(r.truncatedByOffboard).toBeFalsy();
  });

  test('inside the grid, the person leaves first: offboard cut, not a horizon overrun', () => {
    const r = only('2026-01-14');
    expect(r.truncatedByOffboard).toBeTruthy();
    expect(r.beyondHorizon).toBeFalsy();
  });
});

describe.each(branches)('%s with a WIP task pulled back', (_branch, members, assign) => {
  test('startWi follows the pulled-back start date', () => {
    const wip = { ...second(assign), best: 10, status: 'wip', progress: 50, deps: [] };
    // One blocker per person, so the WIP task starts in week 1 and is pulled back into week 0.
    const blockers = members.map((m, i) => ({ ...first(assign, 5), id: `B${i}` }));
    const { results, weeks } = schedule(
      [root, ...blockers, wip],
      members,
      [],
      '2026-01-05',
      '2026-01-23',
      {},
      [1, 2, 3, 4, 5],
      '2026-01-05',
      {
        now: '2026-01-05',
        anchorToToday: false,
        discountProgress: true,
      },
    );
    const r = results.find(x => x.id === 'P1.2');
    const idx = weeks.findIndex(w => +r.startD >= +w.mon && +r.startD < +w.mon + 7 * 864e5);
    expect(idx).toBe(0);
    expect(r.startWi).toBe(idx);
  });
});
