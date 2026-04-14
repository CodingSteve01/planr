import { useState } from 'react';

export function SettingsModal({ meta, teams, onSave, onClose }) {
  const [m, setM] = useState({ ...meta }); const [ts, setTs] = useState(teams.map(t => ({ ...t })));
  const sm = (k, v) => setM(x => ({ ...x, [k]: v }));
  const upT = (i, k, v) => setTs(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t));
  return <div className="overlay" onClick={onClose}>
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      <h2>Project Settings</h2>
      <div className="field"><label>Project name</label><input value={m.name || ''} onChange={e => sm('name', e.target.value)} /></div>
      <div className="frow">
        <div className="field"><label>Plan start</label><input type="date" value={m.planStart || ''} onChange={e => sm('planStart', e.target.value)} /></div>
        <div className="field"><label>Plan end</label><input type="date" value={m.planEnd || ''} onChange={e => sm('planEnd', e.target.value)} /></div>
      </div>
      <hr className="divider" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>Teams</div>
        <button className="btn btn-sec btn-sm" onClick={() => setTs(ts => [...ts, { id: `T${ts.length + 1}`, name: 'New Team', color: '#3b82f6' }])}>+ Team</button>
      </div>
      {ts.map((t, i) => <div key={i} className="frow" style={{ alignItems: 'flex-end', marginBottom: 6 }}>
        <div className="field" style={{ flex: '0 0 70px' }}><label>ID</label><input value={t.id} onChange={e => upT(i, 'id', e.target.value)} /></div>
        <div className="field"><label>Name</label><input value={t.name} onChange={e => upT(i, 'name', e.target.value)} /></div>
        <div className="field" style={{ flex: '0 0 55px' }}><label>Color</label><input type="color" value={t.color || '#3b82f6'} onChange={e => upT(i, 'color', e.target.value)} /></div>
        <div style={{ marginBottom: 12 }}><button className="btn btn-danger btn-sm" onClick={() => setTs(ts => ts.filter((_, j) => j !== i))}>x</button></div>
      </div>)}
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" onClick={() => { onSave(m, ts); onClose(); }}>Save</button>
      </div>
    </div>
  </div>;
}
