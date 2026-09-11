// Run mode's "what needs a look" feed — one ranked list instead of five
// separate chip-filtered panels. Five reasons an item earns a row, most
// urgent first:
//
//   overdue     — a leaf's decide-by date has already passed
//   drift       — Jira reports a different status than the plan (caller
//                 supplies these; the reconcile itself lives in jiraSync.js)
//   atRisk      — a deadline root's projected end has slipped past its date,
//                 or an exploratory leaf's decision window closes within a week
//   blocked     — an open, estimated leaf whose dependencies are not all done
//   unestimated — an open leaf with no size at all — nothing to schedule yet
//
// A leaf earns at most one of blocked/unestimated (an unestimated leaf has
// nothing to be "ready" about yet, so flagging both would just be two rows
// asking for the same fix) but can separately be overdue or drift on top.
//
// Every list here comes from leafNodes(tree)/treeIndex (utils/scheduler.js) —
// memoized per tree identity — so building the feed is one linear pass, not a
// fresh tree.filter() per row (docs/features.md "One progress formula
// everywhere" describes the same discipline for aggregate percentages).
import { leafNodes, isDepsReady } from './scheduler.js';
import { deadlineScopedScheduledItems } from './deadlines.js';
import { localDate, diffDays } from './date.js';

export const ATTENTION_RANK = { overdue: 0, drift: 1, atRisk: 2, blocked: 3, unestimated: 4 };

function matchesScope(node, { rootFilter, teamFilter, personFilter }) {
  if (rootFilter && !(node.id === rootFilter || node.id.startsWith(rootFilter + '.'))) return false;
  if (teamFilter && (node.team || '') !== teamFilter) return false;
  if (personFilter && !(node.assign || []).includes(personFilter)) return false;
  return true;
}

// `driftItems` are pre-reconciled Jira status diffs (see jiraSync.js
// `reconcile().statusDiff`) — attention.js only ranks and merges them, it
// never talks to Jira itself.
export function computeAttention({
  tree = [],
  scheduled = [],
  confidence = {},
  now = new Date(),
  rootFilter = '',
  teamFilter = '',
  personFilter = '',
  driftItems = [],
} = {}) {
  const allLeaves = leafNodes(tree);
  // Readiness is a structural fact about the plan, not a view choice — a
  // filtered-out predecessor still counts as done when it is.
  const doneIds = new Set(allLeaves.filter(l => l.status === 'done').map(l => l.id));
  const leaves = allLeaves.filter(node => matchesScope(node, { rootFilter, teamFilter, personFilter }));

  const items = [];
  leaves.forEach(node => {
    if (node.status === 'done') return;
    if (node.decideBy && localDate(node.decideBy) < now) {
      items.push({ id: node.id, name: node.name, kind: 'overdue', reason: 'overdue', date: node.decideBy, status: node.status });
    }
    if (!(node.best > 0)) {
      items.push({ id: node.id, name: node.name, kind: 'unestimated', reason: 'unestimated', status: node.status });
    } else if (!isDepsReady(tree, doneIds, node)) {
      items.push({ id: node.id, name: node.name, kind: 'blocked', reason: 'blocked', status: node.status });
    }
    if (confidence[node.id] === 'exploratory' && node.decideBy) {
      const days = diffDays(now, localDate(node.decideBy));
      if (days >= 0 && days <= 7) {
        items.push({ id: node.id, name: node.name, kind: 'atRisk', reason: 'exploratoryClose', date: node.decideBy, status: node.status });
      }
    }
  });

  // Deadline roots whose projected finish (from the current schedule) has
  // slipped past the date they're due. Finished work can't be at risk any
  // more — that's a historical fact (`doneLate`), not an open one.
  tree.filter(root => !root.id.includes('.') && root.date && root.status !== 'done' && matchesScope(root, { rootFilter, teamFilter, personFilter }))
    .forEach(root => {
      const linked = root.type === 'deadline'
        ? deadlineScopedScheduledItems(tree, scheduled, root.id)
        : scheduled.filter(s => s.id === root.id || s.id.startsWith(root.id + '.'));
      if (!linked.length) return;
      const dl = localDate(root.date);
      const maxEnd = linked.reduce((m, s) => (s.endD && s.endD > m ? s.endD : m), new Date(0));
      if (maxEnd > dl) {
        items.push({ id: root.id, name: root.name, kind: 'atRisk', reason: 'late', date: root.date, projEnd: maxEnd, status: root.status || 'open' });
      }
    });

  driftItems.forEach(d => items.push({ ...d, kind: 'drift', reason: 'drift' }));

  return items.sort((a, b) => (ATTENTION_RANK[a.kind] - ATTENTION_RANK[b.kind]) || a.id.localeCompare(b.id));
}

// Counts by kind, for a summary strip. Cheap enough to derive from the same
// list rather than caching separately.
export function attentionCounts(items) {
  const counts = { overdue: 0, drift: 0, atRisk: 0, blocked: 0, unestimated: 0 };
  items.forEach(item => { if (counts[item.kind] !== undefined) counts[item.kind]++; });
  return counts;
}
