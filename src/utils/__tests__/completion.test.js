import { describe, expect, test } from 'vitest';
import { normalizeCompletedWindows } from '../completion.js';

describe('normalizeCompletedWindows', () => {
  test('shifts linked done windows forward so serial history does not overlap', () => {
    const tree = [
      { id: 'P1', name: 'Root', status: 'done' },
      { id: 'P1.1', name: 'First', status: 'done', assign: ['M1'], completedStart: '2026-01-05', completedEnd: '2026-01-09', completedAt: '2026-01-09' },
      { id: 'P1.2', name: 'Second', status: 'done', assign: ['M1'], softDeps: ['P1.1'], completedStart: '2026-01-07', completedEnd: '2026-01-13', completedAt: '2026-01-13' },
    ];

    const windows = normalizeCompletedWindows(tree, { workDays: [1, 2, 3, 4, 5] });

    expect(windows.get('P1.1')).toMatchObject({ start: '2026-01-05', end: '2026-01-09', adjusted: false });
    expect(windows.get('P1.2')).toMatchObject({ start: '2026-01-12', end: '2026-01-16', adjusted: true });
  });

  test('does not move a linked done successor that is already serial', () => {
    const tree = [
      { id: 'P1', name: 'Root', status: 'done' },
      { id: 'P1.1', name: 'First', status: 'done', assign: ['M1'], completedStart: '2026-01-05', completedEnd: '2026-01-09', completedAt: '2026-01-09' },
      { id: 'P1.2', name: 'Second', status: 'done', assign: ['M1'], deps: ['P1.1'], completedStart: '2026-01-12', completedEnd: '2026-01-14', completedAt: '2026-01-14' },
    ];

    const windows = normalizeCompletedWindows(tree, { workDays: [1, 2, 3, 4, 5] });

    expect(windows.get('P1.2')).toMatchObject({ start: '2026-01-12', end: '2026-01-14', adjusted: false });
  });
});
