// The filters every view sees the tree through. They lived inside the app
// component, where nothing could call them alone; one of them was wrong for
// as long as that was so.
import { describe, it, expect } from 'vitest';
import { scheduleFiltered, withReviewedDone, withoutDone } from '../viewTree.js';

const tree = [
  { id: 'P1', name: 'Project', status: 'wip' },
  { id: 'P1.1', name: 'Alpha', status: 'open' },
  { id: 'P1.2', name: 'Beta', status: 'open' },
  { id: 'P2', name: 'Other', status: 'open' },
  { id: 'P2.1', name: 'Gamma', status: 'open' },
];
const ids = list => list.map(r => r.id);
const off = { onlyAutoAssigned: false, onlyOverdue: false, onlyOverbooked: false, overbookedTaskIds: new Set() };

describe('the quick filters that read the schedule', () => {
  it('none on: the tree as it is', () => {
    expect(scheduleFiltered(tree, [], off)).toBe(tree);
  });

  it('"overbooked" alone filters: the overbooked task and what it sits under', () => {
    const out = scheduleFiltered(tree, [], { ...off, onlyOverbooked: true, overbookedTaskIds: new Set(['P1.2']) });
    expect(ids(out)).toEqual(['P1', 'P1.2']);
  });

  it('"overbooked" with nobody overbooked leaves the tree alone', () => {
    expect(ids(scheduleFiltered(tree, [], { ...off, onlyOverbooked: true }))).toEqual(ids(tree));
  });

  it('"auto-assigned" keeps what the schedule gave somebody', () => {
    const scheduled = [{ id: 'P2.1', autoAssigned: true }, { id: 'P1.1' }];
    expect(ids(scheduleFiltered(tree, scheduled, { ...off, onlyAutoAssigned: true }))).toEqual(['P2', 'P2.1']);
  });

  it('"overdue" keeps what ends after it is due, unless it is done', () => {
    const scheduled = [
      { id: 'P1.1', due: '2026-03-01', endD: '2026-03-10', status: 'open' },
      { id: 'P1.2', due: '2026-03-01', endD: '2026-03-10', status: 'done' },
      { id: 'P2.1', dueOverdue: true },
    ];
    expect(ids(scheduleFiltered(tree, scheduled, { ...off, onlyOverdue: true }))).toEqual(['P1', 'P1.1', 'P2', 'P2.1']);
  });

  it('two filters on: a task has to pass both', () => {
    const scheduled = [
      { id: 'P1.1', autoAssigned: true },
      { id: 'P1.2', autoAssigned: true },
    ];
    const out = scheduleFiltered(tree, scheduled, {
      ...off,
      onlyAutoAssigned: true,
      onlyOverbooked: true,
      overbookedTaskIds: new Set(['P1.2', 'P2.1']),
    });
    expect(ids(out)).toEqual(['P1', 'P1.2']);
  });
});

describe('done work inside the review window', () => {
  it('comes back with what it sits under, and only when it is done', () => {
    const all = [
      { id: 'P1', status: 'wip' },
      { id: 'P1.1', status: 'done' },
      { id: 'P1.2', status: 'open' },
      { id: 'P1.3', status: 'done' },
    ];
    const shown = [all[0], all[2]];
    expect(ids(withReviewedDone(shown, all, new Set(['P1.1', 'P1.2'])))).toEqual(['P1', 'P1.1', 'P1.2']);
  });
});

describe('hiding done work', () => {
  it('takes done tasks out', () => {
    const out = withoutDone([
      { id: 'P1', status: 'wip' },
      { id: 'P1.1', status: 'done' },
      { id: 'P1.2', status: 'open' },
    ]);
    expect(ids(out)).not.toContain('P1.1');
    expect(ids(out)).toContain('P1.2');
  });
});
