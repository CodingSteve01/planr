import { deepEqual } from '../utils/scenario.js';
import { supersededByBackdate, withoutPendingDates } from '../utils/history.js';

// The document with the day log a save wrote; the same object when nothing
// differs, so that a save which changed nothing does not start another.
export function withDayLog(next, log) {
  if (deepEqual(next.dayLog || [], log || [])) return next;
  if (!log || !log.length) {
    const { dayLog, ...rest } = next;
    return rest;
  }
  return { ...next, dayLog: log };
}
// What a finished save leaves in the document: its events, and none of the
// dates it read. A date set while the save was under way is another one and
// stays for the next save.
export function recordSavedEvents(d, newEvents, pendingRead) {
  const left = withoutPendingDates(d, pendingRead);
  return newEvents && newEvents.length
    ? { ...left, historyEvents: [...supersededByBackdate(left?.historyEvents || [], newEvents).kept, ...newEvents] }
    : left;
}
