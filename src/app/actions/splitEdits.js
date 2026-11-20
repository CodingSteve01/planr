// Turning a task's cascade or its interrupted progress into separate tree
// tasks. Same context convention as nodeEdits.js.
import { iso } from '../../utils/date.js';

// Materialize handoff segments as standalone tree tasks, chained by deps.
// The primary task stays in place but is trimmed to its own consumed
// effort (so the schedule no longer includes the handoff portion in its
// best estimate). Each cascade leg becomes a sibling with the next
// assignee, the segment's remaining effort, and a dep on the previous
// leg. Drops the source task's handoffPlan so the scheduler doesn't
// re-cascade into the freshly created tasks.
export function splitHandoff(ctx, nodeId) {
  const { scheduled, tree, t: _t, act } = ctx;
  const sc = scheduled.find(s => s.id === nodeId);
  const node = tree.find(r => r.id === nodeId);
  if (!node || !sc?.segments || sc.segments.length <= 1) return;
  const handoffSegs = sc.segments.slice(1).filter(s => !s.unscheduled);
  if (!handoffSegs.length) return;

  const factor = node.factor || 1.5;
  const primaryEff = sc.segments[0]?.effort || 0;
  // Round (not ceil) so the trimmed primary fits inside the consumed
  // portion. ceil gave a 0.5–1d slop that pushed the primary past the
  // offboard date and re-triggered a cascade — exactly the synthetic
  // `#N` row the split was supposed to eliminate.
  const newPrimaryBest = Math.max(1, Math.round(primaryEff / factor));

  // noCascade: the scheduler still re-cascades on offboard even after we
  // dropped handoffPlan, because cascading is triggered by the assignee's
  // end-date alone. Mark the trimmed primary as opt-out so the synthetic
  // `#N` row doesn't reappear after the split — the new sibling tasks own
  // that work now.
  const updatedPrimary = { ...node, best: newPrimaryBest, noCascade: true };
  delete updatedPrimary.handoffPlan;

  // Find next free sibling slot under the same parent.
  const parent = nodeId.split('.').slice(0, -1).join('.');
  const sibIds = tree
    .filter(r => {
      const p = r.id.split('.').slice(0, -1).join('.');
      return p === parent;
    })
    .map(r => parseInt(r.id.split('.').pop().replace(/\D/g, ''), 10) || 0);
  let nextNum = sibIds.length ? Math.max(...sibIds) : 0;

  let prevId = node.id;
  const newTasks = handoffSegs.map(seg => {
    nextNum += 1;
    const newId = parent ? `${parent}.${nextNum}` : `P${nextNum}`;
    const remBest = Math.max(1, Math.ceil((seg.effort || 0) / factor));
    const t = {
      id: newId,
      name: `${node.name} → ${seg.personName || '?'}`,
      status: 'open',
      team: seg.team || node.team || '',
      best: remBest,
      factor,
      prio: node.prio || 2,
      deps: [prevId],
      note: _t('split.handoff.note', node.id),
      assign: seg.personId ? [seg.personId] : [],
    };
    if (node.confidence) t.confidence = node.confidence;
    prevId = newId;
    return t;
  });

  // Insert new tasks right after the primary's tree slot so the order
  // matches the Gantt's left-to-right reading.
  const next = [];
  for (const r of tree) {
    if (r.id === nodeId) {
      next.push(updatedPrimary);
    } else {
      next.push(r);
    }
  }
  // Splice new tasks in after the primary's last descendant (same logic
  // as addNode for nested IDs).
  let insertAt = next.length;
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].id === nodeId || next[i].id.startsWith(nodeId + '.')) {
      insertAt = i + 1;
      break;
    }
  }
  next.splice(insertAt, 0, ...newTasks);
  act.setD('tree', next);
}

// Id for a new sibling of `nodeId`: one past the highest number among its siblings.
function nextSiblingId(tree, nodeId) {
  const parent = nodeId.split('.').slice(0, -1).join('.');
  const sibIds = tree
    .filter(r => {
      const p = r.id.split('.').slice(0, -1).join('.');
      return p === parent;
    })
    .map(r => parseInt(r.id.split('.').pop().replace(/\D/g, ''), 10) || 0);
  const nextNum = (sibIds.length ? Math.max(...sibIds) : 0) + 1;
  return parent ? `${parent}.${nextNum}` : `P${nextNum}`;
}

// Index just after the node's last descendant.
function endOfSubtree(next, nodeId) {
  let insertAt = next.length;
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].id === nodeId || next[i].id.startsWith(nodeId + '.')) {
      insertAt = i + 1;
      break;
    }
  }
  return insertAt;
}

// Split an interrupted task. The original is closed at its current
// progress (clamped `best`, status=done) and a new sibling carries the
// remaining effort with a dep on the original. Useful when work paused
// mid-task and the rest will be picked up later — possibly by someone
// else, possibly after blocking work resolves. progressPct overrides
// node.progress for explicit control.
export function splitTaskAtProgress(ctx, nodeId, progressPct) {
  const { tree, t: _t, act } = ctx;
  const node = tree.find(r => r.id === nodeId);
  if (!node || !node.best) return;
  const factor = node.factor || 1.5;
  const totalEff = node.best * factor;
  const prog = Number.isFinite(progressPct) ? progressPct : (node.progress ?? 0);
  if (prog <= 0 || prog >= 100) return; // nothing to split
  const consumedEff = totalEff * (prog / 100);
  const remEff = totalEff - consumedEff;
  if (remEff <= 0) return;

  const today = iso(new Date());
  const newDoneBest = Math.max(1, Math.round(consumedEff / factor));
  const newRemBest = Math.max(1, Math.round(remEff / factor));

  const updated = {
    ...node,
    best: newDoneBest,
    status: 'done',
    progress: 100,
    completedAt: node.completedAt || today,
    completedEnd: node.completedEnd || today,
  };
  delete updated.handoffPlan;

  const newId = nextSiblingId(tree, nodeId);

  const newTask = {
    id: newId,
    name: `${node.name} ${_t('split.task.suffix')}`,
    status: 'open',
    team: node.team || '',
    best: newRemBest,
    factor,
    prio: node.prio || 2,
    deps: [nodeId],
    note: _t('split.task.note', node.id),
    assign: node.assign || [],
  };
  if (node.confidence) newTask.confidence = node.confidence;

  const next = tree.map(r => (r.id === nodeId ? updated : r));
  const insertAt = endOfSubtree(next, nodeId);
  next.splice(insertAt, 0, newTask);
  act.setD('tree', next);
}
