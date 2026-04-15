import { useState, useMemo, useEffect } from 'react';
import { leafNodes, parentId } from '../../utils/scheduler.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';

const SIZES = [
  { label: 'XS', days: 1, desc: 'Trivial change, config, typo fix' },
  { label: 'S', days: 3, desc: 'Small feature, simple bugfix' },
  { label: 'M', days: 7, desc: 'Standard feature, moderate complexity' },
  { label: 'L', days: 15, desc: 'Large feature, multiple components' },
  { label: 'XL', days: 30, desc: 'Major feature, cross-cutting concerns' },
  { label: 'XXL', days: 45, desc: 'Epic, full module/system build' },
];

const RISKS = [
  { id: 'new_tech', label: 'New technology / unknown territory', weight: 0.15 },
  { id: 'external', label: 'External dependencies (APIs, partners)', weight: 0.1 },
  { id: 'migration', label: 'Data migration involved', weight: 0.15 },
  { id: 'ux', label: 'Significant UI/UX design needed', weight: 0.1 },
  { id: 'stakeholder', label: 'Requires stakeholder alignment', weight: 0.1 },
  { id: 'integration', label: 'Complex system integration', weight: 0.15 },
  { id: 'legacy', label: 'Working with legacy code', weight: 0.1 },
  { id: 'unclear', label: 'Requirements not fully clear', weight: 0.2 },
];

