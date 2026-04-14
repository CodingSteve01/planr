import { useState } from 'react';
import { iso } from '../../utils/date.js';
import { computeNRW } from '../../utils/holidays.js';
import { GT, GL } from '../../constants.js';

export function NewProjModal({ onCreate, onClose }) {
  const today = iso(new Date()), twoY = iso(new Date(new Date().getFullYear() + 2, 11, 31));
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ name: '', planStart: today, planEnd: twoY, holidays: 'NRW' });
  const [ts, setTs] = useState([{ id: 'T1', name: 'Frontend', color: '#3b82f6' }, { id: 'T2', name: 'Backend', color: '#f43f5e' }]);
  const [goals, setGoals] = useState([]);
  const sf = (k, v) => setF(x => ({ ...x, [k]: v }));
  const upT = (i, k, v) => setTs(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t));
  const upG = (i, k, v) => setGoals(gs => gs.map((g, j) => j === i ? { ...g, [k]: v } : g));
  const addG = (type) => setGoals(gs => [...gs, { id: 'g' + Date.now() + gs.length, name: '', type, date: '', severity: 'high', description: '', linkedItems: [] }]);
  const toPrio = severity => severity === 'critical' ? 1 : severity === 'high' ? 2 : 3;

  function doCreate() {
    if (!f.name) return;
    const nowY = new Date().getFullYear(); const planYears = []; for (let y = Math.min(nowY - 1, new Date(f.planStart).getFullYear()); y <= Math.max(nowY + 2, new Date(f.planEnd).getFullYear()); y++) planYears.push(y);
    const hols = f.holidays === 'NRW' ? computeNRW(planYears) : [];
    const cleanGoals = goals.map(g => ({ ...g, name: (g.name || '').trim(), description: (g.description || '').trim() })).filter(g => g.name);
    const tree = cleanGoals.map((g, i) => ({
      id: `P${i + 1}`,
      name: g.name,
      status: 'open',
      team: '',
      best: 0,
      factor: 1.5,
      prio: toPrio(g.severity),
      seq: (i + 1) * 10,
      deps: [],
      note: '',
      assign: [],
      // Goal metadata directly on the tree root
      type: g.type,
      severity: g.severity || 'high',
      date: g.date || '',
      description: g.description || '',
    }));
    onCreate({ meta: { ...f, version: '2' }, teams: ts, members: [], vacations: [], tree, holidays: hols });
  }

  return <div className="overlay">
    <div className="modal modal-lg fade">
      <h2>New project {step === 2 && <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 400 }}>— Focus</span>}</h2>

      {step === 1 && <>
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
          <button className="btn btn-sec btn-sm" onClick={() => setTs(ts => [...ts, { id: `T${ts.length + 1}`, name: '', color: '#a78bfa' }])}>+ Add team</button>
        </div>
        {ts.map((t, i) => <div key={i} className="frow" style={{ alignItems: 'flex-end', marginBottom: 6 }}>
          <div className="field" style={{ flex: '0 0 70px' }}><label>ID</label><input value={t.id} onChange={e => upT(i, 'id', e.target.value)} /></div>
          <div className="field"><label>Name</label><input value={t.name} onChange={e => upT(i, 'name', e.target.value)} placeholder="Team name" /></div>
          <div className="field" style={{ flex: '0 0 55px' }}><label>Color</label><input type="color" value={t.color} onChange={e => upT(i, 'color', e.target.value)} /></div>
          <div style={{ marginBottom: 12 }}><button className="btn btn-danger btn-sm" onClick={() => setTs(ts => ts.filter((_, j) => j !== i))}>Remove</button></div>
        </div>)}
        <div className="modal-footer">
          <button className="btn btn-sec" onClick={onClose}>Cancel</button>
          <button className="btn btn-pri" disabled={!f.name} onClick={() => setStep(2)}>Next →</button>
        </div>
      </>}

      {step === 2 && <>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>Start with the big topics: goals, painpoints, and deadlines. Planr will create them as top-level items so you can break them down into causes, measures, and leaf tasks afterwards.</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {Object.keys(GT).map(t => <button key={t} className="goal-type-btn" onClick={() => addG(t)}>{GT[t]} Add {GL[t]}</button>)}
        </div>
        {goals.map((g, i) => <div key={g.id} style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 10, marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>{GT[g.type]}</span>
            <input style={{ flex: 1, background: 'var(--bg4)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', color: 'var(--tx)', fontSize: 12, padding: '5px 8px', outline: 'none' }} placeholder={GL[g.type] + ' name'} value={g.name} onChange={e => upG(i, 'name', e.target.value)} />
            {g.type === 'deadline' && <input type="date" style={{ width: 130, background: 'var(--bg4)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', color: 'var(--tx)', fontSize: 11, padding: '5px 6px', outline: 'none' }} value={g.date || ''} onChange={e => upG(i, 'date', e.target.value)} />}
            <button className="btn btn-danger btn-xs" onClick={() => setGoals(gs => gs.filter((_, j) => j !== i))}>Remove</button>
          </div>
          <input style={{ width: '100%', background: 'var(--bg4)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', color: 'var(--tx2)', fontSize: 11, padding: '4px 8px', outline: 'none' }} placeholder="Description (optional)" value={g.description || ''} onChange={e => upG(i, 'description', e.target.value)} />
        </div>)}
        {!goals.length && <div style={{ textAlign: 'center', padding: 24, color: 'var(--tx3)', fontSize: 11 }}>No focus items yet. Add some above, or skip this step.</div>}
        <div className="modal-footer">
          <button className="btn btn-sec" onClick={() => setStep(1)}>← Back</button>
          <button className="btn btn-pri" onClick={doCreate}>Create project</button>
        </div>
      </>}
    </div>
  </div>;
}
