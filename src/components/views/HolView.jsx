import { iso } from '../../utils/date.js';
import { computeNRW } from '../../utils/holidays.js';
import { DOW_DE } from '../../constants.js';
import { LazyInput } from '../shared/LazyInput.jsx';

export function HolView({holidays,planStart,planEnd,onUpdate}){
  const planYears=[];const nowY=new Date().getFullYear();for(let y=Math.min(nowY-1,new Date(planStart).getFullYear());y<=Math.max(nowY+2,new Date(planEnd).getFullYear());y++)planYears.push(y);
  const sorted=[...(holidays||[])].sort((a,b)=>a.date.localeCompare(b.date));
  const byY={};sorted.forEach(h=>{const y=h.date.split('-')[0];if(!byY[y])byY[y]=[];byY[y].push(h);});
  function importNRW(){
    const nrw=computeNRW(planYears);const ex=new Set((holidays||[]).map(h=>h.date));
    onUpdate([...(holidays||[]),...nrw.filter(h=>!ex.has(h.date))].sort((a,b)=>a.date.localeCompare(b.date)));
  }
  function upd(idx,k,v){onUpdate((holidays||[]).map((h,i)=>i===idx?{...h,[k]:v,auto:false}:h));}
  function del(idx){onUpdate((holidays||[]).filter((_,i)=>i!==idx));}
  const aC=(holidays||[]).filter(h=>h.auto).length;
  const mC=(holidays||[]).filter(h=>!h.auto).length;
  return<div>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
      <div className="section-h" style={{margin:0}}>Holidays</div>
      <button className="btn btn-pri btn-sm" onClick={importNRW}>↓ Import NRW ({planYears.join(', ')})</button>
      <button className="btn btn-sec btn-sm" onClick={()=>onUpdate([...(holidays||[]),{date:iso(new Date()),name:'',auto:false}])}>+ Add manually</button>
      {(holidays||[]).length>0&&<button className="btn btn-danger btn-sm" onClick={()=>{if(confirm('Delete all holidays?'))onUpdate([]);}}>Clear all</button>}
      <div style={{flex:1}}/>
      <span style={{fontSize:11,color:'var(--tx3)'}}>{aC} computed · {mC} manual</span>
    </div>
    <p style={{fontSize:12,color:'var(--tx3)',marginBottom:14}}>Holidays are excluded from working day calculations. NRW holidays are computed dynamically via Easter algorithm and stored in the project file.</p>
    {!(holidays||[]).length&&<div className="empty"><div style={{fontSize:28,marginBottom:10}}>📆</div>
      <div style={{fontWeight:500,color:'var(--tx2)',marginBottom:8}}>No holidays configured</div>
      <button className="btn btn-pri" onClick={importNRW}>↓ Import NRW holidays</button>
    </div>}
    {Object.keys(byY).sort().map(y=><div key={y} style={{marginBottom:18}}>
      <div className="section-h">{y} — {byY[y].length} holidays</div>
      <div className="hol-grid">
        {byY[y].map(h=>{const gi=(holidays||[]).indexOf(h);const dt=new Date(h.date),dow=DOW_DE[dt.getDay()];
          return<div key={h.date+gi} className="hol-row">
            {h.auto
              ?<><span className="hol-d">{dow} {h.date}</span><span style={{flex:1,fontSize:12}}>{h.name}</span><span className="badge bo" style={{fontSize:9}}>NRW</span><button className="btn btn-ghost btn-xs" onClick={()=>del(gi)}>×</button></>
              :<><LazyInput type="date" value={h.date} onCommit={v=>upd(gi,'date',v)} style={{background:'var(--bg3)',border:'1px solid var(--b2)',borderRadius:4,color:'var(--tx)',fontSize:11,padding:'3px 6px',fontFamily:'var(--mono)',width:110,outline:'none',flexShrink:0}}/><LazyInput value={h.name} onCommit={v=>upd(gi,'name',v)} style={{flex:1,minWidth:0,background:'var(--bg3)',border:'1px solid var(--b2)',borderRadius:4,color:'var(--tx)',fontSize:11,padding:'3px 6px',outline:'none'}} placeholder="Name"/><button className="btn btn-danger btn-xs" style={{flexShrink:0}} onClick={()=>del(gi)}>×</button></>
            }
          </div>;
        })}
      </div>
    </div>)}
  </div>;
}
