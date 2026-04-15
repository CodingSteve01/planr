import React, { useState, useRef, useMemo } from 'react';
import { Tip } from '../shared/Tooltip.jsx';
import { WPX, MDE, GT } from '../../constants.js';
import { iso } from '../../utils/date.js';
import { resolveToLeafIds, isLeafNode } from '../../utils/scheduler.js';

const NO_TEAM = '__no_team__';
const NO_TEAM_COLOR = '#64748b';
const NO_PERSON = '(unassigned)';
const NO_PROJECT = '__none__';

export function GanttView({ scheduled, weeks, goals, teams, cpSet, tree, onBarClick, onSeqUpdate }) {
  const [tip, setTip] = useState(null);
  const [drag, setDrag] = useState(null);
  const [dDelta, setDDelta] = useState(0);
  const [groupBy, setGroupBy] = useState(() => { try { return localStorage.getItem('planr_gantt_group') || 'project'; } catch { return 'project'; } });
  const [collapsed, setCollapsed] = useState(new Set());
  const [cpOnly, setCpOnly] = useState(false); // dim non-critical items
  const setGB = v => { setGroupBy(v); try { localStorage.setItem('planr_gantt_group', v); } catch {} };
  const hR = useRef(null), bR = useRef(null), lR = useRef(null);

  function syncS(e) { if (hR.current) hR.current.scrollLeft = e.target.scrollLeft; if (lR.current) lR.current.scrollTop = e.target.scrollTop; }
  function syncL(e) { if (bR.current) bR.current.scrollTop = e.target.scrollTop; }
  function onLWheel(e) { if (bR.current) { bR.current.scrollTop += e.deltaY; bR.current.scrollLeft += e.deltaX; } }

  const tw = weeks.length * WPX;
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
  const iMap = Object.fromEntries((tree || []).map(r => [r.id, r]));

  // Build groups based on groupBy
  const groups = useMemo(() => {
    const result = []; // [{ key, label, color, items, tag? }]
    if (groupBy === 'team') {
      const usedT = [...new Set(allItems.map(s => s.team || NO_TEAM))];
      const tOrd = [...new Set([...teams.map(t => t.id), ...usedT])].filter(t => usedT.includes(t));
      tOrd.forEach(tid => {
        const items = allItems.filter(s => (s.team || NO_TEAM) === tid).sort((a, b) => (a.prio || 4) - (b.prio || 4) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id));
        if (!items.length) return;
        const t = teams.find(x => x.id === tid);
        result.push({ key: 'team:' + tid, label: tid === NO_TEAM ? 'No team' : (t?.name || tid), color: tid === NO_TEAM ? NO_TEAM_COLOR : (t?.color || '#3b82f6'), items });
      });
    } else if (groupBy === 'person') {
      const personKey = s => s.personId || s.person || NO_PERSON;
      const personLabel = s => s.person || NO_PERSON;
      const used = [...new Set(allItems.map(personKey))];
      used.sort((a, b) => a === NO_PERSON ? 1 : b === NO_PERSON ? -1 : a.localeCompare(b));
      used.forEach(pk => {
        const items = allItems.filter(s => personKey(s) === pk).sort((a, b) => (a.prio || 4) - (b.prio || 4) || (a.startWi || 0) - (b.startWi || 0) || a.id.localeCompare(b.id));
        if (!items.length) return;
        const lbl = personLabel(items[0]);
        result.push({ key: 'person:' + pk, label: lbl, color: pk === NO_PERSON ? NO_TEAM_COLOR : 'var(--ac)', items });
      });
    } else { // project
      // Group by root id (P1, D1, ...)
      const used = [...new Set(allItems.map(s => rootOf(s.id)))];
      // Order roots by their tree position
      const treeRootOrder = (tree || []).filter(r => !r.id.includes('.')).map(r => r.id);
      used.sort((a, b) => { const ai = treeRootOrder.indexOf(a), bi = treeRootOrder.indexOf(b); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
      used.forEach(rid => {
        const items = allItems.filter(s => rootOf(s.id) === rid).sort((a, b) => (a.prio || 4) - (b.prio || 4) || (a.startWi || 0) - (b.startWi || 0) || a.id.localeCompare(b.id));
        if (!items.length) return;
        const root = iMap[rid];
        const label = root ? `${root.type ? GT[root.type] + ' ' : ''}${rid} — ${root.name}` : rid;
        const color = root?.type === 'deadline' ? 'var(--re)' : root?.type === 'painpoint' ? 'var(--am)' : root?.type === 'goal' ? 'var(--ac)' : 'var(--tx3)';
        result.push({ key: 'project:' + rid, label, color, items, tag: root?.type });
      });
    }
    return result;
  }, [allItems, groupBy, teams, tree]);

  // Build flat rows: group header + items (skipping items in collapsed groups)
  const rows = [];
  groups.forEach(g => {
    rows.push({ type: 'group', group: g });
    if (!collapsed.has(g.key)) {
      g.items.forEach(s => rows.push({ type: 'task', s, group: g }));
    }
  });

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
  const todayX = todayWi >= 0 ? todayWi * WPX : -1;
  const gTC = t => t === NO_TEAM ? NO_TEAM_COLOR : (teams.find(x => x.id === t)?.color || '#3b82f6');

  // CP dependency lines (only between visible scheduled items)
  const rowIdx = {}; rows.forEach((r, i) => { if (r.type === 'task' && !r.s._unestimated) rowIdx[r.s.id] = i; });
  const sMap = Object.fromEntries(scheduled.map(s => [s.id, s]));
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
        lines.push({ x1: (dep.endWi + 1) * WPX, y1: srcRow * RH + RH / 2, x2: s.startWi * WPX, y2: tgtRow * RH + RH / 2 });
      });
    });
    return lines;
  }, [scheduled, cpSet, tree, rows]);

  const toggleCollapse = key => setCollapsed(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const collapseAll = () => setCollapsed(new Set(groups.map(g => g.key)));
  const expandAll = () => setCollapsed(new Set());

  function onBMD(e, s) { e.stopPropagation(); setDrag({ id: s.id, startWi: s.startWi, endWi: s.endWi, ox: e.clientX, seq: s.seq, team: s.team, prio: s.prio }); setDDelta(0); }
  function onMM(e) { if (!drag) return; const dx = e.clientX - drag.ox; setDDelta(Math.round(dx / WPX)); }
  function onMU() { if (!drag) return; if (dDelta !== 0) { const ns = Math.max(0, (drag.startWi + dDelta) * 2); onSeqUpdate(drag.id, ns); } setDrag(null); setDDelta(0); }

  if (!allItems.length) return <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ textAlign: 'center', color: 'var(--tx3)' }}><div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>No items yet</div>
      <div style={{ fontSize: 12 }}>Add tasks to see the Gantt chart.</div>
    </div>
  </div>;

  const unestimatedCount = unscheduledLeaves.length;

  return <div className="gantt" onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={() => { if (drag) { setDrag(null); setDDelta(0); } }}>
    <div className="gantt-hdr">
      <div className="gh-fix" style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4, padding: '4px 10px' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 4 }}>Group</span>
          {[['project', 'Project'], ['team', 'Team'], ['person', 'Person']].map(([k, l]) =>
            <button key={k} className={`btn btn-xs ${groupBy === k ? 'btn-pri' : 'btn-sec'}`} onClick={() => setGB(k)} style={{ padding: '2px 7px', fontSize: 10 }}>{l}</button>)}
          <button className="btn btn-ghost btn-xs" onClick={collapseAll} title="Collapse all" style={{ padding: '2px 5px', fontSize: 10, marginLeft: 6 }}>▶</button>
          <button className="btn btn-ghost btn-xs" onClick={expandAll} title="Expand all" style={{ padding: '2px 5px', fontSize: 10 }}>▼</button>
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
            return <div key={i} style={{ width: WPX, flexShrink: 0, borderRight: '1px solid var(--b)', borderLeft: isYB ? '2px solid var(--ac2)' : '', textAlign: 'center', fontSize: 10, color: isNow ? 'var(--gr)' : w.hasH ? 'var(--re)' : 'var(--tx3)', fontFamily: 'var(--mono)', fontWeight: isNow ? 700 : 400, background: isNow ? '#1a3020' : w.hasH ? '#301e22' : isYB ? '#1e2448' : '' }}>
              {w.kw}
            </div>; })}
        </div>
      </div>
    </div>
    <div className="gantt-body">
      <div ref={lR} className="gantt-left" style={{ overflowY: 'hidden' }} onScroll={syncL} onWheel={onLWheel}>
        {rows.map((row) => {
          if (row.type === 'group') {
            const g = row.group;
            const isCol = collapsed.has(g.key);
            return <div key={g.key} className="gteam" style={{ color: g.color, borderLeft: `3px solid ${g.color}`, background: 'var(--bg2)', paddingLeft: 6, height: RH, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => toggleCollapse(g.key)}>
              <span style={{ fontSize: 9, color: 'var(--tx3)', width: 12, textAlign: 'center' }}>{isCol ? '▶' : '▼'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
              <span style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 400, marginRight: 6, fontFamily: 'var(--mono)' }}>{g.items.length}</span>
            </div>;
          }
          const s = row.s; const tc = gTC(s.team); const isCp = cpSet?.has(s.id);
          const dim = cpOnly && !isCp;
          return <div key={s.id} className={`grow-l${isCp ? ' cp-row' : ''}`} style={{ height: RH, cursor: 'pointer', opacity: dim ? .25 : (s._unestimated ? .55 : 1) }}
            onClick={() => onBarClick(s)}
            onMouseMove={e => setTip({ item: { ...s, isCp }, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTip(null)}>
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
            {weeks.map((w, i) => <div key={i} style={{ position: 'absolute', left: i * WPX, top: 0, width: WPX, height: '100%', borderRight: '1px solid var(--b)', background: w.hasH ? 'rgba(244,63,94,.10)' : '' }} />)}
            {todayX >= 0 && <div style={{ position: 'absolute', left: todayX, top: 0, width: 2, height: '100%', background: 'var(--gr)', opacity: .7, zIndex: 5 }} />}
            {todayX >= 0 && <div style={{ position: 'absolute', left: todayX - 14, top: 0, background: 'var(--gr)', color: '#000', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: '0 0 3px 3px', zIndex: 6 }}>Today</div>}
            {dlL.map(dl => <React.Fragment key={dl.id}>
              <div style={{ position: 'absolute', left: dl.wi * WPX, top: 0, width: 2, height: '100%', background: dl.severity === 'critical' ? 'var(--re)' : 'var(--am)', opacity: .6, zIndex: 4 }} />
              <div style={{ position: 'absolute', left: dl.wi * WPX - 2, top: 0, background: dl.severity === 'critical' ? 'var(--re)' : 'var(--am)', color: '#000', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: '0 0 3px 3px', zIndex: 6, whiteSpace: 'nowrap' }}>{dl.name}</div>
            </React.Fragment>)}
          </div>
          {rows.map((row) => {
            if (row.type === 'group') { return <div key={row.group.key} style={{ height: RH, background: 'var(--bg2)', borderBottom: '1px solid var(--b2)', position: 'sticky', top: 0, zIndex: 2 }} />; }
            const s = row.s; const tc = gTC(s.team); const isCp = cpSet?.has(s.id);
            if (s._unestimated) return <div key={s.id} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
            const isDrag = drag?.id === s.id;
            const wiS = isDrag ? Math.max(0, s.startWi + dDelta) : s.startWi;
            const wiE = isDrag ? Math.max(wiS, s.endWi + dDelta) : s.endWi;
            const bW = (wiE - wiS + 1) * WPX - 4;
            const dim = cpOnly && !isCp;
            return <div key={s.id} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)', opacity: dim ? .2 : 1 }}
              onMouseMove={e => !drag && setTip({ item: { ...s, isCp }, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTip(null)}>
              {s.status !== 'done' && bW > 0 && <div className={`gbar${isDrag ? ' dragging' : ''}${isCp ? ' cp-bar' : ''}`}
                style={{ left: wiS * WPX + 2, width: Math.max(bW, 6), background: tc + (isCp ? '60' : '40'), color: '#fff', borderLeft: `2px solid ${tc}`, cursor: drag ? 'grabbing' : 'grab' }}
                onMouseDown={e => onBMD(e, s)}
                onClick={() => { if (Math.abs(dDelta) === 0) onBarClick(s); }}>
                {bW > 35 && s.name}
              </div>}
            </div>;
          })}
          {cpLines.length > 0 && <svg style={{ position: 'absolute', top: 0, left: 0, width: tw, height: rows.length * RH, pointerEvents: 'none', zIndex: 3 }}>
            <defs><marker id="gar" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="6" markerHeight="5" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--re)" /></marker></defs>
            {cpLines.map((l, i) => {
              const mx = (l.x1 + l.x2) / 2;
              return <path key={i} d={`M${l.x1},${l.y1} C${mx},${l.y1} ${mx},${l.y2} ${l.x2},${l.y2}`}
                fill="none" stroke="var(--re)" strokeWidth={1.5} opacity={.6} markerEnd="url(#gar)" />;
            })}
          </svg>}
        </div>
      </div>
    </div>
    <div className="gantt-footer">
      {dlL.map(dl => <span key={dl.id} className={`badge ${dl.isLate ? 'bc' : dl.maxEnd ? 'bd' : dl.severity === 'critical' ? 'bc' : 'bh'}`}>
        {dl.isLate ? '! ' : dl.maxEnd ? '' : ''}{dl.name} {dl.date}{dl.isLate ? ' AT RISK' : dl.maxEnd ? ' on track' : ''}
      </span>)}
      {cpSet?.size > 0 && <button className={`badge b-cp${cpOnly ? '' : ''}`} style={{ cursor: 'pointer', border: cpOnly ? '1px solid var(--re)' : '', background: cpOnly ? 'var(--re)' : '', color: cpOnly ? '#000' : '' }} title={cpOnly ? 'Click to show all items' : 'Click to highlight only critical path. Critical path = chain of tasks that determines the earliest possible end date — any delay here delays the whole project.'} onClick={() => setCpOnly(v => !v)}>{cpOnly ? '◉ ' : '○ '}Critical path: {cpSet.size}</button>}
      {unestimatedCount > 0 && <span className="badge bw" title="Items without estimates aren't scheduled but are listed for visibility">{unestimatedCount} no estimate</span>}
      <span style={{ fontSize: 11, color: 'var(--tx3)', marginLeft: 'auto' }}>Drag bars to reorder</span>
    </div>
    {tip && !drag && <Tip item={tip.item} x={tip.x} y={tip.y} teams={teams} tree={tree} />}
  </div>;
}
