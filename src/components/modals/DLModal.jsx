import { useState } from 'react';
import { GT, GL } from '../../constants.js';

export function DLModal({ goals, tree, onSave, onClose }) {
  // Edit goal metadata on tree roots
  const [items, setItems] = useState(goals.map(g => ({ id: g.id, name: g.name, type: g.type || 'goal', severity: g.severity || 'high', date: g.date || '', description: g.description || '' })));
  const upd = (i, k, v) => setItems(its => its.map((x, j) => j === i ? { ...x, [k]: v } : x));

  // Tree roots without a type yet
  const roots = tree.filter(r => !r.id.includes('.'));
  const untyped = roots.filter(r => !items.some(g => g.id === r.id));

  return <div className="overlay">
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      <h2>Edit Focus</h2>
      <p className="helper" style={{ marginBottom: 14 }}>Set the type, priority, and deadline for your top-level items.</p>
      {items.map((g, i) => <div key={g.id} style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 12, marginBottom: 8, borderLeft: `3px solid ${g.type === 'deadline' ? 'var(--re)' : g.type === 'painpoint' ? 'var(--am)' : 'var(--ac)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{g.id}</span>
          <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{g.name}</span>
          <button className="btn btn-danger btn-xs" onClick={() => upd(i, 'type', '')}>Unset type</button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {['goal', 'painpoint', 'deadline'].map(t =>
            <button key={t} className={`goal-type-btn${g.type === t ? ' active' : ''}`} onClick={() => upd(i, 'type', t)}>{GT[t]} {GL[t]}</button>)}
        </div>
        <div className="frow">
          <div className="field" style={{ flex: '0 0 100px' }}><label>Priority</label>
            <select value={g.severity || 'high'} onChange={e => upd(i, 'severity', e.target.value)}>
              <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option>
            </select>
          </div>
          {g.type === 'deadline' && <div className="field" style={{ flex: '0 0 160px' }}><label>Deadline date</label><input type="date" value={g.date || ''} onChange={e => upd(i, 'date', e.target.value)} /></div>}
          <div className="field"><label>Description</label><input value={g.description || ''} onChange={e => upd(i, 'description', e.target.value)} placeholder="Why does this matter?" /></div>
        </div>
      </div>)}
      {untyped.length > 0 && <>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', margin: '12px 0 6px' }}>Untyped top-level items</div>
        {untyped.map(r => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 'var(--r)', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{r.id}</span>
          <span style={{ flex: 1, fontSize: 12 }}>{r.name}</span>
          {['goal', 'painpoint', 'deadline'].map(t =>
            <button key={t} className="goal-type-btn" style={{ fontSize: 10, padding: '3px 6px' }}
              onClick={() => setItems(its => [...its, { id: r.id, name: r.name, type: t, severity: 'high', date: '', description: '' }])}>{GT[t]}</button>)}
        </div>)}
      </>}
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" onClick={() => { onSave(items.filter(g => g.type)); onClose(); }}>Save</button>
      </div>
    </div>
  </div>;
}
