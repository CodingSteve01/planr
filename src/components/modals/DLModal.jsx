import { useState } from 'react';

export function DLModal({ deadlines, tree, onSave, onClose }) {
  const [items, setItems] = useState(deadlines.map(d => ({ ...d })));
  const upd = (i, k, v) => setItems(its => its.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const allIds = tree.map(r => r.id);
  return <div className="overlay" onClick={onClose}>
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      <h2>Deadlines</h2>
      {items.map((dl, i) => <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 12, marginBottom: 8 }}>
        <div className="frow">
          <div className="field"><label>Name</label><input value={dl.name} onChange={e => upd(i, 'name', e.target.value)} /></div>
          <div className="field" style={{ flex: '0 0 140px' }}><label>Date</label><input type="date" value={dl.date || ''} onChange={e => upd(i, 'date', e.target.value)} /></div>
          <div className="field" style={{ flex: '0 0 100px' }}><label>Severity</label>
            <select value={dl.severity || 'high'} onChange={e => upd(i, 'severity', e.target.value)}>
              <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option>
            </select>
          </div>
        </div>
        <div className="field"><label>Description</label><input value={dl.description || ''} onChange={e => upd(i, 'description', e.target.value)} /></div>
        <div className="field"><label>Linked items</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
            {(dl.linkedItems || []).map(id => <span key={id} className="tag">{id}<span className="tag-x" onClick={() => upd(i, 'linkedItems', (dl.linkedItems || []).filter(v => v !== id))}>×</span></span>)}
          </div>
          <select onChange={e => { if (!e.target.value) return; const c = dl.linkedItems || []; if (!c.includes(e.target.value)) upd(i, 'linkedItems', [...c, e.target.value]); e.target.value = ''; }}>
            <option value="">+ Link item</option>{allIds.map(id => <option key={id}>{id}</option>)}
          </select>
        </div>
        <button className="btn btn-danger btn-xs" onClick={() => setItems(its => its.filter((_, j) => j !== i))}>Remove</button>
      </div>)}
      <button className="add-btn" style={{ width: '100%', marginBottom: 14 }} onClick={() => setItems(its => [...its, { id: `dl${Date.now()}`, name: '', date: '', description: '', severity: 'high', linkedItems: [] }])}>+ Add deadline</button>
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" onClick={() => { onSave(items); onClose(); }}>Save</button>
      </div>
    </div>
  </div>;
}
