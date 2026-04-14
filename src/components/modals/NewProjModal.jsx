import { useState } from 'react';
import { iso } from '../../utils/date.js';
import { computeNRW } from '../../utils/holidays.js';

export function NewProjModal({ onCreate, onClose }) {
  const today = iso(new Date()), twoY = iso(new Date(new Date().getFullYear() + 2, 11, 31));
  const [f, setF] = useState({ name: '', planStart: today, planEnd: twoY, holidays: 'NRW' });
  const [ts, setTs] = useState([{ id: 'T1', name: 'Frontend', color: '#3b82f6' }, { id: 'T2', name: 'Backend', color: '#f43f5e' }]);
  const sf = (k, v) => setF(x => ({ ...x, [k]: v }));
  const upT = (i, k, v) => setTs(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t));
  return <div className="overlay">
    <div className="modal modal-lg fade">
      <h2>New project</h2>
      <div className="field"><label>Project name</label>
        <input value={f.name} onChange={e => sf('name', e.target.value)} placeholder="My project" autoFocus />
      </div>
      <div className="frow">
        <div className="field"><label>Plan start</label><input type="date" value={f.planStart} onChange={e => sf('planStart', e.target.value)} /></div>
        <div className="field"><label>Plan end</label><input type="date" value={f.planEnd} onChange={e => sf('planEnd', e.target.value)} /></div>
        <div className="field"><label>Holidays</label>
          <select value={f.holidays} onChange={e => sf('holidays', e.target.value)}>
            <option value="NRW">Germany — NRW</option><option value="none">None</option>
          </select>
        </div>
      </div>
      <hr className="divider" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>Teams</div>
        <button className="btn btn-sec btn-sm" onClick={() => setTs(ts => [...ts, { id: `T${ts.length + 1}`, name: '', color: '#a78bfa' }])}>+ Team</button>
      </div>
      {ts.map((t, i) => <div key={i} className="frow" style={{ alignItems: 'flex-end', marginBottom: 6 }}>
        <div className="field" style={{ flex: '0 0 70px' }}><label>ID</label><input value={t.id} onChange={e => upT(i, 'id', e.target.value)} /></div>
        <div className="field"><label>Name</label><input value={t.name} onChange={e => upT(i, 'name', e.target.value)} placeholder="Team name" /></div>
        <div className="field" style={{ flex: '0 0 55px' }}><label>Color</label><input type="color" value={t.color} onChange={e => upT(i, 'color', e.target.value)} /></div>
        <div style={{ marginBottom: 12 }}><button className="btn btn-danger btn-sm" onClick={() => setTs(ts => ts.filter((_, j) => j !== i))}>x</button></div>
      </div>)}
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" disabled={!f.name} onClick={() => {
          if (!f.name) return;
          const planYears = []; for (let y = new Date(f.planStart).getFullYear(); y <= new Date(f.planEnd).getFullYear(); y++) planYears.push(y);
          const hols = f.holidays === 'NRW' ? computeNRW(planYears) : [];
          onCreate({ meta: { ...f, version: '2' }, teams: ts, members: [], deadlines: [], vacations: [], tree: [], holidays: hols });
        }}>Create project</button>
      </div>
    </div>
  </div>;
}
