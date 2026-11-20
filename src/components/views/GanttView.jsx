import React, { useState, useRef, useMemo, useEffect, memo } from 'react';
import { useCapacityAt } from '../../utils/capacityLens.js';
import { isOnScreen } from '../../utils/onScreen.js';
import { GanttFooter } from './gantt/GanttFooter.jsx';
import { LinkDragOverlay } from './gantt/LinkDragOverlay.jsx';
import { GanttSelectionBar } from './gantt/GanttSelectionBar.jsx';
import { GanttHeader } from './gantt/GanttHeader.jsx';
import { GanttLabelColumn } from './gantt/GanttLabelColumn.jsx';
import { DepLinesSvg } from './gantt/DepLinesSvg.jsx';
import { GanttFlagStrip } from './gantt/GanttFlagStrip.jsx';
import { GanttGridLayer } from './gantt/GanttGridLayer.jsx';
import { useGanttPrefs } from './gantt/useGanttPrefs.js';
import { useGanttZoom } from './gantt/useGanttZoom.js';
import { GanttTaskBarRow } from './gantt/GanttTaskBarRow.jsx';
import { GanttGroupBarRow } from './gantt/GanttGroupBarRow.jsx';
import { computeRowLayout } from '../../utils/gantt/rowLayout.js';
import {
  reorderSelectionInTime as reorderSelection,
  adjustSelectionPrio as adjustPrio,
  linkSelectedInOrder as linkSelected,
  clearSelectedLinks as clearLinks,
} from '../../utils/gantt/selectionEdits.js';
import { buildDepLines, buildHoverLines } from '../../utils/gantt/depLines.js';
import {
  buildHolidayDays,
  buildVacBands,
  buildResourceLoad,
  buildLoadRiskSummary,
  buildLoadWeekSummary,
  taskLoadCells as computeTaskLoadCells,
} from '../../utils/gantt/loadModel.js';
import { buildStructure } from '../../utils/gantt/structure.js';
import { buildAllItems, buildSearchTextById, filterDisplayItems, buildChildrenByParent } from '../../utils/gantt/items.js';
import {
  createGeometry,
  buildMonths,
  monthHeaderLabel as monthHeaderLabelOf,
  weekHeaderLabel as weekHeaderLabelOf,
} from '../../utils/gantt/geometry.js';
import { usePortalRoot } from '../../utils/embedHost.js';
import { iso, addD, localDate } from '../../utils/date.js';
import { resolveToLeafIds, isLeafNode, fixedDurationDays } from '../../utils/scheduler.js';
import { treeOrderRank } from '../../utils/displayOrder.js';
import { buildThreadStructure } from '../../utils/threads.js';
import { deadlineStatus } from '../../utils/timeline.js';
import { chainShorts } from '../../utils/handoff.js';
import { buildMemberShortMap } from '../../App.jsx';
import { Tip } from '../shared/Tooltip.jsx';
import { useT } from '../../i18n.jsx';
import { NO_TEAM, NO_TEAM_COLOR, EMPTY_ARR, rowDrawsBar } from '../../utils/gantt/helpers.js';

