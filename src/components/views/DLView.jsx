import { fmtDate, diffDays, iso } from '../../utils/date.js';
import { GT, GL } from '../../constants.js';
import { deadlineScopedScheduledItems } from '../../utils/deadlines.js';
import { summarizeNodeTimeline } from '../../utils/timeline.js';
import { useT } from '../../i18n.jsx';

const ORDER = ['goal', 'painpoint', 'deadline'];

export function DLView({goals,scheduled,tree=[],stats={},onEdit}){
  const { t } = useT();
  const timelineById = Object.fromEntries((tree || []).map(node => [node.id, summarizeNodeTimeline(tree, scheduled, node)]));
  const grouped = ORDER.map(t => ({ type: t, items: goals.filter(g => g.type === t) })).filter(g => g.items.length);

  return<div>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <div className="section-h" style={{margin:0}}>Focus</div>
      <button className="btn btn-sec btn-sm" onClick={onEdit}>Edit focus</button>
    </div>
    {!goals.length&&<div className="empty"><div style={{fontSize:24,marginBottom:8}}>🎯</div>Set a type (goal/painpoint/deadline) on your top-level items to see them here.</div>}
    {grouped.map(g=><div key={g.type}>
      <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--tx3)',margin:'14px 0 6px',display:'flex',alignItems:'center',gap:4}}>{GT[g.type]} {GL[g.type]}s</div>
      <div className="dl-list">
        {g.items.map(r=>{
          const s = stats[r.id];
          const prog = s?._progress || 0;
          const timeline = timelineById[r.id];
          const childSch = r.type === 'deadline'
            ? deadlineScopedScheduledItems(tree, scheduled, r.id)
            : scheduled.filter(sc => sc.id.startsWith(r.id + '.'));
          const maxEnd = r.type === 'deadline'
            ? (timeline?.deadline?.end || timeline?.planned?.end || null)
            : (timeline?.planned?.end || (childSch.length > 0 ? childSch.reduce((m,sc)=>sc.endD>m?sc.endD:m,new Date(0)) : null));
          const dlDate = r.date ? new Date(r.date) : null;
          const isLate = maxEnd && dlDate && maxEnd > dlDate;
          const daysLeft = dlDate ? diffDays(new Date(), dlDate) : null;
          const isDeadline = r.type === 'deadline';
          return<div key={r.id} className={`goal-card t-${r.type}`}>
            <div className="dl-ch">
              <span className={`badge b${r.severity==='critical'?'c':'h'}`}>{r.severity}</span>
              <span className="dl-name">{r.name}</span>
              {isDeadline&&dlDate&&<span className="dl-date">{fmtDate(r.date)}</span>}
              {isDeadline&&daysLeft!=null&&daysLeft>=0&&<span className="badge bo">{daysLeft}d left</span>}
              {isDeadline&&isLate&&<span className="badge bc">⚠ late</span>}
              {isDeadline&&!isLate&&maxEnd&&<span className="badge bd">✓ On track</span>}
              {childSch.length>0&&<span className="badge bo">{childSch.length} scheduled</span>}
            </div>
            {r.description&&<div style={{fontSize:11,color:'var(--tx3)'}}>{r.description}</div>}
            {timeline?.planned?.end&&<div style={{fontSize:10,color:'var(--tx3)',fontFamily:'var(--mono)',marginTop:4}}>
              {iso(timeline.planned.start)} → {iso(timeline.planned.end)}
              {timeline?.deadline?.end&&<span> · {t('qe.affectsDeadline')}: {iso(timeline.deadline.end)}</span>}
            </div>}
            {prog>0&&<div style={{marginTop:6}}>
              <div className="prog-wrap" style={{height:4}}><div className="prog-fill" style={{width:`${prog}%`,background:r.severity==='critical'?'var(--re)':'var(--am)'}} /></div>
              <div style={{fontSize:9,color:'var(--tx3)',marginTop:2,fontFamily:'var(--mono)'}}>{prog}% complete</div>
            </div>}
          </div>;
        })}
      </div>
    </div>)}
  </div>;
}
