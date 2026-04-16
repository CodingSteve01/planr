import React, { useState, useRef, useMemo, useEffect } from 'react';
import { WPX as DEFAULT_WPX, MDE, GT } from '../../constants.js';
import { iso, addD, addWorkDays } from '../../utils/date.js';
import { resolveToLeafIds, isLeafNode } from '../../utils/scheduler.js';

const NO_TEAM = '__no_team__';
const NO_TEAM_COLOR = '#64748b';
const NO_PERSON = '(unassigned)';
const NO_PROJECT = '__none__';

export function GanttView({ scheduled, weeks, goals, teams, members = [], cpSet, tree, search = '', onBarClick, onSeqUpdate, onExtendPlanStart, onTaskUpdate, onRemoveDep, onAddDep, onReorderInQueue }) {
  // Tooltip removed — was too intrusive and obscured the bars. Use the side panel for details.
  const [drag, setDrag] = useState(null);
  const [dDelta, setDDelta] = useState(0);
  const [groupBy, setGroupBy] = useState(() => { try { return localStorage.getItem('planr_gantt_group') || 'project'; } catch { return 'project'; } });
  const [collapsed, setCollapsed] = useState(new Set());
  const [cpOnly, setCpOnly] = useState(false); // dim non-critical items
  const [hoverDepId, setHoverDepId] = useState(null); // task ID currently hovered (for dep arrows)
  const [hoverLineKey, setHoverLineKey] = useState(null); // currently hovered dep line (for × badge + emphasis)
  const [ctxMenu, setCtxMenu] = useState(null); // {x, y, taskId}
  const [linkMode, setLinkMode] = useState(null); // {fromId, mode: 'pred'|'succ'} — click a second bar to add dep
  const [linkDrag, setLinkDrag] = useState(null); // {fromId, fromX, fromY, mouseX, mouseY} — drag-to-link in progress
  // Zoom: WPX = pixels per week. 20 = default, lower zooms out (months), higher zooms in (toward day-level)
  const [zoom, setZoom] = useState(() => { try { return +localStorage.getItem('planr_gantt_zoom') || DEFAULT_WPX; } catch { return DEFAULT_WPX; } });
  const setZ = v => { const c = Math.max(8, Math.min(140, v)); setZoom(c); try { localStorage.setItem('planr_gantt_zoom', String(c)); } catch {} };
  const WPX = zoom;
  const showDays = WPX >= 70; // at this zoom, individual days fit (~14 px each)
  const setGB = v => { setGroupBy(v); try { localStorage.setItem('planr_gantt_group', v); } catch {} };
  const hR = useRef(null), bR = useRef(null), lR = useRef(null);

  function syncS(e) { if (hR.current) hR.current.scrollLeft = e.target.scrollLeft; if (lR.current) lR.current.scrollTop = e.target.scrollTop; }
  function syncL(e) { if (bR.current) bR.current.scrollTop = e.target.scrollTop; }
  function onLWheel(e) { if (bR.current) { bR.current.scrollTop += e.deltaY; bR.current.scrollLeft += e.deltaX; } }

  const tw = weeks.length * WPX;
  // Map a Date to its pixel X position on the Gantt body.
  // Each week = WPX px covering Mo–Fr (5 working-day columns of WPX/5 each).
  // Weekend dates clamp to Friday of their containing week (they never appear in
  // scheduler output but we stay defensive).
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
    const dayInWeek = dow === 0 ? 4 : Math.min(dow - 1, 4);
    return wi * WPX + dayInWeek * (WPX / 5);
  }
  const months = []; let cm = null, cc = 0, cs = 0;
  weeks.forEach((w, i) => { const ym = `${w.mon.getFullYear()}-${w.mon.getMonth()}`; if (ym !== cm) { if (cm) months.push({ ym: cm, count: cc, start: cs }); cm = ym; cc = 1; cs = i; } else cc++; });
  if (cm) months.push({ ym: cm, count: cc, start: cs });

  // Build all-items list: scheduled items + un-estimated leaves (so nothing hides)
  const sIdSet = new Set(scheduled.map(s => s.id));
  const unscheduledLeaves = (tree || []).filter(r => isLeafNode(tree || [], r.id) && !sIdSet.has(r.id) && r.status !== 'done').map(r => ({
    id: r.id, name: r.name, team: r.team || '', person: NO_PERSON, personId: null, prio: r.prio, seq: r.seq,
    best: r.best || 0, status: r.status, note: r.note || '', deps: (r.deps || []).join(', '),
    startD: null, endD: null, startWi: -1, endWi: -1, weeks: 0, calDays: 0, capPct: 0, vacDed: 0,
    _unestimated: true,
  }));
  const allItems = [...scheduled, ...unscheduledLeaves];

  // Determine root id of a task ('P1', 'D1.2.3' → 'D1')
  const rootOf = id => id.split('.')[0];
  const iMap = useMemo(() => Object.fromEntries((tree || []).map(r => [r.id, r])), [tree]);

  // Build groups based on groupBy. Groups can have subGroups for nested modes.
  const groups = useMemo(() => {
    const result = [];
    const sortItems = arr => arr.sort((a, b) => (a.prio || 4) - (b.prio || 4) || (a.startWi || 0) - (b.startWi || 0) || a.id.localeCompare(b.id));
    const teamGroupOf = (items, parentKey = '') => {
      const usedT = [...new Set(items.map(s => s.team || NO_TEAM))];
      const tOrd = [...new Set([...teams.map(t => t.id), ...usedT])].filter(t => usedT.includes(t));
      return tOrd.map(tid => {
        const subItems = sortItems(items.filter(s => (s.team || NO_TEAM) === tid));
        if (!subItems.length) return null;
        const t = teams.find(x => x.id === tid);
        return {
          key: parentKey + 'team:' + tid,
          label: tid === NO_TEAM ? 'No team' : (t?.name || tid),
          color: tid === NO_TEAM ? NO_TEAM_COLOR : (t?.color || '#3b82f6'),
          items: subItems,
        };
      }).filter(Boolean);
    };

    if (groupBy === 'team') {
      teamGroupOf(allItems).forEach(g => result.push(g));
    } else if (groupBy === 'person') {
      const personKey = s => s.personId || s.person || NO_PERSON;
      const personLabel = s => s.person || NO_PERSON;
      const used = [...new Set(allItems.map(personKey))];
      used.sort((a, b) => a === NO_PERSON ? 1 : b === NO_PERSON ? -1 : a.localeCompare(b));
      used.forEach(pk => {
        const items = sortItems(allItems.filter(s => personKey(s) === pk));
        if (!items.length) return;
        const lbl = personLabel(items[0]);
        result.push({ key: 'person:' + pk, label: lbl, color: pk === NO_PERSON ? NO_TEAM_COLOR : 'var(--ac)', items });
      });
    } else if (groupBy === 'project' || groupBy === 'projteam') {
      const used = [...new Set(allItems.map(s => rootOf(s.id)))];
      const treeRootOrder = (tree || []).filter(r => !r.id.includes('.')).map(r => r.id);
      used.sort((a, b) => { const ai = treeRootOrder.indexOf(a), bi = treeRootOrder.indexOf(b); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
      used.forEach(rid => {
        const projItems = sortItems(allItems.filter(s => rootOf(s.id) === rid));
        if (!projItems.length) return;
        const root = iMap[rid];
        const label = root ? `${root.type ? GT[root.type] + ' ' : ''}${rid} — ${root.name}` : rid;
        const color = root?.type === 'deadline' ? 'var(--re)' : root?.type === 'painpoint' ? 'var(--am)' : root?.type === 'goal' ? 'var(--ac)' : 'var(--tx3)';
        const baseKey = 'project:' + rid;
        if (groupBy === 'projteam') {
          // Nested: project contains team subgroups
          const subGroups = teamGroupOf(projItems, baseKey + '/');
          result.push({ key: baseKey, label, color, items: projItems, subGroups, tag: root?.type });
        } else {
          result.push({ key: baseKey, label, color, items: projItems, tag: root?.type });
        }
      });
    }
    return result;
  }, [allItems, groupBy, teams, tree]);

  // Flatten groups + subGroups into row stream, respecting collapsed state at each level
  const rows = useMemo(() => {
    const out = [];
    groups.forEach(g => {
      out.push({ type: 'group', group: g, level: 0 });
      if (collapsed.has(g.key)) return;
      if (g.subGroups) {
        g.subGroups.forEach(sg => {
          out.push({ type: 'group', group: sg, level: 1 });
          if (collapsed.has(sg.key)) return;
          sg.items.forEach(s => out.push({ type: 'task', s, group: sg, level: 2 }));
        });
      } else {
        g.items.forEach(s => out.push({ type: 'task', s, group: g, level: 1 }));
      }
    });
    return out;
  }, [groups, collapsed]);

  const RH = 28, HH = 28;
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
  const gTC = t => t === NO_TEAM ? NO_TEAM_COLOR : (teams.find(x => x.id === t)?.color || '#3b82f6');

  // Day-accurate mount-point helpers for dependency lines. Source mounts at
  // the RIGHT edge of the bar (end of endD's day column); target mounts at
  // the LEFT edge (start of startD's day column). Falls back to week-aligned
  // positions when dates aren't available.
  function depX1(s) { return showDays && s.endD ? dateToX(s.endD) + WPX / 5 : (s.endWi + 1) * WPX; }
  function depX2(s) { return showDays && s.startD ? dateToX(s.startD) : s.startWi * WPX; }

  // CP dependency lines (only between visible scheduled items)
  const rowIdx = useMemo(() => { const m = {}; rows.forEach((r, i) => { if (r.type === 'task' && !r.s._unestimated) m[r.s.id] = i; }); return m; }, [rows]);
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);
  function resD(id) { return resolveToLeafIds(tree || [], id); }
  const cpLines = useMemo(() => {
    if (!cpSet?.size || !tree) return [];
    const lines = [];
    scheduled.forEach(s => {
      if (!cpSet.has(s.id)) return;
      const node = iMap[s.id]; if (!node) return;
      (node.deps || []).flatMap(resD).forEach(depId => {
        if (!cpSet.has(depId)) return;
        const dep = sMap[depId]; if (!dep) return;
        const srcRow = rowIdx[depId], tgtRow = rowIdx[s.id];
        if (srcRow == null || tgtRow == null) return;
        lines.push({ x1: depX1(dep), y1: srcRow * RH + RH / 2, x2: depX2(s), y2: tgtRow * RH + RH / 2 });
      });
    });
    return lines;
  }, [scheduled, cpSet, tree, rows]);

  // ALL dep lines (always rendered, faint by default; hovered ones highlight)
  const allDepLines = useMemo(() => {
    if (!tree) return [];
    const lines = [];
    scheduled.forEach(s => {
      const node = iMap[s.id]; if (!node) return;
      (node.deps || []).forEach(rawDep => {
        resD(rawDep).forEach(depId => {
          const dep = sMap[depId]; if (!dep) return;
          const srcRow = rowIdx[depId], tgtRow = rowIdx[s.id];
          if (srcRow == null || tgtRow == null) return;
          lines.push({
            key: `${depId}->${s.id}->${rawDep}`,
            x1: depX1(dep), y1: srcRow * RH + RH / 2,
            x2: depX2(s), y2: tgtRow * RH + RH / 2,
            removeFromId: s.id, removeDepId: rawDep,
            srcId: depId, tgtId: s.id,
            isCp: cpSet?.has(depId) && cpSet?.has(s.id),
          });
        });
      });
    });
    return lines;
  }, [scheduled, tree, rows, cpSet]);

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
        // Resolve to leaves but keep the original dep ID for removal targeting
        resD(rawDep).forEach(depId => {
          const dep = sMap[depId]; if (!dep) return;
          const srcRow = rowIdx[depId], tgtRow = rowIdx[hoverDepId];
          if (srcRow == null || tgtRow == null) return;
          rowIds.add(depId);
          lines.push({ x1: depX1(dep), y1: srcRow * RH + RH / 2, x2: depX2(target), y2: tgtRow * RH + RH / 2, kind: 'in', removeFromId: hoverDepId, removeDepId: rawDep });
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
        const srcRow = rowIdx[hoverDepId], tgtRow = rowIdx[s.id];
        if (srcRow == null || tgtRow == null) return;
        rowIds.add(s.id);
        lines.push({ x1: depX1(target), y1: srcRow * RH + RH / 2, x2: depX2(s), y2: tgtRow * RH + RH / 2, kind: 'out', removeFromId: s.id, removeDepId: rawDep });
      });
    });
    return { lines, rowIds };
  }, [hoverDepId, tree, scheduled, rows]);

  const toggleCollapse = key => setCollapsed(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // Search match set: case-insensitive substring across name and ID. Driven by App's
  // global `search` state via the prop, so the same query highlights matches across views.
  const searchMatches = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return null;
    return new Set(allItems.filter(s => (s.name || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).map(s => s.id));
  }, [search, allItems]);

  // On search change, scroll the body to the first matching task — vertically to its row
  // and horizontally so its bar is comfortably in view.
  useEffect(() => {
    if (!searchMatches?.size || !bR.current) return;
    // Defer one frame so rows have committed to the DOM before measuring/scrolling.
    const id = setTimeout(() => {
      const firstIdx = rows.findIndex(r => r.type === 'task' && searchMatches.has(r.s.id));
      if (firstIdx < 0 || !bR.current) return;
      const targetY = firstIdx * RH;
      const row = rows[firstIdx];
      const startWi = row.s?.startWi ?? 0;
      const targetX = Math.max(0, startWi * WPX - 80);
      bR.current.scrollTo({ top: Math.max(0, targetY - bR.current.clientHeight / 2 + RH), left: targetX, behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(id);
  }, [search]);

  // dragRef mirrors the latest drag state synchronously so onMU can read it
  // without waiting for React's batched state commit — same pattern as NetGraph's
  // zoomRef/panRef that fixed the stale-closure zoom-jump bug.
  const dragRef = useRef(null);
  const justDraggedRef = useRef(false);

  function onBMD(e, s) {
    e.stopPropagation();
    justDraggedRef.current = false;
    const d = { id: s.id, startWi: s.startWi, endWi: s.endWi, ox: e.clientX, oy: e.clientY, seq: s.seq, team: s.team, prio: s.prio, rowIdx: rowIdx[s.id], lastDy: 0, isReorder: false };
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
      const enterReorder = !d.isReorder && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx);
      if (d.isReorder || enterReorder) {
        d.isReorder = true; d.lastDy = dy;
        setDrag({ ...d }); // re-render for cursor + visual feedback
      } else {
        const stepPx = showDays ? WPX / 5 : WPX;
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
        const dir = d.lastDy > 0 ? 'later' : 'earlier';
        onReorderInQueue?.(d.id, dir, rowShift);
      } else if (dDelta !== 0) {
        const startMon = new Date(weeks[d.startWi].mon);
        const targetDate = showDays ? addWorkDays(startMon, dDelta) : addD(startMon, dDelta * 7);
        const planStartDate = weeks[0]?.mon;
        if (planStartDate && targetDate < planStartDate) {
          onExtendPlanStart?.(iso(targetDate));
        }
        onSeqUpdate(d.id, { pinnedStart: iso(targetDate) });
      }
      dragRef.current = null;
      setDrag(null); setDDelta(0);
    }
    if (linkDrag) setLinkDrag(null);
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
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>No items yet</div>
      <div style={{ fontSize: 12 }}>Add tasks to see the Gantt chart.</div>
    </div>
  </div>;

  const unestimatedCount = unscheduledLeaves.length;

  return <div className="gantt" onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={() => { if (drag || dragRef.current) { dragRef.current = null; setDrag(null); setDDelta(0); } }}>
    <div className="gantt-hdr">
      <div className="gh-fix" style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4, padding: '4px 10px' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 4 }}>Group</span>
          {[['project', 'Project'], ['projteam', 'Project › Team'], ['team', 'Team'], ['person', 'Person']].map(([k, l]) =>
            <button key={k} className={`btn btn-xs ${groupBy === k ? 'btn-pri' : 'btn-sec'}`} onClick={() => setGB(k)} style={{ padding: '2px 7px', fontSize: 10 }}>{l}</button>)}
        </div>
      </div>
      <div ref={hR} className="gh-scroll">
        <div style={{ display: 'flex', borderBottom: '1px solid var(--b)', height: HH / 2 }}>
          {months.map((m, i) => { const [y, mo] = m.ym.split('-'); const isYS = mo === '0';
            return <div key={i} style={{ width: WPX * m.count, flexShrink: 0, borderRight: '1px solid var(--b2)', padding: '2px 5px', fontSize: 11, color: isYS ? 'var(--ac)' : 'var(--tx2)', fontFamily: 'var(--mono)', fontWeight: isYS ? 600 : 500, overflow: 'hidden', background: isYS ? 'var(--bg3)' : '', display: 'flex', alignItems: 'center' }}>
              {isYS && `${y} `}{MDE[+mo]}
            </div>; })}
        </div>
        <div style={{ display: 'flex', height: HH / 2 }}>
          {weeks.map((w, i) => { const isYB = i > 0 && weeks[i - 1].mon.getFullYear() !== w.mon.getFullYear();
            const isNow = todayWi >= 0 && i === todayWi;
            return <div key={i} className={isNow ? 'gw-now' : w.hasH ? 'gw-hol' : isYB ? 'gw-yb' : ''} style={{ width: WPX, flexShrink: 0, borderRight: '1px solid var(--b)', borderLeft: isYB ? '2px solid var(--ac2)' : '', textAlign: 'center', fontSize: 10, color: isNow ? 'var(--gr)' : w.hasH ? 'var(--re)' : 'var(--tx3)', fontFamily: 'var(--mono)', fontWeight: isNow ? 700 : 400 }}>
              {w.kw}
            </div>; })}
        </div>
        {/* Day-level header row, only when zoomed in enough that day numbers fit. */}
        {showDays && <div style={{ display: 'flex', height: 14, borderTop: '1px solid var(--b2)' }}>
          {weeks.map((w, i) => <div key={i} style={{ width: WPX, flexShrink: 0, display: 'flex' }}>
            {[0, 1, 2, 3, 4].map(d => {
              const date = addD(w.mon, d);
              const isToday = date.toDateString() === now.toDateString();
              return <div key={d} style={{ flex: 1, fontSize: 8, textAlign: 'center', color: isToday ? 'var(--gr)' : 'var(--tx3)', fontWeight: isToday ? 700 : 400, fontFamily: 'var(--mono)', borderRight: d < 4 ? '1px solid var(--b2)' : 'none', lineHeight: '14px' }}>{date.getDate()}</div>;
            })}
          </div>)}
        </div>}
      </div>
    </div>
    <div className="gantt-body">
      <div ref={lR} className="gantt-left" style={{ overflowY: 'hidden' }} onScroll={syncL} onWheel={onLWheel}>
        {rows.map((row) => {
          if (row.type === 'group') {
            const g = row.group;
            const isCol = collapsed.has(g.key);
            const isSub = row.level === 1;
            return <div key={g.key} className="gteam" style={{ color: g.color, borderLeft: `${isSub ? 2 : 3}px solid ${g.color}`, background: isSub ? 'var(--bg3)' : 'var(--bg2)', paddingLeft: isSub ? 18 : 6, height: RH, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: isSub ? 11 : 13, fontWeight: isSub ? 500 : 600, textTransform: isSub ? 'none' : 'uppercase', letterSpacing: isSub ? 0 : '.06em' }}
              onClick={() => toggleCollapse(g.key)}>
              <span style={{ fontSize: 9, color: 'var(--tx3)', width: 12, textAlign: 'center' }}>{isCol ? '▶' : '▼'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
              <span style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 400, marginRight: 6, fontFamily: 'var(--mono)' }}>{g.items.length}</span>
            </div>;
          }
          const s = row.s; const tc = gTC(s.team); const isCp = cpSet?.has(s.id);
          const dim = cpOnly && !isCp;
          const indent = row.level === 2 ? 12 : 0;
          const isHovDep = hoverDepId && hoverLines.rowIds.has(s.id) && s.id !== hoverDepId;
          const isHov = hoverDepId === s.id;
          const isMatchL = searchMatches?.has(s.id);
          const searchDimmedL = searchMatches && searchMatches.size > 0 && !isMatchL;
          return <div key={s.id} className={`grow-l${isCp ? ' cp-row' : ''}`} style={{ height: RH, cursor: 'pointer', opacity: dim ? .25 : searchDimmedL ? .35 : (s._unestimated ? .55 : 1), paddingLeft: 10 + indent, background: isHov ? 'rgba(127,127,127,.10)' : isHovDep ? 'rgba(127,127,127,.05)' : '' }}
            onClick={() => onBarClick(s)}
            onMouseEnter={() => setHoverDepId(s.id)}
            onMouseLeave={() => setHoverDepId(null)}>
            <span className="tid" style={{ flexShrink: 0 }}>{s.id}</span>
            {s._unestimated
              ? <span className="badge bw" style={{ fontSize: 9 }}>no estimate</span>
              : <span style={{ background: 'var(--bg4)', color: 'var(--tx2)', fontSize: 10, padding: '1px 5px', borderRadius: 3, flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{s.person}</span>}
            <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          </div>;
        })}
      </div>
      <div ref={bR} style={{ flex: 1, overflow: 'auto' }} onScroll={syncS}>
        <div style={{ width: tw, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: tw, height: rows.length * RH, pointerEvents: 'none', zIndex: 0 }}>
            {/* Week columns. When the day grid is visible we don't tint the whole week red —
                individual holiday days get tinted below instead. */}
            {weeks.map((w, i) => <div key={i} style={{ position: 'absolute', left: i * WPX, top: 0, width: WPX, height: '100%', borderRight: '1px solid var(--b)', background: !showDays && w.hasH ? 'rgba(244,63,94,.10)' : '' }} />)}
            {/* Day-level overlays: faint vertical separator lines + per-day holiday tint. */}
            {showDays && weeks.map((w, i) => {
              const dayPx = WPX / 5;
              const wdsByTime = new Set(w.wds.map(d => d.getTime()));
              return [0, 1, 2, 3, 4].map(d => {
                const date = addD(w.mon, d);
                // A weekday in plan range that's NOT in wds is a holiday.
                const isHoliday = !wdsByTime.has(date.getTime());
                return <React.Fragment key={`d-${i}-${d}`}>
                  {isHoliday && <div style={{ position: 'absolute', left: i * WPX + d * dayPx, top: 0, width: dayPx, height: '100%', background: 'rgba(244,63,94,.14)' }} />}
                  {d > 0 && <div style={{ position: 'absolute', left: i * WPX + d * dayPx, top: 0, width: 1, height: '100%', background: 'var(--b2)', opacity: .35 }} />}
                </React.Fragment>;
              });
            })}
            {/* Past zone: subtle dim overlay for everything before today */}
            {todayX > 0 && <div style={{ position: 'absolute', left: 0, top: 0, width: todayX, height: '100%', background: 'rgba(0,0,0,.08)', pointerEvents: 'none', zIndex: 1 }} />}
            {/* Today marker — always day-accurate */}
            {todayX >= 0 && <div style={{ position: 'absolute', left: todayX, top: 0, width: 2, height: '100%', background: 'var(--gr)', opacity: .7, zIndex: 5 }} />}
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
                  pointerEvents: 'none', zIndex: 3 }} title={titleStr} />}
                {/* Mast: vertical line at the deadline week */}
                <div style={{ position: 'absolute', left: x, top: 0, width: 2, height: '100%', background: col, opacity: .7, zIndex: 4 }} title={titleStr} />
                {/* Flag: triangle notch on the left (pointing back toward the backfill), label body to the right of the mast */}
                <div style={{ position: 'absolute', left: x, top: 1, zIndex: 6, pointerEvents: 'none', display: 'flex', alignItems: 'center', maxWidth: 120 }} title={titleStr}>
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
          {rows.map((row) => {
            if (row.type === 'group') { const isSub = row.level === 1; return <div key={row.group.key} style={{ height: RH, background: isSub ? 'var(--bg3)' : 'var(--bg2)', borderBottom: '1px solid var(--b2)' }} />; }
            const s = row.s; const tc = gTC(s.team); const isCp = cpSet?.has(s.id);
            if (s._unestimated) return <div key={s.id} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
            const isDrag = drag?.id === s.id;
            // Bar geometry — day-accurate in day-mode (using scheduler's per-day startD/endD),
            // week-aligned otherwise.
            let baseLeft, baseWidth;
            if (showDays && s.startD && s.endD) {
              baseLeft = dateToX(s.startD) + 2;
              baseWidth = dateToX(s.endD) + (WPX / 5) - dateToX(s.startD) - 4;
            } else {
              baseLeft = s.startWi * WPX + 2;
              baseWidth = (s.endWi - s.startWi + 1) * WPX - 4;
            }
            // Drag offset: dDelta is in days when showDays, weeks otherwise.
            const dragPxOffset = isDrag ? dDelta * (showDays ? WPX / 5 : WPX) : 0;
            const barLeft = Math.max(0, baseLeft + dragPxOffset);
            const bW = baseWidth;
            const dim = cpOnly && !isCp;
            const isHovDep = hoverDepId && hoverLines.rowIds.has(s.id) && s.id !== hoverDepId;
            const isHov = hoverDepId === s.id;
            const isMatch = searchMatches?.has(s.id);
            const searchDimmed = searchMatches && searchMatches.size > 0 && !isMatch;
            const node = iMap[s.id];
            const decideBy = node?.decideBy;
            const decideWi = decideBy ? weeks.findIndex(w => { const next = weeks[weeks.indexOf(w) + 1]; const d = new Date(decideBy); return w.mon <= d && (!next || next.mon > d); }) : -1;
            const isDecideOverdue = decideBy && new Date(decideBy) < now;
            return <div key={s.id} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)', opacity: dim ? .2 : searchDimmed ? .25 : 1, background: isHov ? 'rgba(127,127,127,.10)' : isHovDep ? 'rgba(127,127,127,.05)' : '' }}
              onMouseEnter={() => setHoverDepId(s.id)}
              onMouseLeave={() => setHoverDepId(null)}>
              {s.status !== 'done' && bW > 0 && <div className={`gbar${isDrag ? ' dragging' : ''}${isCp ? ' cp-bar' : ''}`} data-link-from={s.id}
                style={{
                  left: barLeft, width: Math.max(bW, 6),
                  // Vertical reorder feedback: bar visually follows the mouse vertically,
                  // with a strong glow so the user sees they're in reorder mode.
                  transform: (isDrag && drag?.isReorder) ? `translateY(${Math.round(drag.lastDy / RH) * RH}px)` : undefined,
                  zIndex: (isDrag && drag?.isReorder) ? 20 : undefined,
                  boxShadow: (isDrag && drag?.isReorder)
                    ? '0 4px 20px rgba(0,0,0,.5), 0 0 0 2px var(--ac)'
                    : isMatch ? '0 0 0 2.5px var(--am)'
                    : linkMode?.fromId === s.id || linkDrag?.fromId === s.id ? '0 0 0 2px var(--ac)' : undefined,
                  background: tc, color: '#fff',
                  textShadow: '0 1px 1.5px rgba(0,0,0,.3)',
                  cursor: linkMode || linkDrag ? 'crosshair'
                    : (drag?.id === s.id && drag?.isReorder) ? 'ns-resize'
                    : drag ? 'grabbing' : 'grab',
                }}
                onMouseDown={e => { if (linkMode || linkDrag) return; onBMD(e, s); }}
                onMouseUp={() => { if (linkDrag) onLinkDrop(s.id); }}
                onClick={() => {
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
                  onBarClick(s);
                }}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, taskId: s.id }); }}>
                {/* Progress overlay: lighter strip on the left proportional to progress % */}
                {(() => { const prog = node?.progress ?? (node?.status === 'done' ? 100 : node?.status === 'wip' ? 50 : 0);
                  return prog > 0 && prog < 100 ? <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog}%`, background: 'rgba(255,255,255,.18)', borderRadius: '4px 0 0 4px', pointerEvents: 'none' }} title={`${prog}% done`} /> : null; })()}
                {node?.parallel && <span style={{ marginRight: 4, fontSize: 10 }} title="Parallel — runs alongside other work (capacity bypass)">≡</span>}
                {node?.pinnedStart && <span style={{ marginRight: 4, fontSize: 10, cursor: 'pointer' }}
                  title={`${s.pinOverridden ? `Pin to ${node.pinnedStart} overridden by capacity. ` : `Pinned to ${node.pinnedStart}. `}Click to unpin.`}
                  onClick={e => { e.stopPropagation(); onTaskUpdate?.({ ...node, pinnedStart: '' }); }}>{s.pinOverridden ? '⚠📌' : '📌'}</span>}
                {bW > 35 && s.name}
                {/* Right-edge link handle: drag from here to another bar to add a dependency */}
                <div title="Drag to another bar to add a dependency" onMouseDown={e => onLinkStart(e, s.id)}
                  style={{ position: 'absolute', right: -4, top: 0, bottom: 0, width: 10, cursor: 'crosshair', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 1 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bg)', border: `1.5px solid ${tc}`, opacity: linkDrag ? 1 : 0.7 }} />
                </div>
              </div>}
              {/* Decision-by marker: diamond on the row at the decideBy week */}
              {decideWi >= 0 && s.status !== 'done' && <div title={`Decide by ${decideBy}${isDecideOverdue ? ' — OVERDUE' : ''}`}
                style={{ position: 'absolute', left: decideWi * WPX + WPX / 2 - 6, top: RH / 2 - 6, width: 12, height: 12, background: isDecideOverdue ? 'var(--re)' : 'var(--am)', transform: 'rotate(45deg)', border: '1px solid #000', zIndex: 4, pointerEvents: 'auto' }} />}
            </div>;
          })}
          {allDepLines.length > 0 && <svg style={{ position: 'absolute', top: 0, left: 0, width: tw, height: rows.length * RH, zIndex: 3, pointerEvents: 'none' }}>
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
                // Longer stubs give the line a "runway" of straight pixels before bending into
                // the bezier and after exiting it. Important when source and target sit on very
                // different rows: a too-short stub makes the curve look like it abruptly hooks
                // into the arrowhead. 10 px reads cleanly without dominating dense layouts.
                const stub = 10;
                const sx = l.x1 + stub;
                const tx = l.x2 - stub;
                // Control-point horizontal offset: at least 30px so backward links get a visible loop
                const dx = Math.max(Math.abs(tx - sx) * 0.5, 30);
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
                // × badge sits right at the start of the curve — close enough to the hover
                // path that the pointer never leaves the hover target on the way to the badge.
                const mx = l.x1 + 12;
                const my = l.y1;
                const removeDep = () => {
                  // Clear hover state BEFORE confirm so React commits the hover-cleared render
                  // before the dep mutation lands (avoids render thrash on the vanishing line).
                  setHoverLineKey(null);
                  setHoverDepId(null);
                  setTimeout(() => {
                    if (confirm(`Remove dependency: ${l.removeFromId} no longer depends on ${l.removeDepId}?`)) {
                      // Targeted removal — reads latest tree state in App, touches only deps field.
                      onRemoveDep?.(l.removeFromId, l.removeDepId);
                    }
                  }, 0);
                };
                return <g key={l.key}>
                  <path d={path} fill="none" stroke={col} strokeWidth={strokeWidth} opacity={opacity} strokeLinejoin="round" strokeLinecap="round" markerEnd={marker} style={{ pointerEvents: 'none' }} />
                  {/* Wide invisible hover/click target */}
                  <path d={path} fill="none" stroke="transparent" strokeWidth={14}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onMouseEnter={() => setHoverLineKey(l.key)}
                    onMouseLeave={() => setHoverLineKey(k => k === l.key ? null : k)}
                    onClick={removeDep}>
                    <title>Click to remove this dependency</title>
                  </path>
                  {isHovered && <>
                    <circle cx={mx} cy={my} r={7} fill="var(--bg2)" stroke="var(--re)" strokeWidth={1.5}
                      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                      onMouseEnter={() => setHoverLineKey(l.key)}
                      onClick={removeDep}>
                      <title>Remove dependency</title>
                    </circle>
                    <text x={mx} y={my + 3.5} fontSize="11" textAnchor="middle" fill="var(--re)" fontWeight="700" style={{ pointerEvents: 'none', userSelect: 'none' }}>×</text>
                  </>}
                </g>;
              });
            })()}
          </svg>}
        </div>
      </div>
    </div>
    <div className="gantt-footer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={`Zoom: ${Math.round(WPX)} px / week. Day-level grid appears at ≥ 70 px/wk.`}>
        <span style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 2 }}>Zoom</span>
        <button className={`btn btn-xs ${!showDays ? 'btn-pri' : 'btn-sec'}`} onClick={() => setZ(DEFAULT_WPX)} title="Week view (compact)" style={{ padding: '2px 7px', fontSize: 10 }}>Week</button>
        <button className={`btn btn-xs ${showDays ? 'btn-pri' : 'btn-sec'}`} onClick={() => setZ(80)} title="Day view (day grid + day numbers)" style={{ padding: '2px 7px', fontSize: 10 }}>Day</button>
        <button className="btn btn-sec btn-xs" onClick={() => setZ(WPX * 0.8)} title="Zoom out" style={{ padding: '2px 7px', fontSize: 10 }}>−</button>
        <button className="btn btn-sec btn-xs" onClick={() => setZ(WPX * 1.25)} title="Zoom in" style={{ padding: '2px 7px', fontSize: 10 }}>+</button>
      </div>
      {searchMatches && <span style={{ fontSize: 10, color: searchMatches.size ? 'var(--am)' : 'var(--re)', fontFamily: 'var(--mono)' }}>
        🔍 {searchMatches.size} match{searchMatches.size === 1 ? '' : 'es'}
      </span>}
      <span style={{ width: 1, height: 14, background: 'var(--b2)' }} />
      {dlL.map(dl => <span key={dl.id} className={`badge ${dl.isLate ? 'bc' : dl.maxEnd ? 'bd' : dl.severity === 'critical' ? 'bc' : 'bh'}`}>
        {dl.isLate ? '! ' : dl.maxEnd ? '' : ''}{dl.name} {dl.date}{dl.isLate ? ' AT RISK' : dl.maxEnd ? ' on track' : ''}
      </span>)}
      {cpSet?.size > 0 && <button className={`badge b-cp${cpOnly ? '' : ''}`} style={{ cursor: 'pointer', border: cpOnly ? '1px solid var(--re)' : '', background: cpOnly ? 'var(--re)' : '', color: cpOnly ? '#000' : '' }} title={cpOnly ? 'Click to show all items' : 'Click to highlight only critical path. Critical path = chain of tasks that determines the earliest possible end date — any delay here delays the whole project.'} onClick={() => setCpOnly(v => !v)}>{cpOnly ? '◉ ' : '○ '}Critical path: {cpSet.size}</button>}
      {unestimatedCount > 0 && <span className="badge bw" title="Items without estimates aren't scheduled but are listed for visibility">{unestimatedCount} no estimate</span>}
      {linkMode && <span style={{ fontSize: 11, color: 'var(--ac)', marginLeft: 'auto' }}>
        🔗 Click another bar to {linkMode.mode === 'pred' ? 'make it depend on' : 'add it as predecessor of'} <b>{linkMode.fromId}</b>
        <button className="btn btn-ghost btn-xs" style={{ marginLeft: 6 }} onClick={() => setLinkMode(null)}>Cancel</button>
      </span>}
      {linkDrag && <span style={{ fontSize: 11, color: 'var(--ac)', marginLeft: 'auto' }}>🔗 Drop on a bar to link as dependency</span>}
      {!linkMode && !linkDrag && <span style={{ fontSize: 11, color: 'var(--tx3)', marginLeft: 'auto' }}>Bar drag ← → = pin · ↑ ↓ = reorder queue · edge handle = link · Right-click = more</span>}
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
    {/* Hover tooltip removed — too intrusive. The QuickEdit sidebar shows full task details. */}
    {ctxMenu && (() => {
      const node = iMap[ctxMenu.taskId]; if (!node) return null;
      const close = () => setCtxMenu(null);
      return <>
        <div onClick={close} onContextMenu={e => { e.preventDefault(); close(); }} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
        <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 4, zIndex: 999, boxShadow: 'var(--sh)', minWidth: 200 }}>
          <div style={{ padding: '5px 10px', fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--b)', marginBottom: 4 }}>{ctxMenu.taskId} — {node.name?.slice(0, 30)}</div>
          <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onBarClick(scheduled.find(s => s.id === ctxMenu.taskId) || node); close(); }}>📝 Open / edit…</div>
          <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { setLinkMode({ fromId: ctxMenu.taskId, mode: 'succ' }); close(); }} title="This task must finish before the next clicked task starts">⬇ Add a successor… (this → other)</div>
          <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { setLinkMode({ fromId: ctxMenu.taskId, mode: 'pred' }); close(); }} title="The next clicked task must finish before this one starts">⬆ Add a predecessor… (other → this)</div>
          <div style={{ borderTop: '1px solid var(--b)', margin: '4px 0' }} />
          <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }}
            onClick={() => { onTaskUpdate?.({ ...node, parallel: !node.parallel }); close(); }}>
            {node.parallel ? '≡ Sequential (disable parallel)' : '≡ Run in parallel'}
          </div>
          {onReorderInQueue && !node.parallel && <>
            <div style={{ borderTop: '1px solid var(--b)', margin: '4px 0' }} />
            <div style={{ padding: '4px 10px', fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Queue order</div>
            <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderInQueue(ctxMenu.taskId, 'first'); close(); }}>⤒ Run first</div>
            <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderInQueue(ctxMenu.taskId, 'earlier'); close(); }}>▲ Run earlier</div>
            <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderInQueue(ctxMenu.taskId, 'later'); close(); }}>▼ Run later</div>
            <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onReorderInQueue(ctxMenu.taskId, 'last'); close(); }}>⤓ Run last</div>
          </>}
          <div style={{ borderTop: '1px solid var(--b)', margin: '4px 0' }} />
          {node.pinnedStart
            ? <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { onTaskUpdate?.({ ...node, pinnedStart: '' }); close(); }}>📌 Unpin (currently {node.pinnedStart})</div>
            : <div className="tr" style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} onClick={() => { const sched = scheduled.find(s => s.id === ctxMenu.taskId); if (sched && sched.startD) { onTaskUpdate?.({ ...node, pinnedStart: iso(sched.startD) }); } close(); }}>📌 Pin to current start</div>}
          {node.deps?.length > 0 && <>
            <div style={{ borderTop: '1px solid var(--b)', margin: '4px 0' }} />
            <div style={{ padding: '4px 10px', fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Remove dependency</div>
            {node.deps.map(d => <div key={d} className="tr" style={{ padding: '4px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 4, color: 'var(--re)', fontFamily: 'var(--mono)' }} onClick={() => { onRemoveDep?.(ctxMenu.taskId, d); close(); }}>× {d}</div>)}
          </>}
        </div>
      </>;
    })()}
  </div>;
}
