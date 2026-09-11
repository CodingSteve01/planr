import { describe, expect, test } from 'vitest';
import { normalizeCompletedWindows, statusChangePatch } from '../completion.js';
import { iso } from '../date.js';

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

describe('statusChangePatch', () => {
  const today = iso(new Date());

  test('open → wip stamps completedStart from today when nothing else is known', () => {
    const patch = statusChangePatch({ status: 'open' }, 'wip');
    expect(patch).toMatchObject({ status: 'wip', progress: 50, completedStart: today });
  });

  test('open → wip prefers an existing completedStart', () => {
    const patch = statusChangePatch({ status: 'open', completedStart: '2020-01-01' }, 'wip');
    expect(patch.completedStart).toBe('2020-01-01');
  });

  test('open → wip prefers plannedStart over today when it is not in the future', () => {
    const past = iso(new Date(Date.now() - 86400000));
    const patch = statusChangePatch({ status: 'open', plannedStart: past }, 'wip');
    expect(patch.completedStart).toBe(past);
  });

  test('open → wip never seeds a future plannedStart', () => {
    const future = iso(new Date(Date.now() + 30 * 86400000));
    const patch = statusChangePatch({ status: 'open', plannedStart: future }, 'wip');
    expect(patch.completedStart).toBe(today);
  });

  test('→ wip keeps an in-progress percentage instead of resetting to 50', () => {
    const patch = statusChangePatch({ status: 'open', progress: 30 }, 'wip');
    expect(patch.progress).toBe(30);
  });

  test('→ done snaps progress to 100 and clamps completedAt to today', () => {
    const future = iso(new Date(Date.now() + 30 * 86400000));
    const patch = statusChangePatch({ status: 'wip', completedAt: future }, 'done');
    expect(patch).toMatchObject({ status: 'done', progress: 100, completedAt: today, completedEnd: today });
  });

  test('→ done seeds completedStart from an existing value, clamped to completedEnd', () => {
    const patch = statusChangePatch({ status: 'wip', completedStart: '2020-01-01', completedAt: today }, 'done');
    expect(patch.completedStart).toBe('2020-01-01');
  });

  test('→ open resets progress to 0', () => {
    expect(statusChangePatch({ status: 'wip', progress: 60 }, 'open')).toEqual({ status: 'open', progress: 0 });
  });
});
