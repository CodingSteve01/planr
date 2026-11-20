import { useMemo, useRef } from 'react';
import { localDay, logStart, planOn, recordToday } from '../utils/dayLog.js';
import { dropChange } from '../utils/effective.js';
import { leafSnapshot, diffSnapshots, stampPendingDates } from '../utils/history.js';
import { isEmptyPatch, diffPlan } from '../utils/scenario.js';
import { sortTree } from '../utils/treeEdit.js';
import { createHistory } from '../utils/undo.js';
import { recordSavedEvents } from './dayLogWrite.js';

// A day before today is a look at the plan as it was (and a place to
// correct it from then on); a day after today is where capacity changes.
// The same plan, whatever a save added to its logs in between.
const sameDocument = (a, b) => a === b || isEmptyPatch(diffPlan(a, b));
function pickEffDate(c, day) {
  const {
    history,
    setHistory,
    setData,
    setSaved,
    setTab,
    setPast,
    setEffDate,
    scnRef,
    pastRef,
    dataRef,
    fileDataRef,
    lastSavedPlanRef,
    lastSavedLeavesRef,
    dayUndoRef,
  } = c;
  const wanted = day || '';
  const goPast = !!wanted && wanted < localDay() && !scnRef.current;
  const from = pastRef.current;
  if (from || goPast) {
    // Back to the real plan first, with whatever was edited on that day.
    let real = from ? fileDataRef.current : recordToday(lastSavedPlanRef.current, dataRef.current);
    if (!real) return;
    // What was changed today and not saved yet is written to the history
    // now, as of today: once the earlier day is on screen, every entry a
    // save finds counts for that day.
    if (!from && lastSavedLeavesRef.current) {
      const snapshot = leafSnapshot(sortTree(real.tree || []));
      const ts = new Date().toISOString();
      const events = stampPendingDates(diffSnapshots(lastSavedLeavesRef.current, snapshot, ts, null), real.asOfPending, snapshot, ts);
      lastSavedLeavesRef.current = snapshot;
      real = recordSavedEvents(real, events, real.asOfPending || null);
    }
    lastSavedPlanRef.current = real;
    if (goPast) {
      const screen = planOn(real, wanted);
      setPast({ day: wanted, base: real, baseScreen: screen });
      setData(screen);
    } else {
      setPast(null);
      setData(real);
    }
    // Snapshots of one day are not edits of another.
    if (!from) dayUndoRef.current = { history, real };
    const kept = dayUndoRef.current;
    const untouched = !goPast && kept && sameDocument(kept.real, real);
    if (!goPast) dayUndoRef.current = null;
    setHistory(untouched ? kept.history : createHistory({ limit: 100 }));
    if (from && !untouched) setSaved(false);
  }
  setEffDate(wanted);
  if (wanted && !goPast) setTab('resources');
}

// Looking at, and correcting, the plan on another day than today.
export function useEarlierDay(ctx) {
  const { data, mutate, past, scn, effDate } = ctx;
  // The context of the latest render. The jump from the list of planned
  // changes is built once per date and must not set aside the undo stack as
  // it was back then: edits made since would be lost on the way back.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  // On an earlier day the screen already is that day: an edit there is an
  // ordinary edit, and the day log carries it forward.
  const effFold = past ? null : effDate || null;
  const pastStart = useMemo(() => (past ? logStart(past.base) : null), [past]);
  const effDropDate = from => mutate(d => dropChange(d, from));
  const effContext = useMemo(
    () => ({
      date: effDate,
      changes: data?.changes || [],
      onGo: day => pickEffDate(ctxRef.current, day || ''),
      onDrop: (from, kind, id) => mutate(d => dropChange(d, from, kind, id)),
    }),
    [effDate, data?.changes, past?.day, scn?.id],
  );
  return { pickEffDate: day => pickEffDate(ctx, day), effFold, pastStart, effDropDate, effContext };
}
