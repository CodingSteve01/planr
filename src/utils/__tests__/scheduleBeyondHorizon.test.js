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

    test('endWi is the week of endD and the span stays consistent', () => {
      const { r, weeks } = go();
      const inGrid = weeks.findIndex(w => w.wds.some(d => +d === +r.endD) || +w.mon === +r.endD);
      if (inGrid >= 0) expect(r.endWi).toBe(inGrid);
      expect(r.endWi).toBeGreaterThanOrEqual(r.startWi);
      expect(r.weeks).toBe(r.endWi - r.startWi + 1);
      expect(r.calDays).toBe(Math.round((r.endD - r.startD) / 864e5) + 1);
    });

    test('counts as overdue when it has a due date', () => {
      const dated = { ...second(assign), due: '2030-12-31' };
      const { results } = run([root, first(assign, effort), dated], members, vacationsOf(members));
      expect(results.find(x => x.id === 'P1.2').dueOverdue).toBe(true);
    });

    test('is marked as beyond the horizon, the task that fits is not', () => {
      const { results, r } = go();
      expect(r.beyondHorizon).toBe(true);
      expect(results.find(x => x.id === 'P1.1').beyondHorizon).toBeFalsy();
    });
  });
});
