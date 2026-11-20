import { describe, it, expect } from 'vitest';
import {
  buildHolidayDays,
  buildVacBands,
  buildResourceLoad,
  buildLoadRiskSummary,
  buildLoadWeekSummary,
  taskLoadCells,
} from '../gantt/loadModel.js';
import { createGeometry } from '../gantt/geometry.js';

const WPX = 70;
const mondays = [new Date(2030, 0, 28), new Date(2030, 1, 4)];
const weeks = mondays.map((mon, i) => ({
  mon,
  kw: `${5 + i}`,
  wds: [0, 1, 2, 3, 4].map(d => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + d)),
}));
const { DPX, dateToX, scheduledWorkDaysOf } = createGeometry({ weeks, WPX });
const t = key => key;
const anna = { id: 'anna', name: 'Anna Noor' };
const ben = { id: 'ben', name: 'Ben Ortiz' };
const memberById = { anna, ben };

const load = ({ items, vacByPerson = {} }) =>
  buildResourceLoad({
    allItems: items,
    iMap: {},
    memberById,
    members: [anna, ben],
    vacByPerson,
    weeks,
    meetingPlans: [],
    teams: [],
    todayIso: '2030-01-01',
    capacityAt: () => 1,
    scheduledWorkDaysOf,
  });
// Five work days of effort spread over the first week.
const alphaTask = {
  id: 'T1',
  name: 'Alpha Task',
  assign: ['anna'],
  effort: 5,
  startD: weeks[0].wds[0],
  endD: weeks[0].wds[4],
  status: 'open',
};

describe('holidays and vacation bands', () => {
  it('lists the work days a week is missing as holiday columns', () => {
    const w = [{ ...weeks[0], wds: weeks[0].wds.filter((_, i) => i !== 2) }];
    const out = buildHolidayDays({ weeks: w, wdSet: new Set([1, 2, 3, 4, 5]), WPX, DPX });
    expect(out).toEqual([{ x: 2 * DPX, iso: '2030-01-30' }]);
  });

  it('builds one strip per person away and skips vacations outside the window', () => {
    const vacByPerson = {
      anna: [
        { from: '2030-01-29', to: '2030-01-30', note: 'Trip' },
        { from: '2031-01-01', to: '2031-01-02' },
      ],
    };
    const out = buildVacBands({ allItems: [alphaTask], vacByPerson, memberById, tw: 2 * WPX, DPX, dateToX });
    expect(out.T1).toHaveLength(1);
    expect(out.T1[0]).toMatchObject({
      personName: 'Anna Noor',
      firstName: 'Anna',
      note: 'Trip',
      nBands: 1,
      lane: 0,
      x1: DPX,
      width: 2 * DPX,
    });
  });
});

describe('resource load', () => {
  it('spreads effort over the days the person works and reports the percentage', () => {
    const rows = load({ items: [alphaTask] }).anna;
    expect(rows[0].load).toBe(5);
    expect(rows[0].availability).toBe(5);
    expect(rows[0].percent).toBe(100);
    expect(rows[0].isPlanningRisk).toBe(true);
    expect(rows[1].load).toBe(0);
  });

  it('does not count vacation days as load or availability', () => {
    const vacByPerson = { anna: [{ from: '2030-01-30', to: '2030-01-31' }] };
    const row = load({ items: [alphaTask], vacByPerson }).anna[0];
    expect(row.availability).toBe(3);
    expect(row.load).toBe(5);
    expect(row.percent).toBe(167);
  });

  it('marks finished work as history, not as a planning risk', () => {
    const row = load({ items: [{ ...alphaTask, status: 'done' }] }).anna[0];
    expect(row.historicalOnly).toBe(true);
    expect(row.isPlanningRisk).toBe(false);
  });
});

describe('load summaries', () => {
  const resourceLoadByWeek = load({ items: [{ ...alphaTask, effort: 6 }] });

  it('counts an overloaded week once in the risk summary', () => {
    const out = buildLoadRiskSummary({ resourceLoadByWeek, memberById, t });
    expect(out).toMatchObject({ overCount: 1, fullCount: 0, maxPercent: 120, historicalCount: 0 });
    expect(out.tip).toContain('Anna Noor');
  });

  it('summarises each week, with the quiet one marked as empty', () => {
    const out = buildLoadWeekSummary({ weeks, resourceLoadByWeek, memberById, t });
    expect(out[0]).toMatchObject({ wi: 0, kw: '5', maxPercent: 120, overCount: 1, totalLoad: 6 });
    expect(out[1]).toMatchObject({ wi: 1, maxPercent: 0, totalLoad: 0, tip: 'g.loadNoWork' });
  });
});

describe('taskLoadCells', () => {
  const resourceLoadByWeek = load({ items: [alphaTask] });
  const ctx = { showLoadHeatmap: true, resourceLoadByWeek, weeks, WPX };

  it('returns one clipped cell per week the bar touches', () => {
    const cells = taskLoadCells(ctx, { assign: ['anna'] }, 30, 60);
    expect(cells.map(c => [c.wi, c.left, c.width])).toEqual([
      [0, 0, 40],
      [1, 40, 20],
    ]);
    expect(cells[0].percent).toBe(100);
  });

  it('returns nothing when the heatmap is off, the task has no bar or nobody is assigned', () => {
    expect(taskLoadCells({ ...ctx, showLoadHeatmap: false }, { assign: ['anna'] }, 0, 60)).toEqual([]);
    expect(taskLoadCells(ctx, { assign: ['anna'] }, 0, 0)).toEqual([]);
    expect(taskLoadCells(ctx, { assign: ['zoe'] }, 0, 60)).toEqual([]);
  });
});
