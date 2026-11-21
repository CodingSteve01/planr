import { describe, it, expect } from 'vitest';
import { shortInitials, scheduleRanges, siblingPosition } from '../tree/derive.js';

describe('short initials', () => {
  it('uses initials, two letters for a single name, and numbers collisions', () => {
    const map = shortInitials([
      { id: 'm1', name: 'Anna Noor' },
      { id: 'm2', name: 'Bo' },
      { id: 'm3', name: 'Arne Nolte' },
      { id: 'm4', name: '' },
    ]);
    expect(map).toEqual({ m1: 'AN1', m2: 'BO', m3: 'AN2', m4: '?' });
    expect(shortInitials(undefined)).toEqual({});
  });
});

describe('schedule ranges', () => {
  const tree = [{ id: 'A1' }, { id: 'A1.1' }, { id: 'A1.2', status: 'done', completedAt: '2026-03-10' }, { id: 'B1' }];
  const sMap = { 'A1.1': { startD: new Date(2026, 2, 2), endD: new Date(2026, 2, 4) } };

  it('spans a parent over its children and prefers the actual window of a done leaf', () => {
    const map = scheduleRanges(tree, sMap);
    expect(map['A1.1']).toEqual({ start: new Date(2026, 2, 2), end: new Date(2026, 2, 4) });
    expect(map['A1.2'].start).toEqual(new Date(2026, 2, 10));
    expect(map['A1']).toEqual({ start: new Date(2026, 2, 2), end: new Date(2026, 2, 10) });
  });

  it('gives a node without any window null', () => {
    expect(scheduleRanges(tree, sMap).B1).toBeNull();
  });
});

describe('sibling position', () => {
  const tree = [{ id: 'A1' }, { id: 'A2' }, { id: 'B1' }, { id: 'A2.1' }, { id: 'A2.2' }, { id: 'A2.10' }];

  it('is null without a selection', () => {
    expect(siblingPosition(tree, undefined)).toBeNull();
  });

  it('ranks roots within their prefix and children within their parent', () => {
    expect(siblingPosition(tree, 'A2')).toEqual({ idx: 1, count: 2 });
    expect(siblingPosition(tree, 'B1')).toEqual({ idx: 0, count: 1 });
    expect(siblingPosition(tree, 'A2.10')).toEqual({ idx: 2, count: 3 });
  });
});
