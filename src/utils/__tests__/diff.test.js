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
});
