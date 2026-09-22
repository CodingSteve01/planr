// Asked: how exactly do I work "as of date X" now?
//
// The unit tests prove `diffSnapshots` stamps an effective date, and the app
// tests prove the switch turns on and says so. Neither proves the thing that
// matters: that restructuring a plan with the switch on actually produces
// events dated to that day, and that the review window then leaves them out.
// This walks that path with the real functions.

import { describe, test, expect } from 'vitest';
import { leafSnapshot, diffSnapshots } from '../utils/history.js';
import { effectiveDateOfEvent } from '../utils/historyView.js';

const TODAY = '2026-09-22T09:00:00.000Z';
const BACKDATE = '2026-09-14';
const WINDOW_OPENS = '2026-09-15';

// Monday's plan: one package, one task, half done.
const before = [
  { id: 'P1', name: 'Abrechnung' },
  { id: 'P1.1', name: 'Konzept', status: 'wip', progress: 50 },
];

describe('restructuring as of last Monday', () => {
  test('the split does not show up as this week\'s movement', () => {
    // Today: the task is split in three. With the switch on, that counts as of
    // the 14th — before the review window opened.
    const after = [
      { id: 'P1', name: 'Abrechnung' },
      { id: 'P1.1', name: 'Konzept', status: 'wip', progress: 50 },
      { id: 'P1.1.1', name: 'Konzept Teil A', status: 'open', progress: 0 },
      { id: 'P1.1.2', name: 'Konzept Teil B', status: 'open', progress: 0 },
    ];
    const events = diffSnapshots(leafSnapshot(before), leafSnapshot(after), TODAY, BACKDATE);

    const inWindow = events.filter(ev => effectiveDateOfEvent(ev) >= WINDOW_OPENS);
    expect(inWindow).toEqual([]);
    // It is still in the log — backdating moves when something counts, it does
    // not hide it.
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(ev => ev.ts === TODAY)).toBe(true);
  });

  test('real progress made today still counts today, switch or no switch', () => {
    // The failure that would make this useless: switching it on and then
    // forgetting, so a week of genuine work reports as nothing.
    const worked = [
      { id: 'P1', name: 'Abrechnung' },
      { id: 'P1.1', name: 'Konzept', status: 'done', progress: 100 },
    ];
    const withSwitchOff = diffSnapshots(leafSnapshot(before), leafSnapshot(worked), TODAY);
    expect(withSwitchOff.filter(ev => effectiveDateOfEvent(ev) >= WINDOW_OPENS)).toHaveLength(1);

    // …and with it on, it does NOT — which is the whole reason the switch is
    // loud in the top bar and resets on reload.
    const withSwitchOn = diffSnapshots(leafSnapshot(before), leafSnapshot(worked), TODAY, BACKDATE);
    expect(withSwitchOn.filter(ev => effectiveDateOfEvent(ev) >= WINDOW_OPENS)).toHaveLength(0);
  });

  test('a removed item is dated too — a deletion is a restructuring', () => {
    const pruned = [{ id: 'P1', name: 'Abrechnung' }, { id: 'P1.2', name: 'Anderes', status: 'open', progress: 0 }];
    const events = diffSnapshots(leafSnapshot(before), leafSnapshot(pruned), TODAY, BACKDATE);
    const removed = events.find(ev => ev.kind === 'removed');
    expect(removed).toBeDefined();
    expect(removed.effectiveAt).toBe(BACKDATE);
  });
});