function GanttViewImpl({
  scheduled,
  weeks,
  goals,
  teams,
  members = [],
  vacations = [],
  meetingPlans = [],
  cpSet,
  cpLabels = {},
  cpEdges,
  tree,
  hideDone = false,
  search = '',
  searchIdx = 0,
  workDays,
  planStart,
  confidence = {},
  confReasons = {},
  rootFilter = '',
  teamFilter = '',
  personFilter = '',
  diffDoneIds = null,
  diffProgressedIds = null,
  diffPastLeafState = null,
  sinceDate = null,
  onlyChanged = false,
  horizonIds = null,
  horizonEnd = null,
  horizonOnlyPlanned = true,
  onBarClick,
  onSeqUpdate,
  onExtendViewStart,
  onTaskUpdate,
  onRemoveDep,
  onAddDep,
  onReorderSibling,
  personQueues = null,
  onOpenBulkEdit,
  baseline = null,
}) {
  // How much of a person there is on a day, as the scheduler sees it.
  const capacityAt = useCapacityAt();
  const portalRoot = usePortalRoot();
  // Diff-overlay sets (project-wide "since" window). Highlight bars that
  // completed or progressed in the chosen window.
  const _diffDoneSet = diffDoneIds instanceof Set ? diffDoneIds : new Set(diffDoneIds || []);
  const _diffProgSet = diffProgressedIds instanceof Set ? diffProgressedIds : new Set(diffProgressedIds || []);
  const _diffChangedSet = useMemo(() => new Set([..._diffDoneSet, ..._diffProgSet]), [_diffDoneSet, _diffProgSet]);
  const _diffActive = !!sinceDate;
  const { t } = useT();
  const REASON_TIP = {
    'manual': t('g.reasonManual'),
    'done': t('g.reasonDone'),
    'auto:person+estimate': t('g.reasonPersonEstimate'),
    'auto:no-person': t('g.reasonNoPerson'),
    'auto:high-risk': t('g.reasonHighRisk'),
    'auto:no-estimate': t('g.reasonNoEstimate'),
    'inherited': t('g.reasonInherited'),
  };
  const UNASSIGNED_LABEL = t('unassigned');
  const wdSet = useMemo(() => new Set(workDays || [1, 2, 3, 4, 5]), [workDays]);
  // Build short-name map directly from members (avoids stale-prop issues).
  const shortMap = useMemo(() => buildMemberShortMap(members), [members]);
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);
  const teamById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams]);
  const leafIdSet = useMemo(() => new Set((tree || []).filter(r => isLeafNode(tree || [], r.id)).map(r => r.id)), [tree]);
  const sn = (personId, fullName) => shortMap[personId] || (fullName || '').split(' ')[0] || '';
  // Render all assignees compactly: "KK+MB" or "KK+MB+1" for 3+.
  // When the task has a handoff cascade, append the chain: "KK+MB→AB→!".
  const snAll = s => {
    const ids = (s.assign || []).length > 0 ? s.assign : s.personId ? [s.personId] : [];
    const primary = (() => {
      if (!ids.length) return sn(s.personId, s.person);
      const shorts = ids.map(id => shortMap[id] || sn(id, ''));
      if (shorts.length <= 2) return shorts.join('+');
      return shorts.slice(0, 2).join('+') + '+' + (shorts.length - 2);
    })();
    return chainShorts(s, shortMap, primary);
  };
  const [tip, setTip] = useState(null); // {item, x, y} — hover tooltip on left-panel task names
  const [drag, setDrag] = useState(null);
  const [dDelta, setDDelta] = useState(0);
  const [cpOnly, setCpOnly] = useState(false); // dim non-critical items
  const [hoverDepId, setHoverDepId] = useState(null); // task ID currently hovered (for dep arrows)
  const [hoverLineKey, setHoverLineKey] = useState(null); // currently hovered dep line (for × badge + emphasis)
  const [pinnedLineKey, setPinnedLineKey] = useState(null); // sticky-selected dep line — survives mouse leave
  const [linkDrag, setLinkDrag] = useState(null); // {fromId, fromX, fromY, mouseX, mouseY} — drag-to-link in progress
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectRect, setSelectRect] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  // Anchor + most-recent shift-range track standard list semantics:
  //   click           → anchor = clicked, clears multi
  //   shift+click     → replace the most-recent range [anchor..lastEnd] with
  //                     the new range [anchor..click] — other manually pinned
  //                     items (added via cmd+click) survive. Anchor stays.
  //   cmd+click       → toggle clicked, anchor moves, prevRange reset
  //   cmd+shift+click → like shift but unconditional add (never wipes prev)
  const lastSelectAnchorRef = useRef(null);
  const lastShiftRangeRef = useRef(null); // Set of ids touched by the most recent shift-range
  const handleSelectClick = (e, id) => {
    if (!id) return false;
    const ctrlLike = e.metaKey || e.ctrlKey;
    if (e.shiftKey) {
      const ids = visibleTaskIds;
      const anchor = lastSelectAnchorRef.current && ids.includes(lastSelectAnchorRef.current) ? lastSelectAnchorRef.current : ids[0];
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a < 0 || b < 0) return false;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const newRange = new Set(ids.slice(lo, hi + 1));
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (!ctrlLike && lastShiftRangeRef.current) {
          // Replace just the previous shift-range; other pinned ids stay.
          lastShiftRangeRef.current.forEach(x => next.delete(x));
        }
        newRange.forEach(x => next.add(x));
        return next;
      });
      lastShiftRangeRef.current = newRange;
      // Anchor unchanged — user can keep extending from the original point.
      return true;
    }
    if (ctrlLike) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastSelectAnchorRef.current = id;
      lastShiftRangeRef.current = null;
      return true;
    }
    lastSelectAnchorRef.current = id;
    lastShiftRangeRef.current = null;
    return false;
  };
  const hR = useRef(null),
    bR = useRef(null),
    lR = useRef(null);
  const { zoom, setZ, WPX, showDays, zoomMode } = useGanttZoom({ hR, bR });
  const {
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
  } = useGanttPrefs();
  const activateMode = (e, action) => {
    if (e.button !== 0) return;
    e.preventDefault();
    action();
  };
  const hoverClearTimerRef = useRef(null);
  const [bodyScrollbarH, setBodyScrollbarH] = useState(0);
  // Guard flag: when true, syncL won't feed bR.scrollTop back (prevents
  // the syncS→syncL loop from killing smooth programmatic scrolls on bR).
  const scrollLock = useRef(false);

  function syncS(e) {
    if (hR.current) hR.current.scrollLeft = e.target.scrollLeft;
    if (lR.current) {
      scrollLock.current = true;
      lR.current.scrollTop = e.target.scrollTop;
    }
  }
  function syncL(e) {
    if (scrollLock.current) {
      scrollLock.current = false;
      return;
    }
    if (bR.current) bR.current.scrollTop = e.target.scrollTop;
  }
  function onLWheel(e) {
    if (bR.current) {
      bR.current.scrollTop += e.deltaY;
      bR.current.scrollLeft += e.deltaX;
    }
  }

  const tw = weeks.length * WPX;
  // Map a Date to its pixel X position on the Gantt body.
  // Each week = WPX px covering all 7 days (Mon–Sun) so weekends are visible
  // as grayed-out columns in day-mode. The DPX constant = pixels per day.
  const { DPX, dateToX, weekIndexOfDate, scheduledWorkDaysOf } = createGeometry({ weeks, WPX });
  const months = useMemo(() => buildMonths(weeks), [weeks]);
  const monthHeaderLabel = m => monthHeaderLabelOf(m, { WPX, zoomMode });
  const weekHeaderLabel = (w, i, isYB, isNow) => weekHeaderLabelOf(w, i, isYB, isNow, { WPX });

  // Build the fact base for this Gantt scope: scheduled items + unscheduled leaves,
  // filtered by root/team/person, but NOT by hideDone. Summary rows derive from this
  // full scoped set so their aggregates stay factually correct.
  const allItems = useMemo(
    () =>
      buildAllItems({
        scheduled,
        tree,
        leafIdSet,
        memberById,
        rootFilter,
        teamFilter,
        personFilter,
        workDays,
        UNASSIGNED_LABEL,
        weekIndexOfDate,
      }),
    // `weeks` because the week index of a date depends on the window, and
    // the label because it changes with the language.
    [scheduled, tree, leafIdSet, memberById, rootFilter, teamFilter, personFilter, workDays, weeks, UNASSIGNED_LABEL],
  );
  // Determine root id of a task ('P1', 'D1.2.3' → 'D1')
  const iMap = useMemo(() => Object.fromEntries((tree || []).map(r => [r.id, r])), [tree]);
  const searchNeedle = useMemo(() => (search || '').trim().toLowerCase(), [search]);
  const searchTextById = useMemo(() => buildSearchTextById({ tree, iMap, teamById, memberById }), [tree, iMap, teamById, memberById]);
  const displayItems = useMemo(
    () =>
      filterDisplayItems({ allItems, hideDone, _diffActive, _diffChangedSet, searchNeedle, searchTextById, iMap, teamById, memberById }),
    [allItems, hideDone, _diffActive, _diffChangedSet, searchNeedle, searchTextById, iMap, teamById, memberById],
  );
  const ordMap = useMemo(() => {
    const m = {};
    (tree || []).forEach((r, idx) => {
      m[r.id] = { idx, ord: typeof r.displayOrder === 'number' ? r.displayOrder : null };
    });
    return m;
  }, [tree]);
  // Earliest scheduled startWi per node — primary sort key so siblings cascade
  // top-to-bottom by time, minimizing edge crossings ("spider web" → top-down flow).
  // For a parent: min startWi across all leaves in its subtree.
  const earliestStartByNode = useMemo(() => {
    const sMap = {};
    for (const s of scheduled || []) {
      if (typeof s.startWi === 'number' && s.startWi >= 0) {
        if (sMap[s.id] == null || s.startWi < sMap[s.id]) sMap[s.id] = s.startWi;
      }
    }
    const out = {};
    for (const r of tree || []) {
      const own = sMap[r.id];
      if (own != null) out[r.id] = own;
    }
    // Propagate min from descendants up to ancestors (id prefix relationship).
    const ids = (tree || []).map(r => r.id);
    for (const id of ids) {
      const own = sMap[id];
      if (own == null) continue;
      const parts = id.split('.');
      while (parts.length > 1) {
        parts.pop();
        const p = parts.join('.');
        if (out[p] == null || own < out[p]) out[p] = own;
      }
    }
    return out;
  }, [tree, scheduled]);
  const childrenByParent = useMemo(() => buildChildrenByParent({ tree, ordMap }), [tree, ordMap]);
  // treeOrder = flattened depth-first traversal so cross-parent ordering also follows displayOrder.
  const treeOrder = useMemo(() => {
    const out = {};
    let i = 0;
    const walk = pid => {
      const kids = childrenByParent[pid] || [];
      for (const id of kids) {
        out[id] = i++;
        walk(id);
      }
    };
    walk('');
    return out;
  }, [childrenByParent]);
  const rootIds = useMemo(() => childrenByParent[''] || EMPTY_ARR, [childrenByParent]);

  const threadStructure = useMemo(() => {
    return buildThreadStructure({ groupBy, allItems, tree, iMap, scheduled });
  }, [groupBy, allItems, tree, iMap, scheduled]);
  const treeRank = useMemo(() => treeOrderRank(tree), [tree]);
  const structure = useMemo(
    () =>
      buildStructure({
        treeRank,
        iMap,
        childrenByParent,
        rootIds,
        tree,
        teams,
        memberById,
        teamById,
        confidence,
        t,
        threadStructure,
        allItems,
        displayItems,
        groupBy,
        weekIndexOfDate,
        UNASSIGNED_LABEL,
      }),
    [
      allItems,
      displayItems,
      groupBy,
      iMap,
      childrenByParent,
      rootIds,
      tree,
      teams,
      memberById,
      teamById,
      confidence,
      t,
      threadStructure,
      weeks,
    ],
  );

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

  const RH = 28,
    HH = 28,
    FLAG_ROW_H = 18;
  // Where each visible row sits, in pixels from the top of the chart body.
  //
  // Classic: row i is at i * RH, which is what it has always been and what
  // every arrow, flag and hover box already assumes. Compact: the rows of one
  // group share lanes, so several of them resolve to the SAME top and the
  // group is as tall as its busiest moment.
  //
  // Everything vertical goes through here — the dependency arrows, the bar
  // rectangles, the two columns — so the two modes cannot drift apart.
  const rowLayout = useMemo(
    () => computeRowLayout({ visibleRows, compact, RH, dateToX, WPX, DPX, collapsed, rowDepth }),
    [visibleRows, rowDepth, collapsed, compact, WPX, DPX, zoom, weeks],
  );
  const rowTop = rowIndex => rowLayout.tops[rowIndex] ?? rowIndex * RH;
  // A task row that took no lane draws nothing in compact mode — it has no
  // bar, so a bordered empty strip would only sit on top of lane 0.
  const rowHidden = rowIndex => compact && rowLayout.lanes?.[rowIndex] === -1;
  const rowCenterY = rowIndex => FLAG_ROW_H + rowTop(rowIndex) + RH / 2;
  const dlL = (goals || [])
    .filter(d => d.date)
    .map(dl => {
      const dateD = localDate(dl.date);
      const x = dateToX(dateD);
      const wi = weekIndexOfDate(dateD);
      const linked = scheduled.filter(s => s.id.startsWith(dl.id + '.'));
      // Shared state machine (utils/timeline.js): finished work is never "late".
      const ds = deadlineStatus(tree, scheduled, dl);
      const maxEnd = ds?.end || (linked.length ? linked.reduce((m, s) => (s.endD > m ? s.endD : m), new Date(0)) : null);
      const isLate = !!ds?.isLate;
      return { ...dl, wi, x, dateD, isLate, maxEnd, dlState: ds?.state || 'unscheduled' };
    });
  const now = new Date();
  const todayIso = iso(now);
  const todayWi = weeks.findIndex((w, i) => {
    const next = weeks[i + 1];
    return w.mon <= now && (!next || next.mon > now);
  });
  // Always day-accurate — even in week mode the line sits on the correct day
  // column within the week, not at the week's left edge.
  const todayX = todayWi >= 0 ? dateToX(now) : -1;
  const gTC = t => (t === NO_TEAM ? NO_TEAM_COLOR : teamById[t]?.color || '#3b82f6');

  // Day-accurate mount-point helpers for dependency lines. Source mounts at
  // the RIGHT edge of the bar (end of endD's day column); target mounts at
  // the LEFT edge (start of startD's day column). Falls back to week-aligned
  // positions when dates aren't available.
  // When the task is currently being dragged, add the live drag pixel offset so
  // dependency lines follow the bar in real time (Bug 2 fix).
  const resizePxPerDay = showDays ? DPX : WPX / 5;
  function dragOffsetFor(s, edge = 'both') {
    if (!drag || drag.id !== s.id || drag.isReorder) return 0;
    if (drag.kind === 'resizeEnd') return edge === 'end' ? dDelta * resizePxPerDay : 0;
    return dDelta * (showDays ? DPX : WPX);
  }
  function depX1(s) {
    const base = s.endD ? dateToX(s.endD) + DPX : (s.endWi + 1) * WPX;
    return base + dragOffsetFor(s, 'end');
  }
  function depX2(s) {
    const base = s.startD ? dateToX(s.startD) : s.startWi * WPX;
    return base + dragOffsetFor(s, 'start');
  }

  // rowIdx maps task ID → array of ALL visible row indices (a multi-assigned task appears
  // in multiple person/team groups, so we need every occurrence for dep-line drawing).
  //
  // Only rows that actually DRAW a bar. A dependency line is an arrow between
  // two bars, so a row with nothing on it cannot be one of its ends — and the
  // row renderer bails out on two cases, not one: an unestimated task and a
  // finished one with no dates. This map excluded only the first, so a line
  // ran to a blank row in the middle of a group and looked like it had come
  // adrift. In compact it is worse: a row with no bar takes no lane, so the
  // line landed on a lane belonging to other work entirely.
  const rowIdx = useMemo(() => {
    const m = {};
    visibleRows.forEach((r, i) => {
      if (!rowDrawsBar(r)) return;
      if (compact && rowLayout.lanes?.[i] === -1) return;
      if (!m[r.s.id]) m[r.s.id] = [];
      m[r.s.id].push(i);
    });
    return m;
  }, [visibleRows, compact, rowLayout]);
  const sMap = useMemo(
    () => Object.fromEntries(allItems.filter(s => !s._unestimated && s.startWi >= 0 && s.endWi >= 0).map(s => [s.id, s])),
    [allItems],
  );
  function taskBarRectForRow(row, index) {
    if (row?.type !== 'task' || !row.s || row.s._unestimated) return null;
    if (row.s._completed && (!row.s.startD || !row.s.endD)) return null;
    const s = row.s;
    let baseLeft, baseWidth;
    if (s.startD && s.endD) {
      baseLeft = dateToX(s.startD) + 2;
      baseWidth = dateToX(s.endD) + DPX - dateToX(s.startD) - 4;
    } else {
      baseLeft = s.startWi * WPX + 2;
      baseWidth = (s.endWi - s.startWi + 1) * WPX - 4;
    }
    const isSummary = row.type === 'summary';
    return {
      id: s.treeId || s.id,
      isSummary,
      left: Math.max(0, baseLeft),
      top: FLAG_ROW_H + rowTop(index) + (isSummary ? 6 : 4),
      width: Math.max(6, baseWidth),
      height: isSummary ? 16 : 20,
    };
  }
  const selectedTaskIds = useMemo(() => {
    const ordered = [];
    const seen = new Set();
    visibleRows.forEach(row => {
      if (row.type !== 'task') return;
      const id = row.s?.treeId || row.s?.id;
      if (!id || seen.has(id) || !selectedIds.has(id)) return;
      seen.add(id);
      ordered.push(id);
    });
    return ordered;
  }, [selectedIds, visibleRows]);
  const visibleTaskIds = useMemo(() => {
    const ids = [];
    const seen = new Set();
    visibleRows.forEach(row => {
      if (row.type !== 'task') return;
      const id = row.s?.treeId || row.s?.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
    return ids;
  }, [visibleRows]);
  // A cursor, so the schedule can be worked without a mouse.
  //
  // The tree had ↑↓ to move, Enter to edit, ⌥↑↓ to reorder; every other
  // surface had a click and nothing else. That is a problem of its own, and
  // it became a bigger one when the order of the work moved into the tree:
  // the Gantt is where you SEE that something sits too early, so it has to be
  // somewhere you can also say so. The keys are the tree's keys deliberately
  // — the same gesture in both places beats two vocabularies.
  const [cursorId, setCursorId] = useState(null);
  // A cursor pointing at a row that has been filtered away is a cursor
  // pointing at nothing; drop it rather than leave it dangling.
  useEffect(() => {
    if (cursorId && !visibleTaskIds.includes(cursorId)) setCursorId(null);
  }, [visibleTaskIds, cursorId]);
  useEffect(() => {
    const h = e => {
      // The Gantt stays mounted after you leave it, and this listener is on
      // the window. Without this it kept answering on every other tab: ⌘A
      // selected invisible bars, ↑/↓ stopped scrolling the Overview, and ⌥↑
      // or E in the tree also reordered or opened the Gantt's old cursor row.
      if (!isOnScreen(bR.current)) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const editingText = ['input', 'textarea', 'select'].includes(tag) || document.activeElement?.isContentEditable;
      if (editingText) return;
      // A dialog on top owns the keyboard — otherwise ↓ scrolls the bars
      // behind whatever the user is actually reading.
      if (document.querySelector('.modal-back, [data-testid="node-modal"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;

      if (mod && String(key || '').toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(visibleTaskIds));
        return;
      }
      if (mod || !visibleTaskIds.length) return;

      if ((key === 'ArrowDown' || key === 'ArrowUp') && e.altKey) {
        if (!cursorId) return;
        e.preventDefault();
        const dir = e.shiftKey ? (key === 'ArrowDown' ? 'last' : 'first') : key === 'ArrowDown' ? 'down' : 'up';
        onReorderSibling?.(cursorId, dir);
        return;
      }
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        const at = cursorId ? visibleTaskIds.indexOf(cursorId) : -1;
        const next = key === 'ArrowDown' ? Math.min(visibleTaskIds.length - 1, at + 1) : Math.max(0, at <= 0 ? 0 : at - 1);
        const id = visibleTaskIds[next];
        setCursorId(id);
        setSelectedIds(e.shiftKey && cursorId ? new Set([...selectedIds, id]) : new Set([id]));
        return;
      }
      if ((key === 'e' || key === 'E' || key === 'Enter') && cursorId) {
        e.preventDefault();
        // onBarClick takes the scheduled row, not an id — it reads `treeId`
        // off it to find the tree node behind a handoff shadow.
        onBarClick?.({ id: cursorId });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [visibleTaskIds, cursorId, selectedIds, onReorderSibling, onBarClick]);
  const reorderSelectionInTime = dir => reorderSelection({ selectedTaskIds, leafIdSet, onReorderSibling }, dir);
  const adjustSelectionPrio = step => adjustPrio({ selectedTaskIds, iMap, onTaskUpdate }, step);
  const linkSelectedInOrder = () => linkSelected({ selectedTaskIds, onAddDep });
  const clearSelectedLinks = (kind = 'all') => clearLinks({ selectedTaskIds, iMap, tree, onTaskUpdate, onRemoveDep }, kind);
  const cpEdgeSet = useMemo(() => (cpEdges instanceof Set ? cpEdges : new Set(cpEdges || [])), [cpEdges]);
  // Per-person vacation blocks: Map<personId, [{from, to}]>
  const vacByPerson = useMemo(() => {
    const m = {};
    (vacations || []).forEach(v => {
      if (!v.person || !v.from || !v.to) return;
      if (!m[v.person]) m[v.person] = [];
      m[v.person].push(v);
    });
    return m;
  }, [vacations]);
  // Every public holiday in the visible window, as a day column. The grid
  // tints them only at day zoom; a person's own row shows them at every zoom,
  // next to that person's vacation, because together they are the days that
  // person is not there.
  const holidayDays = useMemo(() => buildHolidayDays({ weeks, wdSet, WPX, DPX }), [weeks, wdSet, WPX, DPX]);
  const vacBandsByTaskId = useMemo(
    () => buildVacBands({ allItems, vacByPerson, memberById, tw, DPX, dateToX }),
    [allItems, vacByPerson, memberById, tw, DPX, weeks, WPX],
  );
  const resourceLoadByWeek = useMemo(
    () =>
      buildResourceLoad({
        allItems,
        iMap,
        memberById,
        members,
        vacByPerson,
        weeks,
        meetingPlans,
        teams,
        todayIso,
        capacityAt,
        scheduledWorkDaysOf,
      }),
    [allItems, iMap, memberById, members, vacByPerson, weeks, meetingPlans, teams, todayIso, capacityAt],
  );
  const loadRiskSummary = useMemo(() => buildLoadRiskSummary({ resourceLoadByWeek, memberById, t }), [resourceLoadByWeek, memberById, t]);
  const loadWeekSummary = useMemo(
    () => buildLoadWeekSummary({ weeks, resourceLoadByWeek, memberById, t }),
    [weeks, resourceLoadByWeek, memberById, t],
  );

  const taskLoadCells = (s, barLeft, barWidth) =>
    computeTaskLoadCells({ showLoadHeatmap, resourceLoadByWeek, weeks, WPX }, s, barLeft, barWidth);
  const searchableItems = useMemo(
    () => displayItems.map(item => ({ id: item.id, text: `${item.id} ${item.name || ''}`.toLowerCase() })),
    [displayItems],
  );
  function resD(id) {
    return resolveToLeafIds(tree || [], id);
  }
  const allDepLines = useMemo(
    () => buildDepLines({ tree, allItems, sMap, iMap, rowIdx, cpEdgeSet, resD, depX1, depX2, rowCenterY }),
    [allItems, sMap, tree, visibleRows, rowIdx, cpEdgeSet, WPX, showDays, groupBy, dDelta, drag],
  );

  const hoverLines = useMemo(
    () => buildHoverLines({ hoverDepId, tree, allItems, sMap, iMap, rowIdx, resD, depX1, depX2, rowCenterY }),
    [hoverDepId, tree, allItems, sMap, visibleRows, WPX, showDays, dDelta, drag],
  );

  const rowKeyOf = row => row.key || `${row.groupKey || 'row'}::${row.s?.id || row.label}`;
  const rowColor = row => row?.s?._barColor || gTC(row?.s?.team || NO_TEAM);
  useEffect(() => {
    const measureScrollbar = () => {
      if (!bR.current) return;
      const next = Math.max(0, bR.current.offsetHeight - bR.current.clientHeight);
      setBodyScrollbarH(prev => (prev === next ? prev : next));
    };
    measureScrollbar();
    window.addEventListener('resize', measureScrollbar);
    const id = window.setTimeout(measureScrollbar, 0);
    return () => {
      window.removeEventListener('resize', measureScrollbar);
      window.clearTimeout(id);
    };
  }, [visibleRows.length, tw, showDays]);
  const visibleCriticalCount = useMemo(() => {
    if (!cpSet?.size) return 0;
    return new Set(rows.filter(row => row.type === 'task' && cpSet.has(row.s.id)).map(row => row.s.id)).size;
  }, [rows, cpSet]);
  const renderedDepLines = useMemo(() => (cpOnly ? allDepLines.filter(line => line.isCp) : allDepLines), [allDepLines, cpOnly]);
  const rowTooltipItem = row => (row.type === 'group' ? null : { ...row.node, ...row.s, isCp: rowIsCp(row) });
  const dismissTooltip = (clearDepHover = false) => {
    setTip(null);
    if (clearDepHover) setHoverDepId(null);
  };
  const showRowTip = (row, event, includeDeps = false) => {
    const item = rowTooltipItem(row);
    if (!item) return;
    if (includeDeps && row.type === 'task') setHoverDepId(row.s.id);
    setTip({ item, x: event.clientX, y: event.clientY });
  };
  const hideRowTip = (row, includeDeps = false) => {
    if (includeDeps && row.type === 'task') setHoverDepId(null);
    setTip(null);
  };
  const openRowItem = (row, focusRequest = null) => {
    if (row.type === 'group') return;
    dismissTooltip(true);
    onBarClick?.(row.s, focusRequest);
  };

  // Search acts as a real Gantt filter. Matching uses each task plus its
  // ancestor path so searching a work-package name keeps its leaf bars visible.
  const searchMatches = useMemo(() => {
    if (!searchNeedle) return null;
    return new Set(searchableItems.map(item => item.id));
  }, [searchNeedle, searchableItems]);
  // Visible matches in row order — only tasks currently shown (not inside collapsed groups).
  const searchMatchList = useMemo(() => {
    if (!searchMatches?.size) return [];
    return visibleRows.filter(r => r.type === 'task' && searchMatches.has(r.s.id)).map(r => r.s.id);
  }, [searchMatches, visibleRows]);
  const activeMatchId = searchMatchList.length
    ? searchMatchList[((searchIdx % searchMatchList.length) + searchMatchList.length) % searchMatchList.length]
    : null;

  // Scroll to the active match (driven by search text + searchIdx for prev/next cycling).
  // Only programmatically scrolls bR — syncS keeps lR + hR in sync automatically.
  useEffect(() => {
    if (!activeMatchId || !bR.current) return;
    const id = setTimeout(() => {
      const rowIndex = visibleRows.findIndex(r => r.type === 'task' && r.s?.id === activeMatchId);
      if (rowIndex < 0 || !bR.current) return;
      const targetY = rowIndex * RH;
      const s = visibleRows[rowIndex].s;
      const targetX = s._unestimated ? undefined : Math.max(0, (showDays && s?.startD ? dateToX(s.startD) : (s?.startWi ?? 0) * WPX) - 80);
      const scrollTop = Math.max(0, targetY - bR.current.clientHeight / 2 + RH);
      bR.current.scrollTo({ top: scrollTop, left: targetX ?? bR.current.scrollLeft, behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(id);
  }, [activeMatchId, visibleRows, showDays, WPX]);

  // Scroll to today on first render so the user lands on the current time window.
  const didScrollToToday = useRef(false);
  useEffect(() => {
    if (didScrollToToday.current || todayX < 0 || !bR.current) return;
    didScrollToToday.current = true;
    // Delay so the DOM has its final layout before we measure clientWidth.
    const id = setTimeout(() => {
      if (!bR.current) return;
      bR.current.scrollTo({ left: Math.max(0, todayX - 40), behavior: 'auto' });
    }, 150);
    return () => clearTimeout(id);
  }, [todayX]);

  function scrollToToday() {
    if (todayX >= 0 && bR.current) bR.current.scrollTo({ left: Math.max(0, todayX - 40), behavior: 'smooth' });
  }

  // dragRef mirrors the latest drag state synchronously so onMU can read it
  // without waiting for React's batched state commit — same pattern as NetGraph's
  // zoomRef/panRef that fixed the stale-closure zoom-jump bug.
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const selectRef = useRef(null);
  const justDraggedRef = useRef(false);

  function onBMD(e, row) {
    e.stopPropagation();
    dismissTooltip(true);
    justDraggedRef.current = false;
    const s = row.s;
    const node = row.node || iMap[s.treeId || s.id];
    // Done bars represent reality, not plan. Drag-move shifts the whole
    // completed window (completedStart + completedEnd) so the user can record
    // "this actually happened later than I logged". Pin is meaningless for
    // done work and stays disabled.
    const isDoneTask = row.type === 'task' && s.status === 'done' && !!node && !s._unestimated && !s.isHandoff;
    const d = {
      id: s.id,
      treeId: s.treeId || s.id,
      startWi: s.startWi,
      endWi: s.endWi,
      startD: s.startD,
      ox: e.clientX,
      oy: e.clientY,
      seq: s.seq,
      team: s.team,
      prio: s.prio,
      // Assignees needed for vacation-aware snap on drop.
      assign: s.assign || [],
      personId: s.personId,
      rowType: row.type,
      canPin: row.type === 'task' && s.status !== 'done' && !s._unestimated,
      canMoveDone: isDoneTask,
      origCompletedStart: isDoneTask ? node?.completedStart || node?.completedAt || node?.completedEnd || iso(s.startD) : null,
      origCompletedEnd: isDoneTask ? node?.completedEnd || node?.completedAt || node?.completedStart || iso(s.endD) : null,
      // Not in compact: there, vertical position says which LANE a bar is in
      // — what else runs at the same time — and not where it sits in the
      // order. Dragging up or down would look like a reorder and mean
      // something the lanes cannot show. The gesture stays in the tree and
      // the work order, where the order lives.
      reorderMode: onReorderSibling && !compact ? 'tree' : null,
      lockVertical: row.type === 'summary',
      rowIdx: (rowIdx[s.id] ?? [])[0] ?? 0,
      lastDy: 0,
      isReorder: false,
      kind: 'move',
    };
    dragRef.current = d;
    setDrag(d);
    setDDelta(0);
  }
  function clearTimelinePan() {
    if (!panRef.current) return;
    panRef.current = null;
    if (bR.current) bR.current.style.cursor = '';
    if (hR.current) hR.current.style.cursor = '';
  }
  function onTimelinePanStart(e) {
    if (e.button !== 0 && e.button !== 1) return;
    if (!bR.current) return;
    const interactive = e.target?.closest?.('.gbar,[data-link-target],button,a,input,select,textarea,[role="button"]');
    if (interactive) return;
    e.preventDefault();
    dismissTooltip(true);
    const isBody = e.currentTarget === bR.current;
    const selectOnBody = isBody && e.button === 0 && !e.altKey;
    if (selectOnBody) {
      const rect = bR.current.getBoundingClientRect();
      const x = bR.current.scrollLeft + e.clientX - rect.left;
      const y = bR.current.scrollTop + e.clientY - rect.top;
      selectRef.current = { x1: x, y1: y, x2: x, y2: y, append: e.metaKey || e.ctrlKey };
      setSelectRect(selectRef.current);
      if (!e.metaKey && !e.ctrlKey) setSelectedIds(new Set());
      return;
    }
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: bR.current.scrollLeft,
      top: bR.current.scrollTop,
    };
    bR.current.style.cursor = 'grabbing';
    if (hR.current) hR.current.style.cursor = 'grabbing';
  }
  function onResizeEndMD(e, row) {
    e.stopPropagation();
    e.preventDefault();
    dismissTooltip(true);
    justDraggedRef.current = false;
    const s = row.s;
    const node = row.node || iMap[s.treeId || s.id];
    if (!node || row.type !== 'task' || s._unestimated || s.isHandoff) return;
    // Done bar resize edits reality (completedEnd shifts). Open/wip bars edit
    // the planned fixed duration. Different drop targets, same handle UX.
    const isDoneTask = s.status === 'done';
    const currentDays = fixedDurationDays(node) || scheduledWorkDaysOf(s);
    const d = {
      id: s.id,
      treeId: s.treeId || s.id,
      ox: e.clientX,
      oy: e.clientY,
      baseDurationDays: Math.max(1, Math.ceil(currentDays || 1)),
      minDelta: 1 - Math.max(1, Math.ceil(currentDays || 1)),
      rowType: row.type,
      canPin: false,
      reorderMode: null,
      lockVertical: false,
      lastDy: 0,
      isReorder: false,
      kind: isDoneTask ? 'resizeEndDone' : 'resizeEnd',
      origCompletedStart: isDoneTask ? node?.completedStart || node?.completedAt || node?.completedEnd || iso(s.startD) : null,
      origCompletedEnd: isDoneTask ? node?.completedEnd || node?.completedAt || node?.completedStart || iso(s.endD) : null,
    };
    dragRef.current = d;
    setDrag(d);
    setDDelta(0);
  }

  // Left-edge resize: only meaningful for done bars (extends/shrinks the
  // recorded start date). Open/wip bars take their start from the scheduler
  // and have no editable left edge.
  function onResizeStartDoneMD(e, row) {
    e.stopPropagation();
    e.preventDefault();
    dismissTooltip(true);
    justDraggedRef.current = false;
    const s = row.s;
    const node = row.node || iMap[s.treeId || s.id];
    if (!node || row.type !== 'task' || s.status !== 'done' || s._unestimated || s.isHandoff) return;
    const currentDays = Math.max(1, Math.ceil(scheduledWorkDaysOf(s) || 1));
    const d = {
      id: s.id,
      treeId: s.treeId || s.id,
      ox: e.clientX,
      oy: e.clientY,
      baseDurationDays: currentDays,
      rowType: row.type,
      canPin: false,
      reorderMode: null,
      lockVertical: false,
      lastDy: 0,
      isReorder: false,
      kind: 'resizeStartDone',
      origCompletedStart: node?.completedStart || node?.completedAt || node?.completedEnd || iso(s.startD),
      origCompletedEnd: node?.completedEnd || node?.completedAt || node?.completedStart || iso(s.endD),
    };
    dragRef.current = d;
    setDrag(d);
    setDDelta(0);
  }
  function onMM(e) {
    if (selectRef.current && bR.current) {
      const rect = bR.current.getBoundingClientRect();
      selectRef.current = {
        ...selectRef.current,
        x2: bR.current.scrollLeft + e.clientX - rect.left,
        y2: bR.current.scrollTop + e.clientY - rect.top,
      };
      setSelectRect(selectRef.current);
      return;
    }
    if (panRef.current && bR.current) {
      const p = panRef.current;
      bR.current.scrollLeft = Math.max(0, p.left - (e.clientX - p.x));
      bR.current.scrollTop = Math.max(0, p.top - (e.clientY - p.y));
      if (hR.current) hR.current.scrollLeft = bR.current.scrollLeft;
      if (lR.current) lR.current.scrollTop = bR.current.scrollTop;
      return;
    }
    const d = dragRef.current;
    if (d) {
      const dx = e.clientX - d.ox;
      const dy = e.clientY - d.oy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) justDraggedRef.current = true;
      // Once in reorder mode, STAY there (sticky) — prevents mode-flipping when the
      // mouse wobbles horizontally during a vertical drag.
      const enterReorder = !!d.reorderMode && !d.isReorder && Math.abs(dy) > 10 && (d.lockVertical || Math.abs(dy) > Math.abs(dx));
      if (d.isReorder || enterReorder) {
        d.isReorder = true;
        d.lastDy = dy;
        setDrag({ ...d }); // re-render for cursor + visual feedback
      } else if (d.kind === 'resizeEnd') {
        const delta = Math.round(dx / resizePxPerDay);
        setDDelta(Math.max(d.minDelta || 0, delta));
      } else if (d.kind === 'resizeEndDone' || d.kind === 'resizeStartDone') {
        // Done-bar resize uses the same px-per-unit as the move handlers
        // (day mode → days, week mode → weeks). Drop handler multiplies
        // by 7 in week mode and clamps against start/end + today.
        const stepPx = showDays ? DPX : WPX;
        setDDelta(Math.round(dx / stepPx));
      } else if (d.canPin || d.canMoveDone) {
        // canPin = open/wip bars (drag = set pinnedStart).
        // canMoveDone = done bars (drag = shift completedStart/End block).
        const stepPx = showDays ? DPX : WPX;
        setDDelta(Math.round(dx / stepPx));
      }
    }
    if (linkDrag) {
      setLinkDrag(ld => (ld ? { ...ld, mouseX: e.clientX, mouseY: e.clientY } : null));
      // Auto-scroll the Gantt body when cursor approaches the viewport edges
      // so users can drop links onto bars that live off-screen. Step scales
      // with how close the cursor is to the edge.
      const el = bR.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const edge = 80;
        const maxStep = 28;
        if (e.clientX < rect.left + edge) {
          const t = (rect.left + edge - e.clientX) / edge;
          el.scrollLeft -= Math.ceil(maxStep * Math.min(1, t));
        } else if (e.clientX > rect.right - edge) {
          const t = (e.clientX - (rect.right - edge)) / edge;
          el.scrollLeft += Math.ceil(maxStep * Math.min(1, t));
        }
        if (e.clientY < rect.top + edge) {
          const t = (rect.top + edge - e.clientY) / edge;
          el.scrollTop -= Math.ceil(maxStep * Math.min(1, t));
        } else if (e.clientY > rect.bottom - edge) {
          const t = (e.clientY - (rect.bottom - edge)) / edge;
          el.scrollTop += Math.ceil(maxStep * Math.min(1, t));
        }
      }
    }
  }
  function onMU() {
    if (selectRef.current) {
      const rect = selectRef.current;
      const x1 = Math.min(rect.x1, rect.x2);
      const x2 = Math.max(rect.x1, rect.x2);
      const y1 = Math.min(rect.y1, rect.y2);
      const y2 = Math.max(rect.y1, rect.y2);
      const picked = rect.append ? new Set(selectedIds) : new Set();
      visibleRows.forEach((row, index) => {
        const bar = taskBarRectForRow(row, index);
        if (!bar || bar.isSummary) return;
        const intersects = bar.left <= x2 && bar.left + bar.width >= x1 && bar.top <= y2 && bar.top + bar.height >= y1;
        if (intersects) picked.add(bar.id);
      });
      selectRef.current = null;
      setSelectRect(null);
      setSelectedIds(picked);
      return;
    }
    clearTimelinePan();
    const d = dragRef.current;
    if (d) {
      if (d.kind === 'resizeEnd') {
        if (dDelta !== 0) {
          onSeqUpdate?.(d.treeId || d.id, { fixedDurationDays: Math.max(1, Math.ceil((d.baseDurationDays || 1) + dDelta)) });
        }
      } else if (d.kind === 'resizeEndDone' && dDelta !== 0 && d.origCompletedEnd) {
        // Shift completedEnd by N days. Clamp at today (no future-completion)
        // and at completedStart (can't shrink past the recorded start).
        const newEnd = addD(localDate(d.origCompletedEnd), showDays ? dDelta : dDelta * 7);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startCap = d.origCompletedStart ? localDate(d.origCompletedStart) : null;
        let clamped = newEnd > today ? today : newEnd;
        if (startCap && clamped < startCap) clamped = startCap;
        onSeqUpdate?.(d.treeId || d.id, { completedEnd: iso(clamped), completedAt: iso(clamped) });
      } else if (d.kind === 'resizeStartDone' && dDelta !== 0 && d.origCompletedStart) {
        // Shift completedStart. Floor at very old date, cap at completedEnd
        // (can't push start past the recorded end).
        const newStart = addD(localDate(d.origCompletedStart), showDays ? dDelta : dDelta * 7);
        const endCap = d.origCompletedEnd ? localDate(d.origCompletedEnd) : null;
        const clamped = endCap && newStart > endCap ? endCap : newStart;
        onSeqUpdate?.(d.treeId || d.id, { completedStart: iso(clamped) });
      } else if (d.kind === 'move' && d.canMoveDone && dDelta !== 0 && d.origCompletedStart && d.origCompletedEnd) {
        // Move the whole done window as a block: shift start and end by the
        // same delta. Cap end at today so reality stays in the past.
        const shift = showDays ? dDelta : dDelta * 7;
        const newStart = addD(localDate(d.origCompletedStart), shift);
        const newEnd = addD(localDate(d.origCompletedEnd), shift);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cappedEnd = newEnd > today ? today : newEnd;
        const span = +localDate(d.origCompletedEnd) - +localDate(d.origCompletedStart);
        let cappedStart = newStart;
        if (cappedEnd !== newEnd) cappedStart = new Date(+cappedEnd - span);
        onSeqUpdate?.(d.treeId || d.id, {
          completedStart: iso(cappedStart),
          completedEnd: iso(cappedEnd),
          completedAt: iso(cappedEnd),
        });
      } else if (d.isReorder && d.lastDy) {
        // Dragging a bar up or down moves the item in the TREE, whichever view
        // the drag started in. The resource view used to write a `seq` value
        // instead, plus a "match the neighbour's priority so the scheduler
        // honours it" patch — a second ordering system that existed only
        // because the scheduler ignored the tree. It follows the tree now
        // (utils/displayOrder.js, `treeOrderRank`), so there is one order, and
        // dragging a bar and pressing ⌥↓ on the row do the same thing.
        const rowShift = Math.max(1, Math.abs(Math.round(d.lastDy / RH)));
        const dir = d.lastDy > 0 ? (rowShift > 1 ? 'last' : 'down') : rowShift > 1 ? 'first' : 'up';
        const ids = selectedIds.has(d.id) && selectedTaskIds.length > 1 ? selectedTaskIds : [d.treeId || d.id];
        // Moving down, start from the bottom of the selection: otherwise the
        // first move puts the top item past the second, and the second move
        // puts it back.
        const ordered = dir === 'down' || dir === 'last' ? [...ids].reverse() : ids;
        ordered.forEach(id => onReorderSibling?.(id, dir));
      } else if (d.canPin && dDelta !== 0) {
        // Day mode: offset from the bar's actual start date (not the week's Monday).
        // Week mode: offset from the start week's Monday (bar is week-aligned).
        const baseDate = showDays && d.startD ? new Date(d.startD) : new Date(weeks[d.startWi].mon);
        let targetDate = showDays ? addD(baseDate, dDelta) : addD(baseDate, dDelta * 7);
        // Snap to nearest valid pin date: skip weekends, holidays, and any
        // vacation day for this task's assignees. Direction follows the drag.
        // Fall back to opposite direction if we walk off the planning horizon.
        if (showDays) {
          const dir = dDelta > 0 ? 1 : -1;
          const horizonStart = weeks[0]?.mon;
          const horizonEnd = weeks[weeks.length - 1]?.mon;
          // Build vacation-day set for this bar's assignees so the pin doesn't
          // land on a known vacation. Holidays already drop out of wdsByTime.
          const assignees = [...new Set([...(d.assign || []), ...(d.personId ? [d.personId] : [])])];
          const vacBlocks = assignees.flatMap(id => vacByPerson[id] || []);
          const isVacation = date => {
            const t = date.getTime();
            return vacBlocks.some(v => {
              const f = new Date(v.from).getTime();
              const u = new Date(v.to).getTime();
              return t >= f && t <= u;
            });
          };
          const isWorkable = date => {
            if (!wdSet.has(date.getDay())) return false;
            // Holiday check via global workable-day set built from weeks[].wds.
            const ws = weeks.find(w => date >= w.mon && date <= addD(w.mon, 6));
            if (!ws) return wdSet.has(date.getDay()); // outside horizon: weekday-only
            return ws.wds.some(d2 => d2.getTime() === date.getTime());
          };
          let steps = 0;
          while ((!isWorkable(targetDate) || isVacation(targetDate)) && steps < 60) {
            targetDate = addD(targetDate, dir);
            steps++;
          }
          // If we walked off-horizon trying primary direction, try the other.
          if (steps >= 60 || (horizonStart && targetDate < addD(horizonStart, -30)) || (horizonEnd && targetDate > addD(horizonEnd, 30))) {
            targetDate = showDays ? addD(baseDate, dDelta) : addD(baseDate, dDelta * 7);
            const opp = -dir;
            steps = 0;
            while ((!isWorkable(targetDate) || isVacation(targetDate)) && steps < 60) {
              targetDate = addD(targetDate, opp);
              steps++;
            }
          }
        }
        const planStartDate = weeks[0]?.mon;
        if (planStartDate && targetDate < planStartDate) {
          onExtendViewStart?.(iso(targetDate));
        }
        onSeqUpdate(d.id, { pinnedStart: iso(targetDate) });
      }
      dragRef.current = null;
      setDrag(null);
      setDDelta(0);
    }
    if (linkDrag) {
      dismissTooltip(true);
      setLinkDrag(null);
    }
  }
  // Escape key cancels any in-progress drag or link operation.
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') {
        clearTimelinePan();
        if (selectRef.current) {
          selectRef.current = null;
          setSelectRect(null);
        }
        if (selectedIds.size) setSelectedIds(new Set());
        if (dragRef.current || drag) {
          dragRef.current = null;
          setDrag(null);
          setDDelta(0);
          justDraggedRef.current = false;
        }
        if (linkDrag) setLinkDrag(null);
        if (pinnedLineKey) setPinnedLineKey(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  // Start a link-drag from a bar's right-edge handle
  function onLinkStart(e, fromId) {
    e.stopPropagation();
    e.preventDefault();
    dismissTooltip(true);
    setLinkDrag({ fromId, mouseX: e.clientX, mouseY: e.clientY });
  }
  // Complete a link-drag onto a target bar. Two fan-out modes use the current
  // multi-selection — they're mirrors of each other:
  //   • drag SOURCE is selected → every selected id becomes a predecessor of
  //     the drop target ("link these to that").
  //   • drop TARGET is selected → the dragged source becomes a predecessor of
  //     every selected id ("link this to all of those").
  //   • both / neither → plain 1→1.
  function onLinkDrop(targetId) {
    if (!linkDrag || linkDrag.fromId === targetId) {
      setLinkDrag(null);
      return;
    }
    const fromInSel = selectedIds.has(linkDrag.fromId);
    const targetInSel = selectedIds.has(targetId);
    if (fromInSel) {
      const sources = [linkDrag.fromId, ...selectedTaskIds.filter(id => id !== linkDrag.fromId && id !== targetId)];
      sources.forEach(fromId => {
        if (fromId && fromId !== targetId) onAddDep?.(targetId, fromId);
      });
    } else if (targetInSel) {
      const targets = [targetId, ...selectedTaskIds.filter(id => id !== targetId && id !== linkDrag.fromId)];
      targets.forEach(t => {
        if (t && t !== linkDrag.fromId) onAddDep?.(t, linkDrag.fromId);
      });
    } else {
      onAddDep?.(targetId, linkDrag.fromId);
    }
    setLinkDrag(null);
  }
  useEffect(() => {
    if (!linkDrag) return undefined;
    const finishLinkDrag = e => {
      const hitElements =
        typeof document.elementsFromPoint === 'function'
          ? document.elementsFromPoint(e.clientX, e.clientY)
          : [document.elementFromPoint(e.clientX, e.clientY)];
      const targetEl = hitElements.map(el => el?.closest?.('[data-link-target]')).find(Boolean);
      const targetId = targetEl?.getAttribute?.('data-link-target');
      if (targetId) {
        dismissTooltip(true);
        onLinkDrop(targetId);
        return;
      }
      setLinkDrag(null);
    };
    window.addEventListener('mouseup', finishLinkDrag, true);
    return () => window.removeEventListener('mouseup', finishLinkDrag, true);
  }, [linkDrag]);

  const unestimatedCount = useMemo(() => displayItems.filter(s => s._unestimated).length, [displayItems]);
  if (!allItems.length)
    return (
      <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--tx3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}></div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>{t('g.noItems')}</div>
          <div style={{ fontSize: 12 }}>{t('g.addTasks')}</div>
        </div>
      </div>
    );

  return (
    <div
      className="gantt"
      onMouseMove={onMM}
      onMouseUp={onMU}
      onClickCapture={e => {
        // Click-away on the dep-arrow pin: any click whose target isn't the
        // pinned arrow itself clears the pin. The arrow + its × badge call
        // stopPropagation so they keep their own toggling behaviour.
        if (pinnedLineKey) setPinnedLineKey(null);
      }}
      onMouseLeave={() => {
        dismissTooltip(true);
        setHoverLineKey(null);
        clearTimelinePan();
        if (selectRef.current) {
          selectRef.current = null;
          setSelectRect(null);
        }
        if (drag || dragRef.current) {
          dragRef.current = null;
          setDrag(null);
          setDDelta(0);
        }
      }}
    >
      <GanttHeader
        t={t}
        groupBy={groupBy}
        activateMode={activateMode}
        setGB={setGB}
        compact={compact}
        toggleCompact={toggleCompact}
        showLoadHeatmap={showLoadHeatmap}
        toggleLoadHeatmap={toggleLoadHeatmap}
        loadRiskSummary={loadRiskSummary}
        allCollapseKeys={allCollapseKeys}
        expandAll={expandAll}
        collapseAll={collapseAll}
        hR={hR}
        onTimelinePanStart={onTimelinePanStart}
        zoomMode={zoomMode}
        HH={HH}
        months={months}
        monthHeaderLabel={monthHeaderLabel}
        WPX={WPX}
        weeks={weeks}
        todayWi={todayWi}
        weekHeaderLabel={weekHeaderLabel}
        showDays={showDays}
        wdSet={wdSet}
        now={now}
        h1Weeks={h1Weeks}
        h2Weeks={h2Weeks}
        dateToX={dateToX}
        tw={tw}
      />
      <div className="gantt-body">
        <GanttLabelColumn
          lR={lR}
          syncL={syncL}
          onLWheel={onLWheel}
          FLAG_ROW_H={FLAG_ROW_H}
          visibleRows={visibleRows}
          collapsed={collapsed}
          compact={compact}
          rowDepth={rowDepth}
          rowIsCp={rowIsCp}
          cpOnly={cpOnly}
          rowRelevantToCp={rowRelevantToCp}
          RH={RH}
          t={t}
          toggleCollapse={toggleCollapse}
          personQueues={personQueues}
          hoverDepId={hoverDepId}
          hoverLines={hoverLines}
          searchMatches={searchMatches}
          activeMatchId={activeMatchId}
          rowKeyOf={rowKeyOf}
          cursorId={cursorId}
          dragRef={dragRef}
          drag={drag}
          linkDrag={linkDrag}
          showRowTip={showRowTip}
          hideRowTip={hideRowTip}
          handleSelectClick={handleSelectClick}
          openRowItem={openRowItem}
          cpLabels={cpLabels}
          snAll={snAll}
          members={members}
          rowLayout={rowLayout}
          bodyScrollbarH={bodyScrollbarH}
        />
        <div ref={bR} data-testid="gantt-timeline" style={{ flex: 1, overflow: 'auto' }} onScroll={syncS} onMouseDown={onTimelinePanStart}>
          <div
            style={{
              width: tw,
              position: 'relative',
              minHeight: FLAG_ROW_H + rowLayout.height,
              height: compact ? FLAG_ROW_H + rowLayout.height : undefined,
            }}
          >
            <GanttGridLayer
              tw={tw}
              weeks={weeks}
              WPX={WPX}
              showDays={showDays}
              wdSet={wdSet}
              DPX={DPX}
              planStart={planStart}
              dateToX={dateToX}
              t={t}
              todayX={todayX}
              now={now}
              h1Weeks={h1Weeks}
              h2Weeks={h2Weeks}
              dlL={dlL}
            />
            {selectRect &&
              (() => {
                const x = Math.min(selectRect.x1, selectRect.x2);
                const y = Math.min(selectRect.y1, selectRect.y2);
                const w = Math.abs(selectRect.x2 - selectRect.x1);
                const h = Math.abs(selectRect.y2 - selectRect.y1);
                return (
                  <div
                    data-testid="gantt-selection-rect"
                    style={{
                      position: 'absolute',
                      left: x,
                      top: y,
                      width: w,
                      height: h,
                      border: '1px solid var(--ac)',
                      background: 'rgba(59,130,246,.14)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,.16) inset',
                      zIndex: 7,
                      pointerEvents: 'none',
                    }}
                  />
                );
              })()}
            <GanttFlagStrip
              FLAG_ROW_H={FLAG_ROW_H}
              showLoadHeatmap={showLoadHeatmap}
              loadWeekSummary={loadWeekSummary}
              setGB={setGB}
              WPX={WPX}
              dlL={dlL}
              t={t}
            />
            {visibleRows.map((row, _ri) => {
              // Compact stacks several rows onto one lane, so a row cannot sit
              // in normal flow any more — it is placed at the top its lane was
              // given. Everything inside a row is already positioned relative to
              // it, so the bars, the arrows and the hit areas are untouched.
              if (rowHidden(_ri)) return null;
              // FLAG_ROW_H, because that is where the rows begin: in classic they
              // sit in normal flow after the deadline-flag strip, and `rowTop` is
              // measured from the first row, not from the top of the box. Without
              // it every bar in compact sat 18px above where the arrows, the
              // label column and `rowCenterY` all agree it is — which is exactly
              // what "the connecting lines are not where they belong" looks like.
              const _pos = compact ? { position: 'absolute', top: FLAG_ROW_H + rowTop(_ri), left: 0, right: 0, minWidth: tw } : null;
              const _el = (() => {
                if (row.type === 'group') {
                  return (
                    <GanttGroupBarRow
                      key={row.key}
                      row={row}
                      style={{
                        height: RH,
                        position: 'relative',
                        background: 'rgba(127,127,127,.035)',
                        borderBottom: '1px solid var(--b2)',
                      }}
                      dateToX={dateToX}
                      DPX={DPX}
                      WPX={WPX}
                      tw={tw}
                      t={t}
                      rowIsCp={rowIsCp}
                      cpOnly={cpOnly}
                      rowRelevantToCp={rowRelevantToCp}
                      showLoadHeatmap={showLoadHeatmap}
                      groupBy={groupBy}
                      resourceLoadByWeek={resourceLoadByWeek}
                      vacByPerson={vacByPerson}
                      holidayDays={holidayDays}
                    />
                  );
                }
                const s = row.s;
                const rowKey = rowKeyOf(row);
                if (s._unestimated)
                  return <div key={rowKey} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
                if (s._completed && (!s.startD || !s.endD))
                  return <div key={rowKey} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
                return (
                  <GanttTaskBarRow
                    key={rowKey}
                    row={row}
                    rowColor={rowColor}
                    rowIsCp={rowIsCp}
                    drag={drag}
                    dateToX={dateToX}
                    DPX={DPX}
                    WPX={WPX}
                    dDelta={dDelta}
                    showDays={showDays}
                    resizePxPerDay={resizePxPerDay}
                    cpOnly={cpOnly}
                    rowRelevantToCp={rowRelevantToCp}
                    hoverDepId={hoverDepId}
                    hoverLines={hoverLines}
                    searchMatches={searchMatches}
                    iMap={iMap}
                    selectedIds={selectedIds}
                    scheduledWorkDaysOf={scheduledWorkDaysOf}
                    taskLoadCells={taskLoadCells}
                    tw={tw}
                    confidence={confidence}
                    now={now}
                    RH={RH}
                    weeks={weeks}
                    scheduled={scheduled}
                    t={t}
                    baseline={baseline}
                    sinceDate={sinceDate}
                    _diffDoneSet={_diffDoneSet}
                    _diffProgSet={_diffProgSet}
                    activeMatchId={activeMatchId}
                    linkDrag={linkDrag}
                    groupBy={groupBy}
                    dragRef={dragRef}
                    hoverLineKey={hoverLineKey}
                    showRowTip={showRowTip}
                    hideRowTip={hideRowTip}
                    dismissTooltip={dismissTooltip}
                    onReorderSibling={onReorderSibling}
                    onBMD={onBMD}
                    onLinkDrop={onLinkDrop}
                    justDraggedRef={justDraggedRef}
                    onBarClick={onBarClick}
                    handleSelectClick={handleSelectClick}
                    _diffActive={_diffActive}
                    diffPastLeafState={diffPastLeafState}
                    vacBandsByTaskId={vacBandsByTaskId}
                    onTaskUpdate={onTaskUpdate}
                    onResizeStartDoneMD={onResizeStartDoneMD}
                    onResizeEndMD={onResizeEndMD}
                    onLinkStart={onLinkStart}
                  />
                );
              })();
              if (!React.isValidElement(_el)) return _el;
              return React.cloneElement(_el, {
                'data-row-type': row.type,
                ...(_pos
                  ? { style: { ..._el.props.style, ..._pos, borderBottom: row.type === 'task' ? 'none' : _el.props.style?.borderBottom } }
                  : {}),
              });
            })}
            <DepLinesSvg
              renderedDepLines={renderedDepLines}
              tw={tw}
              FLAG_ROW_H={FLAG_ROW_H}
              rowLayout={rowLayout}
              pinnedLineKey={pinnedLineKey}
              hoverLineKey={hoverLineKey}
              hoverDepId={hoverDepId}
              hoverClearTimerRef={hoverClearTimerRef}
              dismissTooltip={dismissTooltip}
              setHoverLineKey={setHoverLineKey}
              setPinnedLineKey={setPinnedLineKey}
              t={t}
              onRemoveDep={onRemoveDep}
            />
          </div>
        </div>
      </div>
      <GanttFooter
        t={t}
        WPX={WPX}
        zoomMode={zoomMode}
        setZ={setZ}
        scrollToToday={scrollToToday}
        searchMatches={searchMatches}
        searchMatchList={searchMatchList}
        searchIdx={searchIdx}
        selectedTaskIds={selectedTaskIds}
        setSelectedIds={setSelectedIds}
        dlL={dlL}
        cpSet={cpSet}
        cpOnly={cpOnly}
        setCpOnly={setCpOnly}
        visibleCriticalCount={visibleCriticalCount}
        unestimatedCount={unestimatedCount}
        allItems={allItems}
        confidence={confidence}
        linkDrag={linkDrag}
      />
      <GanttSelectionBar
        selectedTaskIds={selectedTaskIds}
        setSelectedIds={setSelectedIds}
        linkSelectedInOrder={linkSelectedInOrder}
        t={t}
        reorderSelectionInTime={reorderSelectionInTime}
        adjustSelectionPrio={adjustSelectionPrio}
        onOpenBulkEdit={onOpenBulkEdit}
        clearSelectedLinks={clearSelectedLinks}
        showAssignModal={showAssignModal}
        teams={teams}
        members={members}
        setShowAssignModal={setShowAssignModal}
        tree={tree}
        onTaskUpdate={onTaskUpdate}
      />
      <LinkDragOverlay linkDrag={linkDrag} portalRoot={portalRoot} />
      {/* Hover tooltip on left-panel task names — same Tip component as NetGraph */}
      {tip && (
        <Tip
          item={tip.item}
          x={tip.x + 14}
          y={tip.y + 16}
          teams={teams}
          members={members}
          tree={tree}
          scheduled={scheduled}
          cpLabels={cpLabels}
          vacations={vacBandsByTaskId[tip.item?.id] || EMPTY_ARR}
        />
      )}
    </div>
  );
}

export const GanttView = memo(GanttViewImpl);
