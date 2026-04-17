import { useState, useEffect } from 'react';
import { SBadge } from '../shared/Badges.jsx';
import { SL, GT, GL } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { directChildren, hasChildren, isLeafNode, leafNodes, leafProgress, re } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';

const CONF_OPTS = [
  { id: '', label: 'Auto' },
  { id: 'committed', label: '● Committed' },
  { id: 'estimated', label: '◐ Estimated' },
  { id: 'exploratory', label: '○ Exploratory' },
];

export function QuickEdit({ node, tree, members, teams, scheduled, cpSet, stats, onUpdate, onDelete, onEstimate, onDuplicate, onReorderInQueue }) {
  const [f, setF] = useState({ ...node });
  useEffect(() => setF({ ...node }), [node?.id]);
  const sc = scheduled?.find(s => s.id === node?.id);
  const isCp = cpSet?.has(node?.id);
  if (!node) return null;
  const isLeaf = isLeafNode(tree, node.id);
  const isRoot = !node.id.includes('.');
  const s = (k, v) => { const n = { ...f, [k]: v }; setF(n); onUpdate(n); };
  const fl = () => onUpdate(f);
  const allIds = tree.map(r => r.id).filter(i => i !== node.id);
  const memberLabel = m => `${m.name || m.id}${m.team ? ' — ' + (teams.find(t => t.id === m.team)?.name || m.team) : ''}`;

  return <>
    {/* ── Header: Status + CP ─────────────────────────────────────────── */}
    {isCp && <div style={{ background: '#3d0a0e', border: '1px solid var(--re)', borderRadius: 'var(--r)', padding: '6px 10px', marginBottom: 10, fontSize: 11, color: '#fda4af', display: 'flex', gap: 6, alignItems: 'center' }}>⚡ Critical path item</div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
      {isLeaf && <SBadge s={node.status} />}
      {!isLeaf && <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 10 }}>{SL[f.status] || f.status} <span style={{ fontSize: 8, color: 'var(--tx3)', fontWeight: 400 }}>(auto)</span></span>}
    </div>

    {/* ── Name ────────────────────────────────────────────────────────── */}
    <div className="field"><label>Name</label><input value={f.name || ''} onChange={e => setF(x => ({ ...x, name: e.target.value }))} onBlur={fl} /></div>

    {/* ── Root: Focus type ────────────────────────────────────────────── */}
    {isRoot && <>
      <div className="field"><label>Focus type</label>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {['', 'goal', 'painpoint', 'deadline'].map(t =>
            <button key={t} className={`goal-type-btn${(f.type || '') === t ? ' active' : ''}`} style={{ fontSize: 10, padding: '3px 7px' }}
              onClick={() => s('type', t)}>{t ? `${GT[t]} ${GL[t]}` : '— None'}</button>)}
        </div>
      </div>
      {f.type && <div className="frow">
        <div className="field"><label>Severity</label>
          <SearchSelect value={f.severity || 'high'} options={[{ id: 'critical', label: 'Critical' }, { id: 'high', label: 'High' }, { id: 'medium', label: 'Medium' }]} onSelect={v => s('severity', v)} />
        </div>
        {f.type === 'deadline' && <div className="field"><label>Date</label><input type="date" value={f.date || ''} onChange={e => s('date', e.target.value)} /></div>}
      </div>}
      {f.type && <div className="field"><label>Description</label><input value={f.description || ''} onChange={e => setF(x => ({ ...x, description: e.target.value }))} onBlur={fl} placeholder="Why does this matter?" /></div>}
    </>}

    {/* ── Status + Confidence (leaf) ──────────────────────────────────── */}
    {isLeaf && <div className="frow">
      <div className="field"><label>Status</label>
        <SearchSelect value={f.status || 'open'} options={[{ id: 'open', label: 'Open' }, { id: 'wip', label: 'In Progress' }, { id: 'done', label: 'Done' }]} onSelect={v => s('status', v)} />
      </div>
      <div className="field"><label>Confidence</label>
        <SearchSelect value={f.confidence || ''} options={CONF_OPTS} onSelect={v => s('confidence', v)} />
      </div>
    </div>}

    {/* ── Team + Assignee (together) ──────────────────────────────────── */}
    <div className="field"><label>Team</label>
      <SearchSelect value={f.team || ''} options={teams.map(t => ({ id: t.id, label: t.name || t.id }))} onSelect={v => s('team', v)} placeholder="Choose team..." allowEmpty />
    </div>
    {isLeaf && <div className="field"><label>Assignee</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {(f.assign || []).map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(x => x !== a))}>×</span></span>; })}
      </div>
      <SearchSelect
        options={members.filter(m => !(f.assign || []).includes(m.id)).map(m => ({ id: m.id, label: memberLabel(m) }))}
        onSelect={id => {
          const m = members.find(x => x.id === id);
          const n = { ...f, assign: [...new Set([...(f.assign || []), id])], team: m?.team || f.team };
          setF(n); onUpdate(n);
        }}
        placeholder="Person zuweisen..."
      />
    </div>}

    {/* ── Progress (leaf) ─────────────────────────────────────────────── */}
    {isLeaf && <div className="field"><label>Progress {f.progress ?? leafProgress(f)}%</label>
      <input type="range" min="0" max="100" step="5" value={f.progress ?? leafProgress(f)}
        onChange={e => { const v = +e.target.value; const n = { ...f, progress: v }; if (v >= 100 && f.status !== 'done') n.status = 'done'; else if (v > 0 && v < 100 && f.status !== 'wip') n.status = 'wip'; else if (v === 0 && f.status !== 'open') n.status = 'open'; setF(n); onUpdate(n); }}
        style={{ width: '100%', accentColor: 'var(--ac)' }} />
    </div>}

    {/* ── Parent: aggregated stats ─────────────────────────────────────── */}
    {!isLeaf && (() => {
      const st = stats?.[node.id];
      const childCount = directChildren(tree, node.id).length;
      const leafCount = leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')).length;
      const doneCount = leafNodes(tree).filter(c => c.id.startsWith(node.id + '.') && c.status === 'done').length;
      return <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--tx2)' }}>{leafCount} leaf items ({doneCount} done)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontFamily: 'var(--mono)', fontSize: 11 }}>
          <span style={{ color: 'var(--tx3)' }}>Children</span><span>{childCount}</span>
          <span style={{ color: 'var(--tx3)' }}>Best</span><span>{st?._b?.toFixed(0) || 0}d</span>
          <span style={{ color: 'var(--tx3)' }}>Realistic</span><span style={{ color: 'var(--am)' }}>{st?._r?.toFixed(1) || 0}d</span>
          {st?._startD && <><span style={{ color: 'var(--tx3)' }}>Zeitraum</span><span>{st._startD.toLocaleDateString('de-DE')} — {st._endD.toLocaleDateString('de-DE')}</span></>}
        </div>
      </div>;
    })()}

    {/* ── Estimate (leaf) ─────────────────────────────────────────────── */}
    {isLeaf && <>
      <div className="field"><label>Quick estimate</label>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {[['XS', 1, 1.3], ['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]].map(([sz, d, fc]) =>
            <button key={sz} className={`btn ${f.best === d ? 'btn-pri' : 'btn-sec'} btn-sm`}
              onClick={() => { const n = { ...f, best: d, factor: fc }; setF(n); onUpdate(n); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{d}d</span></button>)}
        </div>
      </div>
      <div className="frow">
        <div className="field"><label>Best (days)</label><input type="number" min="0" value={f.best || 0} onChange={e => setF(x => ({ ...x, best: +e.target.value }))} onBlur={fl} /></div>
        <div className="field"><label>Factor</label><input type="number" step="0.1" min="1" max="5" value={f.factor || 1.5} onChange={e => setF(x => ({ ...x, factor: +e.target.value }))} onBlur={fl} /></div>
        <div className="field"><label>Priority</label>
          <SearchSelect value={String(f.prio || 2)} options={[{ id: '1', label: '1 Critical' }, { id: '2', label: '2 High' }, { id: '3', label: '3 Medium' }, { id: '4', label: '4 Low' }]} onSelect={v => s('prio', +v)} />
        </div>
      </div>
      {onEstimate && <button className="btn btn-sec btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => onEstimate(node)}>Estimation Wizard...</button>}
    </>}

    {/* ── Scheduled info (leaf) — compact card ────────────────────────── */}
    {isLeaf && sc && <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '8px 10px', marginBottom: 12, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontFamily: 'var(--mono)', fontSize: 10 }}>
      <span style={{ color: 'var(--tx3)' }}>Zeitraum</span><span>{iso(sc.startD)} → {iso(sc.endD)}</span>
      <span style={{ color: 'var(--tx3)' }}>Dauer</span><span>{sc.weeks}w ({sc.calDays}d)</span>
      <span style={{ color: 'var(--tx3)' }}>Person</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.person} ({sc.capPct}% cap)</span>
      <span style={{ color: 'var(--tx3)' }}>Aufwand</span><span>{re(f.best || 0, f.factor || 1.5).toFixed(1)}d realistisch{isCp ? ' · ⚡ CP' : ''}</span>
    </div>}
    {isLeaf && !sc && f.best > 0 && <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '8px 10px', marginBottom: 12, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
      {re(f.best || 0, f.factor || 1.5).toFixed(1)}d realistisch · nicht eingeplant
    </div>}

    {/* ── Scheduling controls (leaf) ──────────────────────────────────── */}
    {isLeaf && <>
      <div className="frow">
        <div className="field"><label>Decide by</label>
          <input type="date" value={f.decideBy || ''} onChange={e => { const v = e.target.value; const n = { ...f, decideBy: v }; setF(n); onUpdate(n); }} />
        </div>
        <div className="field"><label>Pinned start {f.pinnedStart && <span style={{ fontSize: 10, color: 'var(--am)' }}>📌</span>}</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="date" value={f.pinnedStart || ''} onChange={e => { const v = e.target.value; const n = { ...f, pinnedStart: v }; setF(n); onUpdate(n); }} style={{ flex: 1 }} />
            {f.pinnedStart && <button className="btn btn-ghost btn-sm" onClick={() => { const n = { ...f, pinnedStart: '' }; setF(n); onUpdate(n); }} title="Unpin">×</button>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--tx2)' }}>Parallel {f.parallel && <span style={{ fontSize: 10, color: 'var(--am)' }}>≡</span>}</label>
        <label className="toggle"><input type="checkbox" checked={!!f.parallel} onChange={e => s('parallel', e.target.checked)} /><span className="slider" /></label>
      </div>
      {onReorderInQueue && !f.parallel && <div className="field">
        <label style={{ fontSize: 10 }}>Queue</label>
        <div style={{ display: 'flex', gap: 3 }}>
          <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'first')} style={{ flex: 1 }}>⤒</button>
          <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'earlier')} style={{ flex: 1 }}>▲</button>
          <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'later')} style={{ flex: 1 }}>▼</button>
          <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'last')} style={{ flex: 1 }}>⤓</button>
        </div>
      </div>}
    </>}

    {/* ── Dependencies ────────────────────────────────────────────────── */}
    <div className="field"><label>Predecessors{!isLeaf ? ' (all leaves)' : ''}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
        {(f.deps || []).map(d => { const dn = tree.find(r => r.id === d); const lbl = (f._depLabels || {})[d] || ''; return <div key={d} className="dep-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{d}</span>
            {dn?.name && <span style={{ fontSize: 10, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{dn.name}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <input value={lbl} onChange={e => s('_depLabels', { ...(f._depLabels || {}), [d]: e.target.value })} placeholder="label" style={{ width: 50, background: 'var(--bg)', border: '1px solid var(--b2)', borderRadius: 4, color: 'var(--tx3)', fontSize: 9, padding: '1px 4px', outline: 'none', fontFamily: 'var(--mono)' }} />
            <span className="tag-x" style={{ cursor: 'pointer', opacity: .6, fontSize: 11, color: 'var(--tx3)' }} onClick={() => { const newDeps = (f.deps || []).filter(x => x !== d); const newLabels = { ...(f._depLabels || {}) }; delete newLabels[d]; const n = { ...f, deps: newDeps, _depLabels: newLabels }; setF(n); onUpdate(n); }}>×</span>
          </div>
        </div>; })}
      </div>
      <SearchSelect options={allIds.map(i => { const n = tree.find(r => r.id === i); return { id: i, label: n?.name || '' }; })} onSelect={id => s('deps', [...new Set([...(f.deps || []), id])])} placeholder="+ Predecessor..." showIds />
    </div>
    {(() => {
      const successors = tree.filter(r => (r.deps || []).includes(node.id));
      if (!successors.length) return null;
      return <div className="field"><label>Successors</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {successors.map(succ => <div key={succ.id} className="dep-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)', flexShrink: 0, fontWeight: 600 }}>{succ.id}</span>
              <span style={{ fontSize: 10, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{succ.name}</span>
            </div>
            <span className="tag-x" style={{ cursor: 'pointer', opacity: .6, fontSize: 11, color: 'var(--tx3)' }} title="Release"
              onClick={() => { if (confirm(`"${succ.name}" wartet nicht mehr auf dieses Item?`)) onUpdate({ ...succ, deps: (succ.deps || []).filter(d => d !== node.id) }); }}>×</span>
          </div>)}
        </div>
      </div>;
    })()}

    {/* ── Notes ────────────────────────────────────────────────────────── */}
    <div className="field"><label>Notes</label><textarea value={f.note || ''} onChange={e => setF(x => ({ ...x, note: e.target.value }))} onBlur={fl} rows={2} /></div>

    {/* ── Actions ──────────────────────────────────────────────────────── */}
    <hr className="divider" />
    <div style={{ display: 'flex', gap: 6 }}>
      {onDuplicate && <button className="btn btn-sec" style={{ flex: 1 }} onClick={() => {
        const sub = tree.filter(r => r.id === node.id || r.id.startsWith(node.id + '.')).length;
        if (confirm(sub > 1 ? `Duplicate "${node.name}" with ${sub - 1} descendant${sub === 2 ? '' : 's'}?` : `Duplicate "${node.name}"?`)) onDuplicate(node.id);
      }}>⧉ Duplicate</button>}
      {onDelete && <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { if (confirm(`Delete ${node.id}${hasChildren(tree, node.id) ? ' and all children' : ''}?`)) onDelete(node.id); }}>Delete</button>}
    </div>
  </>;
}
