// Plan-wide writes that are not about one node: Jira bulk writes, the
// planning review's orders, the layout, the roadmap assignment. Same context
// convention as nodeEdits.js.
import { applyRootOrder } from '../../utils/orderSearch.js';
import { applyDisplayOrder, computeDisplayOrder } from '../../utils/displayOrder.js';
import { mergeRoadmapAssignment } from '../../utils/roadmap.js';
import { push as pushHistory } from '../../utils/undo.js';

// Bulk status write from Run mode's Jira drift rows (BriefingView.jsx).
// Patches carry whole nodes (see utils/jiraSync.js statusPatches); parent
// statuses and the done-window metadata are filled in by the effects that
// already watch the tree, exactly as with a hand edit.
export function onJiraApplyStatus(ctx, patches) {
  const { mutate } = ctx;
  if (!patches?.length) return;
  const byId = new Map(patches.map(patch => [patch.id, patch]));
  mutate(d => ({ ...d, tree: (d.tree || []).map(r => byId.get(r.id) || r) }));
}

// First-start import (JiraImportModal.jsx): the tickets already exist in
// Jira and nobody types two hundred of them again. The nodes arrive fully
// formed and already numbered past whatever the plan has, so this appends
// rather than merges — and it goes through `mutate`, so ⌘Z takes the whole
// import back in one press, which is the only thing that makes trying it
// safe.
export function applyJiraImport(ctx, { nodes = [], newMembers = [] }) {
  const { mutate, setModal, setTab, setSel } = ctx;
  if (!nodes.length) return;
  mutate(d => ({
    ...d,
    tree: [...(d.tree || []), ...nodes],
    members: newMembers.length ? [...(d.members || []), ...newMembers] : d.members,
  }));
  setModal(null);
  setTab('tree');
  setSel(nodes[0]);
}

// "Apply" on an order from the planning review's search: one undo step.
export function onApplyOrder(ctx, order) {
  const { dataRef, setData, setHistory, setSaved } = ctx;
  const before = dataRef.current;
  setData(d => ({ ...d, tree: applyRootOrder(d.tree || [], order) }));
  setHistory(h => pushHistory(h, before, { coalesceMs: 0 }));
  setSaved(false);
}

// "Move P10 behind P8" from a project's waits block: each cause goes
// directly after the project it holds back, in the order they are named.
export function onMoveBehind(ctx, ids, rootId) {
  const { act } = ctx;
  let anchor = rootId;
  for (const id of ids) {
    act.reorderSibling(id, { targetId: anchor, position: 'after' });
    anchor = id;
  }
}

// Reorganize tree layout: per-parent topological sort of children by
// their dep + softDep edges so paths render top-to-bottom in the Gantt.
// Manually-triggered so live edits don't shuffle the tree on the user.
export function onReorganizeLayout(ctx) {
  const { tree, mutate } = ctx;
  const order = computeDisplayOrder(tree);
  mutate(d => ({ ...d, tree: applyDisplayOrder(d.tree || [], order) }));
}

// Persistent Subway-Map assignment: Roadmap.jsx fires this when its
// computed {rootId → routeIdx, colorIdx} differs from what's stored
// (first render of a fresh plan, or a new root entered). Locks the
// layout so projects keep their colour + lane across data edits.
export function onRoadmapAssignmentChange(ctx, computed) {
  const { setData } = ctx;
  // Merge, never replace — see mergeRoadmapAssignment.
  setData(d => {
    const prev = d.roadmapAssignment || {};
    const rootIds = new Set((d.tree || []).filter(r => !r.id.includes('.')).map(r => r.id));
    const merged = mergeRoadmapAssignment(prev, computed, rootIds);
    const unchanged =
      Object.keys(merged).length === Object.keys(prev).length &&
      Object.keys(merged).every(id => prev[id] && prev[id].routeIdx === merged[id].routeIdx && prev[id].colorIdx === merged[id].colorIdx);
    return unchanged ? d : { ...d, roadmapAssignment: merged };
  });
}
