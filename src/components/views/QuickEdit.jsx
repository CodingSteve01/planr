import { useState, useEffect, useMemo } from 'react';
import { SBadge } from '../shared/Badges.jsx';
import { SL, GT } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { hasChildren, isLeafNode, leafNodes, leafProgress, re, derivePhaseStatus } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';
import { useT } from '../../i18n.jsx';

export function QuickEdit({ node, tree, members, teams, taskTemplates, scheduled, cpSet, stats, onUpdate, onDelete, onEstimate, onDuplicate, onReorderInQueue }) {
  const { t } = useT();
  const [f, setF] = useState({ ...node });
  useEffect(() => setF({ ...node }), [node?.id]);
  const CONF_OPTS = useMemo(() => [
    { id: '', label: t('auto') },
    { id: 'committed', label: `${t('conf.committed.dot')} ${t('conf.committed')}` },
    { id: 'estimated', label: `${t('conf.estimated.dot')} ${t('conf.estimated')}` },
    { id: 'exploratory', label: `${t('conf.exploratory.dot')} ${t('conf.exploratory')}` },
  ], [t]);
  const sc = scheduled?.find(s => s.id === node?.id);
  const isCp = cpSet?.has(node?.id);
  if (!node) return null;
  const isLeaf = isLeafNode(tree, node.id);
  const isRoot = !node.id.includes('.');
  const s = (k, v) => { const n = { ...f, [k]: v }; setF(n); onUpdate(n); };
  const fl = () => onUpdate(f);
  const allIds = tree.map(r => r.id).filter(i => i !== node.id);
  const memberLabel = m => `${m.name || m.id}${m.team ? ' — ' + (teams.find(tm => tm.id === m.team)?.name || m.team) : ''}`;
  const SIZES = [['XS', 1, 1.3], ['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]];
  const nearestSize = f.best > 0 ? SIZES.reduce((best, sz) => Math.abs(sz[1] - f.best) < Math.abs(best[1] - f.best) ? sz : best, SIZES[0]) : null;

  return <>
    {/* ── 1. HEADER ──────────────────────────────────────────────────── */}
    {isCp && <div style={{ background: '#3d0a0e', border: '1px solid var(--re)', borderRadius: 'var(--r)', padding: '6px 10px', marginBottom: 10, fontSize: 11, color: '#fda4af', display: 'flex', gap: 6, alignItems: 'center' }}>⚡ {t('qe.cpItem')}</div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
      {isLeaf && <SBadge s={node.status} />}
      {!isLeaf && <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 10 }}>{SL[f.status] || f.status} <span style={{ fontSize: 8, color: 'var(--tx3)', fontWeight: 400 }}>{t('qe.autoStatus')}</span></span>}
    </div>

    {/* ── 2. IDENTITY + NOTES ─────────────────────────────────────────── */}
    <div className="field"><label>{t('qe.name')}</label><input value={f.name || ''} onChange={e => setF(x => ({ ...x, name: e.target.value }))} onBlur={fl} /></div>
    <div className="field"><label>{t('qe.notes')}</label><textarea value={f.note || ''} onChange={e => setF(x => ({ ...x, note: e.target.value }))} onBlur={fl} rows={2} /></div>
    {isRoot && <>
      <div className="field"><label>{t('qe.focusType')}</label>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {['', 'goal', 'painpoint', 'deadline'].map(ft =>
            <button key={ft} className={`goal-type-btn${(f.type || '') === ft ? ' active' : ''}`} style={{ fontSize: 10, padding: '3px 7px' }}
              onClick={() => s('type', ft)}>{ft ? `${GT[ft]} ${t(ft)}` : t('none')}</button>)}
        </div>
      </div>
      {f.type && <div className="frow">
        <div className="field"><label>{t('qe.severity')}</label>
          <SearchSelect value={f.severity || 'high'} options={[{ id: 'critical', label: t('critical') }, { id: 'high', label: t('high') }, { id: 'medium', label: t('medium') }]} onSelect={v => s('severity', v)} />
        </div>
        {f.type === 'deadline' && <div className="field"><label>{t('qe.date')}</label><input type="date" value={f.date || ''} onChange={e => s('date', e.target.value)} /></div>}
      </div>}
      {f.type && <div className="field"><label>{t('qe.description')}</label><input value={f.description || ''} onChange={e => setF(x => ({ ...x, description: e.target.value }))} onBlur={fl} placeholder={t('qe.descPlaceholder')} /></div>}
    </>}

    {/* ── 3. STATUS + PROGRESS (compact) ───────────────────────────────── */}
    {isLeaf && !(f.phases?.length) && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <div style={{ flex: '0 0 100px' }}>
        <SearchSelect value={f.status || 'open'} options={[{ id: 'open', label: t('open') }, { id: 'wip', label: t('wip') }, { id: 'done', label: t('done') }]} onSelect={v => s('status', v)} />
      </div>
      <input type="range" min="0" max="100" step="5" value={f.progress ?? leafProgress(f)}
        onChange={e => { const v = +e.target.value; const n = { ...f, progress: v }; if (v >= 100 && f.status !== 'done') n.status = 'done'; else if (v > 0 && v < 100 && f.status !== 'wip') n.status = 'wip'; else if (v === 0 && f.status !== 'open') n.status = 'open'; setF(n); onUpdate(n); }}
        style={{ flex: 1, accentColor: 'var(--ac)' }} />
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', flexShrink: 0, width: 28, textAlign: 'right' }}>{f.progress ?? leafProgress(f)}%</span>
    </div>}
    {!isLeaf && (() => {
      const st = stats?.[node.id];
      const leafCount = leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')).length;
      const doneCount = leafNodes(tree).filter(c => c.id.startsWith(node.id + '.') && c.status === 'done').length;
      return <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--tx2)' }}>{doneCount}/{leafCount} {t('qe.leafItems')} {t('done')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontFamily: 'var(--mono)', fontSize: 11 }}>
          <span style={{ color: 'var(--tx3)' }}>{t('qe.best')}</span><span>{st?._b?.toFixed(0) || 0}d</span>
          <span style={{ color: 'var(--tx3)' }}>{t('qe.realistic')}</span><span style={{ color: 'var(--am)' }}>{st?._r?.toFixed(1) || 0}d</span>
          {st?._startD && <><span style={{ color: 'var(--tx3)' }}>{t('qe.period')}</span><span>{st._startD.toLocaleDateString('de-DE')} — {st._endD.toLocaleDateString('de-DE')}</span></>}
        </div>
      </div>;
    })()}

    {/* ── 3b. PHASES (non-root nodes) ──────────────────────────────────── */}
    {!isRoot && (() => { try {
      const phases = Array.isArray(f.phases) ? f.phases : [];
      const hasPhases = phases.length > 0;
      const phDerived = derivePhaseStatus(phases);
      const tTemplates = Array.isArray(taskTemplates) ? taskTemplates : [];
      const teamName = id => (teams || []).find(tm => tm.id === id)?.name || id;
      const currentIdx = phases.findIndex(p => p.status !== 'done');

      const applyTemplate = (tplId) => {
        const tpl = tTemplates.find(tp => tp.id === tplId);
        if (!tpl) return;
        const newPhases = tpl.phases.map((p, i) => ({ id: 'ph' + (Date.now() + i), name: p.name, team: p.team || '', status: 'open' }));
        const n = { ...f, phases: newPhases, templateId: tplId };
        const d = derivePhaseStatus(newPhases);
        if (d) { n.status = d.status; n.progress = d.progress; }
        setF(n); onUpdate(n);
      };

      const advancePhase = (phId) => {
        const newPhases = phases.map(p => {
          if (p.id !== phId) return p;
          const next = p.status === 'open' ? 'wip' : p.status === 'wip' ? 'done' : 'open';
          return { ...p, status: next };
        });
        const n = { ...f, phases: newPhases };
        const d = derivePhaseStatus(newPhases);
        if (d) { n.status = d.status; n.progress = d.progress; }
        setF(n); onUpdate(n);
      };

      const addFreePhase = () => {
        const newPhases = [...phases, { id: 'ph' + Date.now(), name: t('ph.freePhase'), team: '', status: 'open' }];
        const n = { ...f, phases: newPhases };
        setF(n); onUpdate(n);
      };

      const removePhase = (phId) => {
        const newPhases = phases.filter(p => p.id !== phId);
        const n = { ...f, phases: newPhases.length ? newPhases : undefined, templateId: newPhases.length ? f.templateId : undefined };
        const d = derivePhaseStatus(newPhases);
        if (d) { n.status = d.status; n.progress = d.progress; }
        setF(n); onUpdate(n);
      };

      const movePhase = (idx, dir) => {
        const newPhases = [...phases];
        const [item] = newPhases.splice(idx, 1);
        newPhases.splice(idx + dir, 0, item);
        const n = { ...f, phases: newPhases };
        setF(n); onUpdate(n);
      };

      const setPhaseTeam = (phId, teamId) => {
        const newPhases = phases.map(p => p.id === phId ? { ...p, team: teamId } : p);
        const n = { ...f, phases: newPhases };
        setF(n); onUpdate(n);
      };

      const renamePhase = (phId, name) => {
        const newPhases = phases.map(p => p.id === phId ? { ...p, name } : p);
        setF({ ...f, phases: newPhases });
      };

      const flushPhases = () => onUpdate(f);

      const clearAll = () => {
        if (!confirm(t('ph.confirmClear'))) return;
        const n = { ...f, phases: undefined, templateId: undefined };
        setF(n); onUpdate(n);
      };

      return <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)', marginBottom: 6, display: 'block' }}>{t('ph.phases')}</label>

        {hasPhases && <>
          {f.templateId && (() => { const tpl = tTemplates.find(tp => tp.id === f.templateId); return tpl ? <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 6 }}>{t('ph.applied', tpl.name)}</div> : null; })()}
          {phDerived && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span className={`badge b${phDerived.status[0]}`} style={{ fontSize: 10 }}>{phDerived.status === 'done' ? t('done') : phDerived.status === 'wip' ? t('wip') : t('open')}</span>
            <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: phDerived.progress + '%', height: '100%', background: 'var(--ac)', borderRadius: 2, transition: 'width .2s' }} />
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', width: 28, textAlign: 'right' }}>{phDerived.progress}%</span>
          </div>}

          {phases.map((ph, i) => {
            const isCurrent = i === currentIdx;
            const dot = ph.status === 'done' ? '✓' : ph.status === 'wip' ? '◐' : '○';
            const dotColor = ph.status === 'done' ? 'var(--gn)' : ph.status === 'wip' ? 'var(--ac)' : 'var(--tx3)';
            return <div key={ph.id} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
              background: isCurrent ? 'var(--bg3)' : 'transparent', borderRadius: 4, marginBottom: 2,
            }}>
              <span style={{ cursor: 'pointer', fontSize: 13, color: dotColor, width: 18, textAlign: 'center', flexShrink: 0, userSelect: 'none' }}
                onClick={() => advancePhase(ph.id)} title={`${ph.status} → click to advance`}>{dot}</span>
              <input value={ph.name} onChange={e => renamePhase(ph.id, e.target.value)} onBlur={flushPhases}
                style={{ flex: 1, fontSize: 11, background: 'transparent', border: 'none', color: ph.status === 'done' ? 'var(--tx3)' : 'var(--tx)', padding: '1px 2px', outline: 'none', textDecoration: ph.status === 'done' ? 'line-through' : 'none', minWidth: 0 }} />
              {ph.team && <span style={{ fontSize: 9, color: 'var(--tx3)', flexShrink: 0 }}>{teamName(ph.team)}</span>}
              <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                <button className="btn btn-sec btn-xs" style={{ padding: '1px 3px', fontSize: 9 }} disabled={i === 0} onClick={() => movePhase(i, -1)}>▲</button>
                <button className="btn btn-sec btn-xs" style={{ padding: '1px 3px', fontSize: 9 }} disabled={i === phases.length - 1} onClick={() => movePhase(i, 1)}>▼</button>
                <span style={{ cursor: 'pointer', fontSize: 10, color: 'var(--tx3)', opacity: .6, padding: '0 2px' }} onClick={() => removePhase(ph.id)}>×</span>
              </div>
            </div>;
          })}

          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button className="btn btn-sec btn-xs" onClick={addFreePhase}>{t('ph.addPhase')}</button>
            <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, color: 'var(--tx3)' }} onClick={clearAll}>{t('ph.clearPhases')}</button>
          </div>
        </>}

        {!hasPhases && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 6 }}>
          {t('ph.noPhases')}
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {tTemplates.length > 0 && <SearchSelect
              options={tTemplates.map(tp => ({ id: tp.id, label: tp.name }))}
              onSelect={applyTemplate} placeholder={t('ph.applyTemplate')} />}
            <button className="btn btn-sec btn-xs" onClick={addFreePhase}>{t('ph.addPhase')}</button>
          </div>
        </div>}
      </div>;
    } catch(e) { console.error('Phases render error:', e); return null; } })()}

    {/* ── 4. ASSIGNMENT ─────────────────────────────────────────────────── */}
    <div className="field"><label>{t('qe.team')}</label>
      <SearchSelect value={f.team || ''} options={teams.map(tm => ({ id: tm.id, label: tm.name || tm.id }))} onSelect={v => s('team', v)} allowEmpty />
    </div>
    {isLeaf && <div className="field"><label>{t('qe.assignee')}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: (f.assign || []).length ? 6 : 0 }}>
        {(f.assign || []).map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(x => x !== a))}>×</span></span>; })}
      </div>
      <SearchSelect
        options={members.filter(m => !(f.assign || []).includes(m.id)).map(m => ({ id: m.id, label: memberLabel(m) }))}
        onSelect={id => {
          const m = members.find(x => x.id === id);
          const n = { ...f, assign: [...new Set([...(f.assign || []), id])], team: m?.team || f.team };
          setF(n); onUpdate(n);
        }}
        placeholder={t('qe.assignPerson')}
      />
    </div>}

    {/* ── 5. ESTIMATION ────────────────────────────────────────────────── */}
    {isLeaf && <>
      <div className="field"><label>{t('qe.quickEstimate')}</label>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 4 }}>
          {SIZES.map(([sz, d, fc]) => {
            const exact = f.best === d;
            const nearest = !exact && nearestSize?.[0] === sz && f.best > 0;
            return <button key={sz} className={`btn ${exact ? 'btn-pri' : 'btn-sec'} btn-sm`}
              style={nearest ? { borderColor: 'var(--ac)', opacity: 0.8 } : undefined}
              onClick={() => { const n = { ...f, best: d, factor: fc }; setF(n); onUpdate(n); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{d}d</span></button>;
          })}
        </div>
        {onEstimate && <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, padding: '2px 0' }} onClick={() => onEstimate(node)}>{t('qe.estimationWizard')}</button>}
      </div>
      <div className="frow">
        <div className="field"><label>{t('qe.bestDays')}</label><input type="number" min="0" value={f.best || 0} onChange={e => setF(x => ({ ...x, best: +e.target.value }))} onBlur={fl} /></div>
        <div className="field"><label>{t('qe.factor')}</label><input type="number" step="0.1" min="1" max="5" value={f.factor || 1.5} onChange={e => setF(x => ({ ...x, factor: +e.target.value }))} onBlur={fl} /></div>
        <div className="field"><label>{t('qe.priority')}</label>
          <SearchSelect value={String(f.prio || 2)} options={[{ id: '1', label: `1 ${t('critical')}` }, { id: '2', label: `2 ${t('high')}` }, { id: '3', label: `3 ${t('medium')}` }, { id: '4', label: `4 ${t('low')}` }]} onSelect={v => s('prio', +v)} />
        </div>
      </div>
      <div className="field"><label>{t('qe.confidence')}</label>
        <SearchSelect value={f.confidence || ''} options={CONF_OPTS} onSelect={v => s('confidence', v)} />
      </div>
      {/* Scheduled info — normal text, not code-block */}
      {sc && <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 12, lineHeight: 1.6 }}>
        <span style={{ color: 'var(--tx3)' }}>{f.best}d × {f.factor || 1.5} = </span>
        <b style={{ color: 'var(--am)' }}>{re(f.best || 0, f.factor || 1.5).toFixed(1)}d</b>
        <span style={{ color: 'var(--tx3)' }}> {t('qe.realisticSuffix')}{isCp ? ' · ⚡ CP' : ''}</span>
        <br />
        <span style={{ color: 'var(--tx3)' }}>{iso(sc.startD)} → {iso(sc.endD)} · {sc.weeks}w · {sc.person}</span>
      </div>}
      {!sc && f.best > 0 && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>
        {f.best}d × {f.factor || 1.5} = {re(f.best || 0, f.factor || 1.5).toFixed(1)}d {t('qe.realisticSuffix')} · {t('qe.notScheduled')}
      </div>}
    </>}

    {/* ── 6. SCHEDULING ────────────────────────────────────────────────── */}
    {isLeaf && <>
      <div className="frow">
        <div className="field"><label>{t('qe.decideBy')}</label>
          <input type="date" value={f.decideBy || ''} onChange={e => { const v = e.target.value; const n = { ...f, decideBy: v }; setF(n); onUpdate(n); }} />
        </div>
        <div className="field"><label>{t('qe.pinnedStart')} {f.pinnedStart && <span style={{ fontSize: 10, color: 'var(--am)' }}>📌</span>}</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="date" value={f.pinnedStart || ''} onChange={e => { const v = e.target.value; const n = { ...f, pinnedStart: v }; setF(n); onUpdate(n); }} style={{ flex: 1 }} />
            {f.pinnedStart && <button className="btn btn-ghost btn-sm" onClick={() => { const n = { ...f, pinnedStart: '' }; setF(n); onUpdate(n); }}>×</button>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--tx2)', margin: 0 }}>{t('qe.parallel')}</label>
        <label className="toggle"><input type="checkbox" checked={!!f.parallel} onChange={e => s('parallel', e.target.checked)} /><span className="slider" /></label>
        {f.parallel && <span style={{ fontSize: 10, color: 'var(--am)' }}>≡</span>}
        {onReorderInQueue && !f.parallel && <>
          <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 'auto' }}>{t('qe.queue')}</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'first')} style={{ padding: '2px 5px' }} title={t('nm.first')}>⤒</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'earlier')} style={{ padding: '2px 5px' }} title={t('nm.earlier')}>▲</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'later')} style={{ padding: '2px 5px' }} title={t('nm.later')}>▼</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'last')} style={{ padding: '2px 5px' }} title={t('nm.last')}>⤓</button>
          </div>
        </>}
      </div>
    </>}

    {/* ── 7. PREDECESSORS ──────────────────────────────────────────────── */}
    <div className="field"><label>{t('qe.predecessors')}{!isLeaf ? ` (${t('qe.allLeaves')})` : ''}</label>
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
        {/* Inherited deps from ancestors */}
        {(() => {
          const ownSet = new Set(f.deps || []);
          const inherited = [];
          let aid = node.id.split('.').slice(0, -1).join('.');
          while (aid) {
            const ancestor = tree.find(r => r.id === aid);
            if (ancestor?.deps) ancestor.deps.forEach(d => { if (!ownSet.has(d)) { inherited.push({ dep: d, from: aid }); ownSet.add(d); } });
            aid = aid.split('.').slice(0, -1).join('.');
          }
          return inherited.map(({ dep, from }) => { const dn = tree.find(r => r.id === dep); return <div key={`inh_${dep}_${from}`} className="dep-row" style={{ opacity: 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{dep}</span>
              {dn?.name && <span style={{ fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{dn.name}</span>}
            </div>
            <span style={{ fontSize: 9, color: 'var(--tx3)', flexShrink: 0 }}>{t('ph.via', from)}</span>
          </div>; });
        })()}
      </div>
      <SearchSelect options={allIds.map(i => { const n = tree.find(r => r.id === i); return { id: i, label: n?.name || '' }; })} onSelect={id => s('deps', [...new Set([...(f.deps || []), id])])} placeholder={`+ ${t('qe.predecessors')}`} showIds />
    </div>

    {/* ── ACTIONS ────────────────────────────────────────────────────────── */}
    <hr className="divider" />
    <div style={{ display: 'flex', gap: 6 }}>
      {onDuplicate && <button className="btn btn-sec" style={{ flex: 1 }} onClick={() => {
        const sub = tree.filter(r => r.id === node.id || r.id.startsWith(node.id + '.')).length;
        if (confirm(sub > 1 ? t('qe.confirmDuplicateN', node.name, sub - 1) : t('qe.confirmDuplicate', node.name))) onDuplicate(node.id);
      }}>⧉ {t('qe.duplicate')}</button>}
      {onDelete && <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { if (confirm(hasChildren(tree, node.id) ? t('qe.confirmDeleteChildren', node.id) : t('qe.confirmDelete', node.id))) onDelete(node.id); }}>{t('delete')}</button>}
    </div>
  </>;
}
