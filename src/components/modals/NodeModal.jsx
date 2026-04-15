import { useState, useEffect } from 'react';
import { SBadge } from '../shared/Badges.jsx';
import { SL, GT, GL } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { directChildren, hasChildren, isLeafNode, leafNodes, leafProgress, re } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';

export function NodeModal({ node, tree, members, teams, scheduled, cpSet, stats, onClose, onUpdate, onDelete, onEstimate }) {
  const [f, setF] = useState({ ...node });
  useEffect(() => setF({ ...node }), [node?.id]);
  const sc = scheduled?.find(s => s.id === node?.id);
  const isCp = cpSet?.has(node?.id);
  if (!node) return null;
  const isLeaf = isLeafNode(tree, node.id);
  const isRoot = !node.id.includes('.');
  const s = (k, v) => setF(x => ({ ...x, [k]: v }));
  const allIds = tree.map(r => r.id).filter(i => i !== node.id);
  return <div className="overlay" onClick={onClose}>
    <div className={`modal${isLeaf ? ' modal-lg' : ''} fade`} onClick={e => e.stopPropagation()}>
      <h2>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', fontSize: 13 }}>{node.id}</span>
        {isLeaf && <SBadge s={node.status} />}
        {isCp && <span className="badge b-cp">Critical Path</span>}
      </h2>
      <div className="field"><label>Name</label><input value={f.name || ''} onChange={e => s('name', e.target.value)} /></div>
      {isRoot && <div className="frow">
        <div className="field"><label>Focus type</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {['', 'goal', 'painpoint', 'deadline'].map(t =>
              <button key={t} className={`goal-type-btn${(f.type || '') === t ? ' active' : ''}`} onClick={() => s('type', t)}>{t ? `${GT[t]} ${GL[t]}` : '— None'}</button>)}
          </div>
        </div>
        {f.type && <div className="field" style={{ flex: '0 0 110px' }}><label>Severity</label>
          <SearchSelect value={f.severity || 'high'} options={[{ id: 'critical', label: 'Critical' }, { id: 'high', label: 'High' }, { id: 'medium', label: 'Medium' }]} onSelect={v => s('severity', v)} />
        </div>}
        {f.type === 'deadline' && <div className="field" style={{ flex: '0 0 140px' }}><label>Date</label><input type="date" value={f.date || ''} onChange={e => s('date', e.target.value)} /></div>}
      </div>}
      {isRoot && f.type && <div className="field"><label>Description</label><input value={f.description || ''} onChange={e => s('description', e.target.value)} placeholder="Why does this matter?" /></div>}
      <div className="frow">
        <div className="field"><label>Status</label>
          {!isLeaf ? <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 11 }}>{SL[f.status] || f.status} <span style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 400 }}>(auto)</span></span>
          : <SearchSelect value={f.status || 'open'} options={[{ id: 'open', label: 'Open' }, { id: 'wip', label: 'In Progress' }, { id: 'done', label: 'Done' }]} onSelect={v => s('status', v)} />}
        </div>
        <div className="field"><label>Team</label>
          <SearchSelect value={f.team || ''} options={teams.map(t => ({ id: t.id, label: t.name || t.id }))} onSelect={v => s('team', v)} placeholder="Choose team..." allowEmpty />
        </div>
      </div>
      {isLeaf && <div className="field"><label>Progress {f.progress ?? leafProgress(f)}%</label>
        <input type="range" min="0" max="100" step="5" value={f.progress ?? leafProgress(f)}
          onChange={e => { const v = +e.target.value; s('progress', v); if (v >= 100 && f.status !== 'done') s('status', 'done'); else if (v > 0 && v < 100 && f.status !== 'wip') s('status', 'wip'); else if (v === 0 && f.status !== 'open') s('status', 'open'); }}
          style={{ width: '100%', accentColor: 'var(--ac)' }} />
      </div>}
      {!isLeaf && (() => {
        const st = stats?.[node.id];
        const childCount = directChildren(tree, node.id).length;
        const leafCount = leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')).length;
        const doneCount = leafNodes(tree).filter(c => c.id.startsWith(node.id + '.') && c.status === 'done').length;
        return <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--tx2)' }}>Aggregated from {leafCount} leaf items</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontFamily: 'var(--mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--tx3)' }}>Children</span><span>{childCount}</span>
            <span style={{ color: 'var(--tx3)' }}>Progress</span><span>{doneCount}/{leafCount} done ({leafCount > 0 ? Math.round(doneCount / leafCount * 100) : 0}%)</span>
            <span style={{ color: 'var(--tx3)' }}>Best</span><span>{st?._b?.toFixed(0) || 0}d</span>
            <span style={{ color: 'var(--tx3)' }}>Realistic</span><span style={{ color: 'var(--am)' }}>{st?._r?.toFixed(1) || 0}d</span>
            <span style={{ color: 'var(--tx3)' }}>Worst</span><span>{st?._w?.toFixed(0) || 0}d</span>
            {st?._startD && <><span style={{ color: 'var(--tx3)' }}>Scheduled</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st._startD.toLocaleDateString('de-DE')} — {st._endD.toLocaleDateString('de-DE')} ({Math.round((st._endD - st._startD) / 864e5)}d)</span></>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6 }}>Status, estimates, and dates are derived from child items.</div>
        </div>;
      })()}
      {isLeaf && <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div>
            <div className="field"><label>Quick estimate</label>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {[['XS', 1, 1.3], ['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]].map(([sz, d, fc]) =>
                  <button key={sz} className={`btn ${f.best === d ? 'btn-pri' : 'btn-sec'} btn-sm`}
                    onClick={() => { s('best', d); s('factor', fc); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{d}d</span></button>)}
              </div>
            </div>
            <div className="frow">
              <div className="field"><label>Best (days)</label><input type="number" min="0" value={f.best || 0} onChange={e => s('best', +e.target.value)} /></div>
              <div className="field"><label>Factor</label><input type="number" step="0.1" min="1" max="5" value={f.factor || 1.5} onChange={e => s('factor', +e.target.value)} /></div>
            </div>
            <div className="frow">
              <div className="field"><label>Priority</label>
                <SearchSelect value={String(f.prio || 1)} options={[{ id: '1', label: '1 Critical' }, { id: '2', label: '2 High' }, { id: '3', label: '3 Medium' }, { id: '4', label: '4 Low' }]} onSelect={v => s('prio', +v)} />
              </div>
              <div className="field"><label>Seq</label><input type="number" value={f.seq || 0} onChange={e => s('seq', +e.target.value)} /></div>
            </div>
            {onEstimate && <button className="btn btn-sec btn-sm" style={{ width: '100%', marginBottom: 12 }} onClick={() => { onClose(); onEstimate(node); }}>Estimation Wizard...</button>}
          </div>
          <div>
            <div className="field"><label>Assignee</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {(f.assign || []).map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(x => x !== a))}>×</span></span>; })}
          </div>
          <SearchSelect
            options={members.filter(m => !(f.assign || []).includes(m.id)).map(m => ({ id: m.id, label: `${m.name || m.id}${m.team ? ' — ' + (teams.find(t => t.id === m.team)?.name || m.team) : ''}` }))}
            onSelect={id => s('assign', [...new Set([...(f.assign || []), id])])}
            placeholder="Search and assign person..."
          />
        </div>
        <div className="field"><label>Dependencies</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
            {(f.deps || []).map(d => { const dn = tree.find(r => r.id === d); const lbl = (f._depLabels || {})[d] || ''; return <div key={d} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{d}</span>
                {dn?.name && <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>— {dn.name}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <input value={lbl} onChange={e => s('_depLabels', { ...(f._depLabels || {}), [d]: e.target.value })} placeholder="label" style={{ width: 80, background: 'var(--bg)', border: '1px solid var(--b2)', borderRadius: 4, color: 'var(--tx3)', fontSize: 10, padding: '2px 6px', outline: 'none', fontFamily: 'var(--mono)' }} />
                <span className="tag-x" style={{ cursor: 'pointer', opacity: .6, fontSize: 12, color: 'var(--tx3)' }} onClick={() => { s('deps', (f.deps || []).filter(x => x !== d)); const dl = { ...(f._depLabels || {}) }; delete dl[d]; s('_depLabels', dl); }}>×</span>
              </div>
            </div>; })}
          </div>
          <SearchSelect
            options={allIds.map(i => { const n = tree.find(r => r.id === i); return { id: i, label: n?.name || '' }; })}
            onSelect={id => s('deps', [...new Set([...(f.deps || []), id])])}
            placeholder="Search and add dependency..."
          />
          <p className="helper">Blocked until all deps finish.</p>
        </div>
          </div>
        </div>
        <div className="calc">
          <span>Realistic:</span><b>{re(f.best || 0, f.factor || 1.5).toFixed(1)}d</b>
          <span>Worst:</span><b>{((f.best || 0) * (f.factor || 1.5)).toFixed(0)}d</b>
          {isCp && <span className="cp">On critical path</span>}
        </div>
        {sc && <div className="calc" style={{ fontSize: 10 }}>
          <span>Scheduled:</span><b>{iso(sc.startD)} → {iso(sc.endD)}</b>
          <span>Duration:</span><b>{sc.weeks}w ({sc.calDays} cal days)</b>
          <span>Person:</span>
          <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{sc.person}</b>
          <span>({sc.capPct}% cap, {sc.vacDed}% vac)</span>
        </div>}
      </>}
      <div className="field"><label>Notes</label><textarea value={f.note || ''} onChange={e => s('note', e.target.value)} rows={2} /></div>
      <div className="modal-footer">
        {onDelete && <button className="btn btn-danger" onClick={() => { if (confirm(`Delete ${node.id}${hasChildren(tree, node.id) ? ' and all children' : ''}?`)) { onDelete(node.id); onClose(); } }}>Delete item</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" onClick={() => { onUpdate(f); onClose(); }}>Save</button>
      </div>
    </div>
  </div>;
}
