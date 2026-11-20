import { localDate } from './date.js';
import { deadlineRootIdForNode, deadlineScopedLeafIds, isDeadlineRelevantForRoot } from './deadlines.js';
import { isLeafNode, resolveToLeafIds } from './scheduler.js';

function asNode(tree, nodeOrId) {
  if (!nodeOrId) return null;
  return typeof nodeOrId === 'string'
    ? (tree || []).find(node => node.id === nodeOrId) || null
    : nodeOrId;
}

function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : localDate(value);
}

function aggregateWindows(windows) {
  const valid = windows.filter(window => window?.start && window?.end);
  if (!valid.length) return null;
  return {
    start: new Date(Math.min(...valid.map(window => window.start.getTime()))),
    end: new Date(Math.max(...valid.map(window => window.end.getTime()))),
    count: valid.length,
  };
}

function makeWindow(startValue, endValue) {
  const start = toDate(startValue);
  const end = toDate(endValue ?? startValue);
  if (!start && !end) return null;
  const safeStart = start || end;
  const safeEnd = end || start;
  if (!safeStart || !safeEnd) return null;
  return safeStart <= safeEnd
    ? { start: safeStart, end: safeEnd }
    : { start: safeEnd, end: safeStart };
}

function leafScheduledWindow(node, scheduledMap) {
  const scheduled = scheduledMap.get(node.id);
  if (!scheduled?.startD || !scheduled?.endD) return null;
  return makeWindow(scheduled.startD, scheduled.endD);
}

function leafActualWindow(node) {
  if (node.status !== 'done') return null;
  return makeWindow(
    node.completedStart || node.completedAt,
    node.completedAt || node.completedEnd || node.completedStart,
  );
}

function leafPlannedWindow(node, scheduledMap) {
  const scheduled = scheduledMap.get(node.id);
  if (node.status === 'done') {
    return makeWindow(
      node.plannedStart || scheduled?.startD || node.pinnedStart || node.completedStart || node.completedAt,
      node.plannedEnd || scheduled?.endD || node.completedEnd || node.completedAt || node.completedStart,
    );
  }
  return leafScheduledWindow(node, scheduledMap);
}

function leafWindows(node, scheduledMap) {
  const actual = leafActualWindow(node);
  const planned = leafPlannedWindow(node, scheduledMap);
  return {
    period: actual || leafScheduledWindow(node, scheduledMap) || planned,
    planned,
    actual,
  };
}

// ── Deadline / goal state ───────────────────────────────────────────────────
// Single source of truth for "is this thing at risk?" — used by Overview,
// Deadlines, Gantt, Subway-Map, the HTML report and every PDF.
//
// The key distinction: "at risk" is a *forecast*. Once all scoped work is done
// there is nothing left to be at risk of, so finished work reports `done` (or
// `doneLate` when it actually landed after the date) instead of a red alarm.
// `isLate` is intentionally the forecast-only flag so red badges calm down the
// moment the work completes.
export const DEADLINE_STATES = ['unscheduled', 'onTrack', 'atRisk', 'done', 'doneLate'];

export function deadlineStatus(tree, scheduled, nodeOrId, timelineHint = null) {
  const node = asNode(tree, nodeOrId);
  if (!node) return null;
  const timeline = timelineHint || summarizeNodeTimeline(tree, scheduled, node);
  const isDeadline = node.type === 'deadline';
  // Deadline nodes only count leaves that are marked deadline-relevant; other
  // roots count everything below them.
  const scopedIds = isDeadline
    ? deadlineScopedLeafIds(tree, node.id)
    : (isLeafNode(tree, node.id) ? [node.id] : resolveToLeafIds(tree, node.id));
  const scopedLeaves = scopedIds.map(id => (tree || []).find(r => r.id === id)).filter(Boolean);
  const doneCount = scopedLeaves.filter(l => l.status === 'done').length;
  const allDone = scopedLeaves.length > 0 && doneCount === scopedLeaves.length;
  // For done work the timeline's period end is the *actual* completion end, so
  // `doneLate` reflects reality rather than an obsolete forecast.
  const end = (isDeadline ? timeline?.deadline?.end : null) || timeline?.period?.end || null;
  const dateD = node.date ? localDate(node.date) : null;
  const missed = !!(end && dateD && dateD < end);
  const state = !end ? 'unscheduled'
    : allDone ? (missed ? 'doneLate' : 'done')
      : missed ? 'atRisk' : 'onTrack';
  return {
    node,
    date: node.date || '',
    dateD,
    end,
    leafCount: scopedLeaves.length,
    doneCount,
    allDone,
    state,
    // Forecast-only: never true for completed work.
    isLate: state === 'atRisk',
    // Historical fact: the (projected or actual) end is past the date.
    missed,
  };
}

export function summarizeNodeTimeline(tree, scheduled, nodeOrId) {
  const node = asNode(tree, nodeOrId);
  if (!node) return null;

  const scheduledMap = new Map((scheduled || []).map(item => [item.id, item]));
  const leafIds = isLeafNode(tree, node.id) ? [node.id] : resolveToLeafIds(tree, node.id);
  const leaves = leafIds
    .map(id => (tree || []).find(item => item.id === id))
    .filter(Boolean);
  const windows = leaves.map(leaf => ({ leaf, ...leafWindows(leaf, scheduledMap) }));
  const windowByLeafId = new Map(windows.map(entry => [entry.leaf.id, entry]));

  const allDone = leaves.length > 0 && leaves.every(leaf => leaf.status === 'done');
  const period = aggregateWindows(windows.map(entry => entry.period));
  const planned = aggregateWindows(windows.map(entry => entry.planned));
  const actual = allDone
    ? aggregateWindows(windows.map(entry => entry.actual || entry.period))
    : null;

  const deadlineRootId = deadlineRootIdForNode(tree, node.id);
  const deadlineScopedLeaves = deadlineRootId
    ? leaves.filter(leaf => isDeadlineRelevantForRoot(tree, deadlineRootId, leaf.id))
    : [];
  const deadlineWindows = deadlineScopedLeaves.map(leaf => windowByLeafId.get(leaf.id)?.period);
  const deadline = deadlineScopedLeaves.length > 0
    ? aggregateWindows(deadlineWindows)
    : null;
  const hasDeadlineSubset = !!deadline
    && deadlineScopedLeaves.length > 0
    && deadlineScopedLeaves.length < leaves.length;

  return {
    node,
    isLeaf: leafIds.length === 1 && leafIds[0] === node.id,
    leafCount: leafIds.length,
    doneLeafCount: leaves.filter(leaf => leaf.status === 'done').length,
    allDone,
    period,
    planned,
    actual,
    deadline: hasDeadlineSubset ? {
      ...deadline,
      leafCount: deadlineScopedLeaves.length,
      excludedLeafCount: Math.max(0, leafIds.length - deadlineScopedLeaves.length),
      rootId: deadlineRootId,
    } : null,
  };
}
