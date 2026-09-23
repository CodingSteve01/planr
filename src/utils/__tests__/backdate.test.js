// Asked for: making some changes as of a point in the past — restructuring
// tasks, say — so that the week-over-week sprint review shows nothing but the
// actual progress.
//
// Splitting a task into three on Tuesday is not three tasks' worth of movement
// in this week's review — it is bookkeeping about work that was already there.
// The history log already understands `effectiveAt` (an event can say it
// belongs to a different day than the one it was written on); what was missing
// was a way to say it for a whole batch of edits instead of one event at a time
// in a dialog.

import { describe, test, expect } from 'vitest';
import { diffSnapshots, leafSnapshot, supersededByBackdate } from '../history.js';
import { effectiveDateOfEvent } from '../historyView.js';

const tree = rows => rows.map(([id, status, progress]) => ({ id, status, progress }));
const snap = rows => leafSnapshot(tree(rows));

const TS = '2026-09-22T09:00:00.000Z';

describe('writing history as of an earlier day', () => {
  test('stamps every event with the day it is meant to belong to', () => {
    const before = snap([['P1.1', 'open', 0]]);
    const after = snap([['P1.1', 'wip', 40], ['P1.2', 'open', 0]]);

    const events = diffSnapshots(before, after, TS, '2026-09-14');

    expect(events.length).toBe(2);
    for (const ev of events) {
      // The timestamp stays honest about when it was written — the effective
      // date is a separate claim about when it counts.
      expect(ev.ts).toBe(TS);
      expect(ev.effectiveAt).toBe('2026-09-14');
    }
  });

  test('says nothing extra when no date is given', () => {
    const events = diffSnapshots(snap([['P1.1', 'open', 0]]), snap([['P1.1', 'done', 100]]), TS);
    expect(events).toHaveLength(1);
    expect(events[0].effectiveAt).toBeUndefined();
  });

  test('ignores a date that is not one', () => {
    const events = diffSnapshots(snap([['P1.1', 'open', 0]]), snap([['P1.1', 'done', 100]]), TS, 'later');
    expect(events[0].effectiveAt).toBeUndefined();
  });

  test('keeps the backdated restructuring out of this week\'s review', () => {
    // The whole point, end to end: today I split a package; the review window
    // opened on the 15th; the split is dated the 14th and therefore is not
    // movement this week. A progress change made today still is.
    const before = snap([['P1.1', 'wip', 20]]);
    const restructured = diffSnapshots(before, snap([['P1.1', 'wip', 20], ['P1.1.1', 'open', 0]]), TS, '2026-09-14');
    const realWork = diffSnapshots(snap([['P1.1', 'wip', 20]]), snap([['P1.1', 'wip', 60]]), TS);

    // `effectiveDateOfEvent` is what every window filter reads — one source
    // per truth, so asserting on it is asserting on what the review shows.
    const inWindow = [...restructured, ...realWork]
      .filter(ev => effectiveDateOfEvent(ev) >= '2026-09-15');

    expect(inWindow.map(e => e.id)).toEqual(['P1.1']);
    expect(inWindow[0].progress).toBe(60);
  });
});

// ── Entries that already sit after the day being caught up on ──────────────
// Asked, and it is the right question: if I record something as done on the
// 14th and the log already says "wip" on the 20th, the replay walks
// done → wip → done and every review in between reports the wrong state.
describe('a backdated entry and the ones after it', () => {
  const ev = (id, on, fields) => ({ ts: TS, id, effectiveAt: on, ...fields });

  test('drops the later entries for that item that claim the same fields', () => {
    const existing = [
      ev('P1.1', '2026-09-10', { status: 'wip' }),   // before — untouched
      ev('P1.1', '2026-09-20', { status: 'wip' }),   // after, same field — gone
      ev('P1.2', '2026-09-20', { status: 'wip' }),   // another item — untouched
    ];
    const { kept, dropped } = supersededByBackdate(existing, [ev('P1.1', '2026-09-14', { status: 'done' })]);

    expect(dropped).toHaveLength(1);
    expect(dropped[0].id).toBe('P1.1');
    expect(kept.map(e => `${e.id}@${e.effectiveAt}`)).toEqual(['P1.1@2026-09-10', 'P1.2@2026-09-20']);
  });

  test('leaves a later entry alone when it is about something else', () => {
    const existing = [ev('P1.1', '2026-09-20', { progress: 60 })];
    const { kept, dropped } = supersededByBackdate(existing, [ev('P1.1', '2026-09-14', { status: 'done' })]);

    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(1);
  });

  test('changes nothing at all when the new events are not backdated', () => {
    const existing = [ev('P1.1', '2026-09-20', { status: 'wip' })];
    const { kept, dropped } = supersededByBackdate(existing, [{ ts: TS, id: 'P1.1', status: 'done' }]);

    expect(dropped).toEqual([]);
    expect(kept).toBe(existing);
  });

  test('an entry on the very same day is a peer, not a contradiction', () => {
    const existing = [ev('P1.1', '2026-09-14', { status: 'wip' })];
    const { dropped } = supersededByBackdate(existing, [ev('P1.1', '2026-09-14', { status: 'done' })]);
    expect(dropped).toEqual([]);
  });
});
