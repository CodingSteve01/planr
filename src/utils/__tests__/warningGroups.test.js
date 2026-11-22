import { describe, test, expect } from 'vitest';
import { warningGroups } from '../warningGroups.js';

describe('warningGroups', () => {
  const rows = [
    { id: 'A', beyondHorizon: true, dueOverdue: true, due: '2026-01-10', status: 'open' },
    { id: 'B', dueOverdue: true, due: '2026-01-10', status: 'open' },
    { id: 'C', beyondHorizon: true, status: 'open' },
    { id: 'D', truncatedByOffboard: { remainingEffort: 1 }, status: 'open' },
  ];

  test('a beyond-horizon task with a due date is counted once, in the beyond group', () => {
    const g = warningGroups(rows);
    expect(g.beyond.map(s => s.id)).toEqual(['A', 'C']);
    expect(g.dueViolations.map(s => s.id)).toEqual(['B']);
    expect(g.truncated.map(s => s.id)).toEqual(['D']);
    expect(g.count).toBe(4);
  });
});
