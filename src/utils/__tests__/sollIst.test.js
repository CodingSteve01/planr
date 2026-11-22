import { describe, test, expect } from 'vitest';
import { computeSollIst, aggregateSollIst } from '../sollIst.js';

const WD = new Set([1, 2, 3, 4, 5]);
const ctx = { workDays: WD, holidayIso: [] };

// Soll = best × factor (factor 1 here), Ist = working days between the dates.
const done = (id, best, start, end) => ({ id, name: id, status: 'done', best, factor: 1, completedStart: start, completedEnd: end });

// Mon–Thu = 4 working days, Mon–Wed = 3.
const tasks = () => [
  done('a', 2, '2026-03-02', '2026-03-05'),
  done('b', 4, '2026-03-09', '2026-03-12'),
  done('c', 6, '2026-03-16', '2026-03-18'),
];

describe('computeSollIst()', () => {
  test('open or undated tasks give null', () => {
    expect(computeSollIst({ status: 'open', best: 2 }, ctx)).toBeNull();
    expect(computeSollIst({ status: 'done', best: 2 }, ctx)).toBeNull();
    expect(computeSollIst(null, ctx)).toBeNull();
  });

  test('over, on and under target with the delta in days and percent', () => {
    const [a, b, c] = tasks().map(t => computeSollIst(t, ctx));
    expect(a.ist.workDays).toBe(4);
    expect(a.delta).toEqual({ workDays: 2, percent: 100, tone: 'over' });
    expect(b.delta).toEqual({ workDays: 0, percent: 0, tone: 'on' });
    expect(c.ist.workDays).toBe(3);
    expect(c.delta).toEqual({ workDays: -3, percent: -50, tone: 'under' });
  });

  test('counts weekends and holidays as confounders, not as work', () => {
    // Fri 6 Mar to Tue 10 Mar: Fri, Mon (holiday), Tue → 2 working days, 2 weekend days.
    const r = computeSollIst(done('x', 2, '2026-03-06', '2026-03-10'), { workDays: WD, holidayIso: ['2026-03-09'] });
    expect(r.ist.workDays).toBe(2);
    expect(r.ist.calDays).toBe(5);
    expect(r.confounders.weekends).toBe(2);
    expect(r.confounders.holidays).toBe(1);
  });
});

describe('aggregateSollIst()', () => {
  test('the ratio is the sum of Ist over the sum of Soll, not a median', () => {
    const r = aggregateSollIst(tasks(), ctx);
    expect(r.count).toBe(3);
    expect(r.sollSum).toBe(12);
    expect(r.istSum).toBe(11);
    expect(r.ratio).toBeCloseTo(11 / 12, 10);
    // The per-task ratios are 2, 1 and 0.5, whose median is 1: not what is reported.
    expect(r.ratio).not.toBe(1);
    expect(r.hits).toBe(1);
    expect(r.hitRate).toBeCloseTo(1 / 3, 10);
  });

  test('overruns and underruns are named and sorted by deviation', () => {
    const r = aggregateSollIst(tasks(), ctx);
    expect(r.overruns.map(e => e.id)).toEqual(['a']);
    expect(r.underruns.map(e => e.id)).toEqual(['c']);
  });

  test('nothing finished → empty aggregate with null ratio', () => {
    const r = aggregateSollIst([{ id: 'z', status: 'open', best: 3 }], ctx);
    expect(r.count).toBe(0);
    expect(r.ratio).toBeNull();
    expect(r.hitRate).toBeNull();
  });
});
