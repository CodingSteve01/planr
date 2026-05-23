import { describe, expect, test } from 'vitest';
import { inferGanttViewStart } from '../viewWindow.js';

describe('inferGanttViewStart', () => {
  test('starts two weeks before the earliest historical task start', () => {
    const tree = [
      { id: 'P1', name: 'Root' },
      { id: 'P1.1', name: 'Done', status: 'done', completedStart: '2026-03-10', completedEnd: '2026-03-20' },
    ];

    expect(inferGanttViewStart(tree, '2026-04-01')).toBe('2026-02-24');
  });

  test('keeps an explicitly earlier view start', () => {
    const tree = [
      { id: 'P1.1', status: 'done', completedStart: '2026-03-10' },
    ];

    expect(inferGanttViewStart(tree, '2026-04-01', '2026-01-01')).toBe('2026-01-01');
  });

  test('uses plan start when there is no earlier task date', () => {
    const tree = [
      { id: 'P1.1', status: 'open', pinnedStart: '2026-05-01' },
    ];

    expect(inferGanttViewStart(tree, '2026-04-01')).toBe('2026-04-01');
  });
});
