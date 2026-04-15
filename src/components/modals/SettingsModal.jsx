import { useState } from 'react';

export function SettingsModal({ meta, onSave, onClose }) {
  const [m, setM] = useState({ ...meta });
  const sm = (k, v) => setM(x => ({ ...x, [k]: v }));
  return <div className="overlay" onClick={onClose}>
    <div className="modal fade" onClick={e => e.stopPropagation()}>
      <h2>Project Settings</h2>
      <div className="field"><label>Project name</label><input value={m.name || ''} onChange={e => sm('name', e.target.value)} /></div>
      <div className="frow">
        <div className="field"><label>Plan start</label><input type="date" value={m.planStart || ''} onChange={e => sm('planStart', e.target.value)} /></div>
        <div className="field"><label>Plan end</label><input type="date" value={m.planEnd || ''} onChange={e => sm('planEnd', e.target.value)} /></div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" onClick={() => { onSave(m); onClose(); }}>Save</button>
      </div>
    </div>
  </div>;
}
