import { addD, addWorkDays, eachDayInclusive, iso, localDate, normalizeVacation } from './date.js';
import { isLeafNode, parentId, pt, re, resolveToLeafIds } from './scheduler.js';

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

export function clampCompletedDate(dateLike) {
  if (!dateLike) return '';
  const date = typeof dateLike === 'string' ? localDate(dateLike) : localDate(dateLike);
  const today = localDate(new Date());
  return iso(date > today ? today : date);
}

function buildVacationSets(vacations) {
  const sets = {};
  (vacations || []).forEach(v => {
    const nv = normalizeVacation(v);
    if (!nv.person || !nv.from || !nv.to) return;
    if (!sets[nv.person]) sets[nv.person] = new Set();
    for (const d of eachDayInclusive(nv.from, nv.to)) sets[nv.person].add(iso(d));
  });
  return sets;
}

function isUsableWorkDay(date, wdSet, hm, vacationSets, assigneeIds) {
  const dayIso = iso(date);
  if (!wdSet.has(date.getDay())) return false;
  if (hm?.[dayIso]) return false;
  if (assigneeIds.some(id => vacationSets[id]?.has(dayIso))) return false;
  return true;
}

function effectiveDeps(tree, item) {
  const deps = new Set(item?.deps || []);
  let aid = parentId(item?.id || '');
  while (aid) {
    const ancestor = tree.find(r => r.id === aid);
    (ancestor?.deps || []).forEach(dep => deps.add(dep));
    aid = parentId(aid);
  }
  return [...deps];
}

export function inferCompletedPersonId(item, members, scheduledSnap = null) {
  if (item?.completedPersonId) return item.completedPersonId;
  if (scheduledSnap?.personId) return scheduledSnap.personId;
  if (item?.assign?.length) return item.assign[0];
  const teamId = pt(item?.team);
  const teamMembers = (members || []).filter(m => pt(m.team) === teamId);
  return teamMembers.length === 1 ? teamMembers[0].id : null;
}

function estimateCompletedAtFromPinnedStart({ item, completedPersonId, members, vacations, hm, workDays }) {
  if (!item?.pinnedStart) return '';
  const wdSet = new Set(workDays || DEFAULT_WORK_DAYS);
  const vacationSets = buildVacationSets(vacations);
  const member = completedPersonId ? (members || []).find(m => m.id === completedPersonId) : null;
  const assigneeIds = [...new Set([...(item?.assign || []), ...(completedPersonId ? [completedPersonId] : [])])];
  const dailyCap = Math.max(0.1, member?.cap || 1);
  let remainingEffort = re(item?.best || 0, item?.factor || 1.5);
  let cursor = localDate(item.pinnedStart);
  let lastWorkDay = new Date(cursor);
  let guard = 0;

  while (!isUsableWorkDay(cursor, wdSet, hm, vacationSets, assigneeIds) && guard < 60) {
    cursor = addD(cursor, 1);
    lastWorkDay = new Date(cursor);
    guard++;
  }
  if (!remainingEffort || remainingEffort <= 0) return clampCompletedDate(cursor);

  while (remainingEffort > 0 && guard < 4000) {
    if (isUsableWorkDay(cursor, wdSet, hm, vacationSets, assigneeIds)) {
      remainingEffort -= dailyCap;
      lastWorkDay = new Date(cursor);
    }
    if (remainingEffort <= 0) break;
    cursor = addD(cursor, 1);
    guard++;
  }
  return clampCompletedDate(lastWorkDay);
}

export function inferCompletedAt({ item, tree, scheduledMap, scheduledSnap, workDays, planStart, completedPersonId, members, vacations, hm }) {
  if (item?.completedAt) return clampCompletedDate(item.completedAt);
  if (item?.completedEnd) return clampCompletedDate(item.completedEnd);
  if (scheduledSnap?.endD) return clampCompletedDate(scheduledSnap.endD);

  const wdSet = new Set(workDays || DEFAULT_WORK_DAYS);
  let earliestSuccessorStart = null;

  (tree || []).forEach(candidate => {
    if (!candidate || candidate.id === item?.id || !isLeafNode(tree || [], candidate.id) || candidate.status === 'done') return;
    const scheduled = scheduledMap?.get(candidate.id);
    if (!scheduled?.startD) return;
    const dependsOnItem = effectiveDeps(tree || [], candidate)
      .some(depId => resolveToLeafIds(tree || [], depId).includes(item.id));
    if (!dependsOnItem) return;
    if (!earliestSuccessorStart || scheduled.startD < earliestSuccessorStart) earliestSuccessorStart = scheduled.startD;
  });

  if (earliestSuccessorStart) {
    return clampCompletedDate(addWorkDays(earliestSuccessorStart, -1, wdSet));
  }

  const pinnedEstimate = estimateCompletedAtFromPinnedStart({ item, completedPersonId, members, vacations, hm, workDays });
  if (pinnedEstimate) return pinnedEstimate;

  return clampCompletedDate(planStart || new Date());
}

export function deriveCompletedWindow({ item, completedAt, completedPersonId, members, vacations, hm, workDays }) {
  const wdSet = new Set(workDays || DEFAULT_WORK_DAYS);
  const vacationSets = buildVacationSets(vacations);
  const member = completedPersonId ? (members || []).find(m => m.id === completedPersonId) : null;
  const assigneeIds = [...new Set([...(item?.assign || []), ...(completedPersonId ? [completedPersonId] : [])])];
  const dailyCap = Math.max(0.1, member?.cap || 1);

  const endDate = localDate(clampCompletedDate(completedAt || item?.completedAt || item?.completedEnd || new Date()));

  let remainingEffort = re(item?.best || 0, item?.factor || 1.5);
  if (!remainingEffort || remainingEffort <= 0) {
    const dayIso = iso(endDate);
    return { completedStart: dayIso, completedEnd: dayIso };
  }

  let startDate = new Date(endDate);
  let cursor = new Date(endDate);
  let steps = 0;
  while (remainingEffort > 0 && steps < 4000) {
    if (isUsableWorkDay(cursor, wdSet, hm, vacationSets, assigneeIds)) {
      startDate = new Date(cursor);
      remainingEffort -= dailyCap;
    }
    if (remainingEffort <= 0) break;
    cursor = addD(cursor, -1);
    steps++;
  }

  return {
    completedStart: iso(startDate),
    completedEnd: iso(endDate),
  };
}
