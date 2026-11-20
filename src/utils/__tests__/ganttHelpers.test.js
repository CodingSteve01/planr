import { describe, it, expect } from 'vitest';
import { normalizeViewMode, fmtLoadDays, personIdsOf, loadHeatStroke, rowDrawsBar } from '../gantt/helpers.js';

describe('gantt helpers', () => {
  it('maps the old grouping names onto the current ones', () => {
    expect(normalizeViewMode('person')).toBe('resource');
    expect(normalizeViewMode('projteam')).toBe('team');
    expect(normalizeViewMode('thread')).toBe('thread');
    expect(normalizeViewMode('')).toBe('project');
  });

  it('prints load in days with at most one decimal', () => {
    expect(fmtLoadDays(3)).toBe('3d');
    expect(fmtLoadDays(2.25)).toBe('2.3d');
    expect(fmtLoadDays(undefined)).toBe('0d');
  });

  it('lists each person of an item once', () => {
    expect(personIdsOf({ personId: 'M1', assign: ['M1', 'M2'] })).toEqual(['M1', 'M2']);
    expect(personIdsOf({})).toEqual([]);
  });

  it('bands the load into free, busy, full and over', () => {
    expect(loadHeatStroke(0)).toBe('var(--b2)');
    expect(loadHeatStroke(89)).toBe('var(--st-done)');
    expect(loadHeatStroke(110)).toBe('var(--st-wip)');
    expect(loadHeatStroke(111)).toBe('var(--st-risk)');
    expect(loadHeatStroke(200, { historicalOnly: true })).toBe('var(--b3)');
  });

  it('draws a bar only for an estimated task with dates when finished', () => {
    const d = new Date(2026, 0, 5);
    expect(rowDrawsBar({ type: 'task', s: {} })).toBe(true);
    expect(rowDrawsBar({ type: 'task', s: { _unestimated: true } })).toBe(false);
    expect(rowDrawsBar({ type: 'task', s: { _completed: true, startD: d } })).toBe(false);
    expect(rowDrawsBar({ type: 'task', s: { _completed: true, startD: d, endD: d } })).toBe(true);
    expect(rowDrawsBar({ type: 'summary', s: {} })).toBe(false);
  });
});
