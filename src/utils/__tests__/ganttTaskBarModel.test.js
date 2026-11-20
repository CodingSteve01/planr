// What a task's bar derives from its row, the drag in progress and the
// view's geometry: where it sits, how wide it is, which handles it shows.
import { describe, it, expect } from 'vitest';
import { buildTaskBarModel } from '../gantt/taskBarModel.js';

const DAY = 20;
const day0 = new Date(2026, 0, 5);
const d = n => new Date(2026, 0, 5 + n);
const dateToX = date => Math.round((date - day0) / 86400000) * DAY;
const ctx = extra => ({
  drag: null,
  dateToX,
  DPX: DAY,
  WPX: 140,
  dDelta: 0,
  showDays: true,
  resizePxPerDay: DAY,
  cpOnly: false,
  rowRelevantToCp: () => true,
  hoverDepId: null,
  hoverLines: { rowIds: new Set() },
  searchMatches: null,
  iMap: {},
  selectedIds: new Set(),
  scheduledWorkDaysOf: () => 5,
  taskLoadCells: () => [],
  tw: 2000,
  confidence: {},
  now: d(2),
  ...extra,
});
const bar = (extra = {}) => ({ id: 'P1.1', status: 'open', startD: d(1), endD: d(5), startWi: 0, endWi: 0, ...extra });
const row = (s, node = { id: s.id, best: 5, factor: 1 }) => ({ type: 'task', s, node });
const model = (s, c = {}, node) => buildTaskBarModel(row(s, node), s, '#3b82f6', false, ctx(c));

describe('where a bar sits', () => {
  it('follows the scheduled days, inset by two pixels on each side', () => {
    const m = model(bar());
    expect(m.barLeft).toBe(1 * DAY + 2);
    expect(m.bW).toBe(5 * DAY - 4);
  });

  it('falls back to whole weeks when there are no dates', () => {
    const m = model(bar({ startD: null, endD: null, startWi: 2, endWi: 3 }));
    expect(m.barLeft).toBe(2 * 140 + 2);
    expect(m.bW).toBe(2 * 140 - 4);
  });

  it('moves with a drag, in days or in weeks, and never left of the start', () => {
    const s = bar();
    expect(model(s, { drag: { id: 'P1.1', kind: 'move' }, dDelta: 3 }).barLeft).toBe(22 + 3 * DAY);
    expect(model(s, { drag: { id: 'P1.1', kind: 'move' }, dDelta: 1, showDays: false }).barLeft).toBe(22 + 140);
    expect(model(s, { drag: { id: 'P1.1', kind: 'move' }, dDelta: -9 }).barLeft).toBe(0);
    // Somebody else's drag does not move this bar.
    expect(model(s, { drag: { id: 'P1.2', kind: 'move' }, dDelta: 3 }).barLeft).toBe(22);
  });

  it('grows with a resize of its end and keeps a minimum width', () => {
    const s = bar();
    expect(model(s, { drag: { id: 'P1.1', kind: 'resizeEnd' }, dDelta: 2 }).bW).toBe(96 + 2 * DAY);
    expect(model(s, { drag: { id: 'P1.1', kind: 'resizeEnd' }, dDelta: 2 }).barLeft).toBe(22);
    expect(model(s, { drag: { id: 'P1.1', kind: 'resizeEnd' }, dDelta: -20 }).bW).toBe(6);
  });
});

describe('the duration a resize previews', () => {
  it('adds the days dragged at the end, takes them off at the start of a done bar, and is at least one', () => {
    const s = bar();
    const base = { id: 'P1.1', baseDurationDays: 5 };
    expect(model(s, { drag: { ...base, kind: 'resizeEnd' }, dDelta: 2 }).resizePreviewDays).toBe(7);
    expect(model(s, { drag: { ...base, kind: 'resizeStartDone' }, dDelta: 2 }).resizePreviewDays).toBe(3);
    expect(model(s, { drag: { ...base, kind: 'resizeEnd' }, dDelta: -9 }).resizePreviewDays).toBe(1);
  });
});

describe('which handles a bar shows', () => {
  it('an open bar resizes at its end, a done bar at both, and neither below 30 pixels', () => {
    const open = model(bar());
    expect([open.showResizeHandle, open.showResizeStartHandle]).toEqual([true, false]);
    const done = model(bar({ status: 'done' }));
    expect([done.showResizeHandle, done.showResizeStartHandle]).toEqual([true, true]);
    const narrow = model(bar({ endD: d(1) }));
    expect(narrow.bW).toBe(16);
    expect([narrow.showResizeHandle, narrow.showResizeStartHandle]).toEqual([false, false]);
  });

  it('an unestimated bar and a handoff stage have no handle', () => {
    expect(model(bar({ _unestimated: true })).showResizeHandle).toBe(false);
    expect(model(bar({ isHandoff: true })).showResizeHandle).toBe(false);
  });

  it('calls a bar compact below 36 pixels and micro below 16', () => {
    expect([model(bar()).compactBar, model(bar()).microBar]).toEqual([false, false]);
    const oneDay = model(bar({ endD: d(1) }));
    expect([oneDay.compactBar, oneDay.microBar]).toEqual([true, false]);
  });
});

describe('what a bar says about its dates', () => {
  it('a due date that has passed is overdue unless the task is done; the schedule can say so too', () => {
    const due = { id: 'P1.1', best: 5, factor: 1, due: '2026-01-06' };
    expect(!!model(bar(), {}, due).isDueOverdue).toBe(true);
    expect(!!model(bar({ status: 'done' }), {}, due).isDueOverdue).toBe(false);
    const later = { id: 'P1.1', best: 5, factor: 1, due: '2026-02-01' };
    expect(!!model(bar(), {}, later).isDueOverdue).toBe(false);
    expect(!!model(bar({ dueOverdue: true }), {}, later).isDueOverdue).toBe(true);
  });

  it('marks what the search does not match, and what is selected', () => {
    const m = model(bar(), { searchMatches: new Set(['P9']), selectedIds: new Set(['P1.1']) });
    expect([m.isMatch, m.searchDimmed, m.isSelected]).toEqual([false, true, true]);
    expect(model(bar(), { searchMatches: new Set() }).searchDimmed).toBe(false);
  });
});
