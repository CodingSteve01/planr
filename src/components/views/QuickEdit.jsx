import { useState, useEffect } from 'react';
import { SBadge, PBadge, TBadge } from '../shared/Badges.jsx';
import { re } from '../../utils/scheduler.js';

export function QuickEdit({node,tree,members,teams,cpSet,onUpdate,onDelete}){
  const[f,setF]=useState({...node});
  useEffect(()=>setF({...node}),[node?.id]);
  const s=(k,v)=>{const n={...f,[k]:v};setF(n);onUpdate(n);};
  const fl=()=>onUpdate(f);
  const isCp=cpSet?.has(node?.id);
  return<>
    {isCp&&<div style={{background:'#3d0a0e',border:'1px solid var(--re)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:10,fontSize:11,color:'#fda4af',display:'flex',gap:6,alignItems:'center'}}>⚡ Critical path item</div>}
    <div className="field"><label>Name</label><input value={f.name||''} onChange={e=>setF(x=>({...x,name:e.target.value}))} onBlur={fl}/></div>
    <div className="frow">
      <div className="field"><label>Status</label>
        <select value={f.status||'open'} onChange={e=>s('status',e.target.value)}>
          <option value="open">Open</option><option value="wip">In Progress</option><option value="done">Done</option>
        </select>
      </div>
      <div className="field"><label>Team</label>
        <select value={f.team||''} onChange={e=>s('team',e.target.value)}>
          <option value="">—</option>
          {teams.map(t=><option key={t.id} value={t.id}>{t.id}</option>)}
        </select>
      </div>
    </div>
    {node.lvl===3&&<>
      <div className="frow">
        <div className="field"><label>Best (days)</label><input type="number" min="0" value={f.best||0} onChange={e=>setF(x=>({...x,best:+e.target.value}))} onBlur={fl}/></div>
        <div className="field"><label>Factor</label><input type="number" step="0.1" min="1" value={f.factor||1.5} onChange={e=>setF(x=>({...x,factor:+e.target.value}))} onBlur={fl}/></div>
      </div>
      <div className="frow">
        <div className="field"><label>Priority</label>
          <select value={f.prio||1} onChange={e=>s('prio',+e.target.value)}>
            <option value={1}>1 Critical</option><option value={2}>2 High</option><option value={3}>3 Medium</option><option value={4}>4 Low</option>
          </select>
        </div>
        <div className="field"><label>Seq</label><input type="number" value={f.seq||0} onChange={e=>setF(x=>({...x,seq:+e.target.value}))} onBlur={fl}/></div>
      </div>
      <div className="calc"><span>Realistic:</span><b>{re(f.best||0,f.factor||1.5).toFixed(1)}d</b><span>Worst:</span><b>{((f.best||0)*(f.factor||1.5)).toFixed(0)}d</b></div>
      <div className="field"><label>Assigned to</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:3,marginBottom:4}}>
          {(f.assign||[]).map(a=><span key={a} className="tag">{a}<span className="tag-x" onClick={()=>s('assign',(f.assign||[]).filter(x=>x!==a))}>×</span></span>)}
        </div>
        <select onChange={e=>{if(!e.target.value)return;s('assign',[...new Set([...(f.assign||[]),e.target.value])]);e.target.value=''}}>
          <option value="">+ Person</option>{members.map(m=><option key={m.id}>{m.id}</option>)}
        </select>
      </div>
      <div className="field"><label>Dependencies</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:3,marginBottom:4}}>
          {(f.deps||[]).map(d=><span key={d} className="tag">{d}<span className="tag-x" onClick={()=>s('deps',(f.deps||[]).filter(x=>x!==d))}>×</span></span>)}
        </div>
        <select onChange={e=>{if(!e.target.value)return;s('deps',[...new Set([...(f.deps||[]),e.target.value])]);e.target.value=''}}>
          <option value="">+ Dep</option>{tree.map(r=>r.id).filter(i=>i!==node.id).map(i=><option key={i}>{i}</option>)}
        </select>
      </div>
    </>}
    <div className="field"><label>Notes</label><textarea value={f.note||''} onChange={e=>setF(x=>({...x,note:e.target.value}))} onBlur={fl} rows={2}/></div>
    <hr className="divider"/>
    {onDelete&&<button className="btn btn-danger" style={{width:'100%'}} onClick={()=>{if(confirm(`Delete ${node.id}${node.lvl<3?' and all children':''}?`))onDelete(node.id);}}>Delete {node.id}</button>}
  </>;
}
