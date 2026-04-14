import { iso } from '../../utils/date.js';

export function Tip({ item, x, y, teams, tree }) {
  if (!item) return null;
  const sx = Math.min(x + 14, window.innerWidth - 300), sy = Math.max(y - 60, 8);
  // Resolve team name
  const teamName = item.team && teams
    ? (item.team.includes('/') ? item.team.split('/').map(t => teams.find(x => x.id === t)?.name || t).join(' / ') : teams.find(t => t.id === item.team)?.name || item.team)
    : item.team;
  // Resolve dep names
  const depList = item.deps && tree
    ? (typeof item.deps === 'string' ? item.deps.split(', ') : Array.isArray(item.deps) ? item.deps : [])
        .map(d => { const n = tree.find(r => r.id === d); return n ? `${d} (${n.name})` : d; })
    : null;

  return <div className="tt" style={{ left: sx, top: sy }}>
    <div className="tt-title">{item.id} — {item.name}</div><hr className="tt-sep" />
    {item.person && <div className="tt-row"><span>Assigned</span><b>{item.person}</b></div>}
    {teamName && <div className="tt-row"><span>Team</span><b>{teamName}</b></div>}
    {item.best > 0 && <div className="tt-row"><span>Best case</span><b>{item.best}d</b></div>}
    {item.effort > 0 && <div className="tt-row"><span>Realistic</span><b>{item.effort?.toFixed(1)}d</b></div>}
    {item.startD && <div className="tt-row"><span>Start</span><b>{iso(item.startD)}</b></div>}
    {item.endD && <div className="tt-row"><span>End</span><b>{iso(item.endD)}</b></div>}
    {depList && depList.length > 0 && <><hr className="tt-sep" /><div style={{ fontSize: 10, color: 'var(--tx3)' }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>Dependencies:</div>
      {depList.map(d => <div key={d} style={{ marginLeft: 4 }}>{d}</div>)}
    </div></>}
    {item.isCp && <div className="tt-row"><span>Critical path</span><b style={{ color: 'var(--re)' }}>YES</b></div>}
    {item.note && <><hr className="tt-sep" /><div style={{ fontSize: 10, color: 'var(--tx3)', fontStyle: 'italic' }}>{item.note}</div></>}
    <hr className="tt-sep" /><div style={{ fontSize: 10, color: 'var(--tx3)' }}>Dbl-click for details</div>
  </div>;
}
