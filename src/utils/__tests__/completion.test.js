import { describe, expect, test } from 'vitest';
import { normalizeCompletedWindows } from '../completion.js';

describe('normalizeCompletedWindows', () => {
  test('returns the recorded window verbatim, even when overlapping a predecessor', () => {
    // Earlier versions silently shifted overlapping done items past their
    // predecessors and then re-anchored against today. That hid the actual
    // recorded dates. Now the window is what the user typed in.
    const tree = [
      { id: 'P1', name: 'Root', status: 'done' },
      { id: 'P1.1', name: 'First', status: 'done', assign: ['M1'], completedStart: '2026-01-05', completedEnd: '2026-01-09', completedAt: '2026-01-09' },
      { id: 'P1.2', name: 'Second', status: 'done', assign: ['M1'], softDeps: ['P1.1'], completedStart: '2026-01-07', completedEnd: '2026-01-13', completedAt: '2026-01-13' },
    ];

    const windows = normalizeCompletedWindows(tree, { workDays: [1, 2, 3, 4, 5] });

    expect(windows.get('P1.1')).toMatchObject({ start: '2026-01-05', end: '2026-01-09', adjusted: false });
    expect(windows.get('P1.2')).toMatchObject({ start: '2026-01-07', end: '2026-01-13', adjusted: false });
  });

  test('returns the recorded window for serial done items unchanged', () => {
    const tree = [
      { id: 'P1', name: 'Root', status: 'done' },
      { id: 'P1.1', name: 'First', status: 'done', assign: ['M1'], completedStart: '2026-01-05', completedEnd: '2026-01-09', completedAt: '2026-01-09' },
      { id: 'P1.2', name: 'Second', status: 'done', assign: ['M1'], deps: ['P1.1'], completedStart: '2026-01-12', completedEnd: '2026-01-14', completedAt: '2026-01-14' },
    ];

    const windows = normalizeCompletedWindows(tree, { workDays: [1, 2, 3, 4, 5] });

    expect(windows.get('P1.2')).toMatchObject({ start: '2026-01-12', end: '2026-01-14', adjusted: false });
  });
});
