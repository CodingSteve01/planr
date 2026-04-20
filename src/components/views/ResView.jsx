import { TBadge } from '../shared/Badges.jsx';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { LazyInput } from '../shared/LazyInput.jsx';
import { buildMemberShortMap } from '../../App.jsx';
import { useT } from '../../i18n.jsx';

export function ResView({ members, teams, vacations, onUpd, onAdd, onClone, onDel, onVac, onTeamUpd, onTeamAdd, onTeamDel }) {
  const { t } = useT();
  const shortMap = buildMemberShortMap(members);
  return <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div className="section-h" style={{ margin: 0 }}>{t('rv.teams')}</div>
      <button className="btn btn-sec btn-sm" onClick={onTeamAdd}>{t('rv.addTeam')}</button>
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
      <div className="section-h" style={{ margin: 0 }}>{t('rv.members')}</div>
      <button className="btn btn-sec btn-sm" onClick={onAdd}>{t('rv.addPerson')}</button>
    </div>
    {!members.length && <div className="empty"><div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>{t('rv.noMembers')}<p>{t('rv.noMembersHint')}</p></div>}
    <div className="res-grid">
      {members.map(m => <div key={m.id} className="res-card">
        <div className="res-ch">
          <span className="res-name">{m.name || m.id}<span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', fontWeight: 400 }} data-htip="Auto-generated short name (used in Markdown)">{shortMap[m.id]}</span></span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><TBadge t={m.team} teams={teams} />{onClone && <button className="btn btn-sec btn-xs" onClick={() => onClone(m)} data-htip={t('rv.clone')}>{t('rv.clone')}</button>}<button className="btn btn-danger btn-xs" onClick={() => onDel(m.id)}>{t('rv.remove')}</button></div>
        </div>
        {[
          [t('rv.fullName'), <LazyInput value={m.name || ''} onCommit={v => onUpd({ ...m, name: v })} />],
          [t('qe.team'), <SearchSelect value={m.team || ''} options={teams.map(tm => ({ id: tm.id, label: tm.name }))} onSelect={v => onUpd({ ...m, team: v })} placeholder={t('rv.chooseTeam')} allowEmpty />],
          [t('rv.role'), <LazyInput value={m.role || ''} onCommit={v => onUpd({ ...m, role: v })} placeholder="e.g. Senior Dev" />],
          [t('rv.capacityPct'), <LazyInput type="number" min="0" max="100" step="5" value={Math.round((m.cap || 1) * 100)} onCommit={v => onUpd({ ...m, cap: v / 100 })} />],
          [t('rv.vacDays'), <LazyInput type="number" min="0" max="40" value={m.vac || 25} onCommit={v => onUpd({ ...m, vac: v })} />],
          [t('rv.startDate'), <LazyInput type="date" value={m.start || ''} onCommit={v => onUpd({ ...m, start: v })} />],
          [t('rv.endDate'), <LazyInput type="date" value={m.end || ''} onCommit={v => onUpd({ ...m, end: v })} />],
        ].map(([l, c]) => <div key={l} className="rf"><label>{l}</label>{c}</div>)}
      </div>)}
    </div>
    <hr className="divider" />
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <div className="section-h" style={{ margin: 0 }}>{t('rv.vacations')}</div>
      <button className="btn btn-sec btn-sm" onClick={() => onVac([...vacations, { person: members[0]?.id || '', week: '', note: '' }])}>{t('rv.addWeek')}</button>
    </div>
    <p className="helper" style={{ marginBottom: 10 }}>{t('rv.vacHint')}</p>
    {vacations.length > 0 && <table className="vac-tbl">
      <thead><tr><th>{t('rv.person')}</th><th>{t('rv.weekStart')}</th><th>{t('rv.note')}</th><th></th></tr></thead>
      <tbody>{vacations.map((v, i) => <tr key={i}>
        <td><SearchSelect value={v.person} options={members.map(m => ({ id: m.id, label: m.name || m.id }))} onSelect={val => onVac(vacations.map((x, j) => j === i ? { ...x, person: val } : x))} placeholder={t('rv.choosePerson')} /></td>
        <td><LazyInput value={v.week} onCommit={val => onVac(vacations.map((x, j) => j === i ? { ...x, week: val } : x))} placeholder="2026-07-13" /></td>
        <td><LazyInput value={v.note || ''} onCommit={val => onVac(vacations.map((x, j) => j === i ? { ...x, note: val } : x))} /></td>
        <td><button className="btn btn-danger btn-xs" onClick={() => onVac(vacations.filter((_, j) => j !== i))}>{t('rv.remove')}</button></td>
      </tr>)}</tbody>
    </table>}
  </div>;
}
