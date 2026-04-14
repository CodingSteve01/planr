import { useState, useMemo } from 'react';
import { nextChildId } from '../../utils/scheduler.js';

export function AddModal({ tree, teams, selected, onAdd, onClose }) {
  const defParent = useMemo(() => {
    if (!selected) return '';
    if (selected.lvl === 1 || selected.lvl === 2) return selected.id;
    if (selected.lvl === 3) return selected.id.split('.').slice(0, -1).join('.');
    return '';
  }, [selected]);

  const parents = useMemo(() => {
    const opts = [{ id: '', label: '— New project (top level)' }];
    tree.filter(r => r.lvl === 1).forEach(r => opts.push({ id: r.id, label: `${r.id} — ${r.name} (add group)` }));
    tree.filter(r => r.lvl === 2).forEach(r => opts.push({ id: r.id, label: `${r.id} — ${r.name} (add task)` }));
    return opts;
  }, [tree]);

  const [pid, setPid] = useState(defParent);
  const autoId = nextChildId(tree, pid);
  const autoLvl = pid ? pid.split('.').length + 1 : 1;
  const lvlLabel = autoLvl === 1 ? 'Project' : autoLvl === 2 ? 'Group' : 'Task';

  const [f, setF] = useState({ name: '', status: 'open', team: teams[0]?.id || '', best: 5, factor: 1.5, prio: 2, seq: 10, deps: [], note: '', assign: [] });
  const s = (k, v) => setF(x => ({ ...x, [k]: v }));

  return <div className="overlay" onClick={onClose}>
    <div className="modal fade" onClick={e => e.stopPropagation()}>
      <h2>Add {lvlLabel.toLowerCase()}</h2>
      <div className="frow">
        <div className="field"><label>Parent</label>
          <select value={pid} onChange={e => setPid(e.target.value)}>
            {parents.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: '0 0 120px' }}><label>ID (auto)</label>
          <input value={autoId} readOnly style={{ opacity: .7, cursor: 'default' }} tabIndex={-1} />
          <p className="helper">Level {autoLvl} — {lvlLabel}</p>
        </div>
      </div>
      <div className="field"><label>Name</label><input value={f.name} onChange={e => s('name', e.target.value)} placeholder={`${lvlLabel} name`} autoFocus /></div>
      <div className="frow">
        <div className="field"><label>Team</label>
          <select value={f.team} onChange={e => s('team', e.target.value)}>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}
          </select>
        </div>
        <div className="field"><label>Status</label>
          <select value={f.status} onChange={e => s('status', e.target.value)}>
            <option value="open">Open</option><option value="wip">In Progress</option><option value="done">Done</option>
          </select>
        </div>
      </div>
      {autoLvl === 3 && <><div className="field"><label>Quick estimate</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['XS', 1, 1.3], ['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]].map(([sz, d, fc]) =>
            <button key={sz} type="button" className={`btn ${f.best === d ? 'btn-pri' : 'btn-sec'} btn-sm`}
              onClick={() => { s('best', d); s('factor', fc); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{d}d</span></button>)}
        </div>
      </div>
      <div className="frow">
        <div className="field"><label>Best (days)</label><input type="number" min="0" value={f.best} onChange={e => s('best', +e.target.value)} /></div>
        <div className="field"><label>Factor</label><input type="number" step="0.1" min="1" value={f.factor} onChange={e => s('factor', +e.target.value)} /></div>
        <div className="field"><label>Priority</label>
          <select value={f.prio} onChange={e => s('prio', +e.target.value)}>
            <option value={1}>1 Critical</option><option value={2}>2 High</option><option value={3}>3 Medium</option><option value={4}>4 Low</option>
          </select>
        </div>
      </div></>}
      <div className="field"><label>Notes</label><textarea value={f.note} onChange={e => s('note', e.target.value)} rows={2} /></div>
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" disabled={!f.name}
          onClick={() => { if (!f.name) return; onAdd({ ...f, id: autoId, lvl: autoLvl }); onClose(); }}>Add {lvlLabel.toLowerCase()}</button>
      </div>
    </div>
  </div>;
}
