import { useMemo } from 'react';
import { TBadge } from '../shared/Badges.jsx';
import { re, treeStats } from '../../utils/scheduler.js';
import { iso, diffDays } from '../../utils/date.js';

export function SumView({ tree, scheduled, deadlines, members, teams, cpSet, goalPaths }) {
  const stats = treeStats(tree);
  const lvs = tree.filter(r => r.lvl === 3);
  const done = lvs.filter(r => r.status === 'done').length;
  const wip = lvs.filter(r => r.status === 'wip').length;
  const open = lvs.filter(r => r.status === 'open').length;
  const tR = lvs.reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
  const prog = lvs.length > 0 ? (done / lvs.length) * 100 : 0;
  const latE = scheduled.length > 0 ? scheduled.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
  const byT = {}; scheduled.forEach(s => { if (!byT[s.team]) byT[s.team] = { t: 0, pt: 0 }; byT[s.team].t++; byT[s.team].pt += s.effort; });

  return <div style={{ maxWidth: 900 }}>
    {/* Progress header */}
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, color: 'var(--gr)' }}>{prog.toFixed(0)}%</span>
      <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{done} done · {wip} in progress · {open} open of {lvs.length} tasks</span>
      {latE && <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx3)', marginLeft: 'auto' }}>Projected end: {iso(latE)}</span>}
    </div>
    <div className="prog-wrap" style={{ height: 6, marginBottom: 24 }}><div className="prog-fill" style={{ width: `${prog}%` }} /></div>

    {/* Goals / Deadlines with integrated critical path */}
    <div className="section-h" style={{ marginTop: 0 }}>Goals & Deadlines</div>
    {deadlines.filter(d => d.date).map(dl => {
      const gp = goalPaths?.[dl.id];
      const linked = scheduled.filter(s => (dl.linkedItems || []).includes(s.id));
      const maxEnd = linked.length > 0 ? linked.reduce((m, s) => s.endD > m ? s.endD : m, new Date(0)) : null;
      const isLate = maxEnd && new Date(dl.date) < maxEnd;
      const daysLeft = diffDays(new Date(), new Date(dl.date));
      const gpDone = gp ? gp.needed.filter(id => tree.find(x => x.id === id)?.status === 'done').length : 0;
      const gpProg = gp && gp.needed.length ? Math.round(gpDone / gp.needed.length * 100) : 0;

      return <div key={dl.id} style={{ background: 'var(--bg2)', border: `1px solid ${isLate ? 'var(--re)' : 'var(--b)'}`, borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{dl.name}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{dl.date}</span>
          {daysLeft >= 0 && <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{daysLeft}d left</span>}
          <span style={{ marginLeft: 'auto' }}>
            {isLate ? <span className="badge bc">AT RISK</span> : maxEnd ? <span className="badge bd">On track</span> : null}
          </span>
        </div>
        {dl.description && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>{dl.description}</div>}
        {gp && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx3)', marginBottom: 3 }}>
            <span>{gpDone}/{gp.needed.length} tasks done · {gp.critical.size} on critical path</span>
            <span>{gpProg}%</span>
          </div>
          <div className="prog-wrap"><div className="prog-fill" style={{ width: `${gpProg}%`, background: dl.severity === 'critical' ? 'var(--re)' : 'var(--am)' }} /></div>
          {gp.critical.size > 0 && <div style={{ marginTop: 6, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {[...gp.critical].slice(0, 6).map(id => { const r = tree.find(x => x.id === id); return <span key={id} style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--re)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3 }}>{id}</span>; })}
            {gp.critical.size > 6 && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>+{gp.critical.size - 6}</span>}
          </div>}
        </>}
      </div>;
    })}

    {/* Team effort - compact */}
    <div className="section-h">Resources</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
      <div className="sum-card" style={{ minWidth: 80 }}><div className="sum-v">{members.length}</div><div className="sum-l">People</div></div>
      <div className="sum-card" style={{ minWidth: 80 }}><div className="sum-v" style={{ color: 'var(--gr)' }}>{tR.toFixed(0)}</div><div className="sum-l">Total PT</div></div>
      {Object.entries(byT).sort().map(([t, d]) => { const team = teams.find(x => x.id === t);
        return <div key={t} className="sum-card" style={{ minWidth: 100 }}>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 2 }}>{team?.name || t}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600, color: team?.color || 'var(--tx)' }}>{d.pt.toFixed(0)} PT</div>
          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{d.t} tasks</div>
        </div>; })}
    </div>

    {/* Project breakdown */}
    {tree.filter(r => r.lvl === 1).length > 0 && <>
      <div className="section-h">Projects</div>
      <table className="tree-tbl">
        <thead><tr><th>Project</th><th className="r">Best</th><th className="r">Realistic</th><th className="r">Worst</th></tr></thead>
        <tbody>{tree.filter(r => r.lvl === 1).map(r => { const s = stats[r.id] || r;
          return <tr key={r.id} className="tr l1"><td><span className="tid">{r.id}</span><span style={{ marginLeft: 8 }}>{r.name}</span></td>
            <td className="nc">{s._b?.toFixed(0)}</td><td className="nc g">{s._r?.toFixed(1)}</td><td className="nc">{s._w?.toFixed(0)}</td>
          </tr>; })}</tbody>
      </table>
    </>}
  </div>;
}
