import React, { useState, useRef, useMemo } from 'react';
import { Tip } from '../shared/Tooltip.jsx';
import { WPX, MDE } from '../../constants.js';
import { iso } from '../../utils/date.js';
import { resolveToLeafIds } from '../../utils/scheduler.js';

const NO_TEAM = '__no_team__';
const NO_TEAM_COLOR = '#64748b';

export function GanttView({ scheduled, weeks, deadlines, teams, cpSet, tree, onBarClick, onSeqUpdate }) {
  const [tip, setTip] = useState(null);
  const [drag, setDrag] = useState(null);
  const [dDelta, setDDelta] = useState(0);
  const hR = useRef(null), bR = useRef(null), lR = useRef(null);

  function syncS(e) { if (hR.current) hR.current.scrollLeft = e.target.scrollLeft; if (lR.current) lR.current.scrollTop = e.target.scrollTop; }
  function syncL(e) { if (bR.current) bR.current.scrollTop = e.target.scrollTop; }
  function onLWheel(e) { if (bR.current) { bR.current.scrollTop += e.deltaY; bR.current.scrollLeft += e.deltaX; } }

  const tw = weeks.length * WPX;
  const months = []; let cm = null, cc = 0, cs = 0;
  weeks.forEach((w, i) => { const ym = `${w.mon.getFullYear()}-${w.mon.getMonth()}`; if (ym !== cm) { if (cm) months.push({ ym: cm, count: cc, start: cs }); cm = ym; cc = 1; cs = i; } else cc++; });
  if (cm) months.push({ ym: cm, count: cc, start: cs });

  const usedT = [...new Set(scheduled.map(s => s.team || NO_TEAM))];
  const tOrd = [...new Set([...teams.map(t => t.id), ...usedT])].filter(t => usedT.includes(t));
  const grp = {}; tOrd.forEach(t => { grp[t] = scheduled.filter(s => (s.team || NO_TEAM) === t).sort((a, b) => (a.prio || 4) - (b.prio || 4) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id)); });

  const rows = []; tOrd.forEach(t => { const tasks = grp[t] || []; if (!tasks.length) return; rows.push({ type: 'team', team: t }); tasks.forEach(s => rows.push({ type: 'task', s, team: t })); });
  const RH = 28, HH = 28;
  const dlL = (deadlines || []).filter(d => d.date).map(dl => {
    const di = weeks.findIndex(w => w.mon > new Date(dl.date));
    const wi = di >= 0 ? di : weeks.length;
    // Check on-track: find latest scheduled end for linked items
    const linkedIds = new Set((dl.linkedItems || []).flatMap(id => resolveToLeafIds(tree || [], id)));
    const linked = scheduled.filter(s => linkedIds.has(s.id));
    const maxEnd = linked.length ? linked.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
    const isLate = maxEnd && new Date(dl.date) < maxEnd;
    return { ...dl, wi, isLate, maxEnd };
  });
  // Today line
  // Find the week that contains today (not the one after)
  const now = new Date();
  const todayWi = weeks.findIndex((w, i) => {
    const next = weeks[i + 1];
    return w.mon <= now && (!next || next.mon > now);
  });
  const todayX = todayWi >= 0 ? todayWi * WPX : -1;
  const gTC = t => t === NO_TEAM ? NO_TEAM_COLOR : (teams.find(x => x.id === t)?.color || '#3b82f6');

  // CP dependency lines
  const rowIdx = {}; rows.forEach((r, i) => { if (r.type === 'task') rowIdx[r.s.id] = i; });
  const iMap = Object.fromEntries((tree || []).map(r => [r.id, r]));
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
  }, [scheduled, cpSet, tree]);

  function onBMD(e, s) { e.stopPropagation(); setDrag({ id: s.id, startWi: s.startWi, endWi: s.endWi, ox: e.clientX, seq: s.seq, team: s.team, prio: s.prio }); setDDelta(0); }
  function onMM(e) { if (!drag) return; const dx = e.clientX - drag.ox; setDDelta(Math.round(dx / WPX)); }
  function onMU() { if (!drag) return; if (dDelta !== 0) { const ns = Math.max(0, (drag.startWi + dDelta) * 2); onSeqUpdate(drag.id, ns); } setDrag(null); setDDelta(0); }

  if (!scheduled.length) return <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ textAlign: 'center', color: 'var(--tx3)' }}><div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>No scheduled items</div>
      <div style={{ fontSize: 12 }}>Add tasks with estimates to see the Gantt chart.</div>
    </div>
  </div>;

  return <div className="gantt" onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={() => { if (drag) { setDrag(null); setDDelta(0); } }}>
    <div className="gantt-hdr">
      <div className="gh-fix"><span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--tx3)' }}>Item / Person</span></div>
      <div ref={hR} className="gh-scroll">
        <div style={{ display: 'flex', borderBottom: '1px solid var(--b)', height: HH / 2 }}>
          {months.map((m, i) => { const [y, mo] = m.ym.split('-'); const isYS = mo === '0';
            return <div key={i} style={{ width: WPX * m.count, flexShrink: 0, borderRight: '1px solid var(--b)', padding: '2px 5px', fontSize: 9, color: isYS ? 'var(--ac)' : 'var(--tx3)', fontFamily: 'var(--mono)', fontWeight: isYS ? 600 : 400, overflow: 'hidden', background: isYS ? 'var(--bg3)' : '', display: 'flex', alignItems: 'center' }}>
              {isYS && `${y} `}{MDE[+mo]}
            </div>; })}
        </div>
        <div style={{ display: 'flex', height: HH / 2 }}>
          {weeks.map((w, i) => { const isYB = i > 0 && weeks[i - 1].mon.getFullYear() !== w.mon.getFullYear();
            const isNow = todayWi >= 0 && i === todayWi;
            return <div key={i} style={{ width: WPX, flexShrink: 0, borderRight: '1px solid var(--b2)', borderLeft: isYB ? '2px solid var(--ac2)' : '', textAlign: 'center', fontSize: 8, color: isNow ? 'var(--gr)' : w.hasH ? 'var(--re)' : 'var(--tx3)', fontFamily: 'var(--mono)', fontWeight: isNow ? 700 : 400, background: isNow ? 'rgba(34,197,94,.12)' : w.hasH ? 'rgba(244,63,94,.06)' : isYB ? 'rgba(37,99,235,.06)' : '' }}>
              {w.kw}
            </div>; })}
        </div>
      </div>
    </div>
    <div className="gantt-body">
      <div ref={lR} className="gantt-left" style={{ overflowY: 'hidden' }} onScroll={syncL} onWheel={onLWheel}>
        {rows.map((row) => {
          if (row.type === 'team') { const tc = gTC(row.team);
            return <div key={'h' + row.team} className="gteam" style={{ color: tc, borderLeft: `3px solid ${tc}`, background: 'var(--bg2)', paddingLeft: 10, height: RH }}>
              {row.team === NO_TEAM ? 'No team' : (teams.find(t => t.id === row.team)?.name || row.team)}
            </div>; }
          const s = row.s; const tc = gTC(row.team); const isCp = cpSet?.has(s.id);
          return <div key={s.id} className={`grow-l${isCp ? ' cp-row' : ''}`} style={{ height: RH, cursor: 'pointer' }}
            onClick={() => onBarClick(s)}
            onMouseMove={e => setTip({ item: { ...s, isCp }, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTip(null)}>
            <span className="tid" style={{ flexShrink: 0 }}>{s.id}</span>
            <span style={{ background: tc + '22', color: tc, fontSize: 9, padding: '1px 5px', borderRadius: 3, flexShrink: 0, fontFamily: 'var(--mono)' }}>{s.person}</span>
            <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          </div>;
        })}
      </div>
      <div ref={bR} style={{ flex: 1, overflow: 'auto' }} onScroll={syncS}>
        <div style={{ width: tw, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: tw, height: rows.length * RH, pointerEvents: 'none', zIndex: 0 }}>
            {weeks.map((w, i) => <div key={i} style={{ position: 'absolute', left: i * WPX, top: 0, width: WPX, height: '100%', borderRight: '1px solid var(--b)', background: w.hasH ? 'rgba(244,63,94,.06)' : '' }} />)}
            {/* Today line */}
            {todayX >= 0 && <div style={{ position: 'absolute', left: todayX, top: 0, width: 2, height: '100%', background: 'var(--gr)', opacity: .7, zIndex: 5 }} />}
            {todayX >= 0 && <div style={{ position: 'absolute', left: todayX - 14, top: 0, background: 'var(--gr)', color: '#fff', fontSize: 8, fontWeight: 600, padding: '1px 4px', borderRadius: '0 0 3px 3px', zIndex: 6 }}>Today</div>}
            {/* Deadline lines with labels */}
            {dlL.map(dl => <React.Fragment key={dl.id}>
              <div style={{ position: 'absolute', left: dl.wi * WPX, top: 0, width: 2, height: '100%', background: dl.severity === 'critical' ? 'var(--re)' : 'var(--am)', opacity: .6, zIndex: 4 }} />
              <div style={{ position: 'absolute', left: dl.wi * WPX - 2, top: 0, background: dl.severity === 'critical' ? 'var(--re)' : 'var(--am)', color: '#fff', fontSize: 7, fontWeight: 600, padding: '1px 4px', borderRadius: '0 0 3px 3px', zIndex: 6, whiteSpace: 'nowrap' }}>{dl.name}</div>
            </React.Fragment>)}
          </div>
          {rows.map((row) => {
            if (row.type === 'team') { const tc = gTC(row.team); return <div key={'h' + row.team} style={{ height: RH, background: 'var(--bg2)', borderBottom: '1px solid var(--b2)', position: 'sticky', top: 0, zIndex: 2 }} />; }
            const s = row.s; const tc = gTC(row.team); const isCp = cpSet?.has(s.id);
            const isDrag = drag?.id === s.id;
            const wiS = isDrag ? Math.max(0, s.startWi + dDelta) : s.startWi;
            const wiE = isDrag ? Math.max(wiS, s.endWi + dDelta) : s.endWi;
            const bW = (wiE - wiS + 1) * WPX - 4;
            return <div key={s.id} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }}
              onMouseMove={e => !drag && setTip({ item: { ...s, isCp }, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTip(null)}>
              {s.status !== 'done' && bW > 0 && <div className={`gbar${isDrag ? ' dragging' : ''}${isCp ? ' cp-bar' : ''}`}
                style={{ left: wiS * WPX + 2, width: Math.max(bW, 6), background: tc + (isCp ? '40' : '28'), color: tc, borderLeft: `2px solid ${tc}`, cursor: drag ? 'grabbing' : 'grab' }}
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
      {cpSet?.size > 0 && <span className="badge b-cp">Crit. path: {cpSet.size}</span>}
      <span style={{ fontSize: 11, color: 'var(--tx3)', marginLeft: 'auto' }}>Drag bars to reorder</span>
    </div>
    {tip && !drag && <Tip item={tip.item} x={tip.x} y={tip.y} teams={teams} tree={tree} />}
  </div>;
}
