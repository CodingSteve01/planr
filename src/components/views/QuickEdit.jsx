import { useState, useEffect } from 'react';
import { SBadge, PBadge, TBadge } from '../shared/Badges.jsx';
import { directChildren, hasChildren, isLeafNode, leafNodes, leafProgress, re } from '../../utils/scheduler.js';
import { GT, GL } from '../../constants.js';

export function QuickEdit({node,tree,members,teams,cpSet,stats,onUpdate,onDelete,onEstimate}){
  const[f,setF]=useState({...node});
  useEffect(()=>setF({...node}),[node?.id]);
  const s=(k,v)=>{const n={...f,[k]:v};setF(n);onUpdate(n);};
  const fl=()=>onUpdate(f);
  const isCp=cpSet?.has(node?.id);
  const isLeaf=isLeafNode(tree,node);
  return<>
    {isCp&&<div style={{background:'#3d0a0e',border:'1px solid var(--re)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:10,fontSize:11,color:'#fda4af',display:'flex',gap:6,alignItems:'center'}}>⚡ Critical path item</div>}
    <div className="field"><label>Name</label><input value={f.name||''} onChange={e=>setF(x=>({...x,name:e.target.value}))} onBlur={fl}/></div>
    {!node?.id?.includes('.')&&<>
      <div className="field"><label>Focus type</label>
        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
          {['','goal','painpoint','deadline'].map(t=>
            <button key={t} className={`goal-type-btn${(f.type||'')===t?' active':''}`} style={{fontSize:10,padding:'3px 7px'}}
              onClick={()=>s('type',t)}>{t?`${GT[t]} ${GL[t]}`:'— None'}</button>)}
        </div>
      </div>
      {f.type&&<div className="frow">
        <div className="field"><label>Severity</label>
          <select value={f.severity||'high'} onChange={e=>s('severity',e.target.value)}>
            <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option>
          </select>
        </div>
        {f.type==='deadline'&&<div className="field"><label>Date</label><input type="date" value={f.date||''} onChange={e=>s('date',e.target.value)}/></div>}
      </div>}
      {f.type&&<div className="field"><label>Description</label><input value={f.description||''} onChange={e=>setF(x=>({...x,description:e.target.value}))} onBlur={fl} placeholder="Why does this matter?"/></div>}
    </>}
    <div className="frow">
      <div className="field"><label>Status</label>
        {isLeaf
          ? <select value={f.status||'open'} onChange={e=>s('status',e.target.value)}>
            <option value="open">Open</option><option value="wip">In Progress</option><option value="done">Done</option>
          </select>
          : <div className={`badge b${(f.status||'open')[0]}`}>Auto from children</div>}
      </div>
      <div className="field"><label>Team</label>
        <select value={f.team||''} onChange={e=>s('team',e.target.value)}>
          <option value="">— None —</option>
          {teams.map(t=><option key={t.id} value={t.id}>{t.name || t.id}</option>)}
        </select>
      </div>
    </div>
    {!isLeaf&&(()=>{
      const st=stats?.[node.id];
      const childCount=directChildren(tree,node.id).length;
      const lvs=leafNodes(tree).filter(c=>c.id.startsWith(node.id+'.'));
      const doneCount=lvs.filter(c=>c.status==='done').length;
      const prog=st?._progress||0;
      return<div style={{background:'var(--bg3)',borderRadius:'var(--r)',padding:'8px 10px',marginBottom:10,fontSize:11}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
          <span style={{color:'var(--tx3)'}}>{childCount} children · {lvs.length} leafs</span>
          <span style={{fontFamily:'var(--mono)',color:prog>=100?'var(--gr)':prog>0?'var(--am)':'var(--tx3)'}}>{prog}%</span>
        </div>
        <div className="prog-wrap" style={{height:4,marginBottom:6}}><div className="prog-fill" style={{width:`${prog}%`}}/></div>
        <div style={{display:'flex',gap:12,fontFamily:'var(--mono)',fontSize:10,color:'var(--tx2)'}}>
          {st?._r>0&&<span>{st._r.toFixed(0)}d effort</span>}
          <span>{doneCount}/{lvs.length} done</span>
        </div>
        {st?._startD&&<div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--tx3)',marginTop:4}}>
          {st._startD.toLocaleDateString('de-DE')} — {st._endD.toLocaleDateString('de-DE')}
        </div>}
      </div>;
    })()}
    {isLeaf&&<div className="field"><label>Progress {f.progress??leafProgress(f)}%</label>
      <input type="range" min="0" max="100" step="5" value={f.progress??leafProgress(f)}
        onChange={e=>{const v=+e.target.value;s('progress',v);if(v>=100&&f.status!=='done')s('status','done');else if(v>0&&v<100&&f.status!=='wip')s('status','wip');else if(v===0&&f.status!=='open')s('status','open');}}
        style={{width:'100%',accentColor:'var(--ac)'}}/>
    </div>}
    {isLeaf&&<>
      {onEstimate&&<button className="btn btn-sec btn-sm" style={{width:'100%',marginBottom:10}} onClick={()=>onEstimate(node)}>Estimation Wizard...</button>}
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
          {(f.assign||[]).map(a=>{const m=members.find(x=>x.id===a);return<span key={a} className="tag">{m?.name||a}<span className="tag-x" onClick={()=>s('assign',(f.assign||[]).filter(x=>x!==a))}>×</span></span>;})}
        </div>
        <select onChange={e=>{if(!e.target.value)return;s('assign',[...new Set([...(f.assign||[]),e.target.value])]);e.target.value=''}}>
          <option value="">+ Person</option>{members.map(m=><option key={m.id} value={m.id}>{m.name||m.id}</option>)}
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
    {onDelete&&<button className="btn btn-danger" style={{width:'100%'}} onClick={()=>{if(confirm(`Delete ${node.id}${hasChildren(tree,node.id)?' and all children':''}?`))onDelete(node.id);}}>Delete item</button>}
  </>;
}
