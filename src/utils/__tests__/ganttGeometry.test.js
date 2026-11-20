import { describe, it, expect } from 'vitest';
import { createGeometry, buildMonths, monthHeaderLabel, weekHeaderLabel } from '../gantt/geometry.js';

// Three weeks, Monday 2030-01-28 to Sunday 2030-02-17, with Mon-Fri as work days.
const mondays = [new Date(2030, 0, 28), new Date(2030, 1, 4), new Date(2030, 1, 11)];
const weeks = mondays.map((mon, i) => ({
  mon,
  kw: `${5 + i}`,
  wds: [0, 1, 2, 3, 4].map(d => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + d)),
}));

describe('gantt geometry', () => {
  const { DPX, dateToX, weekIndexOfDate, scheduledWorkDaysOf } = createGeometry({ weeks, WPX: 70 });

  it('puts a day at its column inside the week', () => {
    expect(DPX).toBe(10);
    expect(dateToX(new Date(2030, 0, 28))).toBe(0);
    expect(dateToX(new Date(2030, 0, 30))).toBe(20);
    expect(dateToX(new Date(2030, 1, 3))).toBe(60); // Sunday is the last column
    expect(dateToX(new Date(2030, 1, 5))).toBe(70 + 10);
  });

  it('clamps dates outside the window to its edges', () => {
    expect(dateToX(null)).toBe(0);
    expect(dateToX(new Date(2030, 0, 1))).toBe(0);
    expect(dateToX(new Date(2031, 0, 1))).toBe(3 * 70);
  });

  it('finds the week of a date, the last one for later dates', () => {
    expect(weekIndexOfDate('2030-02-05')).toBe(1);
    expect(weekIndexOfDate(new Date(2030, 0, 28))).toBe(0);
    expect(weekIndexOfDate('2035-01-01')).toBe(2);
    expect(weekIndexOfDate(null)).toBe(-1);
  });

  it('counts the work days a scheduled item covers', () => {
    expect(scheduledWorkDaysOf({ startD: new Date(2030, 0, 30), endD: new Date(2030, 1, 5) })).toBe(5);
    expect(scheduledWorkDaysOf({ workingDaysInWindow: 2.2 })).toBe(3);
    expect(scheduledWorkDaysOf({ startWi: 0, endWi: 1 })).toBe(10);
    expect(scheduledWorkDaysOf({})).toBe(1);
  });

  it('groups weeks by the month of their Monday', () => {
    expect(buildMonths(weeks)).toEqual([
      { ym: '2030-0', count: 1, start: 0 },
      { ym: '2030-1', count: 2, start: 1 },
    ]);
    expect(buildMonths([])).toEqual([]);
  });

  it('shortens the month label as the column narrows', () => {
    const m = { ym: '2030-2', count: 4 };
    expect(monthHeaderLabel(m, { WPX: 20, zoomMode: 'week' })).toBe("Mar '30");
    expect(monthHeaderLabel(m, { WPX: 12, zoomMode: 'week' })).toBe('Mar');
    expect(monthHeaderLabel(m, { WPX: 6, zoomMode: 'week' })).toBe('');
    expect(monthHeaderLabel({ ym: '2030-0', count: 4 }, { WPX: 12, zoomMode: 'month' })).toBe('Jan 30');
    expect(monthHeaderLabel({ ym: '2030-0', count: 2 }, { WPX: 10, zoomMode: 'month' })).toBe('30');
  });

  it('thins out the week labels when zoomed out', () => {
    const w = { mon: new Date(2030, 0, 28), kw: '5' };
    expect(weekHeaderLabel(w, 1, false, true, { WPX: 10 })).toBe('5');
    expect(weekHeaderLabel(w, 1, false, false, { WPX: 10 })).toBe('');
    expect(weekHeaderLabel(w, 1, true, false, { WPX: 10 })).toBe('30');
    expect(weekHeaderLabel(w, 1, false, false, { WPX: 16 })).toBe('');
    expect(weekHeaderLabel(w, 2, false, false, { WPX: 16 })).toBe('5');
    expect(weekHeaderLabel(w, 1, false, false, { WPX: 30 })).toBe('5');
  });
});
