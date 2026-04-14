import { fmtDate, diffDays, iso } from '../../utils/date.js';

export function DLView({deadlines,scheduled,onEdit}){
  return<div>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <div className="section-h" style={{margin:0}}>Deadlines</div>
      <button className="btn btn-sec btn-sm" onClick={onEdit}>✏ Edit</button>
    </div>
    {!deadlines.length&&<div className="empty"><div style={{fontSize:24,marginBottom:8}}>⚑</div>No deadlines.<p>Track key dates and see if the plan is on schedule.</p></div>}
    <div className="dl-list">
      {deadlines.map(dl=>{
        const linked=scheduled.filter(s=>(dl.linkedItems||[]).includes(s.id));
        const maxEnd=linked.length>0?linked.reduce((m,s)=>s.endD>m?s.endD:m,new Date(0)):null;
        const dlDate=dl.date?new Date(dl.date):null;
        const isLate=maxEnd&&dlDate&&maxEnd>dlDate;
        const daysLeft=dlDate?diffDays(new Date(),dlDate):null;
        return<div key={dl.id} className={`dl-card ${dl.severity}`}>
          <div className="dl-ch">
            <span className={`badge b${dl.severity==='critical'?'c':'h'}`}>⚑ {dl.severity}</span>
            <span className="dl-name">{dl.name}</span>
            <span className="dl-date">{fmtDate(dl.date)}</span>
            {daysLeft!=null&&daysLeft>=0&&<span className="badge bo">{daysLeft}d left</span>}
            {isLate&&<span className="badge bc">⚠ {Math.round((maxEnd-dlDate)/864e5)}d late</span>}
            {!isLate&&maxEnd&&<span className="badge bd">✓ On track</span>}
          </div>
          {dl.description&&<div style={{fontSize:11,color:'var(--tx3)'}}>{dl.description}</div>}
          {linked.length>0&&<div style={{marginTop:8,display:'flex',gap:4,flexWrap:'wrap'}}>
            {linked.map(s=><span key={s.id} className="tag">{s.id} — ends {iso(s.endD)}</span>)}
          </div>}
        </div>;
      })}
    </div>
  </div>;
}