export function EstimationWizard({ node, tree, onSave, onClose }) {
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState(node?.note || '');
  const [size, setSize] = useState(SIZES.findIndex(s => s.days === (node?.best || 0)) >= 0 ? SIZES.findIndex(s => s.days === (node?.best || 0)) : -1);
  const [risks, setRisks] = useState(new Set());
  const [optimistic, setOptimistic] = useState(node?.best || 0);
  const [realistic, setRealistic] = useState(Math.round((node?.best || 0) * 1.3));
  const [pessimistic, setPessimistic] = useState(Math.round((node?.best || 0) * 2));
  const [selDeps, setSelDeps] = useState(node?.deps || []);

  // PERT estimate: (O + 4R + P) / 6
  const pert = useMemo(() => (optimistic + 4 * realistic + pessimistic) / 6, [optimistic, realistic, pessimistic]);
  const riskFactor = useMemo(() => 1 + [...risks].reduce((s, id) => s + (RISKS.find(r => r.id === id)?.weight || 0), 0), [risks]);
  const finalBest = useMemo(() => Math.round(pert), [pert]);
  const finalFactor = useMemo(() => Math.round(riskFactor * 10) / 10, [riskFactor]);
  const finalRealistic = useMemo(() => finalBest * Math.min(finalFactor, 1.3) * 1.15, [finalBest, finalFactor]);

  // Related items for context
  const relatedItems = useMemo(() => {
    if (!node) return [];
    const pid = parentId(node.id);
    return leafNodes(tree).filter(r => r.id !== node.id && r.id.startsWith(pid + '.') && r.best > 0);
  }, [node, tree]);

  const steps = ['Scope', 'Size', 'Risks', 'Three-Point', 'Dependencies', 'Summary'];

  function onSizeSelect(idx) {
    setSize(idx);
    const d = SIZES[idx].days;
    setOptimistic(Math.round(d * 0.6));
    setRealistic(d);
    setPessimistic(Math.round(d * 1.8));
  }

  // Dirty detection: any user input that differs from the original node state
  const origScope = node?.note || '';
  const origDeps = (node?.deps || []).join(',');
  const isDirty = scope !== origScope || size !== -1 && SIZES[size]?.days !== node?.best || risks.size > 0 || selDeps.join(',') !== origDeps;
  const safeClose = () => { if (isDirty && !confirm('Discard your estimate inputs? Everything you entered will be lost.')) return; onClose(); };
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') safeClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isDirty]);

  return <div className="overlay" onClick={safeClose}>
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      <h2 style={{ flexWrap: 'wrap', gap: 8 }}>
        <span>Estimation Wizard</span>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', fontSize: 12, fontWeight: 400 }}>{node?.id}</span>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--tx)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{node?.name}</span>
      </h2>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
        {steps.map((s, i) => <div key={s} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }} onClick={() => setStep(i)}>
          <div style={{ height: 3, background: i <= step ? 'var(--ac)' : 'var(--b2)', borderRadius: 2, marginBottom: 4 }} />
          <div style={{ fontSize: 9, color: i === step ? 'var(--ac)' : 'var(--tx3)', fontWeight: i === step ? 600 : 400 }}>{s}</div>
        </div>)}
      </div>

      {/* Step 0: Scope */}
      {step === 0 && <div className="fade">
        <div className="field"><label>What exactly needs to be done?</label>
          <textarea value={scope} onChange={e => setScope(e.target.value)} rows={4} placeholder="Describe the scope: what's included, what's not, acceptance criteria..." />
          <p className="helper">Be specific. Vague scope = inaccurate estimates.</p>
        </div>
        {relatedItems.length > 0 && <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 6 }}>Similar tasks in this group (for reference)</div>
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
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>What's your gut feeling for the size of this task?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SIZES.map((s, i) => <div key={s.label}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: size === i ? 'var(--ac2)' + '22' : 'var(--bg3)', border: `1px solid ${size === i ? 'var(--ac)' : 'var(--b2)'}`, borderRadius: 'var(--r)', cursor: 'pointer' }}
            onClick={() => onSizeSelect(i)}>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, width: 40, color: size === i ? 'var(--ac)' : 'var(--tx2)' }}>{s.label}</span>
            <div><div style={{ fontWeight: 500, fontSize: 12 }}>{s.days} days</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>{s.desc}</div></div>
          </div>)}
        </div>
      </div>}

      {/* Step 2: Risks */}
      {step === 2 && <div className="fade">
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>Which risks apply to this task? Each adds to the uncertainty factor.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {RISKS.map(r => <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: risks.has(r.id) ? 'var(--am)' + '15' : 'var(--bg3)', border: `1px solid ${risks.has(r.id) ? 'var(--am)' + '44' : 'var(--b2)'}`, borderRadius: 'var(--r)', cursor: 'pointer' }}>
            <input type="checkbox" checked={risks.has(r.id)} onChange={() => setRisks(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
            <div style={{ flex: 1 }}><span style={{ fontSize: 12, fontWeight: 500 }}>{r.label}</span></div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)' }}>+{Math.round(r.weight * 100)}%</span>
          </label>)}
        </div>
        <div className="calc" style={{ marginTop: 12 }}>
          <span>Risk factor:</span><b style={{ color: riskFactor > 1.3 ? 'var(--re)' : 'var(--am)' }}>x{riskFactor.toFixed(2)}</b>
          <span>{risks.size} risks selected</span>
        </div>
      </div>}

      {/* Step 3: Three-point estimate */}
      {step === 3 && <div className="fade">
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>Refine with a three-point estimate (PERT method). The weighted average = (O + 4R + P) / 6</div>
        <div className="frow">
          <div className="field"><label>Optimistic (best case)</label>
            <input type="number" min="0" value={optimistic} onChange={e => setOptimistic(+e.target.value)} />
            <p className="helper">Everything goes perfectly</p>
          </div>
          <div className="field"><label>Realistic (most likely)</label>
            <input type="number" min="0" value={realistic} onChange={e => setRealistic(+e.target.value)} />
            <p className="helper">Normal conditions</p>
          </div>
          <div className="field"><label>Pessimistic (worst case)</label>
            <input type="number" min="0" value={pessimistic} onChange={e => setPessimistic(+e.target.value)} />
            <p className="helper">Murphy's law applies</p>
          </div>
        </div>
        <div className="calc">
          <span>PERT:</span><b>{pert.toFixed(1)} days</b>
          <span>Std dev:</span><b>{((pessimistic - optimistic) / 6).toFixed(1)}d</b>
          <span>Confidence range:</span><b>{Math.round(pert - (pessimistic - optimistic) / 6)}–{Math.round(pert + (pessimistic - optimistic) / 6)}d</b>
        </div>
      </div>}

      {/* Step 4: Dependencies */}
      {step === 4 && <div className="fade">
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>What must be finished before this task can start?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {selDeps.map(d => { const n = tree.find(r => r.id === d); return <span key={d} className="tag">{d} — {n?.name || ''}<span className="tag-x" onClick={() => setSelDeps(ds => ds.filter(x => x !== d))}>×</span></span>; })}
        </div>
        <SearchSelect options={tree.filter(r => r.id !== node?.id).map(r => ({ id: r.id, label: r.name }))} onSelect={v => setSelDeps(ds => [...new Set([...ds, v])])} placeholder="+ Add dependency" showIds />
        {selDeps.length > 0 && <div style={{ marginTop: 12, fontSize: 11, color: 'var(--tx3)' }}>
          This task is blocked by {selDeps.length} item{selDeps.length > 1 ? 's' : ''}. The scheduler will only start it after all dependencies are done.
        </div>}
      </div>}

      {/* Step 5: Summary */}
      {step === 5 && <div className="fade">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Estimation Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div className="sum-card"><div className="sum-v">{finalBest}</div><div className="sum-l">Best case (days)</div></div>
          <div className="sum-card"><div className="sum-v" style={{ color: 'var(--am)' }}>x{finalFactor}</div><div className="sum-l">Uncertainty factor</div></div>
          <div className="sum-card"><div className="sum-v" style={{ color: 'var(--gr)' }}>{finalRealistic.toFixed(0)}</div><div className="sum-l">Realistic (days)</div></div>
          <div className="sum-card"><div className="sum-v">{Math.round(finalBest * finalFactor)}</div><div className="sum-l">Worst case (days)</div></div>
        </div>
        {risks.size > 0 && <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 8 }}>
          <strong>Risks identified:</strong> {[...risks].map(id => RISKS.find(r => r.id === id)?.label).join(', ')}
        </div>}
        {scope && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8, fontStyle: 'italic' }}>Scope: {scope.slice(0, 150)}{scope.length > 150 ? '...' : ''}</div>}
        {selDeps.length > 0 && <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Dependencies: {selDeps.join(', ')}</div>}
      </div>}

      {/* Navigation */}
      <div className="modal-footer">
        {step > 0 && <button className="btn btn-sec" onClick={() => setStep(s => s - 1)}>Back</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sec" onClick={safeClose}>Cancel</button>
        {step < 5 ? <button className="btn btn-pri" onClick={() => setStep(s => s + 1)}>Next</button>
          : <button className="btn btn-pri" onClick={() => { onSave({ best: finalBest, factor: finalFactor, deps: selDeps, note: scope || node?.note || '' }); onClose(); }}>Apply estimate</button>}
      </div>
    </div>
  </div>;
}
