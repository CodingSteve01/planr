import { useMemo } from 'react';
import { EMPTY_ARR } from '../../../utils/gantt/helpers.js';

// Critical-path marks per row and the rows that survive the filters.
export function useGanttVisibleRows({
  cpSet,
  collapsed,
  rows,
  cpOnly,
  _diffActive,
  onlyChanged,
  _diffChangedSet,
  horizonIds,
  horizonOnlyPlanned,
}) {
  const cpNodeSet = useMemo(() => new Set(cpSet || []), [cpSet]);
  const cpRowMeta = useMemo(() => {
    const containsMemo = new Map();
    const containsCritical = row => {
      if (!row) return false;
      if (containsMemo.has(row.key)) return containsMemo.get(row.key);
      const result = row.type === 'task' ? cpNodeSet.has(row.s.id) : (row.children || EMPTY_ARR).some(child => containsCritical(child));
      containsMemo.set(row.key, result);
      return result;
    };
    const highlightMemo = new Map();
    const highlightCritical = row => {
      if (!row) return false;
      if (highlightMemo.has(row.key)) return highlightMemo.get(row.key);
      const result =
        row.type === 'task' ? cpNodeSet.has(row.s.id) : !!row.collapseKey && collapsed.has(row.collapseKey) && containsCritical(row);
      highlightMemo.set(row.key, result);
      return result;
    };
    return { containsCritical, highlightCritical };
  }, [cpNodeSet, collapsed]);
  const rowIsCp = row => cpRowMeta.highlightCritical(row);
  const rowRelevantToCp = row => cpRowMeta.containsCritical(row);
  // Optional "only changed" filter: drops every row whose task didn't move
  // in the diff window. Summary rows survive when any of their descendants
  // moved (so the tree shape stays legible during a sprint review).
  const rowRelevantToDiff = row => {
    if (!_diffActive || !onlyChanged || _diffChangedSet.size === 0) return true;
    if (row?.type === 'task') return _diffChangedSet.has(row.s?.id);
    const walk = r => {
      if (r?.type === 'task') return _diffChangedSet.has(r.s?.id);
      return (r?.children || []).some(walk);
    };
    return walk(row);
  };
  // Planning-horizon filter: when active, only keep rows whose task id (or
  // any descendant for summary rows) sits inside the horizon set. Lets the
  // user drop weeks of background noise from the chart in one click.
  const rowRelevantToHorizon = row => {
    if (!horizonIds) return true;
    if (row?.type === 'task') return horizonIds.has(row.s?.id);
    const walk = r => {
      if (r?.type === 'task') return horizonIds.has(r.s?.id);
      return (r?.children || []).some(walk);
    };
    return walk(row);
  };
  const visibleRows = useMemo(() => {
    let out = cpOnly ? rows.filter(row => rowRelevantToCp(row)) : rows;
    if (_diffActive && onlyChanged && _diffChangedSet.size > 0) {
      out = out.filter(rowRelevantToDiff);
    }
    if (horizonIds && horizonOnlyPlanned) {
      out = out.filter(rowRelevantToHorizon);
    }
    return out;
  }, [rows, cpOnly, cpRowMeta, _diffActive, onlyChanged, _diffChangedSet, horizonIds, horizonOnlyPlanned]);
  return { cpNodeSet, cpRowMeta, rowIsCp, rowRelevantToCp, visibleRows };
}
