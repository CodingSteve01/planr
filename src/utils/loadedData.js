import { iso, normalizeVacation } from './date.js';
import { migrateLegacyChanges, pruneChanges } from './effective.js';
import { compactHistory, withoutPendingDates } from './history.js';
import { buildHMap } from './holidays.js';
import { deriveCompletedWindow, inferCompletedAt, inferCompletedPersonId } from './completion.js';

// Normalize a loaded data object: convert legacy week-based vacations to {from, to} on load.
// Every load goes through here, so this is where a log full of events that
// changed nothing is brought back to what happened (utils/history.js,
// `compactHistory`). The next save writes the shorter log.
export function normalizeLoadedData(d) {
  // The per-person lists of dated capacity and meeting changes move into
  // the one timeline (utils/effective.js); changes naming somebody the plan
  // no longer has are dropped.
  // A date waiting for a save belongs to the session that set it.
  const out = withoutPendingDates(pruneChanges(migrateLegacyChanges(normalizeLoadedCore(d))));
  if (!out || !Array.isArray(out.historyEvents) || out.historyEvents.length < 2) return out;
  const { events, dropped } = compactHistory(out.historyEvents);
  return dropped ? { ...out, historyEvents: events } : out;
}
function completedPersonName(item, members, completedPersonId) {
  return item.completedPerson || (completedPersonId ? members.find(m => m.id === completedPersonId)?.name || completedPersonId : '');
}
function completionDiffers(next, item) {
  return (
    next.completedAt !== item.completedAt ||
    next.completedStart !== item.completedStart ||
    next.completedEnd !== item.completedEnd ||
    next.completedPersonId !== item.completedPersonId ||
    next.completedPerson !== item.completedPerson ||
    next.plannedStart !== item.plannedStart
  );
}
function normalizeLoadedCore(d) {
  if (!d) return d;
  const rawVacations = Array.isArray(d.vacations) ? d.vacations : [];
  const vacations = rawVacations.map(normalizeVacation);
  const vacChanged =
    rawVacations.length !== vacations.length ||
    rawVacations.some((vac, idx) => {
      const norm = vacations[idx];
      return vac?.person !== norm?.person || vac?.from !== norm?.from || vac?.to !== norm?.to || vac?.note !== norm?.note;
    });
  if (!Array.isArray(d.tree) || !d.tree.length) {
    return vacChanged ? { ...d, vacations } : d;
  }

  const members = Array.isArray(d.members) ? d.members : [];
  const tree = Array.isArray(d.tree) ? d.tree : [];
  const hm = buildHMap(d.holidays || []);
  const workDays = d.meta?.workDays || [1, 2, 3, 4, 5];
  const planStart = d.meta?.planStart || iso(new Date());
  const emptyScheduledMap = new Map();
  let changed = vacChanged;

  const nextTree = tree.map(item => {
    if (item.status !== 'done') return item;

    const completedPersonId = inferCompletedPersonId(item, members, null);
    const completedAt = inferCompletedAt({
      item,
      tree,
      scheduledMap: emptyScheduledMap,
      scheduledSnap: null,
      workDays,
      planStart,
      completedPersonId,
      members,
      vacations,
      hm,
    });
    if (!completedAt) return item;

    const derivedWindow = deriveCompletedWindow({
      item,
      completedAt,
      completedPersonId,
      members,
      vacations,
      hm,
      workDays,
    });
    const completedStart = item.completedStart && item.completedStart <= completedAt ? item.completedStart : derivedWindow.completedStart;
    const completedEnd = completedAt;
    const completedPerson = completedPersonName(item, members, completedPersonId);
    const plannedStart = item.plannedStart || item.pinnedStart || '';
    const next = {
      ...item,
      completedAt,
      completedStart,
      completedEnd,
    };
    if (completedPersonId) next.completedPersonId = completedPersonId;
    if (completedPerson) next.completedPerson = completedPerson;
    if (plannedStart && !item.plannedStart) next.plannedStart = plannedStart;
    if (completionDiffers(next, item)) {
      changed = true;
      return next;
    }
    return item;
  });

  return changed ? { ...d, vacations, tree: nextTree } : d;
}
