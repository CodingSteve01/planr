// Archive filter — "this is finished and has been for a while, get it off my map".
//
// A plan accumulates history: projects that wrapped up months ago still own a
// subway line, a legend block and a Gantt group; people who offboarded still
// sit in every person dropdown. All of that is factually part of the plan (and
// stays in the numbers — see the note below), it just crowds out the work that
// is actually live.
//
// This module answers one question: which roots and which members are *old
// news*? Everything else (which surfaces honour it, whether the user wants it
// on) is decided by the caller.
//
// Deliberately NOT applied to progress aggregates: archiving is a display
// filter, so the headline "35% · 1154 PT" keeps counting the finished work.
// Hiding a completed project must never make the project look less complete.
import { localDate } from './date.js';
import { isLeafNode } from './scheduler.js';

export const ARCHIVE_DEFAULT_DAYS = 90;
export const ARCHIVE_DAY_PRESETS = [30, 60, 90, 180, 365];

const DAY = 864e5;
const rootIdOf = id => String(id || '').split('.')[0];
const hasDot = id => String(id || '').includes('.');

// The recorded completion of a single item. `completedAt` is the authoritative
// "done on" stamp; the window ends are fallbacks for items imported before the
// stamp existed.
export function completionDateOf(node) {
  return node?.completedAt || node?.completedEnd || node?.completedStart || null;
}

// Whole days between an ISO date and `now`. Negative for future dates.
export function ageInDays(isoDate, now = new Date()) {
  const then = localDate(isoDate);
  if (!then || Number.isNaN(then.getTime())) return null;
  const today = localDate(now instanceof Date ? now : new Date(now)) || new Date(now);
  return Math.floor((today.getTime() - then.getTime()) / DAY);
}

// One root's archive verdict. A root qualifies when every leaf below it is
// done AND the newest recorded completion is at least `days` old.
//
// No completion date anywhere below → NOT archivable. We can't tell how old
// "done" is, and guessing would hide work the user finished yesterday.
function rootArchiveRow(tree, root, days, now) {
  const prefix = root.id + '.';
  const descendants = tree.filter(node => node.id === root.id || node.id.startsWith(prefix));
  const leaves = descendants.filter(node => isLeafNode(tree, node.id));
  if (!leaves.length) return null;
  if (!leaves.every(leaf => leaf.status === 'done')) return null;

  let newest = null;
  leaves.forEach(leaf => {
    const done = completionDateOf(leaf);
    if (done && (!newest || done > newest)) newest = done;
  });
  if (!newest) newest = completionDateOf(root);
  if (!newest) return null;

  const age = ageInDays(newest, now);
  if (age == null || age < days) return null;
  return { id: root.id, name: root.name || root.id, doneOn: newest, ageDays: age, leafCount: leaves.length };
}

// Members who offboarded long enough ago that they're no longer part of the
// planning conversation. `end` is inclusive, so the day after counts as day 1.
function memberArchiveRow(member, days, now) {
  if (!member?.end) return null;
  const age = ageInDays(member.end, now);
  if (age == null || age < days) return null;
  return { id: member.id, name: member.name || member.id, end: member.end, ageDays: age };
}

// Single entry point. Returns both halves plus ready-to-use id sets so callers
// don't re-derive them per render.
export function scanArchive({ tree = [], members = [], days = ARCHIVE_DEFAULT_DAYS, now = new Date() } = {}) {
  const threshold = Number.isFinite(+days) && +days > 0 ? Math.floor(+days) : ARCHIVE_DEFAULT_DAYS;
  const roots = (tree || [])
    .filter(node => node?.id && !hasDot(node.id))
    .map(root => rootArchiveRow(tree, root, threshold, now))
    .filter(Boolean)
    .sort((a, b) => b.ageDays - a.ageDays);
  const memberRows = (members || [])
    .map(member => memberArchiveRow(member, threshold, now))
    .filter(Boolean)
    .sort((a, b) => b.ageDays - a.ageDays);

  return {
    days: threshold,
    roots,
    rootIds: new Set(roots.map(r => r.id)),
    members: memberRows,
    memberIds: new Set(memberRows.map(m => m.id)),
    count: roots.length + memberRows.length,
  };
}

// Drop every node belonging to an archived root. Takes the *root* id set and
// matches by root prefix, so children go with their parent.
export function stripArchivedRoots(tree, rootIds) {
  if (!rootIds || !rootIds.size) return tree || [];
  return (tree || []).filter(node => !rootIds.has(rootIdOf(node.id)));
}

// Same predicate for anything keyed by task id (scheduled rows, stat maps).
export function isArchivedId(rootIds, id) {
  return !!rootIds?.size && rootIds.has(rootIdOf(id));
}

// Drop archived people. Only for pickers that offer *future* work — never for
// resolving an assignee already recorded on a task.
export function stripArchivedMembers(members, memberIds) {
  if (!memberIds || !memberIds.size) return members || [];
  return (members || []).filter(member => !memberIds.has(member.id));
}
