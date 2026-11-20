import { useMemo } from 'react';

// Which groups are collapsed, and the flat list of rows that follows from it.
export function useGanttRows({ collapsedByMode, setCollapsedByMode, groupBy, structure, setTip }) {
  const collapsed = useMemo(
    () => new Set(collapsedByMode[groupBy] || structure.defaultCollapsed),
    [collapsedByMode, groupBy, structure.defaultCollapsed],
  );
  const updateCollapsed = updater => {
    setCollapsedByMode(prev => {
      const base = new Set(prev[groupBy] || structure.defaultCollapsed);
      const next = updater(base) || base;
      return { ...prev, [groupBy]: [...next] };
    });
  };
  const allCollapseKeys = useMemo(() => {
    const keys = new Set();
    const visit = row => {
      if (row?.collapseKey && row.children?.length) keys.add(row.collapseKey);
      row?.children?.forEach(visit);
    };
    structure.nodes.forEach(visit);
    return [...keys];
  }, [structure.nodes]);
  const toggleCollapse = key =>
    updateCollapsed(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const collapseAll = () => {
    setTip(null);
    setCollapsedByMode(prev => ({ ...prev, [groupBy]: allCollapseKeys }));
  };
  const expandAll = () => {
    setTip(null);
    setCollapsedByMode(prev => ({ ...prev, [groupBy]: [] }));
  };
  // Each row also carries how deep it sits in the grouping, because compact
  // needs to know which rows ARE the grouping: there a row is a lane, and the
  // only things that still own one are the outermost containers — the project,
  // the team, the person, the thread, whichever the pills chose.
  const { rows, rowDepth } = useMemo(() => {
    const out = [];
    const depth = new Map();
    const visit = (row, d) => {
      out.push(row);
      depth.set(row, d);
      if (!row.children?.length) return;
      const collapseKey = row.collapseKey || row.key;
      if (collapsed.has(collapseKey)) return;
      row.children.forEach(child => visit(child, d + 1));
    };
    structure.nodes.forEach(node => visit(node, 0));
    return { rows: out, rowDepth: depth };
  }, [structure, collapsed]);
  return { collapsed, allCollapseKeys, toggleCollapse, collapseAll, expandAll, rows, rowDepth };
}
