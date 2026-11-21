// What changed since the cutoff, per leaf: the badge a row shows and the ids the "Only with changes" filter keeps.

// Per-row diff: returns null when no change, else badge descriptor.
export function diffBadgeFor(r, { tree, pastLeafState, t }) {
  if (!pastLeafState) return null;
  const isLeaf = !tree.some(o => o.id !== r.id && o.id.startsWith(r.id + '.'));
  if (!isLeaf) return null;
  const past = pastLeafState.get(r.id);
  const nowStatus = r.status || 'open';
  const nowProg = typeof r.progress === 'number' ? r.progress : nowStatus === 'done' ? 100 : nowStatus === 'wip' ? 50 : 0;
  if (!past) return { kind: 'new', label: t('diff.labelNew'), tip: t('diff.tipNew') };
  if (past.status !== 'done' && nowStatus === 'done')
    return {
      kind: 'done',
      label: t('diff.labelDone'),
      tip: r.completedAt ? t('diff.tipDone') + ' (' + r.completedAt + ')' : t('diff.tipDone'),
    };
  if (nowProg > (past.progress || 0)) {
    const delta = Math.round(nowProg - (past.progress || 0));
    if (delta >= 1) return { kind: 'progress', label: `+${delta}%`, tip: t('diff.tipProgress', past.progress || 0, nowProg) };
  }
  return null;
}

// Set of ids the filter should keep visible: every leaf with a diff plus
// each of its ancestors.
export function collectDiffKeepIds(tree, computeDiffBadge) {
  const keep = new Set();
  for (const r of tree) {
    if (computeDiffBadge(r)) {
      keep.add(r.id);
      const parts = r.id.split('.');
      for (let i = 1; i < parts.length; i++) keep.add(parts.slice(0, i).join('.'));
    }
  }
  return keep;
}
