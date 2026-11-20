import React, { useState, useRef, useMemo, memo } from 'react';
import { useCapacityAt } from '../../utils/capacityLens.js';
import { GanttFooter } from './gantt/GanttFooter.jsx';
import { LinkDragOverlay } from './gantt/LinkDragOverlay.jsx';
import { GanttSelectionBar } from './gantt/GanttSelectionBar.jsx';
import { GanttHeader } from './gantt/GanttHeader.jsx';
import { GanttLabelColumn } from './gantt/GanttLabelColumn.jsx';
import { DepLinesSvg } from './gantt/DepLinesSvg.jsx';
import { GanttFlagStrip } from './gantt/GanttFlagStrip.jsx';
import { GanttGridLayer } from './gantt/GanttGridLayer.jsx';
import { useGanttPrefs } from './gantt/useGanttPrefs.js';
import { useGanttSelection } from './gantt/useGanttSelection.js';
import { useGanttScrollTo } from './gantt/useGanttScrollTo.js';
import { useGanttDrag } from './gantt/useGanttDrag.js';
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
import { iso, localDate } from '../../utils/date.js';
import { resolveToLeafIds, isLeafNode } from '../../utils/scheduler.js';
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
  const [selectRect, setSelectRect] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
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
  const { selectedIds, setSelectedIds, handleSelectClick, selectedTaskIds, cursorId } = useGanttSelection({
    visibleRows,
    bR,
    onReorderSibling,
    onBarClick,
  });
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

  const { bodyScrollbarH, scrollToToday } = useGanttScrollTo({ bR, visibleRows, tw, showDays, WPX, RH, dateToX, todayX, activeMatchId });

  const {
    onBMD,
    onTimelinePanStart,
    onResizeEndMD,
    onResizeStartDoneMD,
    onMM,
    onMU,
    onLinkStart,
    onLinkDrop,
    dragRef,
    selectRef,
    justDraggedRef,
    clearTimelinePan,
  } = useGanttDrag({
    dismissTooltip,
    iMap,
    onReorderSibling,
    compact,
    rowIdx,
    drag,
    setDrag,
    dDelta,
    setDDelta,
    bR,
    hR,
    lR,
    setSelectRect,
    selectedIds,
    setSelectedIds,
    selectedTaskIds,
    scheduledWorkDaysOf,
    resizePxPerDay,
    showDays,
    DPX,
    WPX,
    RH,
    linkDrag,
    setLinkDrag,
    visibleRows,
    taskBarRectForRow,
    onSeqUpdate,
    weeks,
    vacByPerson,
    wdSet,
    onExtendViewStart,
    pinnedLineKey,
    setPinnedLineKey,
    onAddDep,
  });

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
