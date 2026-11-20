import { buildMarkdownText as _buildMd } from '../utils/markdown.js';
import { recordToday } from '../utils/dayLog.js';
import { leafSnapshot, diffSnapshots, supersededByBackdate, stampPendingDates, withoutPendingDates } from '../utils/history.js';
import { sortTree } from '../utils/treeEdit.js';
import { withDayLog, recordSavedEvents } from './dayLogWrite.js';

// Build the file content together with any new history events. The events
// capture the delta between the leaf state at the last successful persist
// (`lastSavedLeavesRef`) and the current tree. Returns { content, newEvents,
// snapshot } so the caller can commit the ref+state after a successful write.
function composeFileForSave(c) {
  const { data, tree, isMdFile, scnRef, pastRef, fileDataRef, lastSavedPlanRef, lastSavedLeavesRef } = c;
  // A scenario on screen: the file gets the plan it rests on plus the
  // scenario's patch, and no history — nothing in a what-if has happened.
  if (scnRef.current) {
    const fd = fileDataRef.current;
    const content = isMdFile
      ? _buildMd({
          tree: sortTree(fd.tree || []),
          members: fd.members || [],
          teams: fd.teams || [],
          vacations: fd.vacations || [],
          data: fd,
          meta: fd.meta || {},
        })
      : JSON.stringify(fd, null, 2);
    return { content, newEvents: [], snapshot: lastSavedLeavesRef.current };
  }
  // An earlier day on screen: the file gets the real plan, with what was
  // edited here applied from that day on. Its history entries count for
  // that day, and the day log was rebuilt with the edit (utils/dayLog.js).
  const visit = pastRef.current;
  const real = visit ? fileDataRef.current : recordToday(lastSavedPlanRef.current, data);
  const realTree = visit ? sortTree(real.tree || []) : tree;
  const ts = new Date().toISOString();
  const currSnapshot = leafSnapshot(realTree);
  let newEvents = [];
  if (lastSavedLeavesRef.current) {
    newEvents = stampPendingDates(
      diffSnapshots(lastSavedLeavesRef.current, currSnapshot, ts, visit ? visit.day : null),
      real?.asOfPending,
      currSnapshot,
      ts,
    );
  }
  // A backdated entry supersedes the later ones it contradicts, or the
  // replay walks done → wip → done and every review in between reports the
  // wrong state (utils/history.js).
  const { kept } = supersededByBackdate(real?.historyEvents || [], newEvents);
  const eventsForFile = newEvents.length ? [...kept, ...newEvents] : kept;
  const plain = withoutPendingDates(real);
  const dataForFile = eventsForFile.length ? { ...plain, historyEvents: eventsForFile } : plain;
  const content = isMdFile
    ? _buildMd({
        tree: realTree,
        members: real.members || [],
        teams: real.teams || [],
        vacations: real.vacations || [],
        data: dataForFile,
        meta: real.meta || {},
      })
    : JSON.stringify(dataForFile, null, 2);
  return {
    content,
    newEvents,
    snapshot: currSnapshot,
    pendingRead: real?.asOfPending || null,
    savedPlan: real,
    visit: visit ? { day: visit.day, screen: data } : null,
  };
}
// The same diff the file-save path takes, for when there is no file. Kept
// separate because composeFileForSave also serialises the whole project,
// which this does not need.
function recordHistoryForLocalSave(c) {
  const { data, tree, setData, scnRef, pastRef, lastSavedPlanRef, lastSavedLeavesRef } = c;
  // An earlier day on screen: recorded once the visit is over, from the
  // real plan (its dated entries wait in `asOfPending`).
  if (!Array.isArray(tree) || scnRef.current || pastRef.current) return;
  const snapshot = leafSnapshot(tree);
  if (!lastSavedLeavesRef.current) {
    lastSavedLeavesRef.current = snapshot;
    return;
  }
  const pendingRead = data?.asOfPending || null;
  const ts = new Date().toISOString();
  const newEvents = stampPendingDates(diffSnapshots(lastSavedLeavesRef.current, snapshot, ts, null), pendingRead, snapshot, ts);
  lastSavedLeavesRef.current = snapshot;
  const savedPlan = recordToday(lastSavedPlanRef.current, data);
  lastSavedPlanRef.current = savedPlan;
  setData(d => withDayLog(recordSavedEvents(d, newEvents, pendingRead), savedPlan.dayLog));
}
function commitSaveSideEffects(c, { newEvents, snapshot, pendingRead, savedPlan, visit }) {
  const { setData, setPast, scnRef, pastRef, lastSavedPlanRef, lastSavedLeavesRef } = c;
  lastSavedLeavesRef.current = snapshot;
  if (visit) {
    // The visit goes on from what was just written: the real plan with its
    // new entries, and the screen as it was when the save read it.
    const base = recordSavedEvents(savedPlan, newEvents, pendingRead);
    if (pastRef.current?.day !== visit.day) {
      // The day was left while the file was being written: what the save
      // recorded goes to wherever the real plan is now. What today's log
      // entry is measured against was set on leaving, and includes edits
      // made after this save read the screen.
      if (pastRef.current) setPast(p => (p ? { ...p, base: recordSavedEvents(p.base, newEvents, pendingRead) } : p));
      else if (!scnRef.current) setData(d => recordSavedEvents(d, newEvents, pendingRead));
      return;
    }
    lastSavedPlanRef.current = base;
    const baseScreen = { ...visit.screen, historyEvents: base.historyEvents };
    setPast({ day: visit.day, base, baseScreen });
    setData(d => (d === visit.screen ? baseScreen : { ...d, historyEvents: base.historyEvents }));
    return;
  }
  if (savedPlan) lastSavedPlanRef.current = savedPlan;
  if (scnRef.current) return;
  setData(d => withDayLog(recordSavedEvents(d, newEvents, pendingRead), savedPlan?.dayLog));
}

// What a save writes, and what it leaves behind in the document. They read
// `tree` and `isMdFile`, which `App` has only after the file layer is set up;
// `App` hands that layer thin wrappers that call the latest of these.
export function useLogWriters(ctx) {
  return {
    composeFileForSave: () => composeFileForSave(ctx),
    recordHistoryForLocalSave: () => recordHistoryForLocalSave(ctx),
    commitSaveSideEffects: args => commitSaveSideEffects(ctx, args),
  };
}
