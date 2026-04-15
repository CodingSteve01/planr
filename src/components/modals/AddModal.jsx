import { useState, useMemo, useEffect } from 'react';
import { nextChildId } from '../../utils/scheduler.js';
import { GT, GL } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';

export function AddModal({ tree, teams, selected, onAdd, onClose }) {
  const defParent = useMemo(() => selected?.id || '', [selected]);

  const parents = useMemo(() => {
    const opts = [{ id: '', label: '— New top item —' }];
    tree.forEach(r => opts.push({ id: r.id, label: `${r.id} — ${r.name} (add child)` }));
    return opts;
  }, [tree]);

  const [pid, setPid] = useState(defParent);
  const autoId = nextChildId(tree, pid);
  const autoLvl = pid ? pid.split('.').length + 1 : 1;
  const parentNode = useMemo(() => tree.find(r => r.id === pid) || null, [tree, pid]);
  const isTopLevel = !pid;

  const [f, setF] = useState({ name: '', status: 'open', team: '', best: 0, factor: 1.5, prio: 2, seq: 10, deps: [], note: '', assign: [], type: '', severity: 'high', date: '', description: '' });
  const s = (k, v) => setF(x => ({ ...x, [k]: v }));

  const isDirty = !!f.name; // only "dirty" once user has typed something
  const safeClose = () => { if (isDirty && !confirm('Discard this new item?')) return; onClose(); };
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') safeClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isDirty]);

  return <div className="overlay" onClick={safeClose}>
    <div className="modal fade" onClick={e => e.stopPropagation()}>
      <h2>Add {isTopLevel ? 'focus item' : 'child item'}</h2>
      <div className="frow">
        <div className="field"><label>Parent</label>
          <SearchSelect value={pid} options={parents} onSelect={v => setPid(v)} placeholder="— New top item —" />
        </div>
        <div className="field" style={{ flex: '0 0 120px' }}><label>ID (auto)</label>
          <input value={autoId} readOnly style={{ opacity: .7, cursor: 'default' }} tabIndex={-1} />
          <p className="helper">Level {autoLvl}{parentNode ? ` under ${parentNode.id}` : ' — top level'}</p>
        </div>
      </div>
      <div className="field"><label>Name</label><input value={f.name} onChange={e => s('name', e.target.value)} placeholder={isTopLevel ? 'Goal, painpoint, or deadline name' : 'Task name'} autoFocus /></div>

      {isTopLevel && <>
        <div className="frow">
          <div className="field"><label>Focus type</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['goal', 'painpoint', 'deadline'].map(t =>
                <button key={t} type="button" className={`goal-type-btn${f.type === t ? ' active' : ''}`} onClick={() => s('type', f.type === t ? '' : t)}>{GT[t]} {GL[t]}</button>)}
            </div>
          </div>
          {f.type && <div className="field" style={{ flex: '0 0 110px' }}><label>Severity</label>
            <SearchSelect value={f.severity} options={[{ id: 'critical', label: 'Critical' }, { id: 'high', label: 'High' }, { id: 'medium', label: 'Medium' }]} onSelect={v => s('severity', v)} />
          </div>}
          {f.type === 'deadline' && <div className="field" style={{ flex: '0 0 140px' }}><label>Date</label><input type="date" value={f.date} onChange={e => s('date', e.target.value)} /></div>}
        </div>
        {f.type && <div className="field"><label>Description</label><input value={f.description} onChange={e => s('description', e.target.value)} placeholder="Why does this matter?" /></div>}
        <div className="field"><label>Team (optional)</label>
          <SearchSelect value={f.team} options={teams.map(t => ({ id: t.id, label: t.name }))} onSelect={v => s('team', v)} placeholder="Choose team..." allowEmpty />
        </div>
      </>}

      {!isTopLevel && <>
        <div className="frow">
          <div className="field"><label>Team</label>
            <SearchSelect value={f.team} options={teams.map(t => ({ id: t.id, label: t.name }))} onSelect={v => s('team', v)} placeholder="Choose team..." allowEmpty />
          </div>
          <div className="field"><label>Status</label>
            <SearchSelect value={f.status} options={[{ id: 'open', label: 'Open' }, { id: 'wip', label: 'In Progress' }, { id: 'done', label: 'Done' }]} onSelect={v => s('status', v)} />
          </div>
        </div>
        <div className="field"><label>Quick estimate (optional)</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[['XS', 1, 1.3], ['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]].map(([sz, d, fc]) =>
              <button key={sz} type="button" className={`btn ${f.best === d ? 'btn-pri' : 'btn-sec'} btn-sm`}
                onClick={() => { s('best', d); s('factor', fc); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{d}d</span></button>)}
          </div>
          <p className="helper">Leave at 0 for structural grouping items — estimates aggregate from children.</p>
        </div>
        <div className="frow">
          <div className="field"><label>Best (days)</label><input type="number" min="0" value={f.best} onChange={e => s('best', +e.target.value)} /></div>
          <div className="field"><label>Factor</label><input type="number" step="0.1" min="1" value={f.factor} onChange={e => s('factor', +e.target.value)} /></div>
          <div className="field"><label>Priority</label>
            <SearchSelect value={String(f.prio)} options={[{ id: '1', label: '1 Critical' }, { id: '2', label: '2 High' }, { id: '3', label: '3 Medium' }, { id: '4', label: '4 Low' }]} onSelect={v => s('prio', +v)} />
          </div>
        </div>
      </>}
      <div className="field"><label>Notes</label><textarea value={f.note} onChange={e => s('note', e.target.value)} rows={2} /></div>
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={safeClose}>Cancel</button>
        <button className="btn btn-pri" disabled={!f.name}
          onClick={() => { if (!f.name) return; const item = { ...f, id: autoId, lvl: autoLvl }; if (!isTopLevel) { delete item.type; delete item.severity; delete item.date; delete item.description; } onAdd(item); onClose(); }}>Add {isTopLevel ? 'focus item' : 'child item'}</button>
      </div>
    </div>
  </div>;
}
