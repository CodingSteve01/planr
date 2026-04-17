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
  const [showStructure, setShowStructure] = useState(false);
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
  const findById = id => tree.find(r => r.id === id);
  const memberLabel = m => `${m.name || m.id}${m.team ? ' — ' + (teams.find(tm => tm.id === m.team)?.name || m.team) : ''}`;
  const SIZES = [['XS', 1, 1.3], ['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]];
  // Highlight nearest size bracket even for non-exact matches
  const nearestSize = f.best > 0 ? SIZES.reduce((best, sz) => Math.abs(sz[1] - f.best) < Math.abs(best[1] - f.best) ? sz : best, SIZES[0]) : null;
  const CONF_OPTS = useMemo(() => [
    { id: '', label: t('auto') },
    { id: 'committed', label: `${t('conf.committed.dot')} ${t('conf.committed')}` },
    { id: 'estimated', label: `${t('conf.estimated.dot')} ${t('conf.estimated')}` },
    { id: 'exploratory', label: `${t('conf.exploratory.dot')} ${t('conf.exploratory')}` },
  ], [t]);

  // Ancestors with NAMES
  const ancestors = [];
  if (!isRoot) {
    const parts = node.id.split('.');
    for (let i = 1; i < parts.length; i++) { const a = tree.find(r => r.id === parts.slice(0, i).join('.')); if (a) ancestors.push(a); }
  }
  const currentParentId = node.id.split('.').slice(0, -1).join('.');
  const parentOptions = [{ id: '', label: t('nm.topLevel') }, ...tree.filter(r => r.id !== node.id && !r.id.startsWith(node.id + '.')).map(r => ({ id: r.id, label: r.name }))];
  const successors = tree.filter(r => (r.deps || []).includes(node.id));
  const successorIds = new Set(successors.map(r => r.id));
  const stat = !isLeaf ? stats?.[node.id] : null;
  const leafCountUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')).length : 0;
  const doneUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.') && c.status === 'done').length : 0;
  const progPct = !isLeaf ? (leafCountUnder ? Math.round(doneUnder / leafCountUnder * 100) : 0) : (f.progress ?? leafProgress(f));

  return <div className="overlay">
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>

      {/* ── 1. HEADER — breadcrumb with NAMES ──────────────────────────── */}
      {ancestors.length > 0 && <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ancestors.map((a, i) => <span key={a.id}>{i > 0 && <span style={{ color: 'var(--b3)' }}> › </span>}<span style={{ fontFamily: 'var(--mono)', fontSize: 9 }}>{a.id}</span> {a.name?.length > 25 ? a.name.slice(0, 23) + '…' : a.name}</span>)}
      </div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>{node.id}</span>
        {isLeaf && <SBadge s={node.status} />}
        {!isLeaf && <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 10 }}>{SL[f.status] || f.status}</span>}
        {isCp && <span className="badge b-cp">⚡ CP</span>}
        {f.parallel && <span className="badge bo">≡</span>}
        {f.pinnedStart && <span className="badge bo" style={{ cursor: 'pointer' }} onClick={() => s('pinnedStart', '')}>📌 {f.pinnedStart} ×</span>}
      </div>

      {/* ── 2. IDENTITY + NOTES ──────────────────────────────────────── */}
      <div className="field"><label>{t('qe.name')}</label><input value={f.name || ''} onChange={e => s('name', e.target.value)} autoFocus /></div>
      <div className="field"><label>{t('qe.notes')}</label><textarea value={f.note || ''} onChange={e => s('note', e.target.value)} rows={2} /></div>
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

      {/* ── 3. STATUS + PROGRESS (one compact row for leaf) ─────────────── */}
      {isLeaf && <div className="frow" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '0 0 130px' }}><label>{t('qe.status')}</label>
          <SearchSelect value={f.status || 'open'} options={[{ id: 'open', label: t('open') }, { id: 'wip', label: t('wip') }, { id: 'done', label: t('done') }]} onSelect={v => s('status', v)} />
        </div>
        <div className="field" style={{ flex: 1 }}><label>{t('qe.progress')} {progPct}%</label>
          <input type="range" min="0" max="100" step="5" value={progPct}
            onChange={e => { const v = +e.target.value; s('progress', v); if (v >= 100 && f.status !== 'done') s('status', 'done'); else if (v > 0 && v < 100 && f.status !== 'wip') s('status', 'wip'); else if (v === 0 && f.status !== 'open') s('status', 'open'); }}
            style={{ width: '100%', accentColor: 'var(--ac)', marginTop: 4 }} />
        </div>
      </div>}
      {!isLeaf && stat && <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 11, fontFamily: 'var(--mono)' }}>
        <div style={{ color: 'var(--tx2)', marginBottom: 6 }}>{doneUnder}/{leafCountUnder} {t('qe.leafItems')} {t('done')} · {progPct}%</div>
        <div className="prog-wrap" style={{ marginBottom: 6 }}><div className="prog-fill" style={{ width: `${progPct}%`, background: progPct >= 100 ? 'var(--gr)' : 'var(--am)' }} /></div>
        <div style={{ color: 'var(--tx3)' }}>
          {stat._r > 0 && <span style={{ color: 'var(--am)' }}>{stat._r.toFixed(0)}d {t('qe.realisticSuffix')} · </span>}
          {stat._b > 0 && <span>{stat._b.toFixed(0)}d best</span>}
          {stat._startD && <span> · {stat._startD.toLocaleDateString('de-DE')} → {stat._endD.toLocaleDateString('de-DE')}</span>}
        </div>
      </div>}

      {/* ── 4. ASSIGNMENT (team + assignee compact) ─────────────────────── */}
      <div className="field"><label>{t('qe.team')}</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: '0 0 180px' }}>
            <SearchSelect value={f.team || ''} options={teams.map(tm => ({ id: tm.id, label: tm.name || tm.id }))} onSelect={v => s('team', v)} allowEmpty />
          </div>
          {isLeaf && <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {(f.assign || []).map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(x => x !== a))}>×</span></span>; })}
            <div style={{ minWidth: 160, flex: 1 }}>
              <SearchSelect
                options={members.filter(m => !(f.assign || []).includes(m.id)).map(m => ({ id: m.id, label: memberLabel(m) }))}
                onSelect={id => { const m = members.find(x => x.id === id); setF(x => ({ ...x, assign: [...new Set([...(x.assign || []), id])], team: m?.team || x.team })); }}
                placeholder={t('qe.assignPerson')}
              />
            </div>
          </div>}
        </div>
      </div>

      {/* ── 5. ESTIMATION ──────────────────────────────────────────────── */}
      {isLeaf && <>
        <div className="field">
          <label>{t('qe.quickEstimate')}</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
            {SIZES.map(([sz, d, fc]) => {
              const exact = f.best === d;
              const nearest = !exact && nearestSize?.[0] === sz && f.best > 0;
              return <button key={sz} className={`btn ${exact ? 'btn-pri' : 'btn-sec'} btn-sm`}
                style={nearest ? { borderColor: 'var(--ac)', opacity: 0.8 } : undefined}
                onClick={() => { s('best', d); s('factor', fc); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{d}d</span></button>;
            })}
          </div>
          {onEstimate && <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, padding: '2px 0' }} onClick={() => { onClose(); onEstimate(node); }}>{t('qe.estimationWizard')}</button>}
        </div>
        <div className="frow">
          <div className="field"><label>{t('qe.bestDays')}</label><input type="number" min="0" value={f.best || 0} onChange={e => s('best', +e.target.value)} style={{ fontFamily: 'var(--mono)' }} /></div>
          <div className="field"><label>{t('qe.factor')}</label><input type="number" step="0.1" min="1" max="5" value={f.factor || 1.5} onChange={e => s('factor', +e.target.value)} style={{ fontFamily: 'var(--mono)' }} /></div>
          <div className="field"><label>{t('qe.priority')}</label>
            <SearchSelect value={String(f.prio || 2)} options={[{ id: '1', label: `⏫ 1 ${t('critical')}` }, { id: '2', label: `▲ 2 ${t('high')}` }, { id: '3', label: `▬ 3 ${t('medium')}` }, { id: '4', label: `▼ 4 ${t('low')}` }]} onSelect={v => s('prio', +v)} />
          </div>
        </div>
        <div className="field"><label>{t('qe.confidence')}</label>
          <SearchSelect value={f.confidence || ''} options={CONF_OPTS} onSelect={v => s('confidence', v)} />
        </div>
        {/* Scheduled info — readable text, not codeblock */}
        {sc && <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 12, lineHeight: 1.6 }}>
          <span style={{ color: 'var(--tx3)' }}>{f.best}d best × {f.factor || 1.5} = </span>
          <b style={{ color: 'var(--am)' }}>{re(f.best || 0, f.factor || 1.5).toFixed(1)}d</b>
          <span style={{ color: 'var(--tx3)' }}> {t('qe.realisticSuffix')}{isCp ? ' · ⚡ CP' : ''}</span>
          <br />
          <span style={{ color: 'var(--tx3)' }}>{iso(sc.startD)} → {iso(sc.endD)} · {sc.weeks}w · {sc.person} ({sc.capPct}% cap)</span>
        </div>}
        {!sc && f.best > 0 && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>
          {f.best}d best × {f.factor || 1.5} = {re(f.best || 0, f.factor || 1.5).toFixed(1)}d {t('qe.realisticSuffix')} · {t('qe.notScheduled')}
        </div>}
      </>}

      {/* ── 6. SCHEDULING ──────────────────────────────────────────────── */}
      {isLeaf && <>
        <div className="frow">
          <div className="field"><label>{t('qe.decideBy')}</label>
            <input type="date" value={f.decideBy || ''} onChange={e => s('decideBy', e.target.value)} />
          </div>
          <div className="field"><label>{t('qe.pinnedStart')} {f.pinnedStart && <span style={{ fontSize: 10, color: 'var(--am)' }}>📌</span>}</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="date" value={f.pinnedStart || ''} onChange={e => s('pinnedStart', e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-sec btn-xs" onClick={() => s('pinnedStart', iso(new Date()))}>{t('nm.pinToday')}</button>
              {f.pinnedStart && <button className="btn btn-ghost btn-xs" onClick={() => s('pinnedStart', '')}>×</button>}
            </div>
          </div>
        </div>
        <div className="frow" style={{ alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
            <label style={{ fontSize: 11, color: 'var(--tx2)', margin: 0 }}>{t('nm.runParallel')}</label>
            <label className="toggle"><input type="checkbox" checked={!!f.parallel} onChange={e => s('parallel', e.target.checked)} /><span className="slider" /></label>
            {f.parallel && <span style={{ fontSize: 10, color: 'var(--am)' }}>≡</span>}
          </div>
          {onReorderInQueue && !f.parallel && <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
            <span style={{ fontSize: 10, color: 'var(--tx3)', marginRight: 4 }}>{t('qe.queue')}</span>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'first')} style={{ padding: '2px 6px' }}>⤒</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'earlier')} style={{ padding: '2px 6px' }}>▲</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'later')} style={{ padding: '2px 6px' }}>▼</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'last')} style={{ padding: '2px 6px' }}>⤓</button>
          </div>}
        </div>
      </>}

      {/* ── 7. DEPENDENCIES ────────────────────────────────────────────── */}
      <div className="frow" style={{ alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('qe.predecessors')} {!isLeaf && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{t('nm.appliesToAllLeaves')}</span>}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
            {(f.deps || []).map(d => { const dn = findById(d); return <div key={d} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{d}</span>
                {dn?.name && <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{dn.name}</span>}
              </div>
              <span className="tag-x" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx3)' }} onClick={() => setF(x => { const nd = (x.deps || []).filter(y => y !== d); const nl = { ...(x._depLabels || {}) }; delete nl[d]; return { ...x, deps: nd, _depLabels: nl }; })}>×</span>
            </div>; })}
          </div>
          <SearchSelect options={allIds.filter(i => !(f.deps || []).includes(i)).map(i => ({ id: i, label: findById(i)?.name || '' }))} onSelect={id => s('deps', [...new Set([...(f.deps || []), id])])} placeholder={`+ ${t('qe.predecessors')}`} showIds />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('qe.successors')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
            {successors.map(succ => <div key={succ.id} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)', flexShrink: 0, fontWeight: 600 }}>{succ.id}</span>
                <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{succ.name}</span>
              </div>
              <span className="tag-x" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx3)' }} onClick={() => onUpdate({ ...succ, deps: (succ.deps || []).filter(d => d !== node.id) })}>×</span>
            </div>)}
          </div>
          <SearchSelect options={allIds.filter(i => !successorIds.has(i) && i !== node.id && !(f.deps || []).includes(i)).map(i => ({ id: i, label: findById(i)?.name || '' }))} onSelect={id => { const tgt = findById(id); if (tgt) onUpdate({ ...tgt, deps: [...new Set([...(tgt.deps || []), node.id])] }); }} placeholder={`+ ${t('qe.successors')}`} showIds />
        </div>
      </div>

      {/* ── 9. STRUCTURE (rare) ─────────────────────────────────────────── */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--b)' }}>
        <button className="btn btn-ghost btn-xs" onClick={() => setShowStructure(v => !v)} style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
          {showStructure ? '▼' : '▶'} {t('nm.advanced')}
        </button>
        {showStructure && <div style={{ marginTop: 10 }}>
          {onMove && <div className="field"><label>{t('nm.parent')}</label>
            <SearchSelect value={currentParentId} options={parentOptions} onSelect={newPid => {
              if (newPid === currentParentId) return;
              if (isDirty) { alert(t('nm.saveFirst')); return; }
              const sub = tree.filter(r => r.id === node.id || r.id.startsWith(node.id + '.')).length;
              if (!confirm(t('nm.confirmMove', node.name, sub - 1, newPid || t('nm.topLevel')))) return;
              onMove(node.id, newPid);
            }} placeholder={t('nm.topLevel')} showIds />
          </div>}
          {isLeaf && <div className="field"><label>{t('nm.seq')}</label><input type="number" value={f.seq || 0} onChange={e => s('seq', +e.target.value)} style={{ width: 80, fontFamily: 'var(--mono)' }} /></div>}
        </div>}
      </div>

      {/* ── 10. ACTIONS ─────────────────────────────────────────────────── */}
      <div className="modal-footer">
        {onDelete && <button className="btn btn-danger" onClick={() => { if (confirm(hasChildren(tree, node.id) ? t('qe.confirmDeleteChildren', node.id) : t('qe.confirmDelete', node.id))) { onDelete(node.id); onClose(); } }}>{t('delete')}</button>}
        {onDuplicate && <button className="btn btn-sec" onClick={() => {
          if (isDirty && !confirm(t('nm.unsavedDiscard'))) return;
          const sub = tree.filter(r => r.id === node.id || r.id.startsWith(node.id + '.')).length;
          if (confirm(sub > 1 ? t('qe.confirmDuplicateN', node.name, sub - 1) : t('qe.confirmDuplicate', node.name))) onDuplicate(node.id);
        }}>⧉ {t('qe.duplicate')}</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sec" onClick={safeClose}>{t('cancel')}</button>
        <button className="btn btn-pri" onClick={() => { onUpdate(f); onClose(); }} disabled={!isDirty}>{isDirty ? t('save') : t('nm.noChanges')}</button>
      </div>
    </div>
  </div>;
}
