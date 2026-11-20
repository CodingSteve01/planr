import React, { useState, useRef, useMemo, useEffect, useLayoutEffect, useCallback, memo } from 'react';
import { useCapacityAt } from '../../utils/capacityLens.js';
import { isOnScreen } from '../../utils/onScreen.js';
import { PersonChip } from '../shared/PersonChip.jsx';
import { Icon } from '../shared/Icon.jsx';
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
import { tipLines } from '../../utils/tipText.js';
import { fixedFrame, toFixedPoint, usePortalRoot } from '../../utils/embedHost.js';
import { WPX as DEFAULT_WPX, MDE } from '../../constants.js';
import { iso, addD, localDate } from '../../utils/date.js';
import { resolveToLeafIds, isLeafNode, fixedDurationDays, leafProgress } from '../../utils/scheduler.js';
import { treeOrderRank } from '../../utils/displayOrder.js';
import { buildThreadStructure } from '../../utils/threads.js';
import { deadlineStatus } from '../../utils/timeline.js';
import { normalizePhases, phaseWeightShares } from '../../utils/phases.js';
import { chainShorts } from '../../utils/handoff.js';
import { buildMemberShortMap } from '../../App.jsx';
import { Tip } from '../shared/Tooltip.jsx';
import { StatusIcon } from '../shared/StatusIcon.jsx';
import { CriticalPathBadge } from '../shared/CriticalPathBadge.jsx';
import { SelectionActionBar } from '../shared/SelectionActionBar.jsx';
import { AssignModal } from '../modals/AssignModal.jsx';
import { useT } from '../../i18n.jsx';
import {
  NO_TEAM,
  NO_TEAM_COLOR,
  NO_PERSON,
  EMPTY_ARR,
  DAY_ZOOM,
  MONTH_ZOOM,
  normalizeViewMode,
  fmtLoadDays,
  loadHeatColor,
  loadHeatStroke,
  rowDrawsBar,
} from '../../utils/gantt/helpers.js';

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
  // Zoom: WPX = pixels per week. 20 = default, lower zooms out (months), higher zooms in (toward day-level)
  const [zoom, setZoom] = useState(() => {
    try {
      return +localStorage.getItem('planr_gantt_zoom') || DAY_ZOOM;
    } catch {
      return DAY_ZOOM;
    }
  });
  const clampZoom = v => Math.max(8, Math.min(140, v));
  const setZ = v => {
    const c = clampZoom(v);
    setZoom(c);
    try {
      localStorage.setItem('planr_gantt_zoom', String(c));
    } catch {}
    return c;
  };
  const WPX = zoom;
  const showDays = WPX >= 70; // at this zoom, individual days fit (~14 px each)
  const zoomMode = showDays ? 'day' : WPX <= 12 ? 'month' : 'week';
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
  const activateMode = (e, action) => {
    if (e.button !== 0) return;
    e.preventDefault();
    action();
  };
  const hR = useRef(null),
    bR = useRef(null),
    lR = useRef(null);
  const hoverClearTimerRef = useRef(null);
  const zoomAnchorRef = useRef(null);
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
  const onTimelineWheel = useCallback(
    e => {
      const isZoomGesture = e.ctrlKey || e.metaKey;
      if (!isZoomGesture) return;
      e.preventDefault();
      e.stopPropagation();
      const body = bR.current;
      if (!body) {
        setZ(WPX * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
        return;
      }
      const rect = body.getBoundingClientRect();
      const anchorX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const timeAtPointer = (body.scrollLeft + anchorX) / Math.max(WPX, 1);
      zoomAnchorRef.current = { timeAtPointer, anchorX };
      setZ(WPX * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    },
    [WPX],
  );
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    if (!anchor || !bR.current) return;
    zoomAnchorRef.current = null;
    bR.current.scrollLeft = Math.max(0, anchor.timeAtPointer * WPX - anchor.anchorX);
    if (hR.current) hR.current.scrollLeft = bR.current.scrollLeft;
  }, [WPX]);
  useEffect(() => {
    const targets = [hR.current, bR.current].filter(Boolean);
    if (!targets.length) return undefined;
    targets.forEach(el => el.addEventListener('wheel', onTimelineWheel, { passive: false }));
    return () => targets.forEach(el => el.removeEventListener('wheel', onTimelineWheel));
  }, [onTimelineWheel]);
  useEffect(() => {
    try {
      localStorage.setItem('planr_gantt_collapsed', JSON.stringify(collapsedByMode));
    } catch {}
  }, [collapsedByMode]);

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
    [scheduled, tree, leafIdSet, memberById, rootFilter, teamFilter, personFilter, workDays],
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
    [allItems, displayItems, groupBy, iMap, childrenByParent, rootIds, tree, teams, memberById, teamById, confidence, t, threadStructure],
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
    [allItems, iMap, memberById, members, vacByPerson, weeks, meetingPlans, teams, todayIso],
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
      <div className="gantt-hdr">
        <div
          className="gh-fix"
          style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4, padding: '4px 10px' }}
        >
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* group label removed — buttons are self-explanatory and the row was too wide */}
            {/* The chips had no tooltips at all, so which question each grouping
              answers — and that one of them is where a person's order is set —
              was something you had to already know. */}
            {[
              ['project', t('g.project')],
              ['team', t('g.team')],
              ['resource', t('g.resource')],
              ['thread', t('g.thread')],
            ].map(([k, l]) => (
              <button
                key={k}
                data-htip={t(`g.group.${k}Tip`)}
                className={`btn btn-xs ${groupBy === k ? 'btn-pri' : 'btn-sec'}`}
                onMouseDown={e => activateMode(e, () => setGB(k))}
                onClick={e => {
                  if (e.detail === 0) setGB(k);
                }}
                style={{ padding: '2px 7px', fontSize: 11 }}
              >
                {l}
              </button>
            ))}
            <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
            {/* Beside the grouping pills, because it answers the same kind of
              question: the pills say what a row IS, this says how many rows
              there are. */}
            <button
              className={`btn btn-xs ${compact ? 'btn-pri' : 'btn-sec'}`}
              onClick={toggleCompact}
              aria-pressed={compact}
              data-testid="gantt-compact-toggle"
              data-htip={compact ? t('g.classicTip') : t('g.compactTip')}
              style={{ padding: '2px 7px', fontSize: 11 }}
            >
              {compact ? '●' : '○'} {t('g.compact')}
            </button>
            <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
            {/* The overload figure used to be a badge of its own, standing in
              the row of grouping pills — a number in a place that is
              otherwise a set of choices, which is why it read as a control
              and got looked at as neither. It lives on this toggle's tooltip
              now: same detail, one hover away, at the switch that turns the
              reading on. The count itself is still a filter chip under
              Filter, where a number you might want to ACT on belongs. */}
            <button
              className={`btn btn-xs ${showLoadHeatmap ? 'btn-pri' : 'btn-sec'}`}
              onClick={toggleLoadHeatmap}
              aria-pressed={showLoadHeatmap}
              data-htip={showLoadHeatmap ? loadRiskSummary.tip : t('g.loadHeatmapTip')}
              data-testid="gantt-load-toggle"
              style={{ padding: '2px 7px', fontSize: 11 }}
            >
              {showLoadHeatmap ? '●' : '○'} {t('g.loadHeatmap')}
            </button>
            {/* Overbooking now surfaces as a global quick-filter chip in the
              app's subtoolbar so the same indicator works for every view. */}
            {allCollapseKeys.length > 0 && (
              <>
                <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
                <button
                  className="btn btn-sec btn-xs"
                  data-testid="gantt-expand-all"
                  onClick={expandAll}
                  style={{ padding: '2px 7px', fontSize: 11 }}
                >
                  {t('tv.expandAll')}
                </button>
                <button className="btn btn-sec btn-xs" onClick={collapseAll} style={{ padding: '2px 7px', fontSize: 11 }}>
                  {t('tv.collapseAll')}
                </button>
              </>
            )}
          </div>
        </div>
        <div ref={hR} className="gh-scroll" onMouseDown={onTimelinePanStart}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--b)', height: zoomMode === 'month' ? HH : HH / 2 }}>
            {months.map((m, i) => {
              const [y, mo] = m.ym.split('-');
              const isYS = mo === '0';
              const label = monthHeaderLabel(m);
              const title = `${MDE[+mo]} '${y.slice(2)}`;
              return (
                <div
                  key={i}
                  style={{
                    width: WPX * m.count,
                    flexShrink: 0,
                    borderRight: '1px solid var(--b2)',
                    padding: zoomMode === 'month' ? '2px 4px' : '2px 5px',
                    fontSize: zoomMode === 'month' ? 10 : 11,
                    color: isYS ? 'var(--ac)' : 'var(--tx2)',
                    fontFamily: 'var(--mono)',
                    fontWeight: isYS ? 600 : 500,
                    overflow: 'hidden',
                    background: isYS ? 'var(--bg3)' : '',
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                  title={title}
                >
                  {label}
                </div>
              );
            })}
          </div>
          {zoomMode !== 'month' && (
            <div style={{ display: 'flex', height: HH / 2 }}>
              {weeks.map((w, i) => {
                const isYB = i > 0 && weeks[i - 1].mon.getFullYear() !== w.mon.getFullYear();
                const isNow = todayWi >= 0 && i === todayWi;
                const label = weekHeaderLabel(w, i, isYB, isNow);
                return (
                  <div
                    key={i}
                    className={isNow ? 'gw-now' : w.hasH ? 'gw-hol' : isYB ? 'gw-yb' : ''}
                    style={{
                      width: WPX,
                      flexShrink: 0,
                      borderRight: '1px solid var(--b)',
                      borderLeft: isYB ? '2px solid var(--ac2)' : '',
                      textAlign: 'center',
                      fontSize: 11,
                      color: isNow ? 'var(--gr)' : w.hasH ? 'var(--re)' : 'var(--tx3)',
                      fontFamily: 'var(--mono)',
                      fontWeight: isNow ? 700 : 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      lineHeight: `${HH / 2}px`,
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          )}
          {/* Day-level header row: all 7 days (Mon–Sun). Weekends grayed. */}
          {showDays && (
            <div style={{ display: 'flex', height: 14, borderTop: '1px solid var(--b2)' }}>
              {weeks.map((w, i) => (
                <div key={i} style={{ width: WPX, flexShrink: 0, display: 'flex' }}>
                  {[0, 1, 2, 3, 4, 5, 6].map(d => {
                    const date = addD(w.mon, d);
                    const dow = date.getDay();
                    const isWeekend = !wdSet.has(dow);
                    const isToday = date.toDateString() === now.toDateString();
                    return (
                      <div
                        key={d}
                        style={{
                          flex: 1,
                          fontSize: 10,
                          textAlign: 'center',
                          color: isToday ? 'var(--gr)' : isWeekend ? 'var(--tx3)' : 'var(--tx2)',
                          fontWeight: isToday ? 700 : 400,
                          fontFamily: 'var(--mono)',
                          borderRight: d < 6 ? '1px solid var(--b2)' : 'none',
                          lineHeight: '14px',
                          opacity: isWeekend ? 0.4 : 1,
                          background: isWeekend ? 'rgba(127,127,127,.06)' : '',
                        }}
                      >
                        {date.getDate()}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {/* Horizon color band: green(H1) → amber(H2) → gray(beyond) */}
          {(() => {
            const h1D = new Date(now);
            h1D.setDate(h1D.getDate() + h1Weeks * 7);
            const h2D = new Date(now);
            h2D.setDate(h2D.getDate() + h2Weeks * 7);
            const todX = dateToX(now),
              h1X = dateToX(h1D),
              h2X = dateToX(h2D);
            return (
              <div style={{ display: 'flex', height: 3, position: 'relative', overflow: 'hidden', width: tw }}>
                {todX > 0 && <div style={{ position: 'absolute', left: 0, width: todX, height: '100%', background: 'var(--bg3)' }} />}
                {h1X > todX && (
                  <div
                    style={{
                      position: 'absolute',
                      left: Math.max(todX, 0),
                      width: h1X - Math.max(todX, 0),
                      height: '100%',
                      background: 'var(--gr)',
                      opacity: 0.5,
                    }}
                    data-htip={t('g.h1BandTip', h1Weeks)}
                  />
                )}
                {h2X > h1X && (
                  <div
                    style={{ position: 'absolute', left: h1X, width: h2X - h1X, height: '100%', background: 'var(--am)', opacity: 0.4 }}
                    data-htip={t('g.h2BandTip', h2Weeks)}
                  />
                )}
                <div
                  style={{ position: 'absolute', left: h2X, right: 0, height: '100%', background: 'var(--tx3)', opacity: 0.15 }}
                  data-htip={t('g.beyondH2BandTip')}
                />
              </div>
            );
          })()}
        </div>
      </div>
      <div className="gantt-body">
        <div ref={lR} className="gantt-left" style={{ overflowY: 'hidden' }} onScroll={syncL} onWheel={onLWheel}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 8,
              height: FLAG_ROW_H,
              borderBottom: '1px solid var(--b)',
              background: 'var(--bg)',
            }}
          />
          {(() => {
            let _taskIdx = 0;
            return visibleRows.map((row, _ri) => {
              // In compact a row is a lane, so the only things that still own one
              // are the grouping's own containers — the project, the team, the
              // person, the thread, whichever the pills chose. Task rows and the
              // work packages between them do not: several of them share a lane,
              // and a label per task would name rows that no longer correspond to
              // them. The names live on the bars there.
              const _folded = row.type !== 'task' && !!row.children?.length && collapsed.has(row.collapseKey || row.key);
              if (compact && (row.type === 'task' || ((rowDepth.get(row) ?? 0) > 0 && !_folded))) return null;
              const _el = (() => {
                if (row.type === 'group') {
                  const isCol = collapsed.has(row.collapseKey || row.key);
                  const isCp = rowIsCp(row);
                  const dim = cpOnly && !rowRelevantToCp(row);
                  return (
                    <div
                      key={row.key}
                      className="gteam"
                      style={{
                        color: isCp ? 'var(--re)' : row.color,
                        borderLeft: `3px solid ${isCp ? 'var(--re)' : row.color}`,
                        background: isCp ? 'rgba(127,16,18,.06)' : 'var(--bg2)',
                        paddingLeft: 6,
                        height: RH,
                        cursor: 'default',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4, // Sentence case. A group header is a person's or a project's NAME
                        // — uppercase with letter-spacing is a label style, and on a
                        // real plan it made every name both wider and harder to read
                        // for no gain. The colour bar on the left already says "this
                        // is a header".
                        fontSize: 12.5,
                        fontWeight: 600,
                        letterSpacing: '.005em',
                        opacity: dim ? 0.25 : 1,
                      }}
                    >
                      <button
                        type="button"
                        aria-label={isCol ? t('tv.expandAll') : t('tv.collapseAll')}
                        onClick={e => {
                          e.stopPropagation();
                          toggleCollapse(row.collapseKey || row.key);
                        }}
                        style={{
                          appearance: 'none',
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          color: 'var(--tx3)',
                          width: 12,
                          display: 'inline-flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name={isCol ? 'chevronRight' : 'chevronDown'} size={11} strokeWidth={2.2} />
                      </button>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                      {/* Read-only, and worth the two words: this person's bars sit in
                  an order they were given rather than the plan's, and without
                  the note nothing on this screen would explain that. Changing
                  it happens in the Work order view, which is flat — a queue
                  shown as a project hierarchy is not a queue. */}
                      {row.personId && personQueues?.[row.personId] && (
                        <span
                          data-testid={`queue-sorted-${row.personId}`}
                          data-htip={t('g.queueSortedTip')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            marginRight: 6,
                            padding: '0 5px',
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: 0,
                            textTransform: 'none',
                            color: 'var(--tx2)',
                            background: 'var(--bg3)',
                            border: '1px solid var(--b2)',
                            borderRadius: 3,
                          }}
                        >
                          {t('g.queueSorted')}
                        </span>
                      )}
                      {/* What a group header is for: how much work is in it, how much
                  of it is behind you, and how much effort it carries. The
                  header used to say only its own name and a count, so reading
                  "is this team ahead or behind" meant collapsing it and
                  adding up. All three in mono, right-aligned, quiet — the
                  name is what should still be the loudest thing in the row. */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          marginRight: 8,
                          fontSize: 11,
                          fontWeight: 400,
                          fontFamily: 'var(--mono)',
                          color: 'var(--tx3)',
                          letterSpacing: 0,
                        }}
                      >
                        {row.s?._doneCount != null && row.count > 0 && (
                          <span data-htip={t('g.groupDoneTip')}>
                            {row.s._doneCount}/{row.count}
                          </span>
                        )}
                        {row.s?.effort > 0 && <span data-htip={t('g.groupEffortTip')}>{Math.round(row.s.effort)} PT</span>}
                        {row.s?.progress > 0 && (
                          <span style={{ color: row.s.progress >= 99.95 ? 'var(--st-done)' : 'var(--tx2)' }}>
                            {Math.round(row.s.progress)}%
                          </span>
                        )}
                      </span>
                    </div>
                  );
                }
                const s = row.s;
                const isSummary = row.type === 'summary';
                const isCp = rowIsCp(row);
                const dim = cpOnly && !rowRelevantToCp(row);
                const indent = row.level * 6;
                const isHovDep = hoverDepId && hoverLines.rowIds.has(s.id) && s.id !== hoverDepId;
                const isHov = hoverDepId === s.id;
                const isMatchL = searchMatches?.has(s.id);
                const isActiveMatchL = s.id === activeMatchId;
                const searchDimmedL = searchMatches && searchMatches.size > 0 && !isMatchL;
                const statusProgress = s.progress ?? row.node?.progress ?? (s.status === 'done' ? 100 : s.status === 'wip' ? 50 : 0);
                const isCollapsed = !!row.collapseKey && collapsed.has(row.collapseKey);
                const _alt = _taskIdx++ % 2 === 1;
                return (
                  <div
                    key={rowKeyOf(row)}
                    data-task-id={row.type === 'task' ? s.treeId || s.id : undefined}
                    data-gantt-cursor={cursorId && (s.treeId || s.id) === cursorId ? '1' : undefined}
                    className={`grow-l${isCp ? ' cp-row' : ''}${_alt ? ' alt' : ''}${cursorId && (s.treeId || s.id) === cursorId ? ' cursor-row' : ''}`}
                    style={{
                      height: RH,
                      cursor: 'pointer',
                      opacity: dim ? 0.25 : searchDimmedL ? 0.35 : s._unestimated ? 0.55 : 1,
                      paddingLeft: 10 + indent,
                      background: isActiveMatchL
                        ? 'rgba(59,130,246,.15)'
                        : isCp
                          ? 'rgba(127,16,18,.06)'
                          : isHov
                            ? 'rgba(127,127,127,.10)'
                            : isHovDep
                              ? 'rgba(127,127,127,.05)'
                              : '',
                    }}
                    onMouseEnter={e => {
                      if (dragRef.current || drag || linkDrag) return;
                      showRowTip(row, e, !isSummary);
                    }}
                    onMouseLeave={() => hideRowTip(row, !isSummary)}
                    onClick={e => {
                      if (row.type === 'task' && handleSelectClick(e, s.treeId || s.id)) return;
                      openRowItem(row);
                    }}
                  >
                    {isSummary && (
                      <button
                        type="button"
                        aria-label={isCollapsed ? t('tv.expandAll') : t('tv.collapseAll')}
                        onClick={e => {
                          e.stopPropagation();
                          toggleCollapse(row.collapseKey);
                        }}
                        style={{
                          appearance: 'none',
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          color: 'var(--tx3)',
                          width: 12,
                          display: 'inline-flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          flexShrink: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={11} strokeWidth={2.2} />
                      </button>
                    )}
                    <StatusIcon status={s.status} progress={statusProgress} style={{ flexShrink: 0 }} />
                    {isCp && <CriticalPathBadge id={s.id} labels={cpLabels} compact style={{ flexShrink: 0 }} />}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: isSummary ? 600 : 400,
                        color: isSummary ? 'var(--tx)' : 'var(--tx2)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textDecoration: s.status === 'done' ? 'line-through' : 'none',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {s.name}
                    </span>
                    {/* "kein Aufwand" used to be a full amber badge on every such row.
                On the real plan that is nine identical pills down one group,
                shouting the same thing nine times and drowning out the names
                beside them. The count is already on the footer bar and in the
                quick filters; here it only has to mark the row, so it is a
                mark. */}
                    {!isSummary &&
                      (s._unestimated ? (
                        <span
                          data-htip={t('g.noEstimate')}
                          style={{
                            marginLeft: 'auto',
                            flexShrink: 0,
                            fontFamily: 'var(--mono)',
                            fontSize: 11,
                            color: 'var(--st-wip)',
                            letterSpacing: '.08em',
                          }}
                        >
                          —
                        </span>
                      ) : s.autoAssigned ? (
                        <PersonChip
                          auto
                          short={snAll(s)}
                          title={`${t('aa.suggestion')} ${s.person || ''}`}
                          style={{ flexShrink: 0, marginLeft: 'auto' }}
                        />
                      ) : (
                        <PersonChip
                          short={snAll(s)}
                          style={{ flexShrink: 0, marginLeft: 'auto' }}
                          title={(s.assign || []).map(id => members.find(m => m.id === id)?.name || id).join(', ') || s.person}
                        />
                      ))}
                  </div>
                );
              })();
              if (!compact || !_el) return _el;
              // Next row that gets a label of its own; everything between is a
              // lane and its height belongs to this block.
              //
              // "Everything between" has to mean every row compact hides, and that
              // is not only the tasks: the work packages inside a group are hidden
              // too. Skipping only the tasks made this stop at the first package,
              // whose top is the top of the group's lane area — so the block was
              // one row tall, every label after it slid up, and the two columns
              // came apart by a little more with each group.
              const _hidden = r =>
                r.type === 'task' ||
                ((rowDepth.get(r) ?? 0) > 0 && !(r.type !== 'task' && !!r.children?.length && collapsed.has(r.collapseKey || r.key)));
              let _next = _ri + 1;
              while (_next < visibleRows.length && _hidden(visibleRows[_next])) _next++;
              const _h = (_next < visibleRows.length ? rowLayout.tops[_next] : rowLayout.height) - rowLayout.tops[_ri];
              return (
                <div key={`lane-block-${_ri}`} style={{ height: Math.max(RH, _h), overflow: 'hidden' }}>
                  {_el}
                </div>
              );
            });
          })()}
          {bodyScrollbarH > 0 && <div style={{ height: bodyScrollbarH, borderTop: '1px solid var(--b)', background: 'var(--bg)' }} />}
        </div>
        <div ref={bR} data-testid="gantt-timeline" style={{ flex: 1, overflow: 'auto' }} onScroll={syncS} onMouseDown={onTimelinePanStart}>
          <div
            style={{
              width: tw,
              position: 'relative',
              minHeight: FLAG_ROW_H + rowLayout.height,
              height: compact ? FLAG_ROW_H + rowLayout.height : undefined,
            }}
          >
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: tw, pointerEvents: 'none', zIndex: 0 }}>
              {/* Week columns. When the day grid is visible we don't tint the whole week red —
                individual holiday days get tinted below instead. */}
              {weeks.map((w, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: i * WPX,
                    top: 0,
                    width: WPX,
                    height: '100%',
                    borderRight: '1px solid var(--b)',
                    background: !showDays && w.hasH ? 'rgba(244,63,94,.10)' : '',
                  }}
                />
              ))}
              {/* Day-level overlays: all 7 days. Weekends grayed, holidays red-tinted, separators. */}
              {showDays &&
                weeks.map((w, i) => {
                  const wdsByTime = new Set(w.wds.map(d => d.getTime()));
                  return [0, 1, 2, 3, 4, 5, 6].map(d => {
                    const date = addD(w.mon, d);
                    const dow = date.getDay();
                    const isWeekend = !wdSet.has(dow);
                    const isHoliday = !isWeekend && !wdsByTime.has(date.getTime());
                    return (
                      <React.Fragment key={`d-${i}-${d}`}>
                        {isWeekend && (
                          <div
                            style={{
                              position: 'absolute',
                              left: i * WPX + d * DPX,
                              top: 0,
                              width: DPX,
                              height: '100%',
                              background: 'rgba(127,127,127,.10)',
                            }}
                          />
                        )}
                        {isHoliday && (
                          <div
                            style={{
                              position: 'absolute',
                              left: i * WPX + d * DPX,
                              top: 0,
                              width: DPX,
                              height: '100%',
                              background: 'rgba(244,63,94,.14)',
                            }}
                          />
                        )}
                        {d > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              left: i * WPX + d * DPX,
                              top: 0,
                              width: 1,
                              height: '100%',
                              background: isWeekend ? 'var(--b2)' : 'var(--b2)',
                              opacity: isWeekend ? 0.2 : 0.35,
                            }}
                          />
                        )}
                      </React.Fragment>
                    );
                  });
                })}
              {/* Pre-planStart zone: striped overlay for the rendering area before the scheduling horizon */}
              {(() => {
                const psX = planStart ? dateToX(new Date(planStart)) : 0;
                return psX > 0 ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: psX,
                      height: '100%',
                      background:
                        'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(127,127,127,.06) 4px, rgba(127,127,127,.06) 8px)',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }}
                    data-htip={t('g.prePlanStartTip')}
                  />
                ) : null;
              })()}
              {/* Past zone: subtle dim overlay for everything before today */}
              {todayX > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: todayX,
                    height: '100%',
                    background: 'rgba(0,0,0,.06)',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              )}
              {/* Today marker — always day-accurate */}
              {todayX >= 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: todayX,
                    top: 0,
                    width: 2,
                    height: '100%',
                    background: 'var(--gr)',
                    opacity: 0.7,
                    zIndex: 5,
                  }}
                />
              )}
              {/* Horizon lines: H1 (committed boundary) and H2 (estimated boundary) */}
              {(() => {
                const h1Date = new Date(now);
                h1Date.setDate(h1Date.getDate() + h1Weeks * 7);
                const h2Date = new Date(now);
                h2Date.setDate(h2Date.getDate() + h2Weeks * 7);
                const h1X = dateToX(h1Date);
                const h2X = dateToX(h2Date);
                return (
                  <>
                    {h1X > 0 && h1X < tw && (
                      <div
                        style={{
                          position: 'absolute',
                          left: h1X,
                          top: 0,
                          width: 0,
                          height: '100%',
                          borderLeft: '2px dashed var(--ac)',
                          opacity: 0.35,
                          zIndex: 3,
                        }}
                        data-htip={t('g.h1LineTip', h1Weeks)}
                      />
                    )}
                    {h1X > 0 && h1X < tw && (
                      <div
                        style={{
                          position: 'absolute',
                          left: h1X + 4,
                          top: 2,
                          fontSize: 10,
                          color: 'var(--ac)',
                          opacity: 0.5,
                          fontFamily: 'var(--mono)',
                          zIndex: 4,
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                        }}
                      >
                        H1 · {h1Weeks}w
                      </div>
                    )}
                    {h2X > 0 && h2X < tw && (
                      <div
                        style={{
                          position: 'absolute',
                          left: h2X,
                          top: 0,
                          width: 0,
                          height: '100%',
                          borderLeft: '2px dashed var(--am)',
                          opacity: 0.3,
                          zIndex: 3,
                        }}
                        data-htip={t('g.h2LineTip', h2Weeks)}
                      />
                    )}
                    {h2X > 0 && h2X < tw && (
                      <div
                        style={{
                          position: 'absolute',
                          left: h2X + 4,
                          top: 2,
                          fontSize: 10,
                          color: 'var(--am)',
                          opacity: 0.5,
                          fontFamily: 'var(--mono)',
                          zIndex: 4,
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                        }}
                      >
                        H2 · {h2Weeks}w
                      </div>
                    )}
                  </>
                );
              })()}
              {dlL.map(dl => {
                const x = dl.x;
                const col = dl.severity === 'critical' ? 'var(--re)' : 'var(--am)';
                // Backfill: gentle gradient fading from the deadline mast to the left, so the eye
                // naturally traces the runway leading up to the date. Capped at 8 weeks.
                const backfillW = Math.min(x, 8 * WPX);
                const titleStr = `${dl.name} ${dl.date}${dl.isLate ? ` — ${t('s.atRisk')}` : ''}`;
                return (
                  <React.Fragment key={dl.id}>
                    {backfillW > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          left: x - backfillW,
                          top: 0,
                          width: backfillW,
                          height: '100%',
                          background: `linear-gradient(to right, transparent, ${dl.severity === 'critical' ? 'rgba(244,63,94,.14)' : 'rgba(245,158,11,.14)'})`,
                          pointerEvents: 'none',
                          zIndex: 3,
                        }}
                        data-htip={titleStr}
                      />
                    )}
                    {/* Mast: vertical line at the exact deadline date */}
                    <div
                      style={{ position: 'absolute', left: x, top: 0, width: 2, height: '100%', background: col, opacity: 0.7, zIndex: 4 }}
                      data-htip={titleStr}
                    />
                  </React.Fragment>
                );
              })}
            </div>
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
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 8,
                height: FLAG_ROW_H,
                borderBottom: '1px solid var(--b)',
                background: 'var(--bg)',
                boxShadow: '0 1px 0 var(--b)',
              }}
            >
              {showLoadHeatmap &&
                loadWeekSummary.map(cell => {
                  const pct = cell.maxPercent || 0;
                  const isRisk = pct >= 90 && !cell.historicalOnly;
                  const h = isRisk ? FLAG_ROW_H : 5;
                  const top = isRisk ? 0 : FLAG_ROW_H - h;
                  return (
                    <div
                      key={`load-strip-${cell.wi}`}
                      data-htip={cell.tip}
                      onClick={() => setGB('resource')}
                      style={{
                        position: 'absolute',
                        left: cell.wi * WPX,
                        top,
                        width: WPX,
                        height: h,
                        background: pct > 0 ? loadHeatColor(pct, cell) : 'transparent',
                        borderBottom: pct > 0 ? `2px solid ${loadHeatStroke(pct, cell)}` : 'none',
                        opacity: pct > 0 ? (isRisk ? 0.88 : 0.62) : 0,
                        cursor: pct > 0 ? 'pointer' : 'default',
                        zIndex: 0,
                        pointerEvents: pct > 0 ? 'auto' : 'none',
                      }}
                    />
                  );
                })}
              {dlL.map(dl => {
                const x = dl.x;
                const col = dl.severity === 'critical' ? 'var(--re)' : 'var(--am)';
                const titleStr = `${dl.name} ${dl.date}${dl.isLate ? ` — ${t('s.atRisk')}` : ''}`;
                return (
                  <React.Fragment key={`flag-${dl.id}`}>
                    <div
                      style={{
                        position: 'absolute',
                        left: x,
                        top: 0,
                        width: 2,
                        height: FLAG_ROW_H,
                        background: col,
                        opacity: 0.8,
                        zIndex: 2,
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        left: x,
                        top: 1,
                        display: 'flex',
                        alignItems: 'center',
                        maxWidth: 120,
                        pointerEvents: 'auto',
                        zIndex: 3,
                      }}
                      data-htip={titleStr}
                    >
                      <div
                        style={{
                          background: col,
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: 'var(--mono)',
                          padding: '2px 6px 2px 8px',
                          letterSpacing: '.02em',
                          clipPath: 'polygon(6px 0, 100% 0, calc(100% - 4px) 50%, 100% 100%, 6px 100%, 0 50%)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 118,
                        }}
                      >
                        {dl.isLate ? '! ' : ''}
                        {dl.name}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
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
                  const s = row.s;
                  const hasWindow = s?.startD && s?.endD && !s?._unestimated;
                  let baseLeft = 0;
                  let baseWidth = 0;
                  if (hasWindow) {
                    baseLeft = dateToX(s.startD) + 2;
                    baseWidth = dateToX(s.endD) + DPX - dateToX(s.startD) - 4;
                  }
                  const barLeft = Math.max(0, baseLeft);
                  const barWidth = Math.max(baseWidth, 6);
                  const groupStyle =
                    s?.status === 'done'
                      ? { background: 'var(--bg4)', border: '1px solid var(--b2)', color: 'var(--tx2)', textShadow: 'none' }
                      : { background: 'var(--bg3)', border: '1px solid var(--b2)', color: 'var(--tx)', textShadow: 'none' };
                  const groupProgress = s?.progress ?? (s?.status === 'done' ? 100 : s?.status === 'wip' ? 50 : 0);
                  const isCp = rowIsCp(row);
                  const dim = cpOnly && !rowRelevantToCp(row);
                  const loadCells =
                    showLoadHeatmap && groupBy === 'resource' && row.personId && row.personId !== NO_PERSON
                      ? resourceLoadByWeek[row.personId]
                      : null;
                  // A person's own row, in resource grouping: the one row that
                  // belongs to exactly one person, so the one place their
                  // absence can be drawn across the whole timeline without
                  // repeating it on every task (see docs/gantt.md).
                  const ownPerson = groupBy === 'resource' && row.personId && row.personId !== NO_PERSON ? row.personId : null;
                  const personVacs = ownPerson ? vacByPerson[ownPerson] || EMPTY_ARR : EMPTY_ARR;
                  return (
                    <div
                      key={row.key}
                      style={{
                        height: RH,
                        position: 'relative',
                        background: 'rgba(127,127,127,.035)',
                        borderBottom: '1px solid var(--b2)',
                      }}
                    >
                      {ownPerson &&
                        holidayDays.map(h => (
                          <div
                            key={`hol-${h.iso}`}
                            data-person-holiday={h.iso}
                            data-htip={`${t('g.holiday')}: ${h.iso}`}
                            style={{
                              position: 'absolute',
                              left: h.x,
                              top: 0,
                              width: Math.max(DPX, 3),
                              height: '100%',
                              background: 'color-mix(in srgb, var(--st-risk) 22%, transparent)',
                              zIndex: 1,
                            }}
                          />
                        ))}
                      {personVacs.map((v, vi) => {
                        const from = localDate(v.from),
                          to = localDate(v.to);
                        if (!from || !to) return null;
                        const left = dateToX(from),
                          right = dateToX(to) + DPX;
                        if (right <= 0 || left >= tw) return null;
                        return (
                          <div
                            key={`vac-${vi}`}
                            data-person-vacation={`${v.from}_${v.to}`}
                            data-htip={`${row.label} · ${t('g.vacation')}: ${v.from} → ${v.to}${v.note ? ' · ' + v.note : ''}`}
                            style={{
                              position: 'absolute',
                              left: Math.max(0, left),
                              width: Math.max(3, right - Math.max(0, left)),
                              top: 0,
                              bottom: 0,
                              zIndex: 3,
                              // The bars' absence mark, at row scale: hatched wash,
                              // solid seams where it starts and ends.
                              background:
                                'repeating-linear-gradient(45deg, color-mix(in srgb, var(--st-wip) 45%, transparent) 0 2px, transparent 2px 6px)',
                              boxShadow: 'inset 2px 0 0 var(--st-wip), inset -2px 0 0 var(--st-wip)',
                            }}
                          />
                        );
                      })}
                      {loadCells?.map(cell => {
                        const pct = cell.percent || 0;
                        const taskLines = (cell.tasks || EMPTY_ARR)
                          .slice(0, 8)
                          .map(task => `- ${task.id} ${task.name} · ${fmtLoadDays(task.load)}`);
                        const tip = tipLines(
                          `**${row.label} · KW ${cell.kw} (${cell.start})**`,
                          `${pct}% · ${fmtLoadDays(cell.load)} / ${fmtLoadDays(cell.availability)}`,
                          ...(taskLines.length ? taskLines : [`__${t('g.loadNoWork')}__`]),
                        );
                        return (
                          <div
                            key={`load-${cell.wi}`}
                            data-htip={tip}
                            style={{
                              position: 'absolute',
                              left: cell.wi * WPX,
                              top: 0,
                              width: WPX,
                              // Same move as the task rows: a strip along the
                              // baseline rather than a block behind the bar. The
                              // hover target stays the full height so the week's
                              // figures are still one hover away.
                              height: '100%',
                              background: 'transparent',
                              borderBottom: `4px solid ${loadHeatStroke(pct, cell)}`,
                              borderRight: pct > 110 ? '1px solid var(--st-risk)' : '1px solid rgba(127,127,127,.08)',
                              pointerEvents: 'auto',
                              zIndex: 0,
                            }}
                          />
                        );
                      })}
                      {hasWindow && (
                        <div
                          className={`gbar${isCp ? ' cp-bar' : ''}`}
                          style={{
                            left: barLeft,
                            width: barWidth,
                            top: 5,
                            height: 18,
                            borderRadius: 5,
                            cursor: 'default',
                            boxShadow: 'none',
                            opacity: dim ? 0.25 : 1,
                            ...groupStyle,
                          }}
                        >
                          {groupProgress > 0 && groupProgress < 100 && (
                            <div
                              style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${groupProgress}%`,
                                background: 'rgba(127,127,127,.18)',
                                borderRadius: '5px 0 0 5px',
                                pointerEvents: 'none',
                              }}
                            />
                          )}
                          {s?.status === 'done' && (
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(119,128,138,.08)',
                                borderRadius: 5,
                                pointerEvents: 'none',
                              }}
                            />
                          )}
                          {/* Same reasoning as the summary bars: the header beside
                      this bar already carries the name, and repeating it here
                      put the loudest text in the chart on what the reader
                      already knows. The bar's own job is its extent. */}
                        </div>
                      )}
                    </div>
                  );
                }
                const s = row.s;
                const tc = rowColor(row);
                const isSummary = row.type === 'summary';
                const isCp = rowIsCp(row);
                const rowKey = rowKeyOf(row);
                if (s._unestimated)
                  return <div key={rowKey} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
                if (s._completed && (!s.startD || !s.endD))
                  return <div key={rowKey} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
                const isDrag = drag?.id === s.id;
                // Bar geometry is day-accurate whenever scheduler dates exist.
                // Zoom only changes scale/labels; it must not snap bars to weeks.
                let baseLeft, baseWidth;
                if (s.startD && s.endD) {
                  baseLeft = dateToX(s.startD) + 2;
                  baseWidth = dateToX(s.endD) + DPX - dateToX(s.startD) - 4;
                } else {
                  baseLeft = s.startWi * WPX + 2;
                  baseWidth = (s.endWi - s.startWi + 1) * WPX - 4;
                }
                // Drag offset: dDelta is in days when showDays, weeks otherwise.
                const dragPxOffset = isDrag && drag?.kind !== 'resizeEnd' ? dDelta * (showDays ? DPX : WPX) : 0;
                const resizePxOffset = isDrag && drag?.kind === 'resizeEnd' ? dDelta * resizePxPerDay : 0;
                const barLeft = Math.max(0, baseLeft + dragPxOffset);
                const bW = Math.max(6, baseWidth + resizePxOffset);
                const dim = cpOnly && !rowRelevantToCp(row);
                const isHovDep = hoverDepId && hoverLines.rowIds.has(s.id) && s.id !== hoverDepId;
                const isHov = hoverDepId === s.id;
                const isMatch = searchMatches?.has(s.id);
                const searchDimmed = searchMatches && searchMatches.size > 0 && !isMatch;
                const node = row.node || iMap[s.treeId || s.id];
                const linkTaskId = s.treeId || s.id;
                const isSelected = selectedIds.has(linkTaskId);
                const fixedDays = !isSummary ? fixedDurationDays(node) : 0;
                const canResizeDuration = !!(!isSummary && node && s.status !== 'done' && !s._unestimated && !s.isHandoff);
                const canResizeDone = !!(!isSummary && node && s.status === 'done' && !s._unestimated && !s.isHandoff);
                const resizePreviewDays =
                  isDrag && (drag?.kind === 'resizeEnd' || drag?.kind === 'resizeEndDone' || drag?.kind === 'resizeStartDone')
                    ? Math.max(
                        1,
                        Math.ceil(
                          (drag.baseDurationDays || fixedDays || scheduledWorkDaysOf(s)) +
                            (drag?.kind === 'resizeStartDone' ? -dDelta : dDelta),
                        ),
                      )
                    : fixedDays;
                const loadCells = !isSummary ? taskLoadCells(s, barLeft, bW) : EMPTY_ARR;
                const compactBar = !isSummary && bW < 36;
                const microBar = !isSummary && bW < 16;
                // Resize-handles need at least 30px bar width to avoid colliding with
                // the link-connector semicircle that sits flush against the right edge.
                const showResizeHandle = (canResizeDuration || canResizeDone) && bW >= 30;
                const showResizeStartHandle = canResizeDone && bW >= 30;
                const isResizingDuration =
                  isDrag && (drag?.kind === 'resizeEnd' || drag?.kind === 'resizeEndDone' || drag?.kind === 'resizeStartDone');
                const resizePreviewLeft = Math.min(Math.max(0, barLeft + bW + 7), Math.max(0, tw - 74));
                const conf = confidence[s.id] || 'committed';
                const decideBy = isSummary ? null : node?.decideBy;
                const decideX = decideBy ? dateToX(localDate(decideBy)) : -1;
                const isDecideOverdue = decideBy && localDate(decideBy) < now;
                // Due-date marker: solid red bar at the start of the exact due date.
                // "Due 2026-07-01" means it must be done when 2026-07-01 starts.
                // (due < today and unfinished) OR scheduler's projected end blows
                // past due (sc.dueOverdue).
                const dueDate = isSummary ? null : node?.due;
                const dueX = dueDate ? dateToX(localDate(dueDate)) : -1;
                const isDueOverdue = dueDate && (s.dueOverdue || (localDate(dueDate) < now && s.status !== 'done'));
                // Confidence-based bar styling
                // ── What a bar's colour says ──────────────────────────────────
                // It used to say TEAM: the bar was filled with the team's colour
                // at full strength and labelled in white. Team colours come from
                // the plan, so on a real one that meant white text on #f0d342 and
                // on #10b981 — unreadable, and saying something this view is not
                // about. The Gantt answers "when does what happen, and is it
                // running": that is STATE, so state is what the fill says.
                //
                // A soft ground with its own state colour as the ink, which is
                // the pairing the palette already guarantees at 4.5:1 (see
                // paletteContrast.test.js). Confidence keeps its meaning on the
                // BORDER instead of fighting for the same channel: solid =
                // committed, thin = estimated, dashed = exploratory. And the team
                // is still there, as a cap on the bar's leading edge — available
                // at a glance, out of the way of the label.
                const stateFill =
                  s.status === 'wip'
                    ? { background: 'var(--st-wip-soft)', ink: 'var(--st-wip)', edge: 'var(--st-wip)' }
                    : { background: 'var(--bg3)', ink: 'var(--tx2)', edge: 'var(--b3)' };
                const confBorder =
                  conf === 'exploratory'
                    ? `1.5px dashed ${stateFill.edge}`
                    : conf === 'estimated'
                      ? `1px solid ${stateFill.edge}`
                      : `1.5px solid ${stateFill.edge}`;
                const confStyle = {
                  background: stateFill.background,
                  border: confBorder,
                  color: stateFill.ink,
                  textShadow: 'none',
                  borderLeft: `3px solid ${tc}`,
                  opacity: conf === 'exploratory' ? 0.85 : 1,
                };
                const summaryStyle =
                  s.status === 'done'
                    ? {
                        background: 'var(--bg4)',
                        border: '1px solid var(--b2)',
                        color: 'var(--tx2)',
                        textShadow: 'none',
                      }
                    : {
                        background: 'var(--bg3)',
                        border: '1px solid var(--b2)',
                        color: 'var(--tx)',
                        textShadow: 'none',
                      };
                return (
                  <div
                    key={rowKey}
                    className="grow-r"
                    style={{
                      height: RH,
                      position: 'relative',
                      borderBottom: '1px solid var(--b)',
                      opacity: dim ? 0.2 : searchDimmed ? 0.25 : 1,
                      background: isHov ? 'rgba(127,127,127,.10)' : isHovDep ? 'rgba(127,127,127,.05)' : '',
                    }}
                  >
                    {/* Load sits UNDER THE BAR and nowhere else — see the bar's own
                  strip below. It was drawn across the row as well, which is
                  how a week the task has nothing to do with ended up as a
                  loose line floating in the row's empty half; in compact,
                  where several tasks share a lane, those lines piled onto each
                  other and read as noise. One line under the work package says
                  what the load was while the work was happening, which is the
                  question. The row-wide reading still exists where a row IS a
                  person: the resource group header. */}
                    {/* Idle-wait gap: hatched amber band from when the assignee was
                  prev free → this task's start. Visualises why the bar sits
                  far in the future (waiting for a dep). Only when gap > ~5d
                  to avoid noise. */}
                    {!isSummary &&
                      s.blockedBy &&
                      s.personPrevFree &&
                      s.startD &&
                      (() => {
                        const prevFreeD = s.personPrevFree instanceof Date ? s.personPrevFree : new Date(s.personPrevFree);
                        const startD = s.startD instanceof Date ? s.startD : new Date(s.startD);
                        const gapDays = Math.round((startD - prevFreeD) / 864e5);
                        if (gapDays < 5) return null;
                        const x1 = showDays
                          ? dateToX(prevFreeD)
                          : Math.floor(
                              weeks.findIndex(w => {
                                const nxt = weeks[weeks.indexOf(w) + 1];
                                return w.mon <= prevFreeD && (!nxt || nxt.mon > prevFreeD);
                              }) * WPX,
                            );
                        const x2 = barLeft;
                        if (!(x2 > x1)) return null;
                        const blocker = scheduled.find(x => x.id === s.blockedBy.id);
                        const blockerName = blocker?.name && blocker.name !== s.blockedBy.id ? blocker.name : '';
                        const blockerPerson = blocker?.person || blocker?.personShort || '';
                        const endIso =
                          s.blockedBy.endD instanceof Date ? s.blockedBy.endD.toISOString().slice(0, 10) : String(s.blockedBy.endD);
                        const blockerLabel = blockerName ? `${s.blockedBy.id} – ${blockerName}` : s.blockedBy.id;
                        const meta = [blockerPerson, t('g.blockerEnds', endIso)].filter(Boolean).join(', ');
                        return (
                          <div
                            data-htip={t('g.waitingForTip', gapDays, blockerLabel) + (meta ? ` (${meta})` : '')}
                            style={{
                              position: 'absolute',
                              left: x1,
                              top: 8,
                              width: x2 - x1,
                              height: 12,
                              borderRadius: 3,
                              background: 'repeating-linear-gradient(45deg, rgba(245,158,11,.35) 0 4px, rgba(245,158,11,.10) 4px 8px)',
                              border: '1px dashed rgba(245,158,11,.65)',
                              pointerEvents: 'auto',
                              zIndex: 1,
                            }}
                          />
                        );
                      })()}
                    {/* Absence is drawn under the bar as well, and only where it
                  falls INSIDE it: a holiday two months after this task says
                  nothing about this task, and drawn across the row it was one
                  more loose line. Inside the bar it answers the question it is
                  there for — why five days of work span three weeks. */}
                    {/* A scenario is on screen: where this bar sits in the plan,
                  drawn behind it. Only for bars the scenario moved, so the
                  ghosts ARE the difference rather than a second chart. */}
                    {!isSummary &&
                      baseline?.has(s.treeId || s.id) &&
                      (() => {
                        // By tree id: a task handed over between people is several
                        // rows here (`P1.1`, `P1.1#2`) and one item in the plan.
                        const g = baseline.get(s.treeId || s.id);
                        const gLeft = dateToX(g.start) + 2;
                        const gWidth = Math.max(6, dateToX(g.end) + DPX - dateToX(g.start) - 4);
                        return (
                          <div
                            className="scn-ghost"
                            data-testid="scn-ghost"
                            data-ghost-for={s.id}
                            style={{ left: gLeft, width: gWidth, top: 2, height: 24 }}
                          />
                        );
                      })()}
                    {bW > 0 && sinceDate && (_diffDoneSet.has(s.id) || _diffProgSet.has(s.id)) && (
                      <div
                        data-htip={_diffDoneSet.has(s.id) ? t('diff.tipDone') : t('diff.tipNew')}
                        style={{
                          position: 'absolute',
                          left: barLeft - 2,
                          top: (isSummary ? 6 : 4) - 2,
                          width: Math.max(bW, 6) + 4,
                          height: (isSummary ? 16 : 20) + 4,
                          borderRadius: isSummary ? 6 : 5,
                          pointerEvents: 'none',
                          zIndex: 1,
                          // Amber branch = "progressed in window", not wip — literal on purpose, see docs/design-tokens.md.
                          border: `2px solid ${_diffDoneSet.has(s.id) ? 'var(--st-done)' : 'var(--diff)'}`,
                          boxShadow: `0 0 0 1px var(--bg,#111318), 0 0 10px ${_diffDoneSet.has(s.id) ? 'rgba(16,185,129,.6)' : 'rgba(245,158,11,.6)'}`,
                        }}
                      />
                    )}
                    {bW > 0 && (
                      <div
                        className={`gbar${isDrag ? ' dragging' : ''}${isCp ? ' cp-bar' : ''}${isDueOverdue ? ' overdue-bar' : ''}`}
                        data-link-from={linkTaskId}
                        data-link-target={linkTaskId}
                        data-task-bar={!isSummary ? linkTaskId : undefined}
                        style={{
                          left: barLeft,
                          width: Math.max(bW, 6),
                          top: isSummary ? 6 : 4,
                          height: isSummary ? 16 : 20,
                          borderRadius: isSummary ? 5 : 4,
                          padding: isSummary ? '0 6px' : microBar ? 0 : compactBar ? '0 2px' : '0 6px',
                          justifyContent: compactBar ? 'center' : undefined,
                          // Vertical reorder feedback: bar visually follows the mouse vertically,
                          // with a strong glow so the user sees they're in reorder mode.
                          transform: isDrag && drag?.isReorder ? `translateY(${Math.round(drag.lastDy / RH) * RH}px)` : undefined,
                          zIndex: isDrag && drag?.isReorder ? 20 : undefined,
                          boxShadow:
                            isDrag && drag?.isReorder
                              ? '0 4px 20px rgba(0,0,0,.5), 0 0 0 2px var(--ac)'
                              : s.id === activeMatchId
                                ? '0 0 0 3px var(--ac), 0 0 8px rgba(59,130,246,.35)'
                                : isMatch
                                  ? '0 0 0 2px var(--am)'
                                  : isSelected
                                    ? '0 0 0 2px var(--ac), 0 0 0 5px rgba(59,130,246,.22)'
                                    : linkDrag?.fromId === s.id
                                      ? '0 0 0 2px var(--ac)'
                                      : undefined,
                          ...(isSummary
                            ? summaryStyle
                            : s.status === 'done'
                              ? {
                                  background: 'var(--st-done-soft)',
                                  border: '1.5px solid var(--st-done)',
                                  borderLeft: `3px solid ${tc}`,
                                  color: 'var(--st-done)',
                                  textShadow: 'none',
                                }
                              : confStyle),
                          cursor: linkDrag
                            ? 'crosshair'
                            : isSummary
                              ? groupBy === 'project'
                                ? 'ns-resize'
                                : 'pointer'
                              : drag?.id === s.id &&
                                  (drag?.kind === 'resizeEnd' || drag?.kind === 'resizeEndDone' || drag?.kind === 'resizeStartDone')
                                ? 'ew-resize'
                                : drag?.id === s.id && drag?.isReorder
                                  ? 'ns-resize'
                                  : drag
                                    ? 'grabbing'
                                    : 'grab',
                        }}
                        onMouseEnter={e => {
                          if (dragRef.current || drag || linkDrag || hoverLineKey) return;
                          showRowTip(row, e, !isSummary);
                        }}
                        onMouseLeave={() => hideRowTip(row, !isSummary)}
                        onMouseDown={e => {
                          dismissTooltip(true);
                          if (linkDrag) return;
                          if (isSummary) {
                            if (groupBy !== 'project' || !onReorderSibling) return;
                            onBMD(e, row);
                            return;
                          }
                          onBMD(e, row);
                        }}
                        onMouseUp={() => {
                          if (linkDrag && !isSummary) {
                            dismissTooltip(true);
                            onLinkDrop(linkTaskId);
                          }
                        }}
                        onClick={e => {
                          dismissTooltip(true);
                          if (isSummary) {
                            if (justDraggedRef.current) {
                              justDraggedRef.current = false;
                              return;
                            }
                            onBarClick?.(s);
                            return;
                          }
                          if (justDraggedRef.current) {
                            justDraggedRef.current = false;
                            return;
                          }
                          if (linkDrag) return;
                          if (handleSelectClick(e, s.treeId || s.id)) return;
                          onBarClick?.(s);
                        }}
                      >
                        {/* Progress overlay: lighter strip on the left proportional to progress %.
                    When the diff overlay is active the band is split: the part up to the
                    past-progress percentage stays neutral, the slice between past and now
                    is amber so the "gained in window" portion stands out. */}
                        {(() => {
                          const prog = leafProgress(node || s);
                          if (!(prog > 0 && prog < 100)) return null;
                          const past = _diffActive && !isSummary && diffPastLeafState?.get?.(s.id);
                          const pastProg = past ? Math.max(0, Math.min(prog, past.progress || 0)) : null;
                          const gained = pastProg != null && prog - pastProg > 0.5 ? prog - pastProg : 0;
                          return (
                            <>
                              <div
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: `${pastProg != null ? pastProg : prog}%`,
                                  background: isSummary ? 'rgba(127,127,127,.18)' : 'rgba(255,255,255,.18)',
                                  borderRadius: isSummary ? '5px 0 0 5px' : '4px 0 0 4px',
                                  pointerEvents: 'none',
                                }}
                                data-htip={t('g.progressDoneTip', prog) + (past ? t('g.progressPrevSuffix', past.progress || 0) : '')}
                              />
                              {gained > 0 && (
                                <>
                                  <div
                                    style={{
                                      position: 'absolute',
                                      left: `${pastProg}%`,
                                      top: 0,
                                      bottom: 0,
                                      width: `${gained}%`,
                                      background: 'rgba(245,158,11,.55)',
                                      pointerEvents: 'none',
                                    }}
                                    data-htip={t('g.progressGainedTip', Math.round(gained))}
                                  />
                                  {/* Sharp tick at the past-progress position so the eye locks onto
                            "we started the window here". */}
                                  <div
                                    style={{
                                      position: 'absolute',
                                      left: `${pastProg}%`,
                                      top: 0,
                                      bottom: 0,
                                      width: 2,
                                      background: 'var(--diff)',
                                      pointerEvents: 'none',
                                    }}
                                  />
                                </>
                              )}
                            </>
                          );
                        })()}
                        {/* Newly-done bar in window: subtle green wash so completions read
                    even though the live bar already shows status=done. */}
                        {_diffActive && _diffDoneSet.has(s.id) && !isSummary && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              top: 0,
                              bottom: 0,
                              background: 'rgba(16,185,129,.18)',
                              pointerEvents: 'none',
                              borderRadius: 4,
                            }}
                          />
                        )}
                        {/* Phase segments overlay */}
                        {!isSummary &&
                          node?.phases?.length > 1 &&
                          (() => {
                            const phases = normalizePhases(node.phases);
                            const shares = phaseWeightShares(phases);
                            return (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  right: 0,
                                  display: 'flex',
                                  pointerEvents: 'none',
                                  borderRadius: 4,
                                  overflow: 'hidden',
                                }}
                              >
                                {phases.map((ph, pi) => (
                                  <div
                                    key={ph.id || pi}
                                    style={{
                                      flex: `${shares[pi] || 1} 0 0`,
                                      borderRight: pi < phases.length - 1 ? '1px solid rgba(0,0,0,.2)' : 'none',
                                      background:
                                        ph.status === 'done'
                                          ? 'rgba(255,255,255,.15)'
                                          : ph.status === 'wip'
                                            ? 'transparent'
                                            : 'rgba(0,0,0,.12)',
                                    }}
                                    data-htip={`${ph.name}: ${ph.status}${ph.effortPct ? ` · ${ph.effortPct}%` : ''}`}
                                  />
                                ))}
                              </div>
                            );
                          })()}
                        {/* Primary rows of chained tasks carry `hasHandoffSegments`
                    only as metadata — the handoff-shadow rows render their
                    own bars beneath and carry the visual badges. No overlay
                    on the primary bar. */}
                        {!isSummary && s.isHandoff && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: s.unscheduled
                                ? 'repeating-linear-gradient(45deg, rgba(220,38,38,.7) 0 6px, rgba(220,38,38,.25) 6px 12px)'
                                : s.crossTeam
                                  ? 'repeating-linear-gradient(135deg, rgba(255,255,255,.15) 0 4px, transparent 4px 10px)'
                                  : 'transparent',
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                        {!isSummary && s.isHandoff && (
                          <div
                            style={{
                              position: 'absolute',
                              top: -1,
                              right: -1,
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#fff',
                              background: s.unscheduled
                                ? 'rgba(220,38,38,.95)'
                                : s.plannedHandoff
                                  ? 'rgba(34,197,94,.95)'
                                  : s.crossTeam
                                    ? 'rgba(245,158,11,.95)'
                                    : 'rgba(168,85,247,.95)',
                              padding: '1px 5px',
                              borderRadius: '0 4px 0 4px',
                              pointerEvents: 'none',
                            }}
                          >
                            {s.unscheduled ? '! Offen' : s.plannedHandoff ? '● Plan' : s.crossTeam ? '↗ Cross' : '↳ Handoff'}
                          </div>
                        )}
                        {s.status === 'done' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: isSummary ? 'rgba(119,128,138,.08)' : 'rgba(119,128,138,.16)',
                              borderRadius: isSummary ? 5 : 4,
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                        {/* The same rule the row strip follows, on the bar itself:
                    a line along its foot, never a wash across it. Filling the
                    bar meant the load colour and the bar's own state colour
                    competed for the same pixels and neither read — which is
                    the opposite of what an overlay is for. */}
                        {loadCells.length > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              pointerEvents: 'none',
                              borderRadius: isSummary ? 5 : 4,
                              overflow: 'hidden',
                            }}
                          >
                            {loadCells.map(cell => (
                              <div
                                key={`bar-load-${cell.wi}`}
                                style={{
                                  position: 'absolute',
                                  left: cell.left,
                                  bottom: 0,
                                  height: 3,
                                  width: cell.width,
                                  background: loadHeatStroke(cell.percent, cell),
                                }}
                              />
                            ))}
                          </div>
                        )}
                        {/* Absence, clipped to the bar.
                    Three shapes, and the third is the one a Gantt actually
                    wants. It began as an amber block at full ROW height on
                    every task row of the person away — a hundred blocks for
                    one week off. Then a line, which stopped the wash and made
                    absence a decoration on the bar: 3px of colour saying
                    nothing about what it interrupts.
                    What it interrupts is the point. An absence inside a bar
                    is the stretch where no work happens — the reason five days
                    of work span three weeks — so it is drawn as a HOLE in the
                    bar: full height, hatched, the bar's own fill showing
                    through the gaps. The bar visibly pauses there and resumes,
                    which is what happened. Clipped to the bar, so a holiday
                    two months away still says nothing about this task and
                    cannot wash the chart.
                    Always drawn: it is a fact about the work, not a reading
                    you switch on. Load stays a line on the foot — solid, under
                    the hatching — so the two never read as the same thing. */}
                        {!isSummary &&
                          (() => {
                            const bands = vacBandsByTaskId[s.id] || EMPTY_ARR;
                            if (!bands.length) return null;
                            const clipped = bands
                              .map(band => {
                                const left = Math.max(0, band.x1 - barLeft);
                                const right = Math.min(Math.max(bW, 6), band.x1 + band.width - barLeft);
                                return right - left > 1 ? { band, left, width: right - left } : null;
                              })
                              .filter(Boolean);
                            if (!clipped.length) return null;
                            return (
                              <div
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  pointerEvents: 'none',
                                  borderRadius: isSummary ? 5 : 4,
                                  overflow: 'hidden',
                                }}
                              >
                                {clipped.map(({ band, left, width }) => (
                                  <div
                                    key={band.key}
                                    style={{
                                      position: 'absolute',
                                      left,
                                      width,
                                      top: 0,
                                      bottom: 0,
                                      // Faint enough to read the bar's own label straight
                                      // through it — at full strength the hatching simply
                                      // ate the name, which is the one thing on a bar you
                                      // must be able to read. The EDGES carry the meaning
                                      // instead: two solid seams say exactly where the pause
                                      // starts and ends, and the wash between them says it
                                      // is one stretch rather than two marks.
                                      background: 'repeating-linear-gradient(45deg, var(--st-wip) 0 2px, transparent 2px 6px)',
                                      opacity: 0.3,
                                      boxShadow: 'inset 1.5px 0 0 var(--st-wip), inset -1.5px 0 0 var(--st-wip)',
                                      // No tooltip of its own: the bar's tooltip is already
                                      // up while the pointer is on the bar, and a second
                                      // one over it made two stacked boxes. The bar's tip
                                      // lists the vacation instead (Tooltip.jsx).
                                      pointerEvents: 'none',
                                    }}
                                    data-vac-band={`${band.from}_${band.to}`}
                                  />
                                ))}
                              </div>
                            );
                          })()}
                        {!compactBar && (
                          <span style={{ position: 'sticky', left: 6, display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
                            {s.status === 'done' && (
                              <span
                                style={{
                                  marginRight: 4,
                                  fontSize: 11,
                                  flexShrink: 0,
                                  color: isSummary ? 'var(--tx3)' : 'rgba(255,255,255,.92)',
                                }}
                              >
                                ●
                              </span>
                            )}
                            {/* Priority is not drawn on a bar. It is an INPUT to the
                      schedule — it helps decide what runs before what — and
                      this view is the schedule's ANSWER. Printing the input
                      next to the output says the same thing twice, and on a
                      plan where most work is marked critical it is a column
                      of identical marks that distinguishes nothing. It stays
                      where it is set and where ordering is done: the tree and
                      the work order. */}
                            {!isSummary && node?.parallel && (
                              <span style={{ marginRight: 4, fontSize: 11, flexShrink: 0 }} data-htip={t('g.parallelTip')}>
                                ≡
                              </span>
                            )}
                            {!isSummary && node?.pinnedStart && (
                              <span
                                style={{ marginRight: 4, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                                data-htip={`${s.pinOverridden ? t('g.pinOverriddenTip', node.pinnedStart) : t('g.pinnedTip', node.pinnedStart)} ${t('g.clickToUnpin')}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  onTaskUpdate?.({ ...node, pinnedStart: '' });
                                }}
                              >
                                {s.pinOverridden ? '!▸' : '▸'}
                              </span>
                            )}
                            {!isSummary &&
                              s.blockedBy &&
                              (() => {
                                const blocker = scheduled.find(x => x.id === s.blockedBy.id);
                                const blockerName = blocker?.name && blocker.name !== s.blockedBy.id ? blocker.name : '';
                                const blockerPerson = blocker?.person || blocker?.personShort || '';
                                const endIso =
                                  s.blockedBy.endD instanceof Date ? s.blockedBy.endD.toISOString().slice(0, 10) : String(s.blockedBy.endD);
                                const blockerLabel = blockerName ? `${s.blockedBy.id} – ${blockerName}` : s.blockedBy.id;
                                const meta = [blockerPerson, t('g.blockerEnds', endIso)].filter(Boolean).join(', ');
                                return (
                                  <span
                                    style={{ marginRight: 4, fontSize: 11, flexShrink: 0, cursor: 'help' }}
                                    data-htip={`${t('p.waitingFor')} ${blockerLabel}${meta ? ` (${meta})` : ''}`}
                                  >
                                    ~
                                  </span>
                                );
                              })()}
                            {!isSummary && fixedDays > 0 && (
                              <span
                                style={{
                                  marginRight: 4,
                                  fontSize: 11,
                                  flexShrink: 0,
                                  color: 'rgba(255,255,255,.94)',
                                  fontFamily: 'var(--mono)',
                                }}
                                data-htip={`${t('qe.fixedDuration')}: ${fixedDays}d`}
                              >
                                {fixedDays}d
                              </span>
                            )}
                            {/* A summary bar does not repeat its own name. The label
                      column beside it is sticky and already carries it, so
                      printing it again inside the bar put the loudest text in
                      the chart on the one thing the reader already knows —
                      and on a nested plan that is a name in every second row.
                      The count is what the bar adds, so the count is what it
                      says. */}
                            {bW > 35 && (
                              <span
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  textDecoration: s.status === 'done' ? 'line-through' : 'none',
                                }}
                              >
                                {isSummary ? s._summaryCount : s.name}
                              </span>
                            )}
                          </span>
                        )}
                        {compactBar && !microBar && (
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 999,
                              background: s.status === 'done' ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.82)',
                              boxShadow: '0 1px 1px rgba(0,0,0,.35)',
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                        {showResizeStartHandle && (
                          <div
                            className={`g-resize-handle done-edge${isDrag && drag?.kind === 'resizeStartDone' ? ' active' : ''}`}
                            data-htip={`${t('g.doneResizeStart') || 'Drag to adjust completedStart'}${resizePreviewDays ? ` · ${resizePreviewDays}d` : ''}`}
                            onMouseDown={e => onResizeStartDoneMD(e, row)}
                            onClick={e => e.stopPropagation()}
                            style={{ left: 1 }}
                          />
                        )}
                        {showResizeHandle && (
                          <div
                            className={`g-resize-handle${canResizeDone ? ' done-edge' : ''}${isDrag && (drag?.kind === 'resizeEnd' || drag?.kind === 'resizeEndDone') ? ' active' : ''}`}
                            data-htip={`${canResizeDone ? t('g.doneResizeEnd') || 'Drag to adjust completedEnd' : t('g.fixedResize')}${resizePreviewDays ? ` · ${resizePreviewDays}d` : ''}`}
                            onMouseDown={e => onResizeEndMD(e, row)}
                            onClick={e => e.stopPropagation()}
                            style={{ right: 1 }}
                          />
                        )}
                      </div>
                    )}
                    {isResizingDuration && (
                      <div
                        style={{
                          position: 'absolute',
                          left: barLeft + bW,
                          top: 3,
                          bottom: 3,
                          width: 2,
                          background: 'var(--ac)',
                          borderRadius: 2,
                          zIndex: 9,
                          boxShadow: '0 0 8px rgba(59,130,246,.65)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    {isResizingDuration && (
                      <div
                        data-htip={t('g.durationPreviewTip', resizePreviewDays)}
                        style={{
                          position: 'absolute',
                          left: resizePreviewLeft,
                          top: 2,
                          height: 22,
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0 7px',
                          borderRadius: 999,
                          background: 'var(--ac)',
                          border: '1px solid rgba(255,255,255,.75)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 800,
                          fontFamily: 'var(--mono)',
                          lineHeight: '20px',
                          boxShadow: '0 1px 4px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.15)',
                          zIndex: 10,
                          pointerEvents: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        → {resizePreviewDays}d
                      </div>
                    )}
                    {/* Dependency connector: semicircle plus-button OUTSIDE the bar's
                  right edge so it never fights the resize-handle for pixels.
                  Resize-handle lives inside the bar at right:1; this dot sits
                  4px after the bar ends. */}
                    {bW > 0 && !isSummary && (
                      <div
                        className={`g-link-connector${linkDrag?.fromId === linkTaskId ? ' active' : ''}`}
                        data-link-target={linkTaskId}
                        data-htip={t('g.linkHandle')}
                        style={{
                          position: 'absolute',
                          left: barLeft + bW,
                          top: 14,
                          '--link-color': s.status === 'done' ? 'rgba(255,255,255,.88)' : tc,
                          pointerEvents: 'none',
                        }}
                      >
                        <span
                          className="g-link-connector-dot"
                          onMouseDown={e => onLinkStart(e, linkTaskId)}
                          onClick={e => e.stopPropagation()}
                          style={{ pointerEvents: 'auto' }}
                        >
                          +
                        </span>
                      </div>
                    )}
                    {/* Decision-by marker: diamond on the exact decide-by date */}
                    {decideX >= 0 && decideX <= tw && !isSummary && s.status !== 'done' && (
                      <div
                        data-htip={`${t('g.decideByTip', decideBy)}${isDecideOverdue ? ` — ${t('g.overdue')}` : ''}`}
                        style={{
                          position: 'absolute',
                          left: decideX + DPX / 2 - 6,
                          top: RH / 2 - 6,
                          width: 12,
                          height: 12,
                          background: isDecideOverdue ? 'var(--re)' : 'var(--am)',
                          transform: 'rotate(45deg)',
                          border: '1px solid #000',
                          zIndex: 4,
                          pointerEvents: 'auto',
                        }}
                      />
                    )}
                    {/* Due-date marker: vertical bar at the start of the exact due date. Solid red
                  when scheduler projects end past due or due is already in
                  the past + task unfinished. Otherwise dim red. */}
                    {dueX >= 0 && dueX <= tw && !isSummary && s.status !== 'done' && (
                      <div
                        data-htip={`${t('g.dueTip', dueDate)}${isDueOverdue ? ` — ${t('g.overdue')} / ${t('ins.dueOverdueByPlan')}` : ''}`}
                        style={{
                          position: 'absolute',
                          left: dueX,
                          top: 2,
                          width: 4,
                          bottom: 2,
                          background: isDueOverdue ? 'var(--re)' : 'rgba(220,38,38,0.55)',
                          borderRadius: 2,
                          zIndex: 4,
                          pointerEvents: 'auto',
                          boxShadow: isDueOverdue ? '0 0 8px rgba(220,38,38,0.7)' : 'none',
                        }}
                      />
                    )}
                  </div>
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
            {renderedDepLines.length > 0 && (
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: tw,
                  height: FLAG_ROW_H + rowLayout.height,
                  zIndex: 3,
                  pointerEvents: 'none',
                }}
              >
                <defs>
                  <marker id="gar" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--re)" />
                  </marker>
                  <marker id="garH" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--ac)" />
                  </marker>
                  <marker id="garN" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--tx3)" />
                  </marker>
                </defs>
                {(() => {
                  // Gantt-style orthogonal routing (MS-Project FS arrow): right-stub
                  // out of source → vertical drop → horizontal into target. Backward
                  // arrows (cycle/violation) use a 5-segment S-loop that exits the
                  // source on the right, loops over/under, and re-enters the target
                  // from the left so the arrowhead direction stays consistent.
                  const STUB = 12;
                  const buildPathParts = l => {
                    const isForward = l.x2 > l.x1 + STUB * 2;
                    if (isForward) {
                      // L-shape with source-side stub: (x1,y1) → (sx,y1) → (sx,y2) → (x2,y2).
                      // The vertical drop sits right next to the source so the FIRST knick
                      // is always reachable next to the bar the link originates from.
                      const sx = l.x1 + STUB;
                      const sxS = Math.round(sx) + 0.5;
                      return {
                        d: `M${l.x1},${l.y1} L${sxS},${l.y1} L${sxS},${l.y2} L${l.x2 - 1},${l.y2}`,
                        // Bend point = source-side knick.
                        bendX: sxS,
                        bendY: l.y1,
                      };
                    }
                    // Backward: 5-segment S-loop. Exit right of source, loop horizontally
                    // halfway between rows, re-enter target from left.
                    const sx = l.x1 + STUB;
                    const tx = l.x2 - STUB;
                    const my = (l.y1 + l.y2) / 2;
                    return {
                      d: `M${l.x1},${l.y1} L${sx},${l.y1} L${sx},${my} L${tx},${my} L${tx},${l.y2} L${l.x2 - 1},${l.y2}`,
                      // Bend point = FIRST knick from source side.
                      bendX: sx,
                      bendY: l.y1,
                    };
                  };
                  // Render hovered/pinned line LAST so its × badge always sits on
                  // top of overlapping neighbour lines (SVG has no z-index — paint
                  // order wins).
                  const topKey = pinnedLineKey || hoverLineKey;
                  const orderedLines = topKey
                    ? [...renderedDepLines.filter(l => l.key !== topKey), ...renderedDepLines.filter(l => l.key === topKey)]
                    : renderedDepLines;
                  return orderedLines.map(l => {
                    const parts = buildPathParts(l);
                    const path = parts.d;
                    const isHovered = hoverLineKey === l.key;
                    const isPinned = pinnedLineKey === l.key;
                    const isHoveredTask = hoverDepId && (hoverDepId === l.srcId || hoverDepId === l.tgtId);
                    const emphasized = isHovered || isPinned || isHoveredTask;
                    const col = l.isCp ? 'var(--re)' : emphasized ? 'var(--ac)' : 'var(--tx3)';
                    const marker = l.isCp ? 'url(#gar)' : emphasized ? 'url(#garH)' : 'url(#garN)';
                    // All links are hard deps now — uniform solid stroke. CP path
                    // still gets its red emphasis.
                    const opacity = emphasized ? 0.95 : l.isCp ? 0.75 : 0.7;
                    const strokeWidth = emphasized ? 1.8 : 1.4;
                    const dash = undefined;
                    // × badge sits at the SECOND bend (vertical-segment midpoint of
                    // the L) so it lands in the whitespace between source and target
                    // rows — clear of either bar. For straight same-row arrows there
                    // is no vertical segment, fall back to a fixed 18 px source-side
                    // offset on the row.
                    const midX = parts.bendX;
                    const midY = Math.abs(l.y2 - l.y1) > 4 ? (l.y1 + l.y2) / 2 : l.y1;
                    // Hover persists for 80ms after the cursor leaves the line so the
                    // user has time to move onto the × badge without it vanishing.
                    const enterLine = () => {
                      if (hoverClearTimerRef.current) {
                        clearTimeout(hoverClearTimerRef.current);
                        hoverClearTimerRef.current = null;
                      }
                      dismissTooltip(true);
                      setHoverLineKey(l.key);
                    };
                    const leaveLine = () => {
                      if (hoverClearTimerRef.current) clearTimeout(hoverClearTimerRef.current);
                      hoverClearTimerRef.current = setTimeout(() => {
                        setHoverLineKey(k => (k === l.key ? null : k));
                        hoverClearTimerRef.current = null;
                      }, 120);
                    };
                    return (
                      <g key={l.key}>
                        <path
                          d={path}
                          fill="none"
                          stroke={col}
                          strokeWidth={isPinned ? 2.4 : strokeWidth}
                          opacity={opacity}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          markerEnd={marker}
                          strokeDasharray={dash}
                          style={{ pointerEvents: 'none' }}
                        />
                        {/* Wide invisible hit zone — hover highlights; click pins the
                      arrow so it stays selected after the cursor leaves. */}
                        <path
                          d={path}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={14}
                          style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                          onMouseEnter={enterLine}
                          onMouseLeave={leaveLine}
                          onClick={e => {
                            e.stopPropagation();
                            setPinnedLineKey(k => (k === l.key ? null : l.key));
                          }}
                        >
                          <title>{`${t('qe.predecessors')}: ${l.removeDepId} → ${l.removeFromId} — Click to pin`}</title>
                        </path>
                        {/* × delete badge — shown while hovered OR pinned. */}
                        {(isHovered || isPinned) &&
                          onRemoveDep &&
                          (() => {
                            const handleClick = e => {
                              e.stopPropagation();
                              onRemoveDep(l.removeFromId, l.removeDepId);
                              setHoverLineKey(null);
                              setPinnedLineKey(null);
                            };
                            return (
                              <g style={{ cursor: 'pointer' }} onMouseEnter={enterLine} onMouseLeave={leaveLine} onClick={handleClick}>
                                <title>{`Remove dep: ${l.removeDepId} → ${l.removeFromId}`}</title>
                                {/* `pointerEvents="all"` is critical: an SVG element with
                          fill="transparent" does NOT receive clicks under the
                          default `visiblePainted` pointer-events mode. Without
                          this, clicks landing in the enlarged hit zone (between
                          r=10 and r=18) silently missed. */}
                                <circle cx={midX} cy={midY} r={18} fill="transparent" pointerEvents="all" style={{ cursor: 'pointer' }} />
                                <circle
                                  cx={midX}
                                  cy={midY}
                                  r={8}
                                  fill="var(--re)"
                                  stroke="rgba(255,255,255,.75)"
                                  strokeWidth={1}
                                  style={{
                                    cursor: 'pointer',
                                    filter: 'drop-shadow(0 1px 4px rgba(0,0,0,.45)) drop-shadow(0 0 0 rgba(0,0,0,.15))',
                                  }}
                                />
                                <path
                                  d={`M${midX - 3.8},${midY - 3.8} L${midX + 3.8},${midY + 3.8} M${midX + 3.8},${midY - 3.8} L${midX - 3.8},${midY + 3.8}`}
                                  stroke="#fff"
                                  strokeWidth={1.8}
                                  strokeLinecap="round"
                                />
                              </g>
                            );
                          })()}
                      </g>
                    );
                  });
                })()}
              </svg>
            )}
          </div>
        </div>
      </div>
      <div className="gantt-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} data-htip={t('g.zoomFooterTip', Math.round(WPX))}>
          <span style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 2 }}>
            {t('g.zoom')}
          </span>
          <button
            className={`btn btn-xs ${zoomMode === 'month' ? 'btn-pri' : 'btn-sec'}`}
            onClick={() => setZ(MONTH_ZOOM)}
            style={{ padding: '2px 7px', fontSize: 11 }}
          >
            {t('g.month')}
          </button>
          <button
            className={`btn btn-xs ${zoomMode === 'week' ? 'btn-pri' : 'btn-sec'}`}
            onClick={() => setZ(DEFAULT_WPX)}
            style={{ padding: '2px 7px', fontSize: 11 }}
          >
            {t('g.week')}
          </button>
          <button
            className={`btn btn-xs ${zoomMode === 'day' ? 'btn-pri' : 'btn-sec'}`}
            onClick={() => setZ(DAY_ZOOM)}
            style={{ padding: '2px 7px', fontSize: 11 }}
          >
            {t('g.day')}
          </button>
          <button
            className="btn btn-sec btn-xs"
            onClick={() => setZ(WPX * 0.8)}
            data-htip={t('g.zoomOutTip')}
            style={{ padding: '2px 7px', fontSize: 11 }}
          >
            −
          </button>
          <button
            className="btn btn-sec btn-xs"
            onClick={() => setZ(WPX * 1.25)}
            data-htip={t('g.zoomInTip')}
            style={{ padding: '2px 7px', fontSize: 11 }}
          >
            +
          </button>
          <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
          <button className="btn btn-sec btn-xs" onClick={scrollToToday} style={{ padding: '2px 7px', fontSize: 11 }}>
            {t('g.today')}
          </button>
        </div>
        {searchMatches && (
          <span style={{ fontSize: 11, color: searchMatches.size ? 'var(--am)' : 'var(--re)', fontFamily: 'var(--mono)' }}>
            {searchMatchList.length
              ? `${(((searchIdx % searchMatchList.length) + searchMatchList.length) % searchMatchList.length) + 1} / ${searchMatchList.length}`
              : `0 ${t('g.matches')}`}
          </span>
        )}
        {selectedTaskIds.length > 0 && (
          <span
            data-testid="gantt-selection-count"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ac)', fontFamily: 'var(--mono)' }}
          >
            <span>{t('g.selectedTasks', selectedTaskIds.length)}</span>
            <button
              data-testid="gantt-clear-selection"
              className="btn btn-xs btn-sec"
              onClick={() => setSelectedIds(new Set())}
              style={{ padding: '2px 7px', fontSize: 11 }}
            >
              {t('g.clearSelection')}
            </button>
          </span>
        )}
        <span style={{ width: 1, height: 14, background: 'var(--b2)' }} />
        {dlL.map(dl => {
          const suffix = dl.isLate
            ? ` ${t('s.atRisk')}`
            : dl.dlState === 'doneLate'
              ? ` ${t('s.deadlineDoneLate')}`
              : dl.dlState === 'done'
                ? ` ${t('s.deadlineDone')}`
                : dl.maxEnd
                  ? ` ${t('s.onTrack')}`
                  : '';
          const cls = dl.isLate ? 'bc' : dl.dlState === 'doneLate' ? 'bh' : dl.maxEnd ? 'bd' : dl.severity === 'critical' ? 'bc' : 'bh';
          return (
            <span key={dl.id} className={`badge ${cls}`}>
              {dl.isLate ? '! ' : ''}
              {dl.name} {dl.date}
              {suffix}
            </span>
          );
        })}
        {cpSet?.size > 0 && (
          <button
            className={`badge b-cp${cpOnly ? '' : ''}`}
            style={{
              cursor: 'pointer',
              border: cpOnly ? '1px solid var(--re)' : '',
              background: cpOnly ? 'var(--re)' : '',
              color: cpOnly ? '#000' : '',
            }}
            data-htip={cpOnly ? t('g.cpShowAllTip') : t('g.cpShowOnlyTip')}
            onClick={() => setCpOnly(v => !v)}
          >
            {cpOnly ? '◉ ' : '○ '}Critical path: {visibleCriticalCount}
          </button>
        )}
        {unestimatedCount > 0 && (
          <span className="badge bw" data-htip={t('g.noEstimateTip')}>
            {unestimatedCount} {t('g.noEstimate')}
          </span>
        )}
        {/* Confidence legend */}
        {(() => {
          const counts = { committed: 0, estimated: 0, exploratory: 0 };
          allItems.forEach(s => {
            if (s.status !== 'done') counts[confidence[s.id] || 'committed']++;
          });
          return counts.estimated > 0 || counts.exploratory > 0 ? (
            <span
              style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}
            >
              <span data-htip={t('g.confCommittedTip')}>● {counts.committed}</span>
              <span style={{ color: 'var(--am)' }} data-htip={t('g.confEstimatedTip')}>
                ◐ {counts.estimated}
              </span>
              <span data-htip={t('g.confExploratoryTip')}>○ {counts.exploratory}</span>
            </span>
          ) : null;
        })()}
        {linkDrag && <span style={{ fontSize: 12, color: 'var(--ac)', marginLeft: 'auto' }}>↗ {t('g.linkDrop')}</span>}
      </div>
      <SelectionActionBar count={selectedTaskIds.length} onClear={() => setSelectedIds(new Set())} testId="gantt-selection-actionbar">
        {selectedTaskIds.length > 1 && (
          <button
            data-testid="gantt-link-selected"
            className="btn btn-pri"
            onClick={linkSelectedInOrder}
            data-htip={t('g.linkSelectedTip')}
          >
            {t('g.linkSelected')}
          </button>
        )}
        {/* Z-order style reorder: shifts the whole selection in the scheduler
          processing order (writes seq). Mirrors media-player jump controls. */}
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => reorderSelectionInTime('first')}
            data-htip={t('g.reorderFirstTip')}
            aria-label={t('g.reorderFirstTip')}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px' }}
          >
            <Icon name="skipBack" size={13} />
          </button>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => reorderSelectionInTime('up')}
            data-htip={t('g.reorderUpTip')}
            aria-label={t('g.reorderUpTip')}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px' }}
          >
            <Icon name="chevronLeft" size={13} />
          </button>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => reorderSelectionInTime('down')}
            data-htip={t('g.reorderDownTip')}
            aria-label={t('g.reorderDownTip')}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px' }}
          >
            <Icon name="chevronRight" size={13} />
          </button>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => reorderSelectionInTime('last')}
            data-htip={t('g.reorderLastTip')}
            aria-label={t('g.reorderLastTip')}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px' }}
          >
            <Icon name="skipForward" size={13} />
          </button>
        </span>
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => adjustSelectionPrio(-1)}
            data-htip={t('g.prioUpTip')}
            aria-label={t('g.prioUpTip')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            Prio
            <Icon name="chevronUp" size={12} />
          </button>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => adjustSelectionPrio(1)}
            data-htip={t('g.prioDownTip')}
            aria-label={t('g.prioDownTip')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            Prio
            <Icon name="chevronDown" size={12} />
          </button>
        </span>
        <button
          type="button"
          className="sab-assign-trigger"
          onClick={() => onOpenBulkEdit?.(selectedTaskIds)}
          data-htip={t('g.bulkEditTip')}
          data-testid="gantt-bulk-edit-trigger"
        >
          <span className="sab-icon">
            <Icon name="checkSquare" size={13} />
          </span>
          <span>{t('g.bulkEdit')}</span>
        </button>
        <span className="sab-divider" />
        <button
          data-testid="gantt-clear-selected-links"
          className="btn btn-sec"
          onClick={() => clearSelectedLinks('all')}
          data-htip={t('g.clearSelectedLinksTip')}
        >
          {t('g.clearSelectedLinks')}
        </button>
      </SelectionActionBar>
      {showAssignModal && (
        <AssignModal
          count={selectedTaskIds.length}
          teams={teams}
          members={members}
          onClose={() => setShowAssignModal(false)}
          onApply={({ team, persons }) => {
            const sel = new Set(selectedTaskIds);
            (tree || []).forEach(node => {
              if (!sel.has(node.id) || !onTaskUpdate) return;
              const patch = { ...node };
              let changed = false;
              if (team !== null && team !== undefined && (node.team || '') !== (team || '')) {
                patch.team = team || '';
                changed = true;
              }
              if (Array.isArray(persons)) {
                const cur = (node.assign || []).slice().sort().join(',');
                const nxt = persons.slice().sort().join(',');
                if (cur !== nxt) {
                  patch.assign = persons.slice();
                  changed = true;
                }
              }
              if (changed) onTaskUpdate(patch);
            });
          }}
        />
      )}
      {/* Viewport overlay for the live drag-to-link line */}
      {linkDrag && (
        <svg className="layer-drag" style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <marker id="ldArr" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--ac)" />
            </marker>
          </defs>
          {(() => {
            const el = document.querySelector(`[data-link-from="${linkDrag.fromId}"]`);
            const rect = el?.getBoundingClientRect();
            // Everything here is in viewport coordinates; the overlay is fixed and
            // spans its containing block, which is the viewport only when nothing
            // is embedding us. See utils/embedHost.js.
            const frame = fixedFrame(portalRoot);
            const from = toFixedPoint(rect ? rect.right : linkDrag.mouseX, rect ? rect.top + rect.height / 2 : linkDrag.mouseY, frame);
            const to = toFixedPoint(linkDrag.mouseX, linkDrag.mouseY, frame);
            const x1 = from.x,
              y1 = from.y;
            const x2 = to.x,
              y2 = to.y;
            const stub = 10;
            const sx = x1 + stub;
            const tx = x2 - stub;
            const dx = Math.max(Math.abs(tx - sx) * 0.5, 30);
            const c1x = sx + dx,
              c2x = tx - dx;
            const d = `M${x1},${y1} L${sx},${y1} C${c1x},${y1} ${c2x},${y2} ${tx},${y2} L${x2 - 1},${y2}`;
            return (
              <path
                d={d}
                stroke="var(--ac)"
                strokeWidth={2}
                fill="none"
                strokeDasharray="4 3"
                strokeLinejoin="round"
                strokeLinecap="round"
                markerEnd="url(#ldArr)"
              />
            );
          })()}
        </svg>
      )}
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
