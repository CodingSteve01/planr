import { describe, it, expect } from 'vitest';
import { filterRows, collapseTargets, rowAfterDeleting } from '../tree/rows.js';

const rows = [
  { id: 'A1', name: 'Alpha Task', team: 'red', assign: [] },
  { id: 'A1.1', name: 'Beta Step', team: 'red', assign: ['anna'] },
  { id: 'A1.2', name: 'Gamma Step', team: 'blue', assign: [], note: 'Needs Review' },
  { id: 'B1', name: 'Delta Task', team: 'blue', assign: ['anna'] },
];
const none = {
  rootFilter: '',
  teamFilter: '',
  personFilter: '',
  search: '',
  diffKeepIds: null,
  horizonIds: null,
  horizonOnlyPlanned: false,
};
const ids = f => f.map(r => r.id);

describe('tree row filters', () => {
  it('passes everything through without a filter', () => {
    expect(ids(filterRows(rows, none))).toEqual(['A1', 'A1.1', 'A1.2', 'B1']);
  });

  it('narrows to a subtree', () => {
    expect(ids(filterRows(rows, { ...none, rootFilter: 'A1' }))).toEqual(['A1', 'A1.1', 'A1.2']);
  });

  it('keeps the ancestors of a team or person match', () => {
    expect(ids(filterRows(rows, { ...none, teamFilter: 'blue' }))).toEqual(['A1', 'A1.2', 'B1']);
    expect(ids(filterRows(rows, { ...none, personFilter: 'anna' }))).toEqual(['A1', 'A1.1', 'B1']);
  });

  it('searches id, name and note without case', () => {
    expect(ids(filterRows(rows, { ...none, search: 'review' }))).toEqual(['A1.2']);
    expect(ids(filterRows(rows, { ...none, search: 'b1' }))).toEqual(['B1']);
  });

  it('applies the horizon only when asked to', () => {
    const horizonIds = new Set(['A1.1']);
    expect(ids(filterRows(rows, { ...none, horizonIds }))).toHaveLength(4);
    expect(ids(filterRows(rows, { ...none, horizonIds, horizonOnlyPlanned: true }))).toEqual(['A1', 'A1.1']);
  });

  it('restricts to the diff ids', () => {
    expect(ids(filterRows(rows, { ...none, diffKeepIds: new Set(['B1']) }))).toEqual(['B1']);
  });
});

describe('collapse targets', () => {
  it('takes every parent without a selection', () => {
    expect(collapseTargets(rows, new Set())).toEqual(['A1']);
  });

  it('takes the selected parents and parents below them', () => {
    const deep = [...rows, { id: 'A1.2.1', name: 'Leaf' }];
    expect(collapseTargets(deep, new Set(['A1'])).sort()).toEqual(['A1', 'A1.2']);
    expect(collapseTargets(deep, new Set(['B1']))).toEqual([]);
  });
});

describe('row after deleting', () => {
  const visible = ['A1', 'A1.1', 'A1.2', 'B1'];
  it('prefers the row above, then the row below, then nothing', () => {
    expect(rowAfterDeleting(visible, rows, ['A1.1'])).toBe(rows[0]);
    expect(rowAfterDeleting(visible, rows, ['A1', 'A1.1'])).toBe(rows[2]);
    expect(rowAfterDeleting(visible, rows, visible)).toBeNull();
    expect(rowAfterDeleting(visible, rows, ['Z9'])).toBeNull();
  });
});
