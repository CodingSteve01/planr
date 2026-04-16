import { useState } from 'react';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 … Sat=6, Sun=0

export function SettingsModal({ meta, onSave, onClose }) {
  const [m, setM] = useState({ ...meta });
  const sm = (k, v) => setM(x => ({ ...x, [k]: v }));
  const wd = m.workDays || [1, 2, 3, 4, 5]; // default Mon–Fri
  const toggleDay = (day) => {
    const next = wd.includes(day) ? wd.filter(d => d !== day) : [...wd, day].sort((a, b) => {
      const ai = DAY_NUMBERS.indexOf(a), bi = DAY_NUMBERS.indexOf(b);
      return ai - bi;
    });
    sm('workDays', next);
  };
  return <div className="overlay">
    <div className="modal fade" onClick={e => e.stopPropagation()}>
      <h2>Project Settings</h2>
      <div className="field"><label>Project name</label><input value={m.name || ''} onChange={e => sm('name', e.target.value)} /></div>
      <div className="frow">
        <div className="field"><label>Plan start</label><input type="date" value={m.planStart || ''} onChange={e => sm('planStart', e.target.value)} /></div>
        <div className="field"><label>Plan end</label><input type="date" value={m.planEnd || ''} onChange={e => sm('planEnd', e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Working days</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {DAY_NUMBERS.map((day, i) => (
            <button key={day}
              className={`btn btn-xs ${wd.includes(day) ? 'btn-pri' : 'btn-sec'}`}
              onClick={() => toggleDay(day)}
              style={{ flex: 1, padding: '6px 0', fontSize: 11 }}
              title={wd.includes(day) ? `${DAY_LABELS[i]} is a working day — click to disable` : `${DAY_LABELS[i]} is off — click to enable`}>
              {DAY_LABELS[i]}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>Non-working days are grayed out in the day view and skipped by the scheduler.</p>
      </div>
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" onClick={() => { onSave(m); onClose(); }}>Save</button>
      </div>
    </div>
  </div>;
}
