import { useStableCallback } from '../useStableCallback.js';
import { bindActions } from './bindActions.js';
import * as nodeEdits from './nodeEdits.js';
import * as splitEdits from './splitEdits.js';
import * as planEdits from './planEdits.js';

// Edits to nodes and the tree: field updates, dependencies, add / delete /
// duplicate / move / split, ordering, and the plan-wide writes beside them.
// Takes one object — `mutate` (the undo gateway), `setData`, `setHistory`,
// `setSaved`, `dataRef`, `scnRef`, `meta`, `tree`, `scheduled`, `t` (the
// translator), `setSel`, `setModal`, `setTab` — and returns one object of
// named functions.
//
// The `useStableCallback` ones go to memoised children, so their identity
// must not change; they MUST run unconditionally every render, before any
// early return, so React sees the same hook order whether `data` is null
// (the onboarding splash) or loaded. Each body resolves what it reads at call
// time, so the closures still see the fresh tree.
export function useNodeActions(args) {
  const ctx = { ...args };
  const edits = bindActions(ctx, { ...nodeEdits, ...splitEdits });
  ctx.act = edits;
  const plan = bindActions(ctx, planEdits);
  return {
    ...edits,
    onJiraApplyStatus: useStableCallback(plan.onJiraApplyStatus),
    applyJiraImport: useStableCallback(plan.applyJiraImport),
    onApplyOrder: useStableCallback(plan.onApplyOrder),
    onMoveBehind: useStableCallback(plan.onMoveBehind),
    onReorganizeLayout: useStableCallback(plan.onReorganizeLayout),
    onRoadmapAssignmentChange: useStableCallback(plan.onRoadmapAssignmentChange),
    ...useGanttCallbacks(edits),
    onNetDeleteNode: useStableCallback(id => edits.deleteNode(id)),
    onPlanReviewUpdate: useStableCallback((...a) => edits.updateNode(...a)),
    // Row-level status change from Run mode (attention list + per-person
    // queues) — same updateNode() → mutate() path every other status control
    // uses (TreeView's Space key, the bulk-status buttons, QuickEdit), so one
    // undo step either way.
    onBriefingUpdate: useStableCallback((...a) => edits.updateNode(...a)),
  };
}

// The Gantt's edit callbacks. The bar click stays with the component, which
// owns the modal it opens.
function useGanttCallbacks(edits) {
  return {
    onGanttSeqUpdate: useStableCallback((...a) => edits.onSeqUpdate(...a)),
    onGanttExtendViewStart: useStableCallback((...a) => edits.extendViewStart(...a)),
    onGanttTaskUpdate: useStableCallback((...a) => edits.updateNode(...a)),
    onGanttRemoveDep: useStableCallback((...a) => edits.removeDep(...a)),
    onGanttAddDep: useStableCallback((...a) => edits.addDep(...a)),
    onGanttReorderSibling: useStableCallback((...a) => edits.reorderSibling(...a)),
  };
}
