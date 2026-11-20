import { useState, useEffect } from 'react';
import { normalizeViewMode } from '../../../utils/gantt/helpers.js';

// The view's remembered choices: grouping, collapsed groups per grouping,
// horizon lines, load heatmap and compact layout. Each lives in localStorage.
export function useGanttPrefs() {
  const [groupBy, setGroupBy] = useState(() => {
    try {
      const stored = localStorage.getItem('planr_gantt_group');
      return stored ? normalizeViewMode(stored) : 'thread';
    } catch {
      return 'thread';
    }
  });
  const [collapsedByMode, setCollapsedByMode] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('planr_gantt_collapsed') || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  });
  // Horizon lines: weeks from today that separate committed / estimated / exploratory zones
  const [h1Weeks] = useState(() => {
    try {
      return +localStorage.getItem('planr_h1_weeks') || 8;
    } catch {
      return 8;
    }
  });
  const [h2Weeks] = useState(() => {
    try {
      return +localStorage.getItem('planr_h2_weeks') || 18;
    } catch {
      return 18;
    }
  });
  const [showLoadHeatmap, setShowLoadHeatmap] = useState(() => {
    try {
      return localStorage.getItem('planr_gantt_load_heatmap') !== 'false';
    } catch {
      return true;
    }
  });
  const toggleLoadHeatmap = () =>
    setShowLoadHeatmap(v => {
      const next = !v;
      try {
        localStorage.setItem('planr_gantt_load_heatmap', String(next));
      } catch {}
      return next;
    });
  // Compact: pack the bars into lanes instead of giving every task a row.
  //
  // One row per task is the honest default — the label column names each bar
  // and nothing moves. It is also what makes a real plan unreadable: two
  // hundred rows, each carrying one short bar a little further right than the
  // one above, is a staircase across an otherwise empty canvas, and the
  // question a schedule is for — what runs when, and what runs at the same
  // time — is the one thing it cannot show.
  //
  // Compact lays each group's bars out like words in a line of text: left to
  // right in plan order, into the first lane where the bar fits, opening a new
  // lane underneath only where two of them genuinely overlap. A group then
  // takes as many rows as it has simultaneous work, which is the number the
  // reader actually wants. The cost is the label column: a lane holds several
  // tasks, so the names live on the bars and in the tooltip.
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem('planr_gantt_compact') === 'true';
    } catch {
      return false;
    }
  });
  const toggleCompact = () =>
    setCompact(v => {
      const next = !v;
      try {
        localStorage.setItem('planr_gantt_compact', String(next));
      } catch {}
      return next;
    });
  const setGB = v => {
    const next = normalizeViewMode(v);
    setGroupBy(next);
    try {
      localStorage.setItem('planr_gantt_group', next);
    } catch {}
  };
  useEffect(() => {
    try {
      localStorage.setItem('planr_gantt_collapsed', JSON.stringify(collapsedByMode));
    } catch {}
  }, [collapsedByMode]);
  return {
    groupBy,
    collapsedByMode,
    setCollapsedByMode,
    h1Weeks,
    h2Weeks,
    showLoadHeatmap,
    toggleLoadHeatmap,
    compact,
    toggleCompact,
    setGB,
  };
}
