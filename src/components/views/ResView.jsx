import { TBadge } from '../shared/Badges.jsx';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { LazyInput } from '../shared/LazyInput.jsx';
import { buildMemberShortMap } from '../../App.jsx';

export function ResView({ members, teams, vacations, onUpd, onAdd, onClone, onDel, onVac, onTeamUpd, onTeamAdd, onTeamDel }) {
  const shortMap = buildMemberShortMap(members);
  return <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div className="section-h" style={{ margin: 0 }}>Teams</div>
      <button className="btn btn-sec btn-sm" onClick={onTeamAdd}>+ Add team</button>
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
      {teams.map((t, i) => <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: '6px 10px', borderLeft: `3px solid ${t.color}` }}>
        <LazyInput value={t.name} onCommit={v => onTeamUpd(i, 'name', v)} style={{ background: 'transparent', border: 'none', color: 'var(--tx)', fontSize: 12, fontWeight: 600, outline: 'none', width: 100 }} />
        <input type="color" value={t.color || '#3b82f6'} onChange={e => onTeamUpd(i, 'color', e.target.value)} style={{ width: 24, height: 24, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }} />
        <button className="btn btn-danger btn-xs" onClick={() => onTeamDel(i)}>×</button>
      </div>)}
    </div>
    <hr className="divider" />
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div className="section-h" style={{ margin: 0 }}>Team Members</div>
      <button className="btn btn-sec btn-sm" onClick={onAdd}>+ Add person</button>
    </div>
    {!members.length && <div className="empty"><div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>No team members yet.<p>Add people to assign tasks and plan capacity.</p></div>}
    <div className="res-grid">
      {members.map(m => <div key={m.id} className="res-card">
        <div className="res-ch">
          <span className="res-name">{m.name || m.id}<span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', fontWeight: 400 }} title="Auto-generated short name (used in Markdown)">{shortMap[m.id]}</span></span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><TBadge t={m.team} teams={teams} />{onClone && <button className="btn btn-sec btn-xs" onClick={() => onClone(m)} title="Clone for another team">⧉ Clone</button>}<button className="btn btn-danger btn-xs" onClick={() => onDel(m.id)}>Remove</button></div>
        </div>
        {[
          ['Full name', <LazyInput value={m.name || ''} onCommit={v => onUpd({ ...m, name: v })} />],
          ['Team', <SearchSelect value={m.team || ''} options={teams.map(t => ({ id: t.id, label: t.name }))} onSelect={v => onUpd({ ...m, team: v })} placeholder="Choose team..." allowEmpty />],
          ['Role', <LazyInput value={m.role || ''} onCommit={v => onUpd({ ...m, role: v })} placeholder="e.g. Senior Dev" />],
          ['Capacity %', <LazyInput type="number" min="0" max="100" step="5" value={Math.round((m.cap || 1) * 100)} onCommit={v => onUpd({ ...m, cap: v / 100 })} />],
          ['Vacation days/yr', <LazyInput type="number" min="0" max="40" value={m.vac || 25} onCommit={v => onUpd({ ...m, vac: v })} />],
          ['Start date', <LazyInput type="date" value={m.start || ''} onCommit={v => onUpd({ ...m, start: v })} />],
          ['End date', <LazyInput type="date" value={m.end || ''} onCommit={v => onUpd({ ...m, end: v })} />],
        ].map(([l, c]) => <div key={l} className="rf"><label>{l}</label>{c}</div>)}
      </div>)}
    </div>
    <hr className="divider" />
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <div className="section-h" style={{ margin: 0 }}>Vacation Weeks</div>
      <button className="btn btn-sec btn-sm" onClick={() => onVac([...vacations, { person: members[0]?.id || '', week: '', note: '' }])}>+ Add week</button>
    </div>
    <p className="helper" style={{ marginBottom: 10 }}>Enter Monday date of each vacation week (YYYY-MM-DD). Scheduler skips that week for the person.</p>
    {vacations.length > 0 && <table className="vac-tbl">
      <thead><tr><th>Person</th><th>Week start (Mon)</th><th>Note</th><th></th></tr></thead>
      <tbody>{vacations.map((v, i) => <tr key={i}>
        <td><SearchSelect value={v.person} options={members.map(m => ({ id: m.id, label: m.name || m.id }))} onSelect={val => onVac(vacations.map((x, j) => j === i ? { ...x, person: val } : x))} placeholder="Choose person..." /></td>
        <td><LazyInput value={v.week} onCommit={val => onVac(vacations.map((x, j) => j === i ? { ...x, week: val } : x))} placeholder="2026-07-13" /></td>
        <td><LazyInput value={v.note || ''} onCommit={val => onVac(vacations.map((x, j) => j === i ? { ...x, note: val } : x))} /></td>
        <td><button className="btn btn-danger btn-xs" onClick={() => onVac(vacations.filter((_, j) => j !== i))}>Remove</button></td>
      </tr>)}</tbody>
    </table>}
  </div>;
}
