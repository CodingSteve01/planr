import { describe, expect, test } from 'vitest';
import { computeDiff } from '../diff.js';

const cutoff = iso => new Date(`${iso}T23:59:59`);

describe('computeDiff historical fallback', () => {
  test('derives a usable diff from completed bars when no history block exists', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Past work', status: 'done', best: 5, factor: 1, completedStart: '2026-01-10', completedAt: '2026-01-20' },
      { id: 'P1.2', name: 'Future work', status: 'open', best: 5, factor: 1 },
    ];

    const diff = computeDiff({
      tree,
      historyEvents: [],
      sinceDate: cutoff('2026-01-15'),
    });

    expect(diff).not.toBeNull();
    expect(diff.doneInWindowIds).toEqual(['P1.1']);
    expect(diff.progressedInWindowIds).not.toContain('P1.2');
    expect(diff.pastProgressByRootId.P1).toBeGreaterThan(0);
    expect(diff.pastProgressByRootId.P1).toBeLessThan(0.5);
  });

  test('does not invent a diff when neither history nor actual bars exist', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'open', best: 0 },
      { id: 'P1.1', name: 'Future work', status: 'open', best: 5, factor: 1 },
    ];

    expect(computeDiff({ tree, historyEvents: [], sinceDate: cutoff('2026-01-15') })).toBeNull();
  });

  test('legacy actual bars seed past state even when later imported history exists', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Already done before cutoff', status: 'done', best: 5, factor: 1, completedStart: '2026-04-01', completedAt: '2026-04-20' },
      { id: 'P1.2', name: 'Open work', status: 'open', best: 5, factor: 1 },
    ];
    const historyEvents = [
      { ts: '2026-05-22T17:39:21.764Z', id: 'P1.1', kind: 'added', status: 'done', progress: 100, completedAt: '2026-04-20' },
    ];

    const diff = computeDiff({
      tree,
      historyEvents,
      sinceDate: cutoff('2026-05-11'),
    });

    expect(diff).not.toBeNull();
    expect(diff.doneInWindowIds).toEqual([]);
    expect(diff.progressedInWindowIds).not.toContain('P1.1');
    expect(diff.pastProgressByRootId.P1).toBeGreaterThan(0.45);
  });

  test('task added in-window surfaces as new even when older leaves have dated bars', () => {
    // Regression: the synthetic baseline backfill used to emit a `kind=added`
    // event for EVERY leaf at the project baseline, backdating genuinely-new
    // tasks so they looked pre-existing and never showed up in the period diff.
    const tree = [
      { id: 'P4', name: 'Goal', type: 'goal', status: 'wip', best: 0 },
      { id: 'P4.1', name: 'Old done work', status: 'done', best: 5, factor: 1, completedStart: '2026-01-10', completedEnd: '2026-01-15' },
      { id: 'P4.2', name: 'Brand new task', status: 'open', best: 5, factor: 1 },
    ];
    const historyEvents = [
      { ts: '2026-01-15T18:00:00.000Z', id: 'P4.1', status: 'done', progress: 100, completedAt: '2026-01-15' },
      { ts: '2026-06-25T08:00:00.000Z', id: 'P4.2', kind: 'added', status: 'open', progress: 0 },
    ];

    const diff = computeDiff({
      tree,
      historyEvents,
      sinceDate: cutoff('2026-06-01'),
    });

    expect(diff).not.toBeNull();
    expect(diff.changedInWindowIds).toContain('P4.2');
    expect(diff.doneInWindowIds).not.toContain('P4.1');
  });

  test('post-cutoff imported completion uses completedAt, not import time', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'done', best: 0 },
      { id: 'P1.1', name: 'Old done work', status: 'done', best: 5, factor: 1 },
    ];
    const historyEvents = [
      { ts: '2026-05-22T17:39:21.764Z', id: 'P1.1', kind: 'added', status: 'done', progress: 100, completedAt: '2026-04-20' },
    ];

    const diff = computeDiff({
      tree,
      historyEvents,
      sinceDate: cutoff('2026-05-11'),
    });

    expect(diff.doneInWindowIds).toEqual([]);
    expect(diff.progressedInWindowIds).not.toContain('P1.1');
    expect(diff.pastProgressByRootId.P1).toBe(1);
  });

  test('post-cutoff imported parent completion is not counted as leaf work', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'done', best: 0 },
      { id: 'P1.1', name: 'Parent package', status: 'done', best: 0, completedAt: '2026-04-20' },
      { id: 'P1.1.1', name: 'Child A', status: 'done', best: 2, factor: 1, completedAt: '2026-04-18' },
      { id: 'P1.1.2', name: 'Child B', status: 'done', best: 2, factor: 1, completedAt: '2026-04-20' },
    ];
    const historyEvents = [
      { ts: '2026-05-22T17:39:21.764Z', id: 'P1.1', kind: 'added', status: 'done', progress: 100, completedAt: '2026-04-20' },
    ];

    const diff = computeDiff({
      tree,
      historyEvents,
      sinceDate: cutoff('2026-05-11'),
    });

    expect(diff.doneInWindowIds).toEqual([]);
    expect(diff.changedInWindowIds).toEqual([]);
  });

  test('progress event effectiveAt controls whether it appears in a diff window', () => {
    const tree = [
      { id: 'P1', name: 'Project', status: 'wip', best: 0 },
      { id: 'P1.1', name: 'Backfilled progress', status: 'wip', progress: 50, best: 5, factor: 1 },
    ];
    const historyEvents = [
      { ts: '2026-05-25T12:00:00.000Z', id: 'P1.1', status: 'wip', progress: 50, effectiveAt: '2026-05-01' },
    ];

    const afterEffectiveDate = computeDiff({
      tree,
      historyEvents,
      sinceDate: cutoff('2026-05-11'),
    });
    expect(afterEffectiveDate.progressedInWindowIds).not.toContain('P1.1');

    const beforeEffectiveDate = computeDiff({
      tree,
      historyEvents,
      sinceDate: cutoff('2026-04-30'),
    });
    expect(beforeEffectiveDate.progressedInWindowIds).toContain('P1.1');
  });
});
