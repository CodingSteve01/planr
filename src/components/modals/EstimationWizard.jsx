import { useState, useMemo, useEffect } from 'react';
import { leafNodes, parentId } from '../../utils/scheduler.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { instantiateTemplatePhases, normalizePhases, phaseTeamLabel } from '../../utils/phases.js';
import { useT } from '../../i18n.jsx';

const SIZE_DATA = [
  { label: 'XS', days: 1, key: 'ew.xs' },
  { label: 'S', days: 3, key: 'ew.s' },
  { label: 'M', days: 7, key: 'ew.m' },
  { label: 'L', days: 15, key: 'ew.l' },
  { label: 'XL', days: 30, key: 'ew.xl' },
  { label: 'XXL', days: 45, key: 'ew.xxl' },
];

const RISK_DATA = [
  { id: 'new_tech', key: 'ew.risk.newTech', weight: 0.15 },
  { id: 'external', key: 'ew.risk.external', weight: 0.1 },
  { id: 'migration', key: 'ew.risk.migration', weight: 0.15 },
  { id: 'ux', key: 'ew.risk.ux', weight: 0.1 },
  { id: 'stakeholder', key: 'ew.risk.stakeholder', weight: 0.1 },
  { id: 'integration', key: 'ew.risk.integration', weight: 0.15 },
  { id: 'legacy', key: 'ew.risk.legacy', weight: 0.1 },
  { id: 'unclear', key: 'ew.risk.unclear', weight: 0.2 },
];

