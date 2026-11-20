import { describe, it, expect } from 'vitest';
import { computeRowLayout } from '../gantt/rowLayout.js';

const RH = 30;
const WPX = 100;
const DPX = 20;
const task = (key, startWi, endWi) => ({ type: 'task', key, s: { startWi, endWi } });
const group = key => ({ type: 'group', key, children: [] });
const base = rows => ({
  visibleRows: rows,
  RH,
  WPX,
  DPX,
  dateToX: () => 0,
  collapsed: new Set(),
  rowDepth: new Map(rows.map(r => [r, 0])),
});

describe('computeRowLayout', () => {
  it('classic mode stacks one row per line', () => {
    const rows = [group('a'), task('t1', 0, 1), task('t2', 0, 1)];
    const out = computeRowLayout({ ...base(rows), compact: false });
    expect(out.tops).toEqual([0, RH, 2 * RH]);
    expect(out.height).toBe(3 * RH);
    expect(out.lanes).toBeNull();
  });

  it('compact mode puts overlapping bars on separate lanes and reuses a free lane', () => {
    const g = group('a');
    const rows = [g, task('t1', 0, 1), task('t2', 1, 2), task('t3', 2, 3)];
    const ctx = base(rows);
    ctx.rowDepth = new Map(rows.map(r => [r, r === g ? 0 : 1]));
    const out = computeRowLayout({ ...ctx, compact: true });
    // t1 spans weeks 0-1, t2 overlaps it, t3 starts where t1 ended and takes lane 0 again.
    expect(out.lanes).toEqual([0, 0, 1, 0]);
    expect(out.tops[1]).toBe(RH);
    expect(out.height).toBe(3 * RH);
  });

  it('a task without a bar takes no lane', () => {
    const g = group('a');
    const rows = [g, { type: 'task', key: 'x', s: { _unestimated: true } }];
    const ctx = base(rows);
    ctx.rowDepth = new Map([
      [g, 0],
      [rows[1], 1],
    ]);
    const out = computeRowLayout({ ...ctx, compact: true });
    expect(out.lanes[1]).toBe(-1);
  });
});
