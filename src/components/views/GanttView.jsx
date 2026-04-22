import React, { useState, useRef, useMemo, useEffect } from 'react';
import { WPX as DEFAULT_WPX, MDE } from '../../constants.js';
import { iso, addD, addWorkDays, localDate } from '../../utils/date.js';
import { clampCompletedDate } from '../../utils/completion.js';
import { resolveToLeafIds, isLeafNode, parentId } from '../../utils/scheduler.js';
import { normalizePhases, phaseWeightShares } from '../../utils/phases.js';
import { buildMemberShortMap } from '../../App.jsx';
import { Tip } from '../shared/Tooltip.jsx';
import { StatusIcon } from '../shared/StatusIcon.jsx';
import { useT } from '../../i18n.jsx';

const NO_TEAM = '__no_team__';
const NO_TEAM_COLOR = '#64748b';
const NO_PERSON = '__no_person__';
const EMPTY_ARR = [];
const DAY_ZOOM = 98;

function normalizeViewMode(mode) {
  if (mode === 'person') return 'resource';
  if (mode === 'projteam') return 'team';
  return mode || 'project';
}

function withAlpha(color, alpha) {
  if (!color?.startsWith('#')) return color;
  let hex = color.slice(1);
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
  if (hex.length !== 6) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function GanttView({ scheduled, weeks, goals, teams, members = [], vacations = [], cpSet, tree, search = '', searchIdx = 0, workDays, planStart, confidence = {}, confReasons = {}, rootFilter = '', teamFilter = '', personFilter = '', onBarClick, onSeqUpdate, onExtendViewStart, onTaskUpdate, onRemoveDep, onAddDep, onReorderInQueue, onReorderSibling }) {
  const { t } = useT();
  const REASON_TIP = {
    'manual': t('g.reasonManual'), 'done': t('g.reasonDone'),
    'auto:person+estimate': t('g.reasonPersonEstimate'), 'auto:no-person': t('g.reasonNoPerson'),
    'auto:high-risk': t('g.reasonHighRisk'), 'auto:no-estimate': t('g.reasonNoEstimate'),
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
  // Render all assignees compactly: "KK+MB" or "KK+MB+1" for 3+
  const snAll = (s) => {
    const ids = (s.assign || []).length > 0 ? s.assign : (s.personId ? [s.personId] : []);
    if (!ids.length) return sn(s.personId, s.person);
    const shorts = ids.map(id => shortMap[id] || sn(id, ''));
    if (shorts.length <= 2) return shorts.join('+');
    return shorts.slice(0, 2).join('+') + '+' + (shorts.length - 2);
  };
  const [tip, setTip] = useState(null); // {item, x, y} — hover tooltip on left-panel task names
  const [drag, setDrag] = useState(null);
  const [dDelta, setDDelta] = useState(0);
  const [groupBy, setGroupBy] = useState(() => { try { return normalizeViewMode(localStorage.getItem('planr_gantt_group')); } catch { return 'project'; } });
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
  const [ctxMenu, setCtxMenu] = useState(null); // {x, y, taskId}
  const [linkMode, setLinkMode] = useState(null); // {fromId, mode: 'pred'|'succ'} — click a second bar to add dep
  const [linkDrag, setLinkDrag] = useState(null); // {fromId, fromX, fromY, mouseX, mouseY} — drag-to-link in progress
  // Horizon lines: weeks from today that separate committed / estimated / exploratory zones
  const [h1Weeks] = useState(() => { try { return +localStorage.getItem('planr_h1_weeks') || 8; } catch { return 8; } });
  const [h2Weeks] = useState(() => { try { return +localStorage.getItem('planr_h2_weeks') || 18; } catch { return 18; } });
  // Zoom: WPX = pixels per week. 20 = default, lower zooms out (months), higher zooms in (toward day-level)
  const [zoom, setZoom] = useState(() => { try { return +localStorage.getItem('planr_gantt_zoom') || DAY_ZOOM; } catch { return DAY_ZOOM; } });
  const setZ = v => { const c = Math.max(8, Math.min(140, v)); setZoom(c); try { localStorage.setItem('planr_gantt_zoom', String(c)); } catch {} };
  const WPX = zoom;
  const showDays = WPX >= 70; // at this zoom, individual days fit (~14 px each)
  const setGB = v => {
    const next = normalizeViewMode(v);
    setGroupBy(next);
    try { localStorage.setItem('planr_gantt_group', next); } catch {}
  };
  const activateMode = (e, action) => {
    if (e.button !== 0) return;
    e.preventDefault();
    action();
  };
  const hR = useRef(null), bR = useRef(null), lR = useRef(null);
  const [bodyScrollbarH, setBodyScrollbarH] = useState(0);
  // Guard flag: when true, syncL won't feed bR.scrollTop back (prevents
  // the syncS→syncL loop from killing smooth programmatic scrolls on bR).
  const scrollLock = useRef(false);

  function syncS(e) { if (hR.current) hR.current.scrollLeft = e.target.scrollLeft; if (lR.current) { scrollLock.current = true; lR.current.scrollTop = e.target.scrollTop; } }
  function syncL(e) { if (scrollLock.current) { scrollLock.current = false; return; } if (bR.current) bR.current.scrollTop = e.target.scrollTop; }
  function onLWheel(e) { if (bR.current) { bR.current.scrollTop += e.deltaY; bR.current.scrollLeft += e.deltaX; } }
  useEffect(() => {
    try { localStorage.setItem('planr_gantt_collapsed', JSON.stringify(collapsedByMode)); } catch {}
  }, [collapsedByMode]);

  const tw = weeks.length * WPX;
  // Map a Date to its pixel X position on the Gantt body.
  // Each week = WPX px covering all 7 days (Mon–Sun) so weekends are visible
  // as grayed-out columns in day-mode. The DPX constant = pixels per day.
  const DPX = WPX / 7;
  function dateToX(date) {
    if (!date) return 0;
    const d = date instanceof Date ? date : new Date(date);
    if (!weeks.length) return 0;
    if (d < weeks[0].mon) return 0;
    let wi = -1;
    for (let i = 0; i < weeks.length; i++) {
      if (d < addD(weeks[i].mon, 7)) { wi = i; break; }
    }
    if (wi < 0) return weeks.length * WPX;
    const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const dayInWeek = dow === 0 ? 6 : dow - 1; // Mon=0 ... Sun=6
    return wi * WPX + dayInWeek * DPX;
  }
  function weekIndexOfDate(date) {
    if (!date || !weeks.length) return -1;
    const d = date instanceof Date ? date : localDate(date);
    const wi = weeks.findIndex(w => d < addD(w.mon, 7));
    return wi >= 0 ? wi : weeks.length - 1;
  }
  const months = useMemo(() => {
    const ms = []; let cm = null, cc = 0, cs = 0;
    weeks.forEach((w, i) => { const ym = `${w.mon.getFullYear()}-${w.mon.getMonth()}`; if (ym !== cm) { if (cm) ms.push({ ym: cm, count: cc, start: cs }); cm = ym; cc = 1; cs = i; } else cc++; });
    if (cm) ms.push({ ym: cm, count: cc, start: cs });
    return ms;
  }, [weeks]);

  // Build all-items list: scheduled items + un-estimated leaves (so nothing hides).
  // Memoized to avoid recalculating on every render (perf: search typing was laggy).
  const allItems = useMemo(() => {
    const sIdSet = new Set(scheduled.map(s => s.id));
    const unscheduledLeaves = (tree || []).filter(r => leafIdSet.has(r.id) && !sIdSet.has(r.id) && r.status !== 'done').map(r => ({
      id: r.id, name: r.name, team: r.team || '', person: UNASSIGNED_LABEL, personId: null, assign: r.assign || [], prio: r.prio, seq: r.seq,
      best: r.best || 0, status: r.status, note: r.note || '', deps: (r.deps || []).join(', '),
      startD: null, endD: null, startWi: -1, endWi: -1, weeks: 0, calDays: 0, capPct: 0, vacDed: 0,
      _unestimated: true,
    }));
    const doneLeaves = (tree || []).filter(r => leafIdSet.has(r.id) && !sIdSet.has(r.id) && r.status === 'done').map(r => {
      const completedAt = clampCompletedDate(r.completedAt || r.completedEnd || r.completedStart);
      const endD = completedAt ? localDate(completedAt) : null;
      let startD = r.completedStart ? localDate(r.completedStart) : endD;
      if (startD && endD && startD > endD) startD = new Date(endD);
      const completedPersonId = r.completedPersonId || r.assign?.[0] || null;
      const completedPerson = r.completedPerson || (completedPersonId ? (memberById[completedPersonId]?.name || completedPersonId) : UNASSIGNED_LABEL);
      return {
        id: r.id,
        name: r.name,
        team: r.team || '',
        person: completedPerson,
        personId: completedPersonId,
        assign: r.assign || [],
        prio: r.prio,
        seq: r.seq,
        best: r.best || 0,
        status: r.status,
        note: r.note || '',
        deps: (r.deps || []).join(', '),
        startD,
        endD,
        startWi: startD ? weekIndexOfDate(startD) : -1,
        endWi: endD ? weekIndexOfDate(endD) : -1,
        weeks: startD && endD ? Math.max(1, weekIndexOfDate(endD) - weekIndexOfDate(startD) + 1) : 0,
        calDays: startD && endD ? Math.max(1, Math.round((endD - startD) / 864e5) + 1) : 0,
        capPct: 0,
        vacDed: 0,
        autoAssigned: !!r.completedAutoAssigned,
        _completed: true,
      };
    });
    let items = [...scheduled, ...doneLeaves, ...unscheduledLeaves];
    if (rootFilter) items = items.filter(s => s.id.startsWith(rootFilter + '.') || s.id === rootFilter);
    if (teamFilter) items = items.filter(s => (s.team || '') === teamFilter);
    if (personFilter) items = items.filter(s => (s.assign || []).includes(personFilter) || s.personId === personFilter);
    return items;
  }, [scheduled, tree, leafIdSet, memberById, rootFilter, teamFilter, personFilter]);

  // Determine root id of a task ('P1', 'D1.2.3' → 'D1')
  const rootOf = id => id.split('.')[0];
  const iMap = useMemo(() => Object.fromEntries((tree || []).map(r => [r.id, r])), [tree]);
  const treeOrder = useMemo(() => Object.fromEntries((tree || []).map((r, idx) => [r.id, idx])), [tree]);
  const childrenByParent = useMemo(() => {
    const map = {};
    (tree || []).forEach(r => {
      const pid = parentId(r.id);
      if (!map[pid]) map[pid] = [];
      map[pid].push(r.id);
    });
    Object.values(map).forEach(ids => ids.sort((a, b) => (treeOrder[a] ?? 0) - (treeOrder[b] ?? 0)));
    return map;
  }, [tree, treeOrder]);
  const rootIds = useMemo(() => (childrenByParent[''] || EMPTY_ARR), [childrenByParent]);
  const personIdsOf = s => {
    const ids = new Set();
    if (s.personId) ids.add(s.personId);
    (s.assign || []).forEach(a => ids.add(a));
    return [...ids];
  };
  const typeColorOf = node => node?.type === 'deadline'
    ? 'var(--re)'
    : node?.type === 'painpoint'
    ? 'var(--am)'
    : node?.type === 'goal'
    ? 'var(--ac)'
    : 'var(--ac2)';

  const structure = useMemo(() => {
    const defaultCollapsed = new Set();
    const sortItems = arr => [...arr].sort((a, b) => (a.prio || 4) - (b.prio || 4) || (a.startWi || 0) - (b.startWi || 0) || a.id.localeCompare(b.id));
    const buildScopeMeta = scopeItems => {
      const byNode = {};
      const itemById = {};
      scopeItems.forEach(item => {
        itemById[item.id] = item;
        let cid = item.id;
        while (cid) {
          if (!byNode[cid]) byNode[cid] = [];
          byNode[cid].push(item);
          cid = parentId(cid);
        }
      });
      return { byNode, itemById };
    };
    const summaryProgress = scopeItems => {
      let totalWeight = 0;
      let totalProgress = 0;
      scopeItems.forEach(item => {
        const node = iMap[item.id];
        const progress = node?.progress != null ? node.progress : item.status === 'done' ? 100 : item.status === 'wip' ? 50 : 0;
        const weight = item.effort || Math.max(item.best || 0, 1);
        totalWeight += weight;
        totalProgress += progress * weight;
      });
      return totalWeight > 0 ? Math.round(totalProgress / totalWeight) : 0;
    };
    const buildSummaryItem = (node, scopeItems, children = EMPTY_ARR, scopeCtx = {}) => {
      const datedChildren = children
        .map(child => child?.s)
        .filter(item => item && !item._unestimated && item.startD && item.endD);
      const dated = datedChildren.length
        ? datedChildren
        : scopeItems.filter(item => !item._unestimated && item.startD && item.endD);
      const doneCount = scopeItems.filter(item => item.status === 'done').length;
      const wipCount = scopeItems.filter(item => item.status === 'wip').length;
      const mix = { done: 0, committed: 0, estimated: 0, exploratory: 0 };
      scopeItems.forEach(item => {
        if (item.status === 'done') { mix.done++; return; }
        mix[confidence[item.id] || 'committed']++;
      });
      const best = scopeItems.reduce((sum, item) => sum + (item.best || 0), 0);
      const effort = scopeItems.reduce((sum, item) => sum + (item.effort || ((item.best || 0) * ((iMap[item.id]?.factor) || 1.5))), 0);
      const startD = dated.length ? new Date(Math.min(...dated.map(item => +item.startD))) : null;
      const endD = dated.length ? new Date(Math.max(...dated.map(item => +item.endD))) : null;
      const status = doneCount === scopeItems.length
        ? 'done'
        : (doneCount > 0 || wipCount > 0 ? 'wip' : 'open');
      return {
        ...node,
        id: node.id,
        name: node.name,
        team: scopeCtx.teamId || node.team || '',
        person: scopeCtx.personName || null,
        assign: [],
        deps: node.deps || [],
        phases: node.phases || [],
        best,
        effort,
        status,
        progress: summaryProgress(scopeItems),
        startD,
        endD,
        startWi: startD ? weekIndexOfDate(startD) : -1,
        endWi: endD ? weekIndexOfDate(endD) : -1,
        calDays: startD && endD ? Math.max(1, Math.round((endD - startD) / 864e5) + 1) : 0,
        _summary: true,
        _summaryCount: scopeItems.length,
        _scheduledCount: dated.length,
        _doneCount: doneCount,
        _summaryMix: mix,
        _barColor: scopeCtx.color || typeColorOf(node),
      };
    };
    const buildNode = (nodeId, meta, namespace, level, scopeCtx) => {
      const node = iMap[nodeId];
      const scopeItems = meta.byNode[nodeId] || EMPTY_ARR;
      if (!node || !scopeItems.length) return null;
      const childIds = (childrenByParent[nodeId] || EMPTY_ARR).filter(cid => (meta.byNode[cid] || EMPTY_ARR).length > 0);
      if (isLeafNode(tree || [], nodeId) || !childIds.length) {
        const item = meta.itemById[nodeId];
        if (!item) return null;
        return { type: 'task', key: `${namespace}::task:${nodeId}`, s: item, node, level, groupKey: namespace };
      }
      const children = childIds.map(cid => buildNode(cid, meta, namespace, level + 1, scopeCtx)).filter(Boolean);
      const collapseKey = `${namespace}::collapse:${nodeId}`;
      if (children.length > 0 && children.every(child => child.type === 'task')) defaultCollapsed.add(collapseKey);
      return {
        type: 'summary',
        key: `${namespace}::summary:${nodeId}`,
        collapseKey,
        s: buildSummaryItem(node, scopeItems, children, scopeCtx),
        node,
        level,
        groupKey: namespace,
        children,
      };
    };
    const buildTreeNodes = (scopeItems, namespace, baseLevel, scopeCtx = {}) => {
      const meta = buildScopeMeta(sortItems(scopeItems));
      return rootIds.map(rid => buildNode(rid, meta, namespace, baseLevel, scopeCtx)).filter(Boolean);
    };
    const nodes = [];
    if (groupBy === 'project') {
      nodes.push(...buildTreeNodes(allItems, 'project', 0));
    } else if (groupBy === 'team') {
      const usedTeams = [...new Set(allItems.map(item => item.team || NO_TEAM))];
      const orderedTeams = [...new Set([...teams.map(team => team.id), ...usedTeams])].filter(id => usedTeams.includes(id));
      orderedTeams.forEach(teamId => {
        const scopeItems = sortItems(allItems.filter(item => (item.team || NO_TEAM) === teamId));
        if (!scopeItems.length) return;
        const team = teams.find(entry => entry.id === teamId);
        const label = teamId === NO_TEAM ? t('noTeam') : (team?.name || teamId);
        const color = teamId === NO_TEAM ? NO_TEAM_COLOR : (team?.color || '#3b82f6');
        nodes.push({
          type: 'group',
          key: `team:${teamId}`,
          collapseKey: `team:${teamId}`,
          label,
          color,
          count: scopeItems.length,
          level: 0,
          children: buildTreeNodes(scopeItems, `team:${teamId}`, 1, { teamId: teamId === NO_TEAM ? '' : teamId, color }),
        });
      });
    } else {
      const usedPeople = [...new Set(allItems.flatMap(personIdsOf))];
      if (allItems.some(item => !personIdsOf(item).length)) usedPeople.push(NO_PERSON);
      usedPeople
        .sort((a, b) => {
          if (a === NO_PERSON) return 1;
          if (b === NO_PERSON) return -1;
          const aLabel = memberById[a]?.name || a;
          const bLabel = memberById[b]?.name || b;
          return aLabel.localeCompare(bLabel);
        })
        .forEach(personId => {
          const scopeItems = sortItems(personId === NO_PERSON
            ? allItems.filter(item => !personIdsOf(item).length)
            : allItems.filter(item => personIdsOf(item).includes(personId)));
          if (!scopeItems.length) return;
          const member = memberById[personId];
          const label = personId === NO_PERSON ? UNASSIGNED_LABEL : (member?.name || personId);
          const color = personId === NO_PERSON ? NO_TEAM_COLOR : (teamById[member?.team]?.color || 'var(--ac)');
          nodes.push({
            type: 'group',
            key: `resource:${personId}`,
            collapseKey: `resource:${personId}`,
            label,
            color,
            count: scopeItems.length,
            level: 0,
            children: buildTreeNodes(scopeItems, `resource:${personId}`, 1, { personName: label, color }),
          });
        });
    }
    const patchSummaryWindows = row => {
      if (!row?.children?.length) return row;
      const nextChildren = row.children.map(patchSummaryWindows).filter(Boolean);
      if (row.type !== 'summary') return { ...row, children: nextChildren };

      let minStart = null;
      let maxEnd = null;
      nextChildren.forEach(child => {
        const childItem = child?.s;
        if (!childItem || childItem._unestimated || !childItem.startD || !childItem.endD) return;
        const childStart = childItem.startD instanceof Date ? childItem.startD : new Date(childItem.startD);
        const childEnd = childItem.endD instanceof Date ? childItem.endD : new Date(childItem.endD);
        if (!minStart || childStart < minStart) minStart = childStart;
        if (!maxEnd || childEnd > maxEnd) maxEnd = childEnd;
      });

      if (!minStart || !maxEnd) return { ...row, children: nextChildren };
      return {
        ...row,
        s: {
          ...row.s,
          startD: new Date(+minStart),
          endD: new Date(+maxEnd),
          startWi: weekIndexOfDate(minStart),
          endWi: weekIndexOfDate(maxEnd),
          calDays: Math.max(1, Math.round((maxEnd - minStart) / 864e5) + 1),
        },
        children: nextChildren,
      };
    };

    return { nodes: nodes.map(patchSummaryWindows), defaultCollapsed: [...defaultCollapsed] };
  }, [allItems, groupBy, iMap, childrenByParent, rootIds, tree, teams, memberById, teamById, confidence, t]);

  const collapsed = useMemo(() => new Set(collapsedByMode[groupBy] || structure.defaultCollapsed), [collapsedByMode, groupBy, structure.defaultCollapsed]);
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
  const toggleCollapse = key => updateCollapsed(set => {
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
  const rows = useMemo(() => {
    const out = [];
    const visit = row => {
      out.push(row);
      if (!row.children?.length) return;
      const collapseKey = row.collapseKey || row.key;
      if (collapsed.has(collapseKey)) return;
      row.children.forEach(visit);
    };
    structure.nodes.forEach(visit);
    return out;
  }, [structure, collapsed]);
  useEffect(() => {
    const measureScrollbar = () => {
      if (!bR.current) return;
      const next = Math.max(0, bR.current.offsetHeight - bR.current.clientHeight);
      setBodyScrollbarH(prev => prev === next ? prev : next);
    };
    measureScrollbar();
    window.addEventListener('resize', measureScrollbar);
    const id = window.setTimeout(measureScrollbar, 0);
    return () => {
      window.removeEventListener('resize', measureScrollbar);
      window.clearTimeout(id);
    };
  }, [rows.length, tw, showDays]);

  const RH = 28, HH = 28, FLAG_ROW_H = 18;
  const rowCenterY = rowIndex => FLAG_ROW_H + rowIndex * RH + RH / 2;
  const dlL = (goals || []).filter(d => d.date).map(dl => {
    const di = weeks.findIndex(w => w.mon > new Date(dl.date));
    const wi = di >= 0 ? di : weeks.length;
    const linked = scheduled.filter(s => s.id.startsWith(dl.id + '.'));
    const maxEnd = linked.length ? linked.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
    const isLate = maxEnd && new Date(dl.date) < maxEnd;
    return { ...dl, wi, isLate, maxEnd };
  });
  const now = new Date();
  const todayWi = weeks.findIndex((w, i) => { const next = weeks[i + 1]; return w.mon <= now && (!next || next.mon > now); });
  // Always day-accurate — even in week mode the line sits on the correct day
  // column within the week, not at the week's left edge.
  const todayX = todayWi >= 0 ? dateToX(now) : -1;
  const gTC = t => t === NO_TEAM ? NO_TEAM_COLOR : (teamById[t]?.color || '#3b82f6');

  // Day-accurate mount-point helpers for dependency lines. Source mounts at
  // the RIGHT edge of the bar (end of endD's day column); target mounts at
  // the LEFT edge (start of startD's day column). Falls back to week-aligned
  // positions when dates aren't available.
  // When the task is currently being dragged, add the live drag pixel offset so
  // dependency lines follow the bar in real time (Bug 2 fix).
  function dragOffsetFor(s) {
    if (!drag || drag.id !== s.id || drag.isReorder) return 0;
    return dDelta * (showDays ? DPX : WPX);
  }
  function depX1(s) {
    const base = showDays && s.endD ? dateToX(s.endD) + DPX : (s.endWi + 1) * WPX;
    return base + dragOffsetFor(s);
  }
  function depX2(s) {
    const base = showDays && s.startD ? dateToX(s.startD) : s.startWi * WPX;
    return base + dragOffsetFor(s);
  }

  // CP dependency lines (only between visible scheduled items)
  // rowIdx maps task ID → array of ALL row indices (a multi-assigned task appears in
  // multiple person/team groups, so we need every occurrence for dep-line drawing).
  const rowIdx = useMemo(() => {
    const m = {};
    rows.forEach((r, i) => {
      if (r.type === 'task' && !r.s._unestimated) {
        if (!m[r.s.id]) m[r.s.id] = [];
        m[r.s.id].push(i);
      }
    });
    return m;
  }, [rows]);
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);
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
  const vacBandsByTaskId = useMemo(() => {
    const bands = {};
    allItems.forEach(s => {
      const assigneeIds = [...new Set([...(s.assign || []), ...(s.personId ? [s.personId] : [])])];
      if (!assigneeIds.length) return;
      const slots = [];
      assigneeIds.forEach(pid => {
        const pvacs = vacByPerson[pid];
        if (!pvacs?.length) return;
        pvacs.forEach(v => {
          const x1 = dateToX(localDate(v.from));
          const x2 = dateToX(addD(localDate(v.to), 1));
          if (x2 <= 0 || x1 >= tw) return;
          slots.push({
            pid,
            personName: memberById[pid]?.name || pid,
            note: v.note || '',
            from: v.from,
            to: v.to,
            width: Math.max(x2 - x1, DPX),
            x1,
            x2,
          });
        });
      });
      if (!slots.length) return;
      const personOrder = [...new Set(slots.map(sl => sl.pid))];
      const personIndex = Object.fromEntries(personOrder.map((pid, idx) => [pid, idx]));
      const nBands = personOrder.length;
      bands[s.id] = slots.map((sl, idx) => {
        const bandIdx = personIndex[sl.pid] ?? 0;
        const bandH = Math.floor(RH / nBands);
        const topPx = bandIdx * bandH;
        const heightPx = bandIdx === nBands - 1 ? RH - topPx : bandH;
        return {
          key: `vac-${sl.pid}-${idx}`,
          personName: sl.personName,
          firstName: sl.personName.split(' ')[0] || sl.personName,
          note: sl.note,
          from: sl.from,
          to: sl.to,
          nBands,
          topPx,
          heightPx,
          width: sl.width,
          x1: sl.x1,
        };
      });
    });
    return bands;
  }, [allItems, vacByPerson, memberById, tw, DPX, weeks, WPX]);
  function resD(id) { return resolveToLeafIds(tree || [], id); }
  const cpLines = useMemo(() => {
    if (!cpSet?.size || !tree) return [];
    const lines = [];
    scheduled.forEach(s => {
      if (!cpSet.has(s.id)) return;
      const node = iMap[s.id]; if (!node) return;
      (node.deps || []).forEach(rawDep => {
        const leafIds = resD(rawDep);
        let latestId = null, latestEnd = null;
        leafIds.forEach(depId => {
          if (!cpSet.has(depId)) return;
          const dep = sMap[depId]; if (!dep) return;
          if (!latestEnd || dep.endD > latestEnd) { latestEnd = dep.endD; latestId = depId; }
        });
        if (!latestId) return;
        const dep = sMap[latestId];
        const srcRows = rowIdx[latestId], tgtRows = rowIdx[s.id];
        if (!srcRows?.length || !tgtRows?.length) return;
        srcRows.forEach(srcRow => {
          tgtRows.forEach(tgtRow => {
            lines.push({ x1: depX1(dep), y1: rowCenterY(srcRow), x2: depX2(s), y2: rowCenterY(tgtRow) });
          });
        });
      });
    });
    return lines;
  }, [scheduled, cpSet, tree, rows, rowIdx, WPX, showDays, groupBy, dDelta, drag]);

  // ALL dep lines (always rendered, faint by default; hovered ones highlight)
  // When a dep targets a parent node, draw ONE line from the latest-finishing child
  // (that's the actual blocker), not individual lines from every leaf child.
  const allDepLines = useMemo(() => {
    if (!tree) return [];
    const lines = [];
    scheduled.forEach(s => {
      const node = iMap[s.id]; if (!node) return;
      (node.deps || []).forEach(rawDep => {
        const leafIds = resD(rawDep);
        // Find the latest-finishing scheduled leaf — that's the real blocker
        let latestId = null, latestEnd = null;
        leafIds.forEach(depId => {
          const dep = sMap[depId]; if (!dep) return;
          if (!latestEnd || dep.endD > latestEnd) { latestEnd = dep.endD; latestId = depId; }
        });
        if (!latestId) return;
        const dep = sMap[latestId];
        const srcRows = rowIdx[latestId], tgtRows = rowIdx[s.id];
        if (!srcRows?.length || !tgtRows?.length) return;
        srcRows.forEach((srcRow, si) => {
          tgtRows.forEach((tgtRow, ti) => {
            lines.push({
              key: `${latestId}@${si}->${s.id}@${ti}->${rawDep}`,
              x1: depX1(dep), y1: rowCenterY(srcRow),
              x2: depX2(s), y2: rowCenterY(tgtRow),
              removeFromId: s.id, removeDepId: rawDep,
              srcId: latestId, tgtId: s.id,
              isCp: cpSet?.has(latestId) && cpSet?.has(s.id),
            });
          });
        });
      });
    });
    return lines;
  }, [scheduled, tree, rows, rowIdx, cpSet, WPX, showDays, groupBy, dDelta, drag]);

  // On hover: show ALL dependencies (incoming + outgoing) for the hovered task
  const hoverLines = useMemo(() => {
    if (!hoverDepId || !tree) return { lines: [], rowIds: new Set() };
    const lines = [];
    const rowIds = new Set([hoverDepId]);
    const node = iMap[hoverDepId];
    if (!node) return { lines, rowIds };
    const target = sMap[hoverDepId];
    // Outgoing: this task depends on these (deps must finish before this starts)
    if (target) {
      (node.deps || []).forEach(rawDep => {
        const leafIds = resD(rawDep);
        let latestId = null, latestEnd = null;
        leafIds.forEach(depId => {
          const dep = sMap[depId]; if (!dep) return;
          if (!latestEnd || dep.endD > latestEnd) { latestEnd = dep.endD; latestId = depId; }
        });
        if (!latestId) return;
        const dep = sMap[latestId];
        const srcRows = rowIdx[latestId], tgtRows = rowIdx[hoverDepId];
        if (!srcRows?.length || !tgtRows?.length) return;
        rowIds.add(latestId);
        srcRows.forEach(srcRow => {
          tgtRows.forEach(tgtRow => {
            lines.push({ x1: depX1(dep), y1: rowCenterY(srcRow), x2: depX2(target), y2: rowCenterY(tgtRow), kind: 'in', removeFromId: hoverDepId, removeDepId: rawDep });
          });
        });
      });
    }
    // Incoming: which tasks depend on this one (this must finish before they start)
    scheduled.forEach(s => {
      const sNode = iMap[s.id]; if (!sNode) return;
      (sNode.deps || []).forEach(rawDep => {
        const resolved = resD(rawDep);
        if (!resolved.includes(hoverDepId)) return;
        if (!target) return;
        const srcRows = rowIdx[hoverDepId], tgtRows = rowIdx[s.id];
        if (!srcRows?.length || !tgtRows?.length) return;
        rowIds.add(s.id);
        srcRows.forEach(srcRow => {
          tgtRows.forEach(tgtRow => {
            lines.push({ x1: depX1(target), y1: rowCenterY(srcRow), x2: depX2(s), y2: rowCenterY(tgtRow), kind: 'out', removeFromId: s.id, removeDepId: rawDep });
          });
        });
      });
    });
    return { lines, rowIds };
  }, [hoverDepId, tree, scheduled, rows, WPX, showDays, dDelta, drag]);

  const rowKeyOf = row => row.key || `${row.groupKey || 'row'}::${row.s?.id || row.label}`;
  const rowColor = row => row?.s?._barColor || gTC(row?.s?.team || NO_TEAM);
  const cpNodeSet = useMemo(() => {
    const set = new Set(cpSet || []);
    (cpSet || []).forEach(id => {
      let pid = parentId(id);
      while (pid) {
        set.add(pid);
        pid = parentId(pid);
      }
    });
    return set;
  }, [cpSet]);
  const rowIsCp = row => cpNodeSet.has(row.s.id);
  const rowTooltipItem = row => row.type === 'group'
    ? null
    : { ...row.node, ...row.s, isCp: rowIsCp(row) };
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

  // Search: Set for dimming (all matches across allItems), ordered list for cycling (visible rows only).
  const searchMatches = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return null;
    return new Set(allItems.filter(s => (s.name || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).map(s => s.id));
  }, [search, allItems]);
  // Visible matches in row order — only tasks currently shown (not inside collapsed groups).
  const searchMatchList = useMemo(() => {
    if (!searchMatches?.size) return [];
    return rows.filter(r => r.type === 'task' && searchMatches.has(r.s.id)).map(r => r.s.id);
  }, [searchMatches, rows]);
  const activeMatchId = searchMatchList.length
    ? searchMatchList[((searchIdx % searchMatchList.length) + searchMatchList.length) % searchMatchList.length]
    : null;

  // Scroll to the active match (driven by search text + searchIdx for prev/next cycling).
  // Only programmatically scrolls bR — syncS keeps lR + hR in sync automatically.
  useEffect(() => {
    if (!activeMatchId || !bR.current) return;
    const id = setTimeout(() => {
      const rowIndex = rows.findIndex(r => r.type === 'task' && r.s?.id === activeMatchId);
      if (rowIndex < 0 || !bR.current) return;
      const targetY = rowIndex * RH;
      const s = rows[rowIndex].s;
      const targetX = s._unestimated ? undefined : Math.max(0, (showDays && s?.startD ? dateToX(s.startD) : (s?.startWi ?? 0) * WPX) - 80);
      const scrollTop = Math.max(0, targetY - bR.current.clientHeight / 2 + RH);
      bR.current.scrollTo({ top: scrollTop, left: targetX ?? bR.current.scrollLeft, behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(id);
  }, [activeMatchId]);

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
  const justDraggedRef = useRef(false);

  function onBMD(e, row) {
    e.stopPropagation();
    dismissTooltip(true);
    justDraggedRef.current = false;
    const s = row.s;
    const d = {
      id: s.id,
      startWi: s.startWi,
      endWi: s.endWi,
      startD: s.startD,
      ox: e.clientX,
      oy: e.clientY,
      seq: s.seq,
      team: s.team,
      prio: s.prio,
      rowType: row.type,
      canPin: row.type === 'task' && s.status !== 'done' && !s._unestimated,
      reorderMode: groupBy === 'project' && onReorderSibling
        ? 'tree'
        : (row.type === 'task' && onReorderInQueue ? 'queue' : null),
      lockVertical: row.type === 'summary',
      rowIdx: (rowIdx[s.id] ?? [])[0] ?? 0,
      lastDy: 0,
      isReorder: false,
    };
    dragRef.current = d;
    setDrag(d);
    setDDelta(0);
  }
  function onMM(e) {
    const d = dragRef.current;
    if (d) {
      const dx = e.clientX - d.ox;
      const dy = e.clientY - d.oy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) justDraggedRef.current = true;
      // Once in reorder mode, STAY there (sticky) — prevents mode-flipping when the
      // mouse wobbles horizontally during a vertical drag.
      const enterReorder = !!d.reorderMode && !d.isReorder && Math.abs(dy) > 10 && (d.lockVertical || Math.abs(dy) > Math.abs(dx));
      if (d.isReorder || enterReorder) {
        d.isReorder = true; d.lastDy = dy;
        setDrag({ ...d }); // re-render for cursor + visual feedback
      } else if (d.canPin) {
        const stepPx = showDays ? DPX : WPX;
        setDDelta(Math.round(dx / stepPx));
      }
    }
    if (linkDrag) { setLinkDrag(ld => ld ? { ...ld, mouseX: e.clientX, mouseY: e.clientY } : null); }
  }
  function onMU() {
    const d = dragRef.current;
    if (d) {
      if (d.isReorder && d.lastDy) {
        const rowShift = Math.max(1, Math.abs(Math.round(d.lastDy / RH)));
        if (d.reorderMode === 'tree') {
          const dir = d.lastDy > 0 ? (rowShift > 1 ? 'last' : 'down') : (rowShift > 1 ? 'first' : 'up');
          onReorderSibling?.(d.id, dir);
        } else {
          const dir = d.lastDy > 0 ? 'later' : 'earlier';
          onReorderInQueue?.(d.id, dir, rowShift);
        }
      } else if (d.canPin && dDelta !== 0) {
        // Day mode: offset from the bar's actual start date (not the week's Monday).
        // Week mode: offset from the start week's Monday (bar is week-aligned).
        const baseDate = showDays && d.startD ? new Date(d.startD) : new Date(weeks[d.startWi].mon);
        let targetDate = showDays ? addD(baseDate, dDelta) : addD(baseDate, dDelta * 7);
        // Snap to nearest work day (forward for rightward drag, backward for leftward)
        if (showDays) {
          while (!wdSet.has(targetDate.getDay())) targetDate = addD(targetDate, dDelta > 0 ? 1 : -1);
        }
        const planStartDate = weeks[0]?.mon;
        if (planStartDate && targetDate < planStartDate) {
          onExtendViewStart?.(iso(targetDate));
        }
        onSeqUpdate(d.id, { pinnedStart: iso(targetDate) });
      }
      dragRef.current = null;
      setDrag(null); setDDelta(0);
    }
    if (linkDrag) {
      dismissTooltip(true);
      setLinkDrag(null);
    }
  }
  // Escape key cancels any in-progress drag or link operation.
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') {
        if (dragRef.current || drag) { dragRef.current = null; setDrag(null); setDDelta(0); justDraggedRef.current = false; }
        if (linkDrag) setLinkDrag(null);
        if (linkMode) setLinkMode(null);
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
  // Complete a link-drag onto a target bar
  function onLinkDrop(targetId) {
    if (!linkDrag || linkDrag.fromId === targetId) { setLinkDrag(null); return; }
    // Targeted add: reads latest tree state in App, touches only deps field.
    // target depends on linkDrag.fromId (predecessor → successor)
    onAddDep?.(targetId, linkDrag.fromId);
    setLinkDrag(null);
  }

  if (!allItems.length) return <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ textAlign: 'center', color: 'var(--tx3)' }}><div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>{t('g.noItems')}</div>
      <div style={{ fontSize: 12 }}>{t('g.addTasks')}</div>
    </div>
  </div>;

  const unestimatedCount = useMemo(() => allItems.filter(s => s._unestimated).length, [allItems]);

  return <div className="gantt" onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={() => {
    dismissTooltip(true);
    setHoverLineKey(null);
    if (drag || dragRef.current) { dragRef.current = null; setDrag(null); setDDelta(0); }
  }}>
    <div className="gantt-hdr">
      <div className="gh-fix" style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4, padding: '4px 10px' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* group label removed — buttons are self-explanatory and the row was too wide */}
          {[['project', t('g.project')], ['team', t('g.team')], ['resource', t('g.resource')]].map(([k, l]) =>
            <button
              key={k}
              className={`btn btn-xs ${groupBy === k ? 'btn-pri' : 'btn-sec'}`}
              onMouseDown={e => activateMode(e, () => setGB(k))}
              onClick={e => { if (e.detail === 0) setGB(k); }}
              style={{ padding: '2px 7px', fontSize: 10 }}
            >{l}</button>)}
          {allCollapseKeys.length > 0 && <>
            <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
            <button className="btn btn-sec btn-xs" onClick={expandAll} style={{ padding: '2px 7px', fontSize: 10 }}>{t('tv.expandAll')}</button>
            <button className="btn btn-sec btn-xs" onClick={collapseAll} style={{ padding: '2px 7px', fontSize: 10 }}>{t('tv.collapseAll')}</button>
          </>}
        </div>
      </div>
      <div ref={hR} className="gh-scroll">
        <div style={{ display: 'flex', borderBottom: '1px solid var(--b)', height: HH / 2 }}>
          {months.map((m, i) => { const [y, mo] = m.ym.split('-'); const isYS = mo === '0';
            return <div key={i} style={{ width: WPX * m.count, flexShrink: 0, borderRight: '1px solid var(--b2)', padding: '2px 5px', fontSize: 11, color: isYS ? 'var(--ac)' : 'var(--tx2)', fontFamily: 'var(--mono)', fontWeight: isYS ? 600 : 500, overflow: 'hidden', background: isYS ? 'var(--bg3)' : '', display: 'flex', alignItems: 'center' }}>
              {MDE[+mo]}{` '${y.slice(2)}`}
            </div>; })}
        </div>
        <div style={{ display: 'flex', height: HH / 2 }}>
          {weeks.map((w, i) => { const isYB = i > 0 && weeks[i - 1].mon.getFullYear() !== w.mon.getFullYear();
            const isNow = todayWi >= 0 && i === todayWi;
            return <div key={i} className={isNow ? 'gw-now' : w.hasH ? 'gw-hol' : isYB ? 'gw-yb' : ''} style={{ width: WPX, flexShrink: 0, borderRight: '1px solid var(--b)', borderLeft: isYB ? '2px solid var(--ac2)' : '', textAlign: 'center', fontSize: 10, color: isNow ? 'var(--gr)' : w.hasH ? 'var(--re)' : 'var(--tx3)', fontFamily: 'var(--mono)', fontWeight: isNow ? 700 : 400 }}>
              {w.kw}
            </div>; })}
        </div>
        {/* Day-level header row: all 7 days (Mon–Sun). Weekends grayed. */}
        {showDays && <div style={{ display: 'flex', height: 14, borderTop: '1px solid var(--b2)' }}>
          {weeks.map((w, i) => <div key={i} style={{ width: WPX, flexShrink: 0, display: 'flex' }}>
            {[0, 1, 2, 3, 4, 5, 6].map(d => {
              const date = addD(w.mon, d);
              const dow = date.getDay();
              const isWeekend = !wdSet.has(dow);
              const isToday = date.toDateString() === now.toDateString();
              return <div key={d} style={{ flex: 1, fontSize: 7, textAlign: 'center', color: isToday ? 'var(--gr)' : isWeekend ? 'var(--tx3)' : 'var(--tx2)', fontWeight: isToday ? 700 : 400, fontFamily: 'var(--mono)', borderRight: d < 6 ? '1px solid var(--b2)' : 'none', lineHeight: '14px', opacity: isWeekend ? .4 : 1, background: isWeekend ? 'rgba(127,127,127,.06)' : '' }}>{date.getDate()}</div>;
            })}
          </div>)}
        </div>}
        {/* Horizon color band: green(H1) → amber(H2) → gray(beyond) */}
        {(() => {
          const h1D = new Date(now); h1D.setDate(h1D.getDate() + h1Weeks * 7);
          const h2D = new Date(now); h2D.setDate(h2D.getDate() + h2Weeks * 7);
          const todX = dateToX(now), h1X = dateToX(h1D), h2X = dateToX(h2D);
          return <div style={{ display: 'flex', height: 3, position: 'relative', overflow: 'hidden', width: tw }}>
            {todX > 0 && <div style={{ position: 'absolute', left: 0, width: todX, height: '100%', background: 'var(--bg3)' }} />}
            {h1X > todX && <div style={{ position: 'absolute', left: Math.max(todX, 0), width: h1X - Math.max(todX, 0), height: '100%', background: 'var(--gr)', opacity: .5 }} data-htip={`H1 · ${h1Weeks}w — committed`} />}
            {h2X > h1X && <div style={{ position: 'absolute', left: h1X, width: h2X - h1X, height: '100%', background: 'var(--am)', opacity: .4 }} data-htip={`H2 · ${h2Weeks}w — estimated`} />}
            <div style={{ position: 'absolute', left: h2X, right: 0, height: '100%', background: 'var(--tx3)', opacity: .15 }} data-htip="Beyond H2 — exploratory" />
          </div>;
        })()}
      </div>
    </div>
    <div className="gantt-body">
      <div ref={lR} className="gantt-left" style={{ overflowY: 'hidden' }} onScroll={syncL} onWheel={onLWheel}>
        <div style={{ height: FLAG_ROW_H, borderBottom: '1px solid var(--b)', background: 'var(--bg)' }} />
        {rows.map(row => {
          if (row.type === 'group') {
            const isCol = collapsed.has(row.collapseKey || row.key);
            return <div key={row.key} className="gteam" style={{ color: row.color, borderLeft: `3px solid ${row.color}`, background: 'var(--bg2)', paddingLeft: 6, height: RH, cursor: 'default', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <button
                type="button"
                aria-label={isCol ? t('tv.expandAll') : t('tv.collapseAll')}
                onClick={e => { e.stopPropagation(); toggleCollapse(row.collapseKey || row.key); }}
                style={{ appearance: 'none', background: 'transparent', border: 'none', padding: 0, fontSize: 9, color: 'var(--tx3)', width: 12, textAlign: 'center', cursor: 'pointer' }}
              >{isCol ? '▶' : '▼'}</button>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
              <span style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 400, marginRight: 6, fontFamily: 'var(--mono)' }}>{row.count}</span>
            </div>;
          }
          const s = row.s;
          const isSummary = row.type === 'summary';
          const isCp = rowIsCp(row);
          const dim = cpOnly && !isCp;
          const indent = row.level * 14;
          const isHovDep = hoverDepId && hoverLines.rowIds.has(s.id) && s.id !== hoverDepId;
          const isHov = hoverDepId === s.id;
          const isMatchL = searchMatches?.has(s.id);
          const isActiveMatchL = s.id === activeMatchId;
          const searchDimmedL = searchMatches && searchMatches.size > 0 && !isMatchL;
          const confL = confidence[s.id] || 'committed';
          const confDot = isSummary ? null : (confL === 'exploratory' ? '○' : confL === 'estimated' ? '◐' : null);
          const statusProgress = s.progress ?? row.node?.progress ?? (s.status === 'done' ? 100 : s.status === 'wip' ? 50 : 0);
          const isCollapsed = !!row.collapseKey && collapsed.has(row.collapseKey);
          return <div key={rowKeyOf(row)} className={`grow-l${isCp ? ' cp-row' : ''}`} style={{ height: RH, cursor: 'pointer', opacity: dim ? .25 : searchDimmedL ? .35 : (s._unestimated ? .55 : 1), paddingLeft: 10 + indent, background: isActiveMatchL ? 'rgba(59,130,246,.15)' : isHov ? 'rgba(127,127,127,.10)' : isHovDep ? 'rgba(127,127,127,.05)' : '' }}
            onClick={() => openRowItem(row)}>
            {isSummary && <button
              type="button"
              aria-label={isCollapsed ? t('tv.expandAll') : t('tv.collapseAll')}
              onClick={e => { e.stopPropagation(); toggleCollapse(row.collapseKey); }}
              style={{ appearance: 'none', background: 'transparent', border: 'none', padding: 0, fontSize: 9, color: 'var(--tx3)', width: 12, textAlign: 'center', flexShrink: 0, cursor: 'pointer' }}
            >{isCollapsed ? '▶' : '▼'}</button>}
            <span className="tid" style={{ flexShrink: 0 }}>{s.id}</span>
            {confDot && <span style={{ fontSize: 9, color: confL === 'exploratory' ? 'var(--tx3)' : 'var(--am)', flexShrink: 0, lineHeight: 1, cursor: 'help' }} data-htip={`${confL === 'exploratory' ? 'Exploratory' : 'Estimated'} — ${REASON_TIP[confReasons[s.id]] || '?'}`}>{confDot}</span>}
            <StatusIcon status={s.status} progress={statusProgress} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: isSummary ? 600 : 400, color: isSummary ? 'var(--tx)' : 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: s.status === 'done' ? 'line-through' : 'none' }}>{s.name}</span>
            {!isSummary && (s._unestimated
              ? <span className="badge bw" style={{ fontSize: 9 }}>{t('g.noEstimate')}</span>
              : <span style={{ background: s.autoAssigned ? 'transparent' : 'var(--bg4)', color: s.autoAssigned ? 'var(--am)' : 'var(--tx2)', fontSize: 10, padding: '1px 5px', borderRadius: 3, flexShrink: 0, fontFamily: 'var(--mono)', border: s.autoAssigned ? '1px dashed var(--am)' : 'none', opacity: s.autoAssigned ? 0.7 : 1 }} data-htip={s.autoAssigned ? `Auto: ${s.person}` : (s.assign || []).map(id => members.find(m => m.id === id)?.name || id).join(', ') || s.person}>{snAll(s)}</span>)}
          </div>;
        })}
        {bodyScrollbarH > 0 && <div style={{ height: bodyScrollbarH, borderTop: '1px solid var(--b)', background: 'var(--bg)' }} />}
      </div>
      <div ref={bR} style={{ flex: 1, overflow: 'auto' }} onScroll={syncS}>
        <div style={{ width: tw, position: 'relative', minHeight: FLAG_ROW_H + rows.length * RH }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: tw, pointerEvents: 'none', zIndex: 0 }}>
            {/* Week columns. When the day grid is visible we don't tint the whole week red —
                individual holiday days get tinted below instead. */}
            {weeks.map((w, i) => <div key={i} style={{ position: 'absolute', left: i * WPX, top: 0, width: WPX, height: '100%', borderRight: '1px solid var(--b)', background: !showDays && w.hasH ? 'rgba(244,63,94,.10)' : '' }} />)}
            {/* Day-level overlays: all 7 days. Weekends grayed, holidays red-tinted, separators. */}
            {showDays && weeks.map((w, i) => {
              const wdsByTime = new Set(w.wds.map(d => d.getTime()));
              return [0, 1, 2, 3, 4, 5, 6].map(d => {
                const date = addD(w.mon, d);
                const dow = date.getDay();
                const isWeekend = !wdSet.has(dow);
                const isHoliday = !isWeekend && !wdsByTime.has(date.getTime());
                return <React.Fragment key={`d-${i}-${d}`}>
                  {isWeekend && <div style={{ position: 'absolute', left: i * WPX + d * DPX, top: 0, width: DPX, height: '100%', background: 'rgba(127,127,127,.10)' }} />}
                  {isHoliday && <div style={{ position: 'absolute', left: i * WPX + d * DPX, top: 0, width: DPX, height: '100%', background: 'rgba(244,63,94,.14)' }} />}
                  {d > 0 && <div style={{ position: 'absolute', left: i * WPX + d * DPX, top: 0, width: 1, height: '100%', background: isWeekend ? 'var(--b2)' : 'var(--b2)', opacity: isWeekend ? .2 : .35 }} />}
                </React.Fragment>;
              });
            })}
            {/* Pre-planStart zone: striped overlay for the rendering area before the scheduling horizon */}
            {(() => { const psX = planStart ? dateToX(new Date(planStart)) : 0;
              return psX > 0 ? <div style={{ position: 'absolute', left: 0, top: 0, width: psX, height: '100%', background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(127,127,127,.06) 4px, rgba(127,127,127,.06) 8px)', pointerEvents: 'none', zIndex: 1 }} data-htip="Before scheduling horizon — only pinned tasks appear here" /> : null;
            })()}
            {/* Past zone: subtle dim overlay for everything before today */}
            {todayX > 0 && <div style={{ position: 'absolute', left: 0, top: 0, width: todayX, height: '100%', background: 'rgba(0,0,0,.06)', pointerEvents: 'none', zIndex: 1 }} />}
            {/* Today marker — always day-accurate */}
            {todayX >= 0 && <div style={{ position: 'absolute', left: todayX, top: 0, width: 2, height: '100%', background: 'var(--gr)', opacity: .7, zIndex: 5 }} />}
            {/* Horizon lines: H1 (committed boundary) and H2 (estimated boundary) */}
            {(() => {
              const h1Date = new Date(now); h1Date.setDate(h1Date.getDate() + h1Weeks * 7);
              const h2Date = new Date(now); h2Date.setDate(h2Date.getDate() + h2Weeks * 7);
              const h1X = dateToX(h1Date);
              const h2X = dateToX(h2Date);
              return <>
                {h1X > 0 && h1X < tw && <div style={{ position: 'absolute', left: h1X, top: 0, width: 0, height: '100%', borderLeft: '2px dashed var(--ac)', opacity: .35, zIndex: 3 }} data-htip={`Horizon 1 (${h1Weeks}w) — items here should be committed`} />}
                {h1X > 0 && h1X < tw && <div style={{ position: 'absolute', left: h1X + 4, top: 2, fontSize: 8, color: 'var(--ac)', opacity: .5, fontFamily: 'var(--mono)', zIndex: 4, whiteSpace: 'nowrap', pointerEvents: 'none' }}>H1 · {h1Weeks}w</div>}
                {h2X > 0 && h2X < tw && <div style={{ position: 'absolute', left: h2X, top: 0, width: 0, height: '100%', borderLeft: '2px dashed var(--am)', opacity: .3, zIndex: 3 }} data-htip={`Horizon 2 (${h2Weeks}w) — items here should be at least estimated`} />}
                {h2X > 0 && h2X < tw && <div style={{ position: 'absolute', left: h2X + 4, top: 2, fontSize: 8, color: 'var(--am)', opacity: .5, fontFamily: 'var(--mono)', zIndex: 4, whiteSpace: 'nowrap', pointerEvents: 'none' }}>H2 · {h2Weeks}w</div>}
              </>;
            })()}
            {dlL.map(dl => {
              const x = dl.wi * WPX;
              const col = dl.severity === 'critical' ? 'var(--re)' : 'var(--am)';
              // Backfill: gentle gradient fading from the deadline mast to the left, so the eye
              // naturally traces the runway leading up to the date. Capped at 8 weeks.
              const backfillW = Math.min(x, 8 * WPX);
              const titleStr = `${dl.name} ${dl.date}${dl.isLate ? ' — AT RISK' : ''}`;
              return <React.Fragment key={dl.id}>
                {backfillW > 0 && <div style={{ position: 'absolute', left: x - backfillW, top: 0, width: backfillW, height: '100%',
                  background: `linear-gradient(to right, transparent, ${dl.severity === 'critical' ? 'rgba(244,63,94,.14)' : 'rgba(245,158,11,.14)'})`,
                  pointerEvents: 'none', zIndex: 3 }} data-htip={titleStr} />}
                {/* Mast: vertical line at the deadline week */}
                <div style={{ position: 'absolute', left: x, top: 0, width: 2, height: '100%', background: col, opacity: .7, zIndex: 4 }} data-htip={titleStr} />
                {/* Flag: triangle notch on the left (pointing back toward the backfill), label body to the right of the mast */}
                <div style={{ position: 'absolute', left: x, top: 1, zIndex: 6, pointerEvents: 'none', display: 'flex', alignItems: 'center', maxWidth: 120 }} data-htip={titleStr}>
                  <div style={{
                    background: col, color: '#fff', fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
                    padding: '2px 6px 2px 8px', letterSpacing: '.02em',
                    clipPath: 'polygon(6px 0, 100% 0, calc(100% - 4px) 50%, 100% 100%, 6px 100%, 0 50%)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 118,
                  }}>{dl.isLate ? '! ' : ''}{dl.name}</div>
                </div>
              </React.Fragment>;
            })}
          </div>
          <div style={{ height: FLAG_ROW_H, borderBottom: '1px solid var(--b)' }} />
          {rows.map(row => {
            if (row.type === 'group') {
              return <div key={row.key} style={{ height: RH, background: 'var(--bg2)', borderBottom: '1px solid var(--b2)' }} />;
            }
            const s = row.s;
            const tc = rowColor(row);
            const isSummary = row.type === 'summary';
            const isCp = rowIsCp(row);
            const rowKey = rowKeyOf(row);
            if (s._unestimated) return <div key={rowKey} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
            if (s._completed && (!s.startD || !s.endD)) return <div key={rowKey} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
            const isDrag = drag?.id === s.id;
            // Bar geometry — day-accurate in day-mode (using scheduler's per-day startD/endD),
            // week-aligned otherwise.
            let baseLeft, baseWidth;
            if (showDays && s.startD && s.endD) {
              baseLeft = dateToX(s.startD) + 2;
              baseWidth = dateToX(s.endD) + (DPX) - dateToX(s.startD) - 4;
            } else {
              baseLeft = s.startWi * WPX + 2;
              baseWidth = (s.endWi - s.startWi + 1) * WPX - 4;
            }
            // Drag offset: dDelta is in days when showDays, weeks otherwise.
            const dragPxOffset = isDrag ? dDelta * (showDays ? DPX : WPX) : 0;
            const barLeft = Math.max(0, baseLeft + dragPxOffset);
            const bW = baseWidth;
            const dim = cpOnly && !isCp;
            const isHovDep = hoverDepId && hoverLines.rowIds.has(s.id) && s.id !== hoverDepId;
            const isHov = hoverDepId === s.id;
            const isMatch = searchMatches?.has(s.id);
            const searchDimmed = searchMatches && searchMatches.size > 0 && !isMatch;
            const node = row.node || iMap[s.id];
            const conf = confidence[s.id] || 'committed';
            const decideBy = isSummary ? null : node?.decideBy;
            const decideWi = decideBy ? weeks.findIndex(w => { const next = weeks[weeks.indexOf(w) + 1]; const d = new Date(decideBy); return w.mon <= d && (!next || next.mon > d); }) : -1;
            const isDecideOverdue = decideBy && new Date(decideBy) < now;
            // Confidence-based bar styling
            const confStyle = conf === 'exploratory'
              ? { background: 'transparent', border: `1.5px dashed ${tc}`, color: tc, textShadow: 'none', opacity: 0.7 }
              : conf === 'estimated'
              ? { background: withAlpha(tc, 0.38), border: `1px solid ${tc}`, color: '#fff', textShadow: '0 1px 1.5px rgba(0,0,0,.3)' }
              : { background: tc, color: '#fff', textShadow: '0 1px 1.5px rgba(0,0,0,.3)' };
            const summaryStyle = s.status === 'done'
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
            return <div key={rowKey} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)', opacity: dim ? .2 : searchDimmed ? .25 : 1, background: isHov ? 'rgba(127,127,127,.10)' : isHovDep ? 'rgba(127,127,127,.05)' : '' }}>
              {/* Vacation overlays — per-assignee on every task row regardless of grouping */}
              {!isSummary && (() => {
                const bands = vacBandsByTaskId[s.id] || EMPTY_ARR;
                if (!bands.length) return null;
                return bands.map(band => {
                  return <div key={band.key} style={{
                    position: 'absolute', left: band.x1, top: band.topPx, width: band.width, height: band.heightPx,
                    background: 'rgba(245,158,11,.18)',
                    borderLeft: '1px solid rgba(245,158,11,.28)',
                    borderRight: '1px solid rgba(245,158,11,.28)',
                    zIndex: 2, pointerEvents: 'none',
                  }} data-htip={`${band.personName} · ${t('g.vacation')}: ${band.from} → ${band.to}${band.note ? ' · ' + band.note : ''}`} />;
                });
              })()}
              {bW > 0 && <div className={`gbar${isDrag ? ' dragging' : ''}${isCp ? ' cp-bar' : ''}`} data-link-from={s.id}
                style={{
                  left: barLeft, width: Math.max(bW, 6), top: isSummary ? 6 : 4, height: isSummary ? 16 : 20, borderRadius: isSummary ? 5 : 4,
                  // Vertical reorder feedback: bar visually follows the mouse vertically,
                  // with a strong glow so the user sees they're in reorder mode.
                  transform: (isDrag && drag?.isReorder) ? `translateY(${Math.round(drag.lastDy / RH) * RH}px)` : undefined,
                  zIndex: (isDrag && drag?.isReorder) ? 20 : undefined,
                  boxShadow: (isDrag && drag?.isReorder)
                    ? '0 4px 20px rgba(0,0,0,.5), 0 0 0 2px var(--ac)'
                    : s.id === activeMatchId ? '0 0 0 3px var(--ac), 0 0 8px rgba(59,130,246,.35)'
                    : isMatch ? '0 0 0 2px var(--am)'
                    : linkMode?.fromId === s.id || linkDrag?.fromId === s.id ? '0 0 0 2px var(--ac)' : undefined,
                  ...(isSummary
                    ? summaryStyle
                    : s.status === 'done'
                    ? {
                        background: `linear-gradient(0deg, rgba(120,128,138,.58), rgba(120,128,138,.58)), ${tc}`,
                        border: '1px solid rgba(255,255,255,.14)',
                        color: 'rgba(255,255,255,.92)',
                        textShadow: '0 1px 1.5px rgba(0,0,0,.28)',
                      }
                    : confStyle),
                  cursor: linkMode || linkDrag ? 'crosshair'
                    : isSummary ? (groupBy === 'project' ? 'ns-resize' : 'pointer')
                    : s.status === 'done' ? 'pointer'
                    : (drag?.id === s.id && drag?.isReorder) ? 'ns-resize'
                    : drag ? 'grabbing' : 'grab',
                }}
                onMouseEnter={e => {
                  if (dragRef.current || drag || linkDrag || linkMode || hoverLineKey) return;
                  showRowTip(row, e, !isSummary);
                }}
                onMouseLeave={() => hideRowTip(row, !isSummary)}
                onMouseDown={e => {
                  dismissTooltip(true);
                  if (linkMode || linkDrag) return;
                  if (isSummary) {
                    if (groupBy !== 'project' || !onReorderSibling) return;
                    onBMD(e, row);
                    return;
                  }
                  if (s.status === 'done') return;
                  onBMD(e, row);
                }}
                onMouseUp={() => { if (linkDrag && !isSummary) { dismissTooltip(true); onLinkDrop(s.id); } }}
                onClick={() => {
                  dismissTooltip(true);
                  if (isSummary) {
                    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
                    onBarClick?.(s);
                    return;
                  }
                  if (linkMode && linkMode.fromId !== s.id) {
                    // Click-link mode (legacy via context menu): this bar becomes successor (depends on linkMode.fromId) or predecessor
                    if (linkMode.mode === 'pred') onAddDep?.(s.id, linkMode.fromId);
                    else onAddDep?.(linkMode.fromId, s.id);
                    setLinkMode(null);
                    return;
                  }
                  // Suppress the click-after-drag: drag gestures (pin, reorder) shouldn't
                  // also open the QuickEdit sidebar on mouse-up.
                  if (justDraggedRef.current) { justDraggedRef.current = false; return; }
                  if (linkDrag) return;
                  onBarClick?.(s);
                }}
                onContextMenu={e => {
                  if (isSummary) return;
                  e.preventDefault();
                  dismissTooltip(true);
                  setCtxMenu({ x: e.clientX, y: e.clientY, taskId: s.id });
                }}>
                {/* Progress overlay: lighter strip on the left proportional to progress % */}
                {(() => { const prog = s.progress ?? node?.progress ?? (node?.status === 'done' ? 100 : node?.status === 'wip' ? 50 : 0);
                  if (!(prog > 0 && prog < 100)) return null;
                  return <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${prog}%`,
                    background: isSummary ? 'rgba(127,127,127,.18)' : 'rgba(255,255,255,.18)',
                    borderRadius: isSummary ? '5px 0 0 5px' : '4px 0 0 4px',
                    pointerEvents: 'none',
                  }} data-htip={`${prog}% done`} />;
                })()}
                {/* Phase segments overlay */}
                {!isSummary && node?.phases?.length > 1 && (() => {
                  const phases = normalizePhases(node.phases);
                  const shares = phaseWeightShares(phases);
                  return <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, display: 'flex', pointerEvents: 'none', borderRadius: 4, overflow: 'hidden' }}>
                    {phases.map((ph, pi) => <div key={ph.id || pi} style={{
                      flex: `${shares[pi] || 1} 0 0`,
                      borderRight: pi < phases.length - 1 ? '1px solid rgba(0,0,0,.2)' : 'none',
                      background: ph.status === 'done' ? 'rgba(255,255,255,.15)' : ph.status === 'wip' ? 'transparent' : 'rgba(0,0,0,.12)',
                    }} data-htip={`${ph.name}: ${ph.status}${ph.effortPct ? ` · ${ph.effortPct}%` : ''}`} />)}
                  </div>;
                })()}
                {s.status === 'done' && <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: isSummary ? 'rgba(119,128,138,.08)' : 'rgba(119,128,138,.16)',
                  borderRadius: isSummary ? 5 : 4,
                  pointerEvents: 'none',
                }} />}
                <span style={{ position: 'sticky', left: 6, display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
                {s.status === 'done' && <span style={{ marginRight: 4, fontSize: 10, flexShrink: 0, color: isSummary ? 'var(--tx3)' : 'rgba(255,255,255,.92)' }}>✓</span>}
                {!isSummary && node?.parallel && <span style={{ marginRight: 4, fontSize: 10, flexShrink: 0 }} data-htip="Parallel — runs alongside other work (capacity bypass)">≡</span>}
                {!isSummary && node?.pinnedStart && <span style={{ marginRight: 4, fontSize: 10, cursor: 'pointer', flexShrink: 0 }}
                  data-htip={`${s.pinOverridden ? `Pin to ${node.pinnedStart} overridden by capacity. ` : `Pinned to ${node.pinnedStart}. `}Click to unpin.`}
                  onClick={e => { e.stopPropagation(); onTaskUpdate?.({ ...node, pinnedStart: '' }); }}>{s.pinOverridden ? '⚠📌' : '📌'}</span>}
                {bW > 35 && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: s.status === 'done' ? 'line-through' : 'none' }}>{isSummary ? `${s.name} · ${s._summaryCount}` : s.name}</span>}
                </span>
                {/* Right-edge link handle: drag from here to another bar to add a dependency */}
                {!isSummary && s.status !== 'done' && <div data-htip="Drag to another bar to add a dependency" onMouseDown={e => onLinkStart(e, s.id)}
                  style={{ position: 'absolute', right: -4, top: 0, bottom: 0, width: 10, cursor: 'crosshair', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 1 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bg)', border: `1.5px solid ${tc}`, opacity: linkDrag ? 1 : 0.7 }} />
                </div>}
              </div>}
              {/* Decision-by marker: diamond on the row at the decideBy week */}
              {decideWi >= 0 && !isSummary && s.status !== 'done' && <div data-htip={`Decide by ${decideBy}${isDecideOverdue ? ' — OVERDUE' : ''}`}
                style={{ position: 'absolute', left: decideWi * WPX + WPX / 2 - 6, top: RH / 2 - 6, width: 12, height: 12, background: isDecideOverdue ? 'var(--re)' : 'var(--am)', transform: 'rotate(45deg)', border: '1px solid #000', zIndex: 4, pointerEvents: 'auto' }} />}
            </div>;
          })}
          {allDepLines.length > 0 && <svg style={{ position: 'absolute', top: 0, left: 0, width: tw, height: FLAG_ROW_H + rows.length * RH, zIndex: 3, pointerEvents: 'none' }}>
            <defs>
              <marker id="gar" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--re)" /></marker>
              <marker id="garH" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--ac)" /></marker>
              <marker id="garN" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--tx3)" /></marker>
            </defs>
            {(() => {
              // Short 5px stubs horizontally out of source / into target, cubic bezier between.
              // Works for both forward (target right of source) and backward (target left of source):
              // in the backward case the control points' horizontal pull creates a natural S-loop
              // without any orthogonal step pattern.
              const buildPath = (l) => {
                const isForward = l.x2 > l.x1;
                const stub = 10;
                const sx = l.x1 + stub;
                const tx = l.x2 - stub;
                // Short forward arrows (stubs overlap): simple arc, no S-loop.
                if (isForward && tx <= sx) {
                  const cpOff = Math.max(Math.abs(l.y2 - l.y1) * 0.4, 20);
                  return `M${l.x1},${l.y1} C${l.x1 + cpOff},${l.y1} ${l.x2 - cpOff},${l.y2} ${l.x2 - 1},${l.y2}`;
                }
                // Normal forward: smooth bezier. Backward: S-loop to visualize the violation.
                const dx = isForward
                  ? Math.max((tx - sx) * 0.4, 20)
                  : Math.max(Math.abs(tx - sx) * 0.5, 30);
                const c1x = sx + dx;
                const c2x = tx - dx;
                return `M${l.x1},${l.y1} L${sx},${l.y1} C${c1x},${l.y1} ${c2x},${l.y2} ${tx},${l.y2} L${l.x2 - 1},${l.y2}`;
              };
              return allDepLines.map(l => {
                const path = buildPath(l);
                const isHovered = hoverLineKey === l.key;
                const isHoveredTask = hoverDepId && (hoverDepId === l.srcId || hoverDepId === l.tgtId);
                const emphasized = isHovered || isHoveredTask;
                const col = l.isCp ? 'var(--re)' : emphasized ? 'var(--ac)' : 'var(--tx3)';
                const marker = l.isCp ? 'url(#gar)' : emphasized ? 'url(#garH)' : 'url(#garN)';
                // Default opacity raised because solid-fill bars made the prior 0.32
                // grey arrows disappear visually between adjacent bars.
                const opacity = emphasized ? 0.95 : (l.isCp ? 0.7 : 0.55);
                const strokeWidth = emphasized ? 1.8 : 1.2;
                const openDependency = () => {
                  dismissTooltip(true);
                  setHoverLineKey(null);
                  onBarClick?.({ id: l.removeFromId }, { tab: 'timing', focusHint: 'deps', depId: l.removeDepId });
                };
                return <g key={l.key}>
                  <path d={path} fill="none" stroke={col} strokeWidth={strokeWidth} opacity={opacity} strokeLinejoin="round" strokeLinecap="round" markerEnd={marker} style={{ pointerEvents: 'none' }} />
                  {/* Wide invisible hover/click target */}
                  <path d={path} fill="none" stroke="transparent" strokeWidth={14}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onMouseEnter={() => { dismissTooltip(true); setHoverLineKey(l.key); }}
                    onMouseLeave={() => setHoverLineKey(k => k === l.key ? null : k)}
                    onClick={openDependency}>
                    <title>{`${t('qe.predecessors')}: ${l.removeDepId} → ${l.removeFromId}`}</title>
                  </path>
                </g>;
              });
            })()}
          </svg>}
        </div>
      </div>
    </div>
    <div className="gantt-footer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} data-htip={`Zoom: ${Math.round(WPX)} px / week. Day-level grid appears at ≥ 70 px/wk.`}>
        <span style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 2 }}>{t('g.zoom')}</span>
        <button className={`btn btn-xs ${!showDays ? 'btn-pri' : 'btn-sec'}`} onClick={() => setZ(DEFAULT_WPX)} style={{ padding: '2px 7px', fontSize: 10 }}>{t('g.week')}</button>
        <button className={`btn btn-xs ${showDays ? 'btn-pri' : 'btn-sec'}`} onClick={() => setZ(DAY_ZOOM)} style={{ padding: '2px 7px', fontSize: 10 }}>{t('g.day')}</button>
        <button className="btn btn-sec btn-xs" onClick={() => setZ(WPX * 0.8)} data-htip="Zoom out" style={{ padding: '2px 7px', fontSize: 10 }}>−</button>
        <button className="btn btn-sec btn-xs" onClick={() => setZ(WPX * 1.25)} data-htip="Zoom in" style={{ padding: '2px 7px', fontSize: 10 }}>+</button>
        <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
        <button className="btn btn-sec btn-xs" onClick={scrollToToday} style={{ padding: '2px 7px', fontSize: 10 }}>{t('g.today')}</button>
      </div>
      {searchMatches && <span style={{ fontSize: 10, color: searchMatches.size ? 'var(--am)' : 'var(--re)', fontFamily: 'var(--mono)' }}>
        {searchMatchList.length
          ? `${((searchIdx % searchMatchList.length) + searchMatchList.length) % searchMatchList.length + 1} / ${searchMatchList.length}`
          : `0 ${t('g.matches')}`}
      </span>}
      <span style={{ width: 1, height: 14, background: 'var(--b2)' }} />
      {dlL.map(dl => <span key={dl.id} className={`badge ${dl.isLate ? 'bc' : dl.maxEnd ? 'bd' : dl.severity === 'critical' ? 'bc' : 'bh'}`}>
        {dl.isLate ? '! ' : dl.maxEnd ? '' : ''}{dl.name} {dl.date}{dl.isLate ? ` ${t('s.atRisk')}` : dl.maxEnd ? ` ${t('s.onTrack')}` : ''}
      </span>)}
      {cpSet?.size > 0 && <button className={`badge b-cp${cpOnly ? '' : ''}`} style={{ cursor: 'pointer', border: cpOnly ? '1px solid var(--re)' : '', background: cpOnly ? 'var(--re)' : '', color: cpOnly ? '#000' : '' }} data-htip={cpOnly ? 'Click to show all items' : 'Click to highlight only critical path. Critical path = chain of tasks that determines the earliest possible end date — any delay here delays the whole project.'} onClick={() => setCpOnly(v => !v)}>{cpOnly ? '◉ ' : '○ '}Critical path: {cpSet.size}</button>}
      {unestimatedCount > 0 && <span className="badge bw" data-htip="Items without estimates aren't scheduled but are listed for visibility">{unestimatedCount} {t('g.noEstimate')}</span>}
      {/* Confidence legend */}
      {(() => {
        const counts = { committed: 0, estimated: 0, exploratory: 0 };
        allItems.forEach(s => { if (s.status !== 'done') counts[confidence[s.id] || 'committed']++; });
        return (counts.estimated > 0 || counts.exploratory > 0) ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
          <span data-htip="Committed: person assigned, estimate solid">● {counts.committed}</span>
          <span style={{ color: 'var(--am)' }} data-htip="Estimated: team/estimate exists but no person or high risk">◐ {counts.estimated}</span>
          <span data-htip="Exploratory: scope unclear, needs concept work">○ {counts.exploratory}</span>
        </span> : null;
      })()}
      {linkMode && <span style={{ fontSize: 11, color: 'var(--ac)', marginLeft: 'auto' }}>
        🔗 {t('g.linkClick', linkMode.mode === 'pred' ? t('g.ctxPred') : t('g.ctxSucc'))} <b>{linkMode.fromId}</b>
        <button className="btn btn-ghost btn-xs" style={{ marginLeft: 6 }} onClick={() => setLinkMode(null)}>{t('cancel')}</button>
      </span>}
      {linkDrag && <span style={{ fontSize: 11, color: 'var(--ac)', marginLeft: 'auto' }}>🔗 {t('g.linkDrop')}</span>}
      {/* Bar-help text removed — discoverable via right-click context menu */}
    </div>
    {/* Viewport overlay for the live drag-to-link line */}
    {linkDrag && <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 1000 }}>
      <defs><marker id="ldArr" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--ac)" /></marker></defs>
      {(() => {
        const el = document.querySelector(`[data-link-from="${linkDrag.fromId}"]`);
        const rect = el?.getBoundingClientRect();
        const x1 = rect ? rect.right : linkDrag.mouseX;
        const y1 = rect ? rect.top + rect.height / 2 : linkDrag.mouseY;
        const x2 = linkDrag.mouseX, y2 = linkDrag.mouseY;
        const stub = 10;
        const sx = x1 + stub;
        const tx = x2 - stub;
        const dx = Math.max(Math.abs(tx - sx) * 0.5, 30);
        const c1x = sx + dx, c2x = tx - dx;
        const d = `M${x1},${y1} L${sx},${y1} C${c1x},${y1} ${c2x},${y2} ${tx},${y2} L${x2 - 1},${y2}`;
        return <path d={d} stroke="var(--ac)" strokeWidth={2} fill="none" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" markerEnd="url(#ldArr)" />;
      })()}
    </svg>}
    {/* Hover tooltip on left-panel task names — same Tip component as NetGraph */}
    {tip && <Tip item={tip.item} x={tip.x + 14} y={tip.y + 16} teams={teams} members={members} tree={tree} />}
    {ctxMenu && (() => {
      const node = iMap[ctxMenu.taskId]; if (!node) return null;
      const close = () => setCtxMenu(null);
      return <>
        <div onClick={close} onContextMenu={e => { e.preventDefault(); close(); }} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
        <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 4, zIndex: 999, boxShadow: 'var(--sh)', minWidth: 200 }}>
          <div style={{ padding: '5px 10px', fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--b)', marginBottom: 4 }}>{ctxMenu.taskId} — {node.name?.slice(0, 30)}</div>
          <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onBarClick(scheduled.find(s => s.id === ctxMenu.taskId) || node); close(); }}>📝 {t('g.ctxEdit')}</div>
          <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { setLinkMode({ fromId: ctxMenu.taskId, mode: 'succ' }); close(); }}>⬇ {t('g.ctxSucc')}</div>
          <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { setLinkMode({ fromId: ctxMenu.taskId, mode: 'pred' }); close(); }}>⬆ {t('g.ctxPred')}</div>
          <div style={{ borderTop: '1px solid var(--b)', margin: '4px 0' }} />
          <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }}
            onClick={() => { onTaskUpdate?.({ ...node, parallel: !node.parallel }); close(); }}>
            {node.parallel ? `≡ ${t('g.ctxSequential')}` : `≡ ${t('g.ctxParallel')}`}
          </div>
          {(groupBy === 'project' ? onReorderSibling : onReorderInQueue) && !node.parallel && <>
            <div style={{ borderTop: '1px solid var(--b)', margin: '4px 0' }} />
            <div style={{ padding: '4px 10px', fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('g.ctxQueueOrder')}</div>
            {groupBy === 'project'
              ? <>
                <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderSibling?.(ctxMenu.taskId, 'first'); close(); }}>⤒ {t('g.ctxRunFirst')}</div>
                <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderSibling?.(ctxMenu.taskId, 'up'); close(); }}>▲ {t('g.ctxRunEarlier')}</div>
                <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderSibling?.(ctxMenu.taskId, 'down'); close(); }}>▼ {t('g.ctxRunLater')}</div>
                <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderSibling?.(ctxMenu.taskId, 'last'); close(); }}>⤓ {t('g.ctxRunLast')}</div>
              </>
              : <>
                <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderInQueue?.(ctxMenu.taskId, 'first'); close(); }}>⤒ {t('g.ctxRunFirst')}</div>
                <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderInQueue?.(ctxMenu.taskId, 'earlier'); close(); }}>▲ {t('g.ctxRunEarlier')}</div>
                <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderInQueue?.(ctxMenu.taskId, 'later'); close(); }}>▼ {t('g.ctxRunLater')}</div>
                <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderInQueue?.(ctxMenu.taskId, 'last'); close(); }}>⤓ {t('g.ctxRunLast')}</div>
              </>}
          </>}
          <div style={{ borderTop: '1px solid var(--b)', margin: '4px 0' }} />
          {node.pinnedStart
            ? <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onTaskUpdate?.({ ...node, pinnedStart: '' }); close(); }}>📌 {t('g.ctxUnpin')} ({node.pinnedStart})</div>
            : <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { const sched = scheduled.find(s => s.id === ctxMenu.taskId); if (sched && sched.startD) { onTaskUpdate?.({ ...node, pinnedStart: iso(sched.startD) }); } close(); }}>📌 {t('g.ctxPinCurrent')}</div>}
          {node.deps?.length > 0 && <>
            <div style={{ borderTop: '1px solid var(--b)', margin: '4px 0' }} />
            <div style={{ padding: '4px 10px', fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('g.ctxRemoveDep')}</div>
            {node.deps.map(d => <div key={d} className="tr" style={{ padding: '4px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 4, color: 'var(--re)', fontFamily: 'var(--mono)' }} onClick={() => { onRemoveDep?.(ctxMenu.taskId, d); close(); }}>× {d}</div>)}
          </>}
        </div>
      </>;
    })()}
  </div>;
}
