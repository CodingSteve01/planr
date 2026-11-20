import { flushSync } from 'react-dom';
import { exportSprintMarkdown } from '../../utils/exports.js';

// What a click on an item, a bar or a graph node does. Each takes the render's
// context first (`tree`, `scheduled`, the setters, `exportCtx`).

export function onBarClick(ctx, s, focusRequest = null) {
  const node = ctx.tree.find(r => r.id === (s.treeId || s.id));
  if (!node) return;
  let effectiveFocus = focusRequest;
  let modalNodeValue;
  if (s.isHandoff && typeof s.segmentIdx === 'number') {
    // Handoff-shadow click: open the PRIMARY's modal (not the shadow), jump
    // the user straight into the handoff editor on the right stage. We do
    // NOT spread the shadow over the node — that would put `#N` in the
    // title and make the top-level Team/Assign fields look like they edit
    // the shadow (they don't; they edit the primary tree item).
    effectiveFocus = {
      ...(focusRequest || {}),
      section: 'handoff',
      handoffStage: s.segmentIdx - 1,
      handoffShadowId: s.id,
    };
    modalNodeValue = node;
  } else {
    modalNodeValue = { ...node, ...s };
  }
  flushSync(() => {
    ctx.setModalFocus(effectiveFocus);
    ctx.setMN(modalNodeValue);
    ctx.setModal('node');
  });
}

export function onGanttBarClick(ctx, ...a) {
  onBarClick(ctx, ...a);
}

export function onNetNodeClick(ctx, r) {
  onBarClick(ctx, r);
}

// Clicking an item — anywhere — opens that item's own edit dialog. The same
// one a Gantt bar and a graph node open, because it is the same question:
// what is this, and can I change it without leaving what I was reading.
//
// There were three of these. #27 gave the Roadmap tab this behaviour and
// said why: routing a click through "set the root filter and jump to the
// Tree" is navigation, not editing — you lose the map you were reading to
// get a dialog you could have had in place. The Overview's subway map kept
// the old handler, which is the map that gets looked at most, and Planning
// had a third one that opened the bare tree node without the schedule's half
// of the answer. One handler now (principle 7).
//
// Navigating to a row in the tree is still a thing you can want, and it is
// still here — as `onNavigate`, a separate gesture with its own name, rather
// than as what a click silently did to a work package but not to a leaf.
export function onOpenItemDialog(ctx, id) {
  // A leaf has a scheduled row — dates, effort, assignment — and the dialog
  // wants it merged in; a work package has none and opens as the tree node.
  const row = ctx.scheduled.find(s2 => (s2.treeId || s2.id) === id && !s2.isHandoff);
  onBarClick(ctx, row || { id });
}

export function onSumNavigate(ctx, id, target) {
  const node = ctx.tree.find(r => r.id === id);
  if (node) ctx.setSel(node);
  ctx.setTab(target || 'tree');
}

export function onNetAddNode(ctx) {
  ctx.setModal('add');
}

export function onSumExportTodo(ctx, horizonDays) {
  exportSprintMarkdown({ ...ctx.exportCtx(), horizonDays });
}
