import { useState, useEffect, useMemo } from 'react';
import { SBadge } from '../shared/Badges.jsx';
import { SL, GT } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { hasChildren, isLeafNode, leafNodes, leafProgress, re } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';
import { useT } from '../../i18n.jsx';

export function NodeModal({ node, tree, members, teams, scheduled, cpSet, stats, onClose, onUpdate, onDelete, onEstimate, onDuplicate, onMove, onReorderInQueue }) {
  const { t } = useT();
  const [f, setF] = useState({ ...node });
  const [advanced, setAdvanced] = useState(false);
  // Re-sync when a different node is opened. NodeModal buffers changes locally
  // and saves on button click — so we only reset on ID change, not on every
  // tree mutation (which would lose unsaved edits during successor releases).
  useEffect(() => setF({ ...node }), [node?.id]);
  const sc = scheduled?.find(s => s.id === node?.id);
  const isCp = cpSet?.has(node?.id);
  const isDirty = useMemo(() => node && JSON.stringify({ ...node }) !== JSON.stringify(f), [node, f]);
  const safeClose = () => { if (isDirty && !confirm(t('nm.unsavedDiscard'))) return; onClose(); };
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') safeClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isDirty]);
  if (!node) return null;
  const isLeaf = isLeafNode(tree, node.id);
  const isRoot = !node.id.includes('.');
  const s = (k, v) => setF(x => ({ ...x, [k]: v }));
  const allIds = tree.map(r => r.id).filter(i => i !== node.id);

  // Ancestors for the breadcrumb (compact, ID-only)
  const ancestors = [];
  if (!isRoot) {
    const parts = node.id.split('.');
    for (let i = 1; i < parts.length; i++) {
      const aid = parts.slice(0, i).join('.');
      const a = tree.find(r => r.id === aid);
      if (a) ancestors.push(a);
    }
  }
  // Parent options (excluding self + descendants)
  const parentOptions = [
    { id: '', label: t('nm.topLevel') },
    ...tree.filter(r => r.id !== node.id && !r.id.startsWith(node.id + '.')).map(r => ({ id: r.id, label: r.name })),
  ];
  const currentParentId = node.id.split('.').slice(0, -1).join('.');

  // Predecessors (deps): items THIS depends on
  // Successors: items that depend on THIS
  const successors = tree.filter(r => (r.deps || []).includes(node.id));
  const successorIds = new Set(successors.map(r => r.id));

  // Helpers
  const findById = id => tree.find(r => r.id === id);
  const memberLabel = m => `${m.name || m.id}${m.team ? ' — ' + (teams.find(tm => tm.id === m.team)?.name || m.team) : ''}`;

  const SIZES = [['XS', 1, 1.3], ['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]];
  const stat = !isLeaf ? stats?.[node.id] : null;
  const leafCountUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')).length : 0;
  const doneUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.') && c.status === 'done').length : 0;
  const progPct = !isLeaf ? (leafCountUnder ? Math.round(doneUnder / leafCountUnder * 100) : 0) : (f.progress ?? leafProgress(f));

  return <div className="overlay">
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      {/* Compact header: breadcrumb + ID + name as primary input */}
      {ancestors.length > 0 && <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 6, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ancestors.map(a => `${a.id} ${a.name}`).join(' › ')}>
        {ancestors.map((a, i) => <span key={a.id}>{i > 0 && <span style={{ color: 'var(--b3)' }}> › </span>}{a.id}</span>)}
      </div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>{node.id}</span>
        {isLeaf && <SBadge s={node.status} />}
        {isCp && <span className="badge b-cp" title="On the critical path — any delay here delays the project end">⚡ CP</span>}
        {f.parallel && <span className="badge bo" title="Parallel: bypasses person capacity (legacy field)">≡ parallel</span>}
        {f.pinnedStart && <span className="badge bo" style={{ cursor: 'pointer' }} title={`Pinned to ${f.pinnedStart} — click to unpin`} onClick={() => s('pinnedStart', '')}>📌 {f.pinnedStart} ×</span>}
      </div>
      <div className="field"><label>{t('qe.name')}</label><input value={f.name || ''} onChange={e => s('name', e.target.value)} autoFocus /></div>

      {/* Root-only: focus type / severity / date / description */}
      {isRoot && <>
        <div className="frow">
          <div className="field"><label>{t('nm.focusType')}</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['', 'goal', 'painpoint', 'deadline'].map(ft =>
                <button key={ft} className={`goal-type-btn${(f.type || '') === ft ? ' active' : ''}`} onClick={() => s('type', ft)}>{ft ? `${GT[ft]} ${t(ft)}` : t('none')}</button>)}
            </div>
          </div>
          {f.type && <div className="field" style={{ flex: '0 0 110px' }}><label>{t('nm.severity')}</label>
            <SearchSelect value={f.severity || 'high'} options={[{ id: 'critical', label: t('critical') }, { id: 'high', label: t('high') }, { id: 'medium', label: t('medium') }]} onSelect={v => s('severity', v)} />
          </div>}
          {f.type === 'deadline' && <div className="field" style={{ flex: '0 0 140px' }}><label>{t('qe.date')}</label><input type="date" value={f.date || ''} onChange={e => s('date', e.target.value)} /></div>}
        </div>
        {f.type && <div className="field"><label>{t('qe.description')}</label><input value={f.description || ''} onChange={e => s('description', e.target.value)} placeholder={t('qe.descPlaceholder')} /></div>}
      </>}

      {/* Status / Team — only for leaf items the status is editable */}
      <div className="frow">
        <div className="field"><label>{t('qe.status')}{!isLeaf && <span style={{ fontSize: 9, color: 'var(--tx3)', marginLeft: 6 }}>{t('qe.autoStatus')}</span>}</label>
          {isLeaf
            ? <SearchSelect value={f.status || 'open'} options={[{ id: 'open', label: t('open') }, { id: 'wip', label: t('wip') }, { id: 'done', label: t('done') }]} onSelect={v => s('status', v)} />
            : <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 11, padding: '6px 10px', display: 'inline-block' }}>{SL[f.status] || f.status}</span>}
        </div>
        <div className="field"><label>{t('qe.team')}</label>
          <SearchSelect value={f.team || ''} options={teams.map(tm => ({ id: tm.id, label: tm.name || tm.id }))} onSelect={v => s('team', v)} placeholder="Choose team..." allowEmpty />
        </div>
      </div>

      {/* Leaf-only: progress + assignee */}
      {isLeaf && <>
        <div className="field">
          <label>{t('qe.progress')} {progPct}%</label>
          <input type="range" min="0" max="100" step="5" value={progPct}
            onChange={e => { const v = +e.target.value; s('progress', v); if (v >= 100 && f.status !== 'done') s('status', 'done'); else if (v > 0 && v < 100 && f.status !== 'wip') s('status', 'wip'); else if (v === 0 && f.status !== 'open') s('status', 'open'); }}
            style={{ width: '100%', accentColor: 'var(--ac)' }} />
        </div>
        <div className="field"><label>{t('qe.assignee')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {(f.assign || []).map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(x => x !== a))}>×</span></span>; })}
          </div>
          <SearchSelect
            options={members.filter(m => !(f.assign || []).includes(m.id)).map(m => ({ id: m.id, label: memberLabel(m) }))}
            onSelect={id => { const m = members.find(x => x.id === id); setF(x => ({ ...x, assign: [...new Set([...(x.assign || []), id])], team: m?.team || x.team })); }}
            placeholder={t('qe.assignPerson')}
          />
        </div>
        {/* Effort: quick estimate buttons + inline summary */}
        <div className="field">
          <label>{t('qe.effort')}
            <span style={{ marginLeft: 10, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {re(f.best || 0, f.factor || 1.5).toFixed(1)}d {t('qe.realisticSuffix')} · {((f.best || 0) * (f.factor || 1.5)).toFixed(0)}d worst
              {sc && <> · scheduled {iso(sc.startD)} → {iso(sc.endD)}</>}
            </span>
          </label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {SIZES.map(([sz, d, fc]) =>
              <button key={sz} className={`btn ${f.best === d ? 'btn-pri' : 'btn-sec'} btn-sm`}
                onClick={() => { s('best', d); s('factor', fc); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{d}d</span></button>)}
            <input type="number" min="0" value={f.best || 0} onChange={e => s('best', +e.target.value)} style={{ width: 60, marginLeft: 6 }} title="Best-case days" />
            {onEstimate && <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); onEstimate(node); }} title="Open the full estimation wizard">{t('qe.estimationWizard')}</button>}
          </div>
        </div>
        <div className="field" style={{ maxWidth: 200 }}><label>{t('qe.priority')}</label>
          <SearchSelect value={String(f.prio || 2)} options={[{ id: '1', label: `⏫ 1 ${t('critical')}` }, { id: '2', label: `▲ 2 ${t('high')}` }, { id: '3', label: `▬ 3 ${t('medium')}` }, { id: '4', label: `▼ 4 ${t('low')}` }]} onSelect={v => s('prio', +v)} />
        </div>
      </>}

      {/* Non-leaf: aggregated stats card (read-only) */}
      {!isLeaf && stat && <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 11, fontFamily: 'var(--mono)' }}>
        <div style={{ color: 'var(--tx2)', marginBottom: 6 }}>{doneUnder}/{leafCountUnder} {t('qe.leafItems')} {t('done')} · {progPct}%</div>
        <div className="prog-wrap" style={{ marginBottom: 6 }}><div className="prog-fill" style={{ width: `${progPct}%`, background: progPct >= 100 ? 'var(--gr)' : 'var(--am)' }} /></div>
        <div style={{ color: 'var(--tx3)' }}>
          {stat._r > 0 && <span style={{ color: 'var(--am)' }}>{stat._r.toFixed(0)}d {t('qe.realisticSuffix')} · </span>}
          {stat._b > 0 && <span>{stat._b.toFixed(0)}d {t('qe.best').toLowerCase()} · {stat._w?.toFixed(0)}d worst</span>}
          {stat._startD && <span> · {stat._startD.toLocaleDateString('de-DE')} → {stat._endD.toLocaleDateString('de-DE')}</span>}
        </div>
      </div>}

      {/* Predecessors and Successors — both fully editable */}
      <div className="frow" style={{ alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('qe.predecessors')} {!isLeaf && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{t('nm.appliesToAllLeaves')}</span>}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
            {(f.deps || []).map(d => { const dn = findById(d); return <div key={d} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{d}</span>
                {dn?.name && <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{dn.name}</span>}
              </div>
              <span className="tag-x" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx3)' }} title="Remove predecessor" onClick={() => setF(x => { const newDeps = (x.deps || []).filter(y => y !== d); const newLabels = { ...(x._depLabels || {}) }; delete newLabels[d]; return { ...x, deps: newDeps, _depLabels: newLabels }; })}>×</span>
            </div>; })}
          </div>
          <SearchSelect
            options={allIds.filter(i => !(f.deps || []).includes(i)).map(i => ({ id: i, label: findById(i)?.name || '' }))}
            onSelect={id => s('deps', [...new Set([...(f.deps || []), id])])}
            placeholder="+ Add predecessor"
            showIds
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('qe.successors')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
            {successors.map(succ => <div key={succ.id} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)', flexShrink: 0, fontWeight: 600 }}>{succ.id}</span>
                <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{succ.name}</span>
              </div>
              <span className="tag-x" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx3)' }} title="Release this successor" onClick={() => onUpdate({ ...succ, deps: (succ.deps || []).filter(d => d !== node.id) })}>×</span>
            </div>)}
          </div>
          <SearchSelect
            options={allIds.filter(i => !successorIds.has(i) && i !== node.id && !(f.deps || []).includes(i)).map(i => ({ id: i, label: findById(i)?.name || '' }))}
            onSelect={id => { const target = findById(id); if (target) onUpdate({ ...target, deps: [...new Set([...(target.deps || []), node.id])] }); }}
            placeholder="+ Add successor"
            showIds
          />
        </div>
      </div>

      <div className="field"><label>{t('qe.notes')}</label><textarea value={f.note || ''} onChange={e => s('note', e.target.value)} rows={2} /></div>

      {/* Scheduling controls — always visible, not hidden behind a toggle. */}
      {isLeaf && <>
        <div className="field">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 12, color: 'var(--tx2)' }}>{t('nm.runParallel')} {f.parallel && <span style={{ fontSize: 10, color: 'var(--am)', marginLeft: 4 }}>≡ {t('nm.capacityBypass')}</span>}</label>
            <label className="toggle"><input type="checkbox" checked={!!f.parallel} onChange={e => s('parallel', e.target.checked)} /><span className="slider" /></label>
          </div>
        </div>
        {onReorderInQueue && !f.parallel && <div className="field">
          <label>{t('nm.queuePosition')}</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'first')} style={{ flex: 1 }}>⤒ {t('nm.first')}</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'earlier')} style={{ flex: 1 }}>▲ {t('nm.earlier')}</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'later')} style={{ flex: 1 }}>▼ {t('nm.later')}</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'last')} style={{ flex: 1 }}>⤓ {t('nm.last')}</button>
          </div>
        </div>}
        <div className="frow">
          <div className="field"><label>{t('qe.decideBy')}</label>
            <input type="date" value={f.decideBy || ''} onChange={e => s('decideBy', e.target.value)} />
          </div>
          <div className="field"><label>{t('qe.pinnedStart')} {f.pinnedStart && <span style={{ fontSize: 10, color: 'var(--am)' }}>📌</span>}</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="date" value={f.pinnedStart || ''} onChange={e => s('pinnedStart', e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-sec btn-xs" onClick={() => s('pinnedStart', iso(new Date()))} title="Pin to today">{t('nm.pinToday')}</button>
              {f.pinnedStart && <button className="btn btn-ghost btn-xs" onClick={() => s('pinnedStart', '')} title="Unpin">×</button>}
            </div>
          </div>
        </div>
      </>}

      {/* Advanced section: parent move, seq, factor */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--b)' }}>
        <button className="btn btn-ghost btn-xs" onClick={() => setAdvanced(v => !v)} style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
          {advanced ? '▼' : '▶'} {t('nm.advanced')}
        </button>
        {advanced && <div style={{ marginTop: 10 }}>
          {onMove && <div className="field"><label>{t('nm.parent')}</label>
            <SearchSelect value={currentParentId} options={parentOptions} onSelect={newPid => {
              if (newPid === currentParentId) return;
              if (isDirty) { alert(t('nm.saveFirst')); return; }
              const sub = tree.filter(r => r.id === node.id || r.id.startsWith(node.id + '.')).length;
              if (!confirm(t('nm.confirmMove', node.name, sub - 1, newPid || t('nm.topLevel')))) return;
              onMove(node.id, newPid);
            }} placeholder={t('nm.topLevel')} showIds />
          </div>}
          {isLeaf && <div className="frow">
            <div className="field"><label title="Risk factor multiplier (default 1.5)">{t('qe.factor')}</label><input type="number" step="0.1" min="1" max="5" value={f.factor || 1.5} onChange={e => s('factor', +e.target.value)} /></div>
            <div className="field"><label title="Manual sort order within team (rare; usually leave at 0)">{t('nm.seq')}</label><input type="number" value={f.seq || 0} onChange={e => s('seq', +e.target.value)} /></div>
          </div>}
          <div className="field"><label title="Override the auto-derived planning confidence. Leave on Auto to let planr decide based on assignee/estimate/risk.">{t('nm.confidenceOverride')}</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['', t('auto')], ['committed', `● ${t('conf.committed')}`], ['estimated', `◐ ${t('conf.estimated')}`], ['exploratory', `○ ${t('conf.exploratory')}`]].map(([v, l]) =>
                <button key={v} className={`btn ${(f.confidence || '') === v ? 'btn-pri' : 'btn-sec'} btn-xs`} style={{ flex: 1, fontSize: 10 }}
                  onClick={() => s('confidence', v)}>{l}</button>)}
            </div>
          </div>
        </div>}
      </div>

      <div className="modal-footer">
        {onDelete && <button className="btn btn-danger" onClick={() => { if (confirm(hasChildren(tree, node.id) ? t('qe.confirmDeleteChildren', node.id) : t('qe.confirmDelete', node.id))) { onDelete(node.id); onClose(); } }}>{t('delete')}</button>}
        {onDuplicate && <button className="btn btn-sec" onClick={() => {
          if (isDirty && !confirm(t('nm.unsavedDiscard'))) return;
          const sub = tree.filter(r => r.id === node.id || r.id.startsWith(node.id + '.')).length;
          if (confirm(sub > 1 ? t('qe.confirmDuplicateN', node.name, sub - 1) : t('qe.confirmDuplicate', node.name))) onDuplicate(node.id);
        }} title="Create a copy of this item and all its children">⧉ {t('qe.duplicate')}</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sec" onClick={safeClose}>{t('cancel')}</button>
        <button className="btn btn-pri" onClick={() => { onUpdate(f); onClose(); }} disabled={!isDirty}>{isDirty ? t('save') : t('nm.noChanges')}</button>
      </div>
    </div>
  </div>;
}
