import { useMemo } from 'react';
import { SBadge, TBadge } from '../shared/Badges.jsx';
import { re, treeStats } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';

export function SumView({tree,scheduled,deadlines,members,teams,cpSet,goalPaths}){
  const stats=treeStats(tree);
  const lvs=tree.filter(r=>r.lvl===3);
  const done=lvs.filter(r=>r.status==='done').length;
  const wip=lvs.filter(r=>r.status==='wip').length;
  const open=lvs.filter(r=>r.status==='open').length;
  const tB=lvs.reduce((s,r)=>s+(r.best||0),0);
  const tR=lvs.reduce((s,r)=>s+re(r.best||0,r.factor||1.5),0);
  const prog=lvs.length>0?(done/lvs.length)*100:0;
  const latE=scheduled.length>0?scheduled.reduce((m,s)=>s.endD>m?s.endD:m,new Date(0)):null;
  const byT={};scheduled.forEach(s=>{if(!byT[s.team])byT[s.team]={t:0,pt:0};byT[s.team].t++;byT[s.team].pt+=s.effort;});
  return<div>
    <div className="sum-row">
      <div className="sum-card"><div className="sum-v">{lvs.length}</div><div className="sum-l">Total tasks</div></div>
      <div className="sum-card"><div className="sum-v" style={{color:'var(--gr)'}}>{done}</div><div className="sum-l">Done</div></div>
      <div className="sum-card"><div className="sum-v" style={{color:'var(--am)'}}>{wip}</div><div className="sum-l">In progress</div></div>
      <div className="sum-card"><div className="sum-v" style={{color:'var(--tx3)'}}>{open}</div><div className="sum-l">Open</div></div>
      <div className="sum-card"><div className="sum-v">{tB}</div><div className="sum-l">Best case PT</div></div>
      <div className="sum-card"><div className="sum-v" style={{color:'var(--gr)'}}>{tR.toFixed(0)}</div><div className="sum-l">Realistic PT</div></div>
      <div className="sum-card"><div className="sum-v">{members.length}</div><div className="sum-l">People</div></div>
      {latE&&new Date(latE).getFullYear()>2000&&<div className="sum-card"><div className="sum-v" style={{fontSize:14}}>{iso(latE)}</div><div className="sum-l">Projected end</div></div>}
    </div>
    {cpSet?.size>0&&<div style={{background:'#3d0a0e',border:'1px solid #7f1d1d',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
      <span style={{fontSize:16}}>⚡</span>
      <div><div style={{fontWeight:600,fontSize:12,color:'#fda4af'}}>Critical Path — {cpSet.size} items</div>
        <div style={{fontSize:11,color:'#f87171'}}>Delays on these items push the project end date directly. Check Schedule and Network tabs.</div>
      </div>
    </div>}
    {lvs.length>0&&<div style={{marginBottom:18}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--tx3)',marginBottom:5}}><span>Overall progress</span><span>{prog.toFixed(0)}%</span></div>
      <div className="prog-wrap"><div className="prog-fill" style={{width:`${prog}%`}}/></div>
    </div>}
    {deadlines.filter(d=>d.date).map(dl=>{
      const linked=scheduled.filter(s=>(dl.linkedItems||[]).includes(s.id));
      const maxEnd=linked.length>0?linked.reduce((m,s)=>s.endD>m?s.endD:m,new Date(0)):null;
      const isLate=maxEnd&&new Date(dl.date)&&maxEnd>new Date(dl.date);
      return<div key={dl.id} className={`dl-bar${dl.severity!=='critical'?' hi':''}`}>
        <span>⚑</span>
        <div style={{flex:1}}><div style={{fontWeight:600,fontSize:12}}>{dl.name} — {dl.date}</div><div style={{fontSize:11,color:'var(--tx3)'}}>{dl.description}</div></div>
        {isLate&&<span className="badge bc">⚠ At risk</span>}
        {!isLate&&maxEnd&&<span className="badge bd">✓ On track</span>}
      </div>;
    })}
    {/* Goal-based critical paths */}
    {goalPaths&&Object.keys(goalPaths).length>0&&<>
      <div className="section-h">Critical paths per goal</div>
      {Object.entries(goalPaths).map(([dlId,gp])=>{
        const critCount=gp.critical.size;const totalNeeded=gp.needed.length;
        const doneCount=gp.needed.filter(id=>{const r=tree.find(x=>x.id===id);return r?.status==='done';}).length;
        const prog=totalNeeded>0?Math.round(doneCount/totalNeeded*100):0;
        return<div key={dlId} style={{background:'var(--bg2)',border:'1px solid var(--b)',borderRadius:'var(--r)',padding:12,marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <span className={`badge b${gp.severity==='critical'?'c':'h'}`}>{gp.name}</span>
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--tx3)'}}>{gp.date}</span>
            <span style={{fontSize:11,color:'var(--tx2)'}}>{critCount} critical / {totalNeeded} needed tasks</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--tx3)',marginBottom:4}}>
            <span>Progress: {doneCount}/{totalNeeded} done</span><span>{prog}%</span>
          </div>
          <div className="prog-wrap"><div className="prog-fill" style={{width:`${prog}%`}}/></div>
          {critCount>0&&<div style={{marginTop:6,display:'flex',gap:4,flexWrap:'wrap'}}>
            {[...gp.critical].slice(0,8).map(id=>{const r=tree.find(x=>x.id===id);return<span key={id} className="tag" style={{borderColor:'var(--re)',color:'var(--re)'}}>{id} {r?.name||''}</span>;})}
            {critCount>8&&<span style={{fontSize:10,color:'var(--tx3)'}}>+{critCount-8} more</span>}
          </div>}
        </div>;
      })}
    </>}
    <div className="section-h">Effort by team</div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:18}}>
      {Object.entries(byT).sort().map(([t,d])=>{const team=teams.find(x=>x.id===t);
        return<div key={t} className="sum-card" style={{minWidth:140}}>
          <div style={{marginBottom:6}}><TBadge t={t} teams={teams}/></div>
          <div style={{fontFamily:'var(--mono)',fontSize:18,fontWeight:600,color:team?.color||'var(--tx)'}}>{d.pt.toFixed(0)} PT</div>
          <div style={{fontSize:11,color:'var(--tx3)'}}>{d.t} tasks</div>
        </div>;})}
    </div>
    {tree.filter(r=>r.lvl===1).length>0&&<>
      <div className="section-h">Project breakdown</div>
      <table className="tree-tbl">
        <thead><tr><th>Project</th><th className="r">Best</th><th className="r">Realistic</th><th className="r">Worst</th></tr></thead>
        <tbody>{tree.filter(r=>r.lvl===1).map(r=>{const s=stats[r.id]||r;
          return<tr key={r.id} className="tr l1"><td><span className="tid">{r.id}</span><span style={{marginLeft:8}}>{r.name}</span></td>
            <td className="nc">{s._b?.toFixed(0)}</td><td className="nc g">{s._r?.toFixed(1)}</td><td className="nc">{s._w?.toFixed(0)}</td>
          </tr>;})}</tbody>
      </table>
    </>}
  </div>;
}
