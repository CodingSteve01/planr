import { phaseProgress } from '../phases.js';
import { fixedDurationDays, scheduleEffort } from './taskBasics.js';
import { directChildren, descendantLeaves, isLeafNode, leafNodes } from './treeIndex.js';
// Cyclic by design: progress.js needs leafProgress/scheduleEffort from here and
// treeStats needs the one aggregate formula from there. Both sides only touch
// the other at call time, so the cycle resolves cleanly.
import { aggregateProgressPct } from '../progress.js';

// ── Planning confidence ───────────────────────────────────────────────────────
// Categorises every item into one of three confidence levels that drive
// visual differentiation in the Gantt and the Planning Review panel.
//   committed   — person assigned, estimate exists, risk factor reasonable
//   estimated   — team/estimate exists but no person or high risk
//   exploratory — scope unclear: no estimate or very high risk factor
export function computeConfidence(tree, members) {
  const result = {};
  const reasons = {}; // why each item got its confidence level
  const lvs = leafNodes(tree);
  lvs.forEach(r => {
    if (r.confidence) {
      result[r.id] = r.confidence;
      reasons[r.id] = 'manual';
      return;
    }
    if (r.status === 'done') {
      result[r.id] = 'committed';
      reasons[r.id] = 'done';
      return;
    }
    const hasAssign = (r.assign || []).length > 0;
    const hasFixed = fixedDurationDays(r) > 0;
    const hasEstimate = r.best > 0 || hasFixed;
    const highRisk = !hasFixed && (r.factor || 1.5) >= 2.0;
    if (hasAssign && hasEstimate && !highRisk) {
      result[r.id] = 'committed';
      reasons[r.id] = 'auto:person+estimate';
    } else if (hasEstimate && !highRisk) {
      result[r.id] = 'estimated';
      reasons[r.id] = hasAssign ? 'auto:high-risk' : 'auto:no-person';
    } else {
      result[r.id] = 'exploratory';
      reasons[r.id] = !hasEstimate ? 'auto:no-estimate' : 'auto:high-risk';
    }
  });
  const order = ['exploratory', 'estimated', 'committed'];
  tree.forEach(parent => {
    if (isLeafNode(tree, parent.id)) return;
    if (parent.confidence) {
      result[parent.id] = parent.confidence;
      reasons[parent.id] = 'manual';
      return;
    }
    const childLeaves = lvs.filter(l => l.id.startsWith(parent.id + '.'));
    if (!childLeaves.length) return;
    const worst = childLeaves.reduce((w, c) => {
      const ci = order.indexOf(result[c.id] || 'exploratory');
      return ci < w ? ci : w;
    }, 2);
    result[parent.id] = order[worst];
    reasons[parent.id] = 'inherited';
  });
  return { confidence: result, reasons };
}

// Derive leaf progress: phases (single source of truth) > explicit field > status-based default
export function leafProgress(r) {
  if (!r) return 0;
  if (r.status === 'done') return 100;
  // Phases are the single source of truth when present, but a non-done task
  // must never become "reached" just because phase or manual progress hit 100.
  const raw = r.phases?.length ? phaseProgress(r.phases) : r.progress != null && r.progress >= 0 ? r.progress : r.status === 'wip' ? 50 : 0;
  return Math.max(0, Math.min(99, raw));
}

export function treeStats(tree) {
  const m = Object.fromEntries(tree.map(r => [r.id, { ...r }]));
  [...tree].reverse().forEach(r => {
    if (isLeafNode(tree, r.id)) {
      const fixedDays = fixedDurationDays(r);
      const effort = scheduleEffort(r);
      m[r.id]._b = r.best || fixedDays || 0;
      m[r.id]._r = effort;
      m[r.id]._w = effort;
      m[r.id]._progress = leafProgress(r);
      m[r.id]._leafCount = 1;
      m[r.id]._doneCount = r.status === 'done' ? 1 : 0;
    } else {
      const ch = directChildren(tree, r.id);
      m[r.id]._b = ch.reduce((s, c) => s + (m[c.id]?._b || 0), 0);
      m[r.id]._r = ch.reduce((s, c) => s + (m[c.id]?._r || 0), 0);
      m[r.id]._w = ch.reduce((s, c) => s + (m[c.id]?._w || 0), 0);
      // One shared formula for every aggregate percentage in the app
      // (utils/progress.js). Inlining the maths here is what let the tree grid,
      // the Subway-Map, the goal cards and the PDF drift apart.
      const leaves = descendantLeaves(tree, r.id);
      if (leaves.length) {
        const done = leaves.filter(l => l.status === 'done').length;
        // Unrounded on purpose: the display sites format with
        // progressPctLabel (one decimal). Rounding here made the tree grid
        // print 45 % where the Subway-Map printed 44.5 % for the same scope.
        m[r.id]._progress = aggregateProgressPct(leaves);
        // Full subtree counts, so a view rendering a filtered tree (hide-done)
        // can still label the unfiltered scope instead of a shrunken one.
        m[r.id]._leafCount = leaves.length;
        m[r.id]._doneCount = done;
        const wip = leaves.filter(l => l.status === 'wip').length;
        m[r.id]._autoStatus = done === leaves.length ? 'done' : done > 0 || wip > 0 || m[r.id]._progress > 0 ? 'wip' : 'open';
      }
    }
  });
  return m;
}

// Enrich stats with scheduled date ranges for parent items (L1, L2)
export function enrichParentSchedules(stats, tree, results) {
  tree
    .filter(r => !isLeafNode(tree, r.id))
    .forEach(parent => {
      const ch = results.filter(s => s.id.startsWith(parent.id + '.') && s.startD && s.endD);
      if (!ch.length) return;
      if (stats[parent.id]) {
        stats[parent.id]._startD = new Date(Math.min(...ch.map(s => new Date(s.startD))));
        stats[parent.id]._endD = new Date(Math.max(...ch.map(s => new Date(s.endD))));
        stats[parent.id]._taskCount = ch.length;
      }
    });
}

// Compute auto-status for parent items (call after treeStats)
export function deriveParentStatuses(tree, stats) {
  return tree.map(r => {
    if (isLeafNode(tree, r.id)) return r;
    const s = stats[r.id];
    if (s?._autoStatus && s._autoStatus !== r.status) return { ...r, status: s._autoStatus };
    return r;
  });
}

export function nextChildId(tree, parentId) {
  if (!parentId) {
    // Root items always get a "P{n}" id (AddModal and the tree editor both
    // rely on this fixed prefix). Deriving the next number from `r.lvl`
    // undercounted: `lvl` is only ever set by AddModal's own writes, so a
    // tree loaded from a file/demo project (whose roots predate that field)
    // always looked empty here and this handed out "P1" again — colliding
    // with an existing P1 the very first time a top-level item was added.
    // Scanning root ids ("no dot") that already match the P-prefix is the
    // same information without the false negative.
    const nums = tree.filter(r => !r.id.includes('.') && /^P\d+$/.test(r.id)).map(r => parseInt(r.id.slice(1), 10) || 0);
    return `P${(nums.length ? Math.max(...nums) : 0) + 1}`;
  }
  const depth = parentId.split('.').length;
  const siblings = tree.filter(r => r.id.startsWith(parentId + '.') && r.id.split('.').length === depth + 1);
  const nums = siblings.map(r => parseInt(r.id.split('.').pop()) || 0);
  return `${parentId}.${(nums.length ? Math.max(...nums) : 0) + 1}`;
}