export function EstimationWizard({ node, tree, teams, taskTemplates, onSave, onClose }) {
  const { t } = useT();
  const tTemplates = Array.isArray(taskTemplates) ? taskTemplates : [];

  const SIZES = useMemo(() => SIZE_DATA.map(s => ({ ...s, desc: t(s.key) })), [t]);
  const RISKS = useMemo(() => RISK_DATA.map(r => ({ ...r, label: t(r.key) })), [t]);

  const [step, setStep] = useState(0);
  const [scope, setScope] = useState(node?.note || '');
  const [size, setSize] = useState(SIZE_DATA.findIndex(s => s.days === (node?.best || 0)) >= 0 ? SIZE_DATA.findIndex(s => s.days === (node?.best || 0)) : -1);
  const [risks, setRisks] = useState(new Set());
  const [optimistic, setOptimistic] = useState(node?.best || 0);
  const [realistic, setRealistic] = useState(Math.round((node?.best || 0) * 1.3));
  const [pessimistic, setPessimistic] = useState(Math.round((node?.best || 0) * 2));
  const [selDeps, setSelDeps] = useState(node?.deps || []);
  const [confidence, setConfidence] = useState(node?.confidence || '');
  const [selTemplate, setSelTemplate] = useState(node?.templateId || '');
  const [phases, setPhases] = useState(() => normalizePhases(node?.phases || []));

  // PERT estimate: (O + 4R + P) / 6
  const pert = useMemo(() => (optimistic + 4 * realistic + pessimistic) / 6, [optimistic, realistic, pessimistic]);
  const riskFactor = useMemo(() => 1 + [...risks].reduce((s, id) => s + (RISK_DATA.find(r => r.id === id)?.weight || 0), 0), [risks]);
  const finalBest = useMemo(() => Math.round(pert), [pert]);
  const finalFactor = useMemo(() => Math.round(riskFactor * 10) / 10, [riskFactor]);
  const finalRealistic = useMemo(() => finalBest * Math.min(finalFactor, 1.3) * 1.15, [finalBest, finalFactor]);

  // Related items for context
  const relatedItems = useMemo(() => {
    if (!node) return [];
    const pid = parentId(node.id);
    return leafNodes(tree).filter(r => r.id !== node.id && r.id.startsWith(pid + '.') && r.best > 0);
  }, [node, tree]);

  // Ancestor breadcrumb for context
  const ancestors = useMemo(() => {
    if (!node) return [];
    const out = [];
    const parts = node.id.split('.');
    for (let i = 1; i < parts.length; i++) {
      const aid = parts.slice(0, i).join('.');
      const a = tree.find(r => r.id === aid);
      if (a) out.push(a);
    }
    return out;
  }, [node, tree]);

  const steps = t('ew.steps').split(',');

  function onSizeSelect(idx) {
    setSize(idx);
    const d = SIZE_DATA[idx].days;
    setOptimistic(Math.round(d * 0.6));
    setRealistic(d);
    setPessimistic(Math.round(d * 1.8));
  }

  // Dirty detection: any user input that differs from the original node state
  const origScope = node?.note || '';
  const origDeps = (node?.deps || []).join(',');
  const isDirty = scope !== origScope || size !== -1 && SIZE_DATA[size]?.days !== node?.best || risks.size > 0 || selDeps.join(',') !== origDeps;
  const safeClose = () => { if (isDirty && !confirm(t('ew.discardConfirm'))) return; onClose(); };
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') safeClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isDirty]);

  return <div className="overlay">
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      {ancestors.length > 0 && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
        {ancestors.map(a => <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{a.id}</span>
          <span style={{ color: 'var(--tx2)' }}>{a.name}</span>
          <span style={{ color: 'var(--b3)' }}>›</span>
        </span>)}
      </div>}
      <h2 style={{ flexWrap: 'wrap', gap: 8 }}>
        <span>{t('ew.title')}</span>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', fontSize: 12, fontWeight: 400 }}>{node?.id}</span>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--tx)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{node?.name}</span>
      </h2>
      {node?.note && <div style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', borderLeft: '3px solid var(--ac)', borderRadius: 'var(--r)', padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'var(--tx2)', fontStyle: 'italic' }} title="Existing note on this task">{node.note}</div>}

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
        {steps.map((s, i) => <div key={s} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }} onClick={() => setStep(i)}>
          <div style={{ height: 3, background: i <= step ? 'var(--ac)' : 'var(--b2)', borderRadius: 2, marginBottom: 4 }} />
          <div style={{ fontSize: 9, color: i === step ? 'var(--ac)' : 'var(--tx3)', fontWeight: i === step ? 600 : 400 }}>{s}</div>
        </div>)}
      </div>

      {/* Step 0: Scope + Template */}
      {step === 0 && <div className="fade">
        <div className="guide-card" style={{ marginBottom: 14 }}>
          <div className="guide-kicker">{t('ew.flowKicker')}</div>
          <div className="guide-title">{t('ew.flowTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--tx2)' }}>{t('ew.flowBody')}</div>
        </div>

        <div className="field"><label>{t('ew.scopeQ')}</label>
          <textarea value={scope} onChange={e => setScope(e.target.value)} rows={3} placeholder="Describe the scope: what's included, what's not, acceptance criteria..." />
          <p className="helper">{t('ew.scopeHelp')}</p>
        </div>

        {/* Template / Phases — in Scope step for non-root nodes */}
        {node?.id?.includes('.') && <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 6 }}>{t('ph.phases')}</div>
          {tTemplates.length > 0 && <div className="field" style={{ marginBottom: 10 }}>
            <label>{t('ew.templateLabel')}</label>
            <SearchSelect value={selTemplate || ''} options={tTemplates.map(tp => ({ id: tp.id, label: tp.name }))}
              onSelect={tplId => {
                if (!tplId) {
                  setSelTemplate('');
                  setPhases([]);
                  return;
                }
                const tpl = tTemplates.find(tp => tp.id === tplId);
                if (!tpl) return;
                setSelTemplate(tplId);
                setPhases(instantiateTemplatePhases(tpl.phases));
              }} placeholder={t('ph.applyTemplate')} allowEmpty emptyLabel={t('none')} />
            <p className="helper">{t('ew.templateHelp')}</p>
          </div>}
          {phases?.length > 0 && <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
              {phases.map(ph => {
                const tn = phaseTeamLabel(ph, teams);
                return <div key={ph.id} style={{ fontSize: 11, color: 'var(--tx2)', display: 'flex', gap: 6, padding: '2px 0' }}>
                  <span>○ {ph.name}</span>
                  {ph.effortPct && <span style={{ color: 'var(--tx3)' }}>{ph.effortPct}%</span>}
                  {tn && <span style={{ color: 'var(--tx3)' }}>— {tn}</span>}
                </div>;
              })}
            </div>
            <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, color: 'var(--tx3)' }}
              onClick={() => { setPhases([]); setSelTemplate(''); }}>{t('ph.clearPhases')}</button>
          </>}
          {!phases?.length && !tTemplates.length && <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{t('ph.noPhases')}</div>}
        </div>}

        {relatedItems.length > 0 && <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 6 }}>{t('ew.scopeRelated')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {relatedItems.map(r => <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--tx2)', padding: '3px 8px', background: 'var(--bg3)', borderRadius: 4 }}>
              <span>{r.id} — {r.name}</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{r.best}d (x{r.factor || 1.5})</span>
            </div>)}
          </div>
        </div>}
      </div>}

      {/* Step 1: T-Shirt Size */}
      {step === 1 && <div className="fade">
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>{t('ew.sizeQ')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SIZES.map((s, i) => <div key={s.label}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: size === i ? 'var(--ac2)' + '22' : 'var(--bg3)', border: `1px solid ${size === i ? 'var(--ac)' : 'var(--b2)'}`, borderRadius: 'var(--r)', cursor: 'pointer' }}
            onClick={() => onSizeSelect(i)}>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, width: 40, color: size === i ? 'var(--ac)' : 'var(--tx2)' }}>{s.label}</span>
            <div><div style={{ fontWeight: 500, fontSize: 12 }}>{s.days} {t('days')}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>{s.desc}</div></div>
          </div>)}
        </div>
      </div>}

      {/* Step 2: Risks */}
      {step === 2 && <div className="fade">
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>{t('ew.risksQ')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {RISKS.map(r => <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: risks.has(r.id) ? 'var(--am)' + '15' : 'var(--bg3)', border: `1px solid ${risks.has(r.id) ? 'var(--am)' + '44' : 'var(--b2)'}`, borderRadius: 'var(--r)', cursor: 'pointer' }}>
            <input type="checkbox" checked={risks.has(r.id)} onChange={() => setRisks(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
            <div style={{ flex: 1 }}><span style={{ fontSize: 12, fontWeight: 500 }}>{r.label}</span></div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)' }}>+{Math.round(r.weight * 100)}%</span>
          </label>)}
        </div>
        <div className="calc" style={{ marginTop: 12 }}>
          <span>{t('ew.riskFactor')}:</span><b style={{ color: riskFactor > 1.3 ? 'var(--re)' : 'var(--am)' }}>x{riskFactor.toFixed(2)}</b>
          <span>{t('ew.risksSelected', risks.size)}</span>
        </div>
      </div>}

      {/* Step 3: Three-point estimate */}
      {step === 3 && <div className="fade">
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>{t('ew.threePointQ')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="field"><label>{t('ew.optimistic')}</label>
            <input type="number" min="0" value={optimistic} onChange={e => setOptimistic(+e.target.value)} />
            <p className="helper">{t('ew.optHelp')}</p>
          </div>
          <div className="field"><label>{t('ew.realisticLabel')}</label>
            <input type="number" min="0" value={realistic} onChange={e => setRealistic(+e.target.value)} />
            <p className="helper">{t('ew.realHelp')}</p>
          </div>
          <div className="field"><label>{t('ew.pessimistic')}</label>
            <input type="number" min="0" value={pessimistic} onChange={e => setPessimistic(+e.target.value)} />
            <p className="helper">{t('ew.pessHelp')}</p>
          </div>
        </div>
        <div className="calc">
          <span>{t('ew.pert')}:</span><b>{pert.toFixed(1)} {t('days')}</b>
          <span>{t('ew.stdDev')}:</span><b>{((pessimistic - optimistic) / 6).toFixed(1)}d</b>
          <span>{t('ew.confRange')}:</span><b>{Math.round(pert - (pessimistic - optimistic) / 6)}–{Math.round(pert + (pessimistic - optimistic) / 6)}d</b>
        </div>
      </div>}

      {/* Step 4: Dependencies */}
      {step === 4 && <div className="fade">
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>{t('ew.depsQ')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {selDeps.map(d => { const n = tree.find(r => r.id === d); return <span key={d} className="tag">{d} — {n?.name || ''}<span className="tag-x" onClick={() => setSelDeps(ds => ds.filter(x => x !== d))}>×</span></span>; })}
        </div>
        <SearchSelect options={tree.filter(r => r.id !== node?.id).map(r => ({ id: r.id, label: r.name }))} onSelect={v => setSelDeps(ds => [...new Set([...ds, v])])} placeholder={`+ ${t('qe.predecessors')}`} showIds />
        {selDeps.length > 0 && <div style={{ marginTop: 12, fontSize: 11, color: 'var(--tx3)' }}>
          {t('ew.depsBlocked', selDeps.length)}
        </div>}
      </div>}

      {/* Step 5: Confidence */}
      {step === 5 && <div className="fade">
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>{t('ew.confQ')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['', t('ew.confAuto'), t('ew.confAutoDesc')],
            ['committed', t('ew.confCommitted'), t('ew.confCommittedDesc')],
            ['estimated', t('ew.confEstimated'), t('ew.confEstimatedDesc')],
            ['exploratory', t('ew.confExploratory'), t('ew.confExploratoryDesc')],
          ].map(([v, label, desc]) => <div key={v}
            style={{ padding: '10px 14px', background: confidence === v ? (v === 'exploratory' ? 'rgba(127,127,127,.12)' : v === 'estimated' ? 'rgba(245,158,11,.10)' : v === 'committed' ? 'rgba(22,163,74,.10)' : 'var(--bg3)') : 'var(--bg3)', border: `1px solid ${confidence === v ? 'var(--ac)' : 'var(--b2)'}`, borderRadius: 'var(--r)', cursor: 'pointer' }}
            onClick={() => setConfidence(v)}>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{desc}</div>
          </div>)}
        </div>
        {riskFactor > 1.3 && !confidence && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--am)', background: 'rgba(245,158,11,.08)', padding: '8px 12px', borderRadius: 'var(--r)' }}>
          {t('ew.confRiskHint', risks.size, riskFactor.toFixed(1))}
        </div>}
      </div>}

      {/* Step 6: Summary */}
      {step === 6 && <div className="fade">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{t('ew.summary')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div className="sum-card"><div className="sum-v">{finalBest}</div><div className="sum-l">{t('ew.bestCase')}</div></div>
          <div className="sum-card"><div className="sum-v" style={{ color: 'var(--am)' }}>x{finalFactor}</div><div className="sum-l">{t('ew.uncertaintyFactor')}</div></div>
          <div className="sum-card"><div className="sum-v" style={{ color: 'var(--gr)' }}>{finalRealistic.toFixed(0)}</div><div className="sum-l">{t('ew.realisticDays')}</div></div>
          <div className="sum-card"><div className="sum-v">{Math.round(finalBest * finalFactor)}</div><div className="sum-l">{t('ew.worstCase')}</div></div>
        </div>
        {risks.size > 0 && <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 8 }}>
          <strong>{t('ew.risksIdentified')}:</strong> {[...risks].map(id => RISKS.find(r => r.id === id)?.label).join(', ')}
        </div>}
        {scope && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8, fontStyle: 'italic' }}>{scope.slice(0, 150)}{scope.length > 150 ? '...' : ''}</div>}
        {confidence && <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 8 }}>
          <strong>{t('qe.confidence')}:</strong> {confidence === 'committed' ? t('conf.committed.dot') + ' ' + t('conf.committed') : confidence === 'estimated' ? t('conf.estimated.dot') + ' ' + t('conf.estimated') : t('conf.exploratory.dot') + ' ' + t('conf.exploratory')}
        </div>}
        {selDeps.length > 0 && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>{t('qe.predecessors')}: {selDeps.join(', ')}</div>}
        {phases?.length > 0 && <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 8 }}>
          <strong>{t('ph.phases')}:</strong> {phases.map(ph => ph.name).join(' → ')}
        </div>}
      </div>}

      {/* Navigation */}
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={safeClose}>{t('cancel')}</button>
        <div style={{ flex: 1 }} />
        {step > 0 && <button className="btn btn-sec" onClick={() => setStep(s => s - 1)}>{t('back')}</button>}
        {step < 6 ? <button className="btn btn-pri" onClick={() => setStep(s => s + 1)}>{t('next')}</button>
          : <button className="btn btn-pri" onClick={() => { const est = { best: finalBest, factor: finalFactor, deps: selDeps, note: scope || node?.note || '', confidence }; if (phases?.length) { est.phases = phases; est.templateId = selTemplate; } onSave(est); onClose(); }}>{t('ew.apply')}</button>}
      </div>
    </div>
  </div>;
}
