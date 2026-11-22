// The three repairs a loaded plan goes through: every one of them returns
// "nothing to do" (null, or the same object) when the plan is already right,
// so the app does not re-render or mark the plan as changed for nothing.
import { describe, it, expect } from 'vitest';
import { migratedAutoHolidays, withDerivedTeamsAndStatuses, trimmedToHorizon } from '../app/planRepairs.js';
import { computeNRW } from '../utils/holidays.js';

describe('migratedAutoHolidays', () => {
  const fresh = computeNRW([2026]);
  const easter = fresh.find(h => h.name === 'Ostermontag');

  it('corrects an automatic holiday that carries the wrong date', () => {
    const wrong = fresh.map(h => (h.name === 'Ostermontag' ? { ...h, date: '2026-04-07' } : h));
    const out = migratedAutoHolidays(wrong, '2026-01-05', '2026-12-31');
    expect(out.find(h => h.name === 'Ostermontag').date).toBe(easter.date);
    expect(out.filter(h => h.name !== 'Ostermontag')).toEqual(fresh.filter(h => h.name !== 'Ostermontag'));
  });

  it('leaves a manual holiday alone, even when it shares a name with an automatic one', () => {
    const manual = { date: '2026-04-07', name: 'Ostermontag' };
    const wrong = [{ ...easter, date: '2026-04-08' }, manual];
    const out = migratedAutoHolidays(wrong, '2026-01-05', '2026-12-31');
    expect(out[0].date).toBe(easter.date);
    expect(out[1]).toBe(manual);
  });

  it('returns null when every automatic holiday already matches', () => {
    expect(migratedAutoHolidays(fresh, '2026-01-05', '2026-12-31')).toBeNull();
    expect(migratedAutoHolidays([{ date: '2026-02-03', name: 'Team day' }], '2026-01-05', '2026-12-31')).toBeNull();
  });
});

describe('withDerivedTeamsAndStatuses', () => {
  const anna = { id: 'AN', name: 'Anna Noor', team: 'Backend' };
  const leaf = (id, extra) => ({ id, name: id, ...extra });

  it('moves a task to the team of its first assignee when that person is not in the task team', () => {
    const d = { tree: [leaf('P1', { team: 'Frontend', assign: ['AN'] })] };
    const out = withDerivedTeamsAndStatuses(d, [anna]);
    expect(out).not.toBe(d);
    expect(out.tree[0].team).toBe('Backend');
  });

  it('derives the status of a parent from its leaves', () => {
    const d = { tree: [{ id: 'P1', name: 'Project', status: 'open' }, leaf('P1.1', { status: 'done' }), leaf('P1.2', { status: 'done' })] };
    const out = withDerivedTeamsAndStatuses(d, []);
    expect(out.tree.find(r => r.id === 'P1').status).toBe('done');
    expect(out.tree.find(r => r.id === 'P1.1').status).toBe('done');
  });

  it('returns the same object when teams and statuses are already right', () => {
    const d = {
      tree: [
        { id: 'P1', name: 'Project', status: 'wip' },
        leaf('P1.1', { status: 'done', team: 'Backend', assign: ['AN'] }),
        leaf('P1.2', { status: 'open', team: 'Backend' }),
      ],
    };
    expect(withDerivedTeamsAndStatuses(d, [anna])).toBe(d);
  });
});

describe('trimmedToHorizon', () => {
  const mon = iso => new Date(`${iso}T00:00:00`);
  const weeks = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-02-02', '2026-06-01'].map(d => ({ mon: mon(d) }));

  it('drops the weeks that start after the last end date plus the padding', () => {
    const out = trimmedToHorizon({ results: [{ endD: mon('2026-01-16') }], weeks }, 7);
    expect(out.weeks.map(w => w.mon.getDate())).toEqual([5, 12, 19]);
  });

  it('accepts end dates given as strings', () => {
    const out = trimmedToHorizon({ results: [{ endD: '2026-01-16' }], weeks }, 0);
    expect(out.weeks).toHaveLength(2);
  });

  it('keeps all weeks when nothing would be left', () => {
    const out = trimmedToHorizon({ results: [{ endD: mon('2025-01-01') }], weeks }, 0);
    expect(out.weeks).toBe(weeks);
  });
});
