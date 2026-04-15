import { TBadge } from '../shared/Badges.jsx';

export function ResView({members,teams,vacations,onUpd,onAdd,onDel,onVac}){
  return<div>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <div className="section-h" style={{margin:0}}>Team Members</div>
      <button className="btn btn-sec btn-sm" onClick={onAdd}>+ Add person</button>
    </div>
    {!members.length&&<div className="empty"><div style={{fontSize:24,marginBottom:8}}>👥</div>No team members yet.<p>Add people to assign tasks and plan capacity.</p></div>}
    <div className="res-grid">
      {members.map(m=><div key={m.id} className="res-card">
        <div className="res-ch"><span className="res-name">{m.name||m.id}</span>
          <div style={{display:'flex',gap:6,alignItems:'center'}}><TBadge t={m.team} teams={teams}/><button className="btn btn-danger btn-xs" onClick={()=>onDel(m.id)}>Remove</button></div>
        </div>
        {[['Full name',<input value={m.name||''} onChange={e=>onUpd({...m,name:e.target.value})}/>],
          ['Team',<select value={m.team||''} onChange={e=>onUpd({...m,team:e.target.value})}><option value="">— None —</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>],
          ['Role',<input value={m.role||''} onChange={e=>onUpd({...m,role:e.target.value})} placeholder="e.g. Senior Dev"/>],
          ['Capacity %',<input type="number" min="0" max="100" step="5" value={Math.round((m.cap||1)*100)} onChange={e=>onUpd({...m,cap:+e.target.value/100})}/>],
          ['Vacation days/yr',<input type="number" min="0" max="40" value={m.vac||25} onChange={e=>onUpd({...m,vac:+e.target.value})}/>],
          ['Start date',<input type="date" value={m.start||''} onChange={e=>onUpd({...m,start:e.target.value})}/>],
        ].map(([l,c])=><div key={l} className="rf"><label>{l}</label>{c}</div>)}
      </div>)}
    </div>
    <hr className="divider"/>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
      <div className="section-h" style={{margin:0}}>Vacation Weeks</div>
      <button className="btn btn-sec btn-sm" onClick={()=>onVac([...vacations,{person:members[0]?.id||'',week:'',note:''}])}>+ Add week</button>
    </div>
    <p className="helper" style={{marginBottom:10}}>Enter Monday date of each vacation week (YYYY-MM-DD). Scheduler skips that week for the person.</p>
    {vacations.length>0&&<table className="vac-tbl">
      <thead><tr><th>Person</th><th>Week start (Mon)</th><th>Note</th><th></th></tr></thead>
      <tbody>{vacations.map((v,i)=><tr key={i}>
        <td><select value={v.person} onChange={e=>onVac(vacations.map((x,j)=>j===i?{...x,person:e.target.value}:x))}>{members.map(m=><option key={m.id} value={m.id}>{m.name||m.id}</option>)}</select></td>
        <td><input value={v.week} onChange={e=>onVac(vacations.map((x,j)=>j===i?{...x,week:e.target.value}:x))} placeholder="2026-07-13"/></td>
        <td><input value={v.note||''} onChange={e=>onVac(vacations.map((x,j)=>j===i?{...x,note:e.target.value}:x))}/></td>
        <td><button className="btn btn-danger btn-xs" onClick={()=>onVac(vacations.filter((_,j)=>j!==i))}>Remove</button></td>
      </tr>)}</tbody>
    </table>}
  </div>;
}
