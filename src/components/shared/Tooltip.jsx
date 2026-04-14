import { iso } from '../../utils/date.js';

export function Tip({ item, x, y }) {
  if (!item) return null;
  const sx = Math.min(x + 14, window.innerWidth - 300), sy = Math.max(y - 60, 8);
  return <div className="tt" style={{ left: sx, top: sy }}>
    <div className="tt-title">{item.id} — {item.name}</div><hr className="tt-sep" />
    {item.person && <div className="tt-row"><span>Assigned</span><b>{item.person}</b></div>}
    {item.team && <div className="tt-row"><span>Team</span><b>{item.team}</b></div>}
    {item.best > 0 && <div className="tt-row"><span>Best case</span><b>{item.best}d</b></div>}
    {item.effort > 0 && <div className="tt-row"><span>Realistic</span><b>{item.effort?.toFixed(1)}d</b></div>}
    {item.startD && <div className="tt-row"><span>Start</span><b>{iso(item.startD)}</b></div>}
    {item.endD && <div className="tt-row"><span>End</span><b>{iso(item.endD)}</b></div>}
    {item.deps && <div className="tt-row"><span>Deps</span><b style={{ fontSize: 9, maxWidth: 130, textAlign: 'right' }}>{item.deps}</b></div>}
    {item.isCp && <div className="tt-row"><span>Critical path</span><b style={{ color: 'var(--re)' }}>YES</b></div>}
    {item.note && <><hr className="tt-sep" /><div style={{ fontSize: 10, color: 'var(--tx3)', fontStyle: 'italic' }}>{item.note}</div></>}
    <hr className="tt-sep" /><div style={{ fontSize: 10, color: 'var(--tx3)' }}>Click for details</div>
  </div>;
}
