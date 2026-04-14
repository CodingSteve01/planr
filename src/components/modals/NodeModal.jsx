import { useState, useEffect } from 'react';
import { SBadge } from '../shared/Badges.jsx';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { re } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';

export function NodeModal({ node, tree, members, teams, scheduled, cpSet, stats, onClose, onUpdate, onDelete, onEstimate }) {
  const [f, setF] = useState({ ...node });
  useEffect(() => setF({ ...node }), [node?.id]);
  const sc = scheduled?.find(s => s.id === node?.id);
  const isCp = cpSet?.has(node?.id);
  if (!node) return null;
  const s = (k, v) => setF(x => ({ ...x, [k]: v }));
  const allIds = tree.map(r => r.id).filter(i => i !== node.id);
  return <div className="overlay" onClick={onClose}>
    <div className="modal fade" onClick={e => e.stopPropagation()}>
      <h2>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', fontSize: 13 }}>{node.id}</span>
        {node.lvl === 3 && <SBadge s={node.status} />}
        {isCp && <span className="badge b-cp">Critical Path</span>}
      </h2>
      <div className="field"><label>Name</label><input value={f.name || ''} onChange={e => s('name', e.target.value)} /></div>
      <div className="frow">
        <div className="field"><label>Status</label>
          <select value={f.status || 'open'} onChange={e => s('status', e.target.value)}>
            <option value="open">Open</option><option value="wip">In Progress</option><option value="done">Done</option>
          </select>
        </div>
        <div className="field"><label>Team</label>
          <select value={f.team || ''} onChange={e => s('team', e.target.value)}>
            <option value="">— None —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
          </select>
        </div>
      </div>
      {node.lvl < 3 && (() => {
        const st = stats?.[node.id];
        const childCount = tree.filter(c => c.id.startsWith(node.id + '.') && c.lvl === node.lvl + 1).length;
        const leafCount = tree.filter(c => c.lvl === 3 && c.id.startsWith(node.id + '.')).length;
        const doneCount = tree.filter(c => c.lvl === 3 && c.id.startsWith(node.id + '.') && c.status === 'done').length;
        return <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--tx2)' }}>Aggregated from {leafCount} tasks</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontFamily: 'var(--mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--tx3)' }}>Progress</span><span>{doneCount}/{leafCount} done ({leafCount > 0 ? Math.round(doneCount / leafCount * 100) : 0}%)</span>
            <span style={{ color: 'var(--tx3)' }}>Best</span><span>{st?._b?.toFixed(0) || 0}d</span>
            <span style={{ color: 'var(--tx3)' }}>Realistic</span><span style={{ color: 'var(--am)' }}>{st?._r?.toFixed(1) || 0}d</span>
            <span style={{ color: 'var(--tx3)' }}>Worst</span><span>{st?._w?.toFixed(0) || 0}d</span>
            {st?._startD && <><span style={{ color: 'var(--tx3)' }}>Scheduled</span><span>{st._startD.toLocaleDateString('de-DE')} — {st._endD.toLocaleDateString('de-DE')}</span></>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6 }}>Status, estimates, and dates are derived from child tasks.</div>
        </div>;
      })()}
      {node.lvl === 3 && <>
        {onEstimate && <button className="btn btn-sec" style={{ width: '100%', marginBottom: 12 }} onClick={() => { onClose(); onEstimate(node); }}>Open Estimation Wizard...</button>}
        <div className="field"><label>Quick estimate (T-shirt size)</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['XS', 1, 1.3], ['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]].map(([sz, d, fc]) =>
              <button key={sz} className={`btn ${f.best === d ? 'btn-pri' : 'btn-sec'} btn-sm`}
                onClick={() => { s('best', d); s('factor', fc); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 3 }}>{d}d</span></button>)}
          </div>
        </div>
        <div className="frow">
          <div className="field"><label>Best case (days)</label><input type="number" min="0" value={f.best || 0} onChange={e => s('best', +e.target.value)} /></div>
          <div className="field"><label>Uncertainty factor</label><input type="number" step="0.1" min="1" max="5" value={f.factor || 1.5} onChange={e => s('factor', +e.target.value)} /></div>
        </div>
        <div className="frow">
          <div className="field"><label>Priority</label>
            <select value={f.prio || 1} onChange={e => s('prio', +e.target.value)}>
              <option value={1}>1 — Critical</option><option value={2}>2 — High</option>
              <option value={3}>3 — Medium</option><option value={4}>4 — Low</option>
            </select>
          </div>
          <div className="field"><label>Sequence</label><input type="number" value={f.seq || 0} onChange={e => s('seq', +e.target.value)} /></div>
        </div>
        <div className="calc">
          <span>Realistic:</span><b>{re(f.best || 0, f.factor || 1.5).toFixed(1)}d</b>
          <span>Worst:</span><b>{((f.best || 0) * (f.factor || 1.5)).toFixed(0)}d</b>
          {sc && <><span>Scheduled:</span><b>{iso(sc.startD)} → {iso(sc.endD)}</b></>}
          {isCp && <span className="cp">On critical path</span>}
        </div>
        <div className="field"><label>Assignee</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {(f.assign || []).map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(x => x !== a))}>×</span></span>; })}
          </div>
          <select onChange={e => { if (!e.target.value) return; s('assign', [...new Set([...(f.assign || []), e.target.value])]); e.target.value = ''; }}>
            <option value="">+ Assign person</option>
            {members.filter(m => !f.team || m.team === f.team || (f.team || '').includes(m.team)).map(m => (
              <option key={m.id} value={m.id}>{m.name || m.id}{m.team ? ` (${teams.find(t => t.id === m.team)?.name || m.team})` : ''}</option>
            ))}
            {f.team && <option disabled>───</option>}
            {f.team && members.filter(m => m.team !== f.team && !(f.team || '').includes(m.team)).map(m => (
              <option key={m.id} value={m.id}>{m.name || m.id}{m.team ? ` (${teams.find(t => t.id === m.team)?.name || m.team})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="field"><label>Dependencies</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
            {(f.deps || []).map(d => { const dn = tree.find(r => r.id === d); const lbl = (f._depLabels || {})[d] || ''; return <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="tag" style={{ flexShrink: 0 }}>{d} {dn?.name ? `— ${dn.name}` : ''}<span className="tag-x" onClick={() => { s('deps', (f.deps || []).filter(x => x !== d)); const dl = { ...(f._depLabels || {}) }; delete dl[d]; s('_depLabels', dl); }}>×</span></span>
              <input value={lbl} onChange={e => s('_depLabels', { ...(f._depLabels || {}), [d]: e.target.value })} placeholder="label (optional)" style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 4, color: 'var(--tx)', fontSize: 10, padding: '2px 6px', outline: 'none', fontFamily: 'var(--mono)' }} />
            </div>; })}
          </div>
          <SearchSelect
            options={allIds.map(i => { const n = tree.find(r => r.id === i); return { id: i, label: n?.name || '' }; })}
            onSelect={id => s('deps', [...new Set([...(f.deps || []), id])])}
            placeholder="Search and add dependency..."
          />
          <p className="helper">Blocked until all deps finish. Optional: add a label to describe the relation.</p>
        </div>
      </>}
      <div className="field"><label>Notes</label><textarea value={f.note || ''} onChange={e => s('note', e.target.value)} rows={2} /></div>
      <div className="modal-footer">
        {onDelete && <button className="btn btn-danger" onClick={() => { onDelete(node.id); onClose(); }}>Delete</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" onClick={() => { onUpdate(f); onClose(); }}>Save</button>
      </div>
    </div>
  </div>;
}
