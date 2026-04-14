import { fmtDate, diffDays, iso } from '../../utils/date.js';
import { GT, GL } from '../../constants.js';
import { resolveToLeafIds } from '../../utils/scheduler.js';

const ORDER = ['goal', 'painpoint', 'deadline'];

export function DLView({deadlines,scheduled,onEdit,tree=[]}){
  const items = deadlines.map(d => ({ ...d, type: d.type || 'deadline' }));
  const grouped = ORDER.map(t => ({ type: t, items: items.filter(d => d.type === t) })).filter(g => g.items.length);

  return<div>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <div className="section-h" style={{margin:0}}>Focus</div>
      <button className="btn btn-sec btn-sm" onClick={onEdit}>Edit focus</button>
    </div>
    {!deadlines.length&&<div className="empty"><div style={{fontSize:24,marginBottom:8}}>🎯</div>Define the big topics first: goals, painpoints, and deadlines.</div>}
    {grouped.map(g=><div key={g.type}>
      <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--tx3)',margin:'14px 0 6px',display:'flex',alignItems:'center',gap:4}}>{GT[g.type]} {GL[g.type]}s</div>
      <div className="dl-list">
        {g.items.map(dl=>{
          const linkedIds = new Set((dl.linkedItems || []).flatMap(id => resolveToLeafIds(tree, id)));
          const linked=scheduled.filter(s=>linkedIds.has(s.id));
          const maxEnd=linked.length>0?linked.reduce((m,s)=>s.endD>m?s.endD:m,new Date(0)):null;
          const dlDate=dl.date?new Date(dl.date):null;
          const isLate=maxEnd&&dlDate&&maxEnd>dlDate;
          const daysLeft=dlDate?diffDays(new Date(),dlDate):null;
          const isDeadline=dl.type==='deadline';
          return<div key={dl.id} className={`goal-card t-${dl.type}`}>
            <div className="dl-ch">
              <span className={`badge b${dl.severity==='critical'?'c':'h'}`}>{dl.severity}</span>
              <span className="dl-name">{dl.name}</span>
              {isDeadline&&dlDate&&<span className="dl-date">{fmtDate(dl.date)}</span>}
              {isDeadline&&daysLeft!=null&&daysLeft>=0&&<span className="badge bo">{daysLeft}d left</span>}
              {isDeadline&&isLate&&<span className="badge bc">⚠ {Math.round((maxEnd-dlDate)/864e5)}d late</span>}
              {isDeadline&&!isLate&&maxEnd&&<span className="badge bd">✓ On track</span>}
              {!isDeadline&&linked.length>0&&<span className="badge bo">{linked.length} linked</span>}
            </div>
            {dl.description&&<div style={{fontSize:11,color:'var(--tx3)'}}>{dl.description}</div>}
            {linked.length>0&&<div style={{marginTop:8,display:'flex',gap:4,flexWrap:'wrap'}}>
              {linked.map(s=><span key={s.id} className="tag">{s.id} — ends {iso(s.endD)}</span>)}
            </div>}
          </div>;
        })}
      </div>
    </div>)}
  </div>;
}
