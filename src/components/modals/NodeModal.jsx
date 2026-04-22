import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { SBadge } from '../shared/Badges.jsx';
import { SL, GT } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { PhaseList } from '../shared/Phases.jsx';
import { AutoAssignHint } from '../shared/AutoAssignHint.jsx';
import { CustomFieldInput } from '../shared/CustomFieldInput.jsx';
import { TaskInsights } from '../shared/TaskInsights.jsx';
import { hasChildren, isLeafNode, leafNodes, leafProgress, re, derivePhaseStatus } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';
import { normalizePhases } from '../../utils/phases.js';
import { useT } from '../../i18n.jsx';
import { DEFAULT_SIZES } from '../../utils/sizes.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';

// REASON_TIP is built inside the component using t() — see reasonTip below
const CONF_LABEL = { committed: 'Committed', estimated: 'Estimated', exploratory: 'Exploratory' };
const CONF_DOT = { committed: '●', estimated: '◐', exploratory: '○' };
const CONF_COLOR = { committed: 'var(--gr)', estimated: 'var(--am)', exploratory: 'var(--tx3)' };

export function NodeModal({ node, tree, members, teams, taskTemplates, sizes: projectSizes, customFields: projectCustomFields, scheduled, cpSet, stats, confidence = {}, confReasons = {}, focusRequest = null, onClose, onUpdate, onDelete, onEstimate, onDuplicate, onMove, onReorderInQueue, onNavigate }) {
  const { t } = useT();
  const REASON_TIP = {
    'manual': t('g.reasonManual'), 'done': t('g.reasonDone'),
    'auto:person+estimate': t('g.reasonPersonEstimate'), 'auto:no-person': t('g.reasonNoPerson'),
    'auto:high-risk': t('g.reasonHighRisk'), 'auto:no-estimate': t('g.reasonNoEstimate'),
    'inherited': t('g.reasonInherited'),
  };
  const [f, setF] = useState({ ...node });
  const [nmTab, setNmTab] = useState('insights');
  const [focusHint, setFocusHint] = useState(null);
  const [highlightedDepId, setHighlightedDepId] = useState(null);
  const depRowRefs = useRef({});
  const activateTab = (e, action) => {
    if (e.button !== 0) return;
    e.preventDefault();
    action();
  };

  // Refs for focus targets — keyed by focusHint value
  const focusRefs = {
    name: useRef(null),
    pinnedStart: useRef(null),
    bestDays: useRef(null),
    assign: useRef(null),
    phases: useRef(null),
    status: useRef(null),
    customFields: useRef(null),
    deps: useRef(null),
  };

  useEffect(() => setF({ ...node }), [node?.id]);

  useEffect(() => {
    if (!focusRequest) {
      setHighlightedDepId(null);
      return;
    }
    const requestedTab = focusRequest.tab || (focusRequest.focusHint === 'deps' ? 'timing' : null);
    if (requestedTab) setNmTab(requestedTab);
    if (focusRequest.focusHint) setFocusHint(focusRequest.focusHint);
    setHighlightedDepId(focusRequest.depId || null);
  }, [focusRequest, node?.id]);

  // Focus the primary field after tab switch driven by Insights click
  useLayoutEffect(() => {
    if (!focusHint) return;
    const el = focusRefs[focusHint]?.current;
    if (el) {
      // If el is a native input/textarea, focus it directly; otherwise focus first input inside
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.focus();
        if (el.select) el.select();
      } else {
        const inner = el.querySelector('input, textarea');
        if (inner) { inner.focus(); if (inner.select) inner.select(); }
        else el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }
    setFocusHint(null);
  }, [focusHint, nmTab]);

  useLayoutEffect(() => {
    if (!highlightedDepId || nmTab !== 'timing') return;
    const row = depRowRefs.current[highlightedDepId];
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const id = window.setTimeout(() => setHighlightedDepId(current => current === highlightedDepId ? null : current), 2200);
    return () => window.clearTimeout(id);
  }, [highlightedDepId, nmTab, f.deps]);

  const sc = scheduled?.find(s => s.id === node?.id);
  const isCp = cpSet?.has(node?.id);
  const isDirty = useMemo(() => node && JSON.stringify({ ...node }) !== JSON.stringify(f), [node, f]);
  const safeClose = () => { if (isDirty && !confirm(t('nm.unsavedDiscard'))) return; onClose(); };
  const handleNavigate = id => {
    if (!id || !onNavigate) return;
    if (isDirty && !confirm(t('nm.unsavedDiscard'))) return;
    onNavigate(id);
  };
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
  const SIZES = (projectSizes?.length ? projectSizes : DEFAULT_SIZES).map(s => [s.label, s.days, s.factor, s.desc || '']);
  const nearestSize = f.best > 0 ? SIZES.reduce((best, sz) => Math.abs(sz[1] - f.best) < Math.abs(best[1] - f.best) ? sz : best, SIZES[0]) : null;
  const CONF_OPTS = useMemo(() => [
    { id: '', label: t('auto') },
    { id: 'committed', label: `${t('conf.committed.dot')} ${t('conf.committed')}` },
    { id: 'estimated', label: `${t('conf.estimated.dot')} ${t('conf.estimated')}` },
    { id: 'exploratory', label: `${t('conf.exploratory.dot')} ${t('conf.exploratory')}` },
  ], [t]);

  const phases = normalizePhases(f.phases);

  // Ancestors
  const ancestors = [];
  if (!isRoot) {
    const parts = node.id.split('.');
    for (let i = 1; i < parts.length; i++) { const a = tree.find(r => r.id === parts.slice(0, i).join('.')); if (a) ancestors.push(a); }
  }
  const currentParentId = node.id.split('.').slice(0, -1).join('.');
  const parentOptions = [{ id: '', label: t('nm.topLevel') }, ...tree.filter(r => r.id !== node.id && !r.id.startsWith(node.id + '.')).map(r => ({ id: r.id, label: r.name }))];
  const inheritedDeps = (() => {
    const own = new Set(node?.deps || []);
    const inherited = [];
    let aid = node?.id ? node.id.split('.').slice(0, -1).join('.') : '';
    while (aid) {
      const ancestor = tree.find(r => r.id === aid);
      if (ancestor?.deps) ancestor.deps.forEach(d => { if (!own.has(d)) inherited.push({ dep: d, from: aid }); });
      aid = aid.split('.').slice(0, -1).join('.');
    }
    return inherited;
  })();
  const stat = !isLeaf ? stats?.[node.id] : null;
  const leafCountUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')).length : 0;
  const doneUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.') && c.status === 'done').length : 0;
  const progPct = !isLeaf ? (leafCountUnder ? Math.round(doneUnder / leafCountUnder * 100) : 0) : (f.progress ?? leafProgress(f));

  // Phases onChange: phases define status + progress
  const handlePhaseChange = (nextPhases, extra = {}) => {
    setF(x => {
      const clean = nextPhases.length ? nextPhases : undefined;
      const next = { ...x, ...extra, phases: clean, templateId: clean ? (extra.templateId ?? x.templateId) : undefined };
      const derived = derivePhaseStatus(nextPhases);
      if (derived) { next.status = derived.status; next.progress = derived.progress; }
      return next;
    });
  };

  // Phase inline toggle from Insights: cycle open → wip → done → open
  const handlePhaseToggle = phaseId => {
    setF(x => {
      const nextPhases = (x.phases || []).map(p => {
        if (p.id !== phaseId) return p;
        const next = p.status === 'open' ? 'wip' : p.status === 'wip' ? 'done' : 'open';
        return { ...p, status: next };
      });
      const derived = derivePhaseStatus(nextPhases);
      return { ...x, phases: nextPhases, ...(derived ? { status: derived.status, progress: derived.progress } : {}) };
    });
  };

  // Tab definitions
  const hasPhases = isLeaf && (node.phases?.length > 0 || node.best > 0);
  const nmTabs = [
    { id: 'insights', label: t('nm.tab.insights') },
    { id: 'overview', label: t('qe.tab.overview') },
    ...(hasPhases ? [{ id: 'workflow', label: t('qe.tab.workflow') }] : []),
    ...(isLeaf ? [{ id: 'effort', label: t('qe.tab.effort') }] : []),
    { id: 'timing', label: t('qe.tab.timing') },
    { id: 'advanced', label: t('nm.advanced') },
  ];
  const activeNmTab = nmTabs.find(x => x.id === nmTab) ? nmTab : 'insights';
  const customFields = projectCustomFields?.length ? projectCustomFields : DEFAULT_CUSTOM_FIELDS;
  const setCustomValue = (fieldId, val) => s('customValues', { ...(f.customValues || {}), [fieldId]: val });

  return <div className="overlay">
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>

      {/* ── HEADER ── */}
      {ancestors.length > 0 && <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ancestors.map((a, i) => <span key={a.id}>
          {i > 0 && <span style={{ color: 'var(--b3)' }}> › </span>}
          <button
            type="button"
            onClick={() => handleNavigate(a.id)}
            data-htip={`${a.id} — ${a.name}`}
            style={{
              appearance: 'none',
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'inherit',
              cursor: onNavigate ? 'pointer' : 'default',
              font: 'inherit',
            }}
          >
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9 }}>{a.id}</span> {a.name?.length > 25 ? a.name.slice(0, 23) + '…' : a.name}
          </button>
        </span>)}
      </div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>{node.id}</span>
        {isLeaf && <SBadge s={node.status} />}
        {!isLeaf && <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 10 }}>{SL[f.status] || f.status}</span>}
        {isCp && <span className="badge b-cp">⚡ CP</span>}
        {f.parallel && <span className="badge bo">≡</span>}
        {f.pinnedStart && <span className="badge bo" style={{ cursor: 'pointer' }} onClick={() => s('pinnedStart', '')}>📌 {f.pinnedStart} ×</span>}
      </div>

      {/* ── TAB BAR ── */}
      <div className="qe-tabs" style={{ margin: '0 -22px 14px', padding: '0 22px' }}>
        {nmTabs.map(x => <button
          key={x.id}
          className={`qe-tab${activeNmTab === x.id ? ' active' : ''}`}
          onMouseDown={e => activateTab(e, () => setNmTab(x.id))}
          onClick={e => { if (e.detail === 0) setNmTab(x.id); }}
        >{x.label}</button>)}
      </div>

      {/* ══════ INSIGHTS TAB ══════ */}
      {activeNmTab === 'insights' && <TaskInsights
        node={f}
        tree={tree}
        members={members}
        teams={teams}
        scheduled={scheduled}
        cpSet={cpSet}
        stats={stats}
        confidence={confidence}
        confReasons={confReasons}
        customFields={projectCustomFields?.length ? projectCustomFields : DEFAULT_CUSTOM_FIELDS}
        onPhaseToggle={handlePhaseToggle}
        onOpenItem={handleNavigate}
        onEditSection={sectionId => {
          const tabMap = { details: 'overview', timing: 'timing', effort: 'effort', people: 'workflow', phases: 'workflow', status: 'workflow', dependencies: 'timing', customFields: 'overview' };
          const fieldMap = { details: 'name', timing: 'pinnedStart', effort: 'bestDays', people: 'assign', phases: 'phases', status: 'status', dependencies: 'deps', customFields: 'customFields' };
          const requested = tabMap[sectionId];
          // Fallback: if requested tab is hidden, land on overview so user is never stuck.
          const target = nmTabs.find(x => x.id === requested) ? requested : 'overview';
          setNmTab(target);
          setFocusHint(fieldMap[sectionId] || null);
        }}
      />}

      {/* ══════ OVERVIEW TAB ══════ */}
      {activeNmTab === 'overview' && <>
        <div className="field"><label>{t('qe.name')}</label><input ref={focusRefs.name} value={f.name || ''} onChange={e => s('name', e.target.value)} autoFocus /></div>
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

        {/* Parent stats (non-leaf, no phases) */}
        {!isLeaf && phases.length === 0 && stat && <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 11, fontFamily: 'var(--mono)' }}>
          <div style={{ color: 'var(--tx2)', marginBottom: 6 }}>{doneUnder}/{leafCountUnder} {t('qe.leafItems')} {t('done')} · {progPct}%</div>
          <div className="prog-wrap" style={{ marginBottom: 6 }}><div className="prog-fill" style={{ width: `${progPct}%`, background: progPct >= 100 ? 'var(--gr)' : 'var(--am)' }} /></div>
          <div style={{ color: 'var(--tx3)' }}>
            {stat._r > 0 && <span style={{ color: 'var(--am)' }}>{stat._r.toFixed(0)}d {t('qe.realisticSuffix')} · </span>}
            {stat._b > 0 && <span>{stat._b.toFixed(0)}d best</span>}
            {stat._startD && <span> · {stat._startD.toLocaleDateString('de-DE')} → {stat._endD.toLocaleDateString('de-DE')}</span>}
          </div>
        </div>}

        {/* ── Custom fields ── */}
        {customFields.length > 0 && <div ref={focusRefs.customFields} style={{ marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{t('cf.fieldValues')}</div>
          <div className="frow" style={{ flexWrap: 'wrap' }}>
            {customFields.map(cf => <div key={cf.id} className="field" style={{ flex: '1 1 200px' }}>
              <label>{cf.name}</label>
              <CustomFieldInput field={cf} value={(f.customValues || {})[cf.id] ?? ''} onChange={val => setCustomValue(cf.id, val)} />
            </div>)}
          </div>
        </div>}
      </>}

      {/* ══════ WORKFLOW TAB ══════ */}
      {activeNmTab === 'workflow' && !isRoot && <>
        {/* Manual status + progress (leaf without phases only) */}
        {isLeaf && phases.length === 0 && <div ref={focusRefs.status} className="frow" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '0 0 130px' }}><label>{t('qe.status')}</label>
            <SearchSelect value={f.status || 'open'} options={[{ id: 'open', label: t('open') }, { id: 'wip', label: t('wip') }, { id: 'done', label: t('done') }]} onSelect={v => {
              if (v === 'done') setF(x => ({ ...x, status: 'done', progress: 100, completedAt: x.completedAt || iso(new Date()) }));
              else if (v === 'open') setF(x => ({ ...x, status: 'open', progress: 0 }));
              else if (v === 'wip') setF(x => ({ ...x, status: 'wip', progress: (x.progress && x.progress > 0 && x.progress < 100) ? x.progress : 50 }));
            }} />
          </div>
          <div className="field" style={{ flex: 1 }}><label>{t('qe.progress')} {progPct}%</label>
            <input type="range" min="0" max="100" step="5" value={progPct}
              onChange={e => {
                const v = +e.target.value;
                setF(x => {
                  const next = { ...x, progress: v };
                  if (v >= 100 && x.status !== 'done') { next.status = 'done'; next.completedAt = x.completedAt || iso(new Date()); }
                  else if (v > 0 && v < 100 && x.status !== 'wip') next.status = 'wip';
                  else if (v === 0 && x.status !== 'open') next.status = 'open';
                  return next;
                });
              }}
              style={{ width: '100%', accentColor: 'var(--ac)', marginTop: 4 }} />
          </div>
        </div>}

        {/* Phases — define status + progress when present */}
        <div ref={focusRefs.phases}><PhaseList
          phases={f.phases}
          templates={taskTemplates}
          teams={teams}
          members={members}
          templateId={f.templateId}
          onChange={handlePhaseChange}
        /></div>

        <div className="field"><label>{t('qe.team')}</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ flex: '0 0 180px' }}>
              <SearchSelect value={f.team || ''} options={teams.map(tm => ({ id: tm.id, label: tm.name || tm.id }))} onSelect={v => s('team', v)} allowEmpty />
            </div>
            {isLeaf && <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              {(f.assign || []).map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(x => x !== a))}>×</span></span>; })}
              <div ref={focusRefs.assign} style={{ minWidth: 160, flex: 1 }}>
                <SearchSelect
                  options={members.filter(m => !(f.assign || []).includes(m.id)).map(m => ({ id: m.id, label: memberLabel(m) }))}
                  onSelect={id => { const m = members.find(x => x.id === id); setF(x => ({ ...x, assign: [...new Set([...(x.assign || []), id])], team: m?.team || x.team })); }}
                  placeholder={t('qe.assignPerson')}
                />
              </div>
            </div>}
          </div>
        </div>
        {isLeaf && <AutoAssignHint node={f} scheduled={scheduled} members={members}
          onAccept={({ assign, team }) => setF(x => ({ ...x, assign, team }))} />}
      </>}

      {/* ══════ EFFORT TAB ══════ */}
      {activeNmTab === 'effort' && isLeaf && <>
        <div className="field">
          <label>{t('qe.quickEstimate')}</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
            {SIZES.map(([sz, d, fc, desc]) => {
              const exact = f.best === d;
              const nearest = !exact && nearestSize?.[0] === sz && f.best > 0;
              return <button key={sz} className={`btn ${exact ? 'btn-pri' : 'btn-sec'} btn-sm`}
                style={nearest ? { borderColor: 'var(--ac)', opacity: 0.8 } : undefined}
                data-htip={desc || undefined}
                onClick={() => { s('best', d); s('factor', fc); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{d}d</span></button>;
            })}
          </div>
          {onEstimate && <button className={`btn btn-pri${!f.best ? ' btn-cta' : ''}`} style={{ marginTop: 4 }} onClick={() => { onClose(); onEstimate(node); }}>{t('qe.estimateNow')}</button>}
        </div>
        <div className="frow">
          <div className="field"><label>{t('qe.bestDays')}</label><input ref={focusRefs.bestDays} type="number" min="0" value={f.best || 0} onChange={e => s('best', +e.target.value)} style={{ fontFamily: 'var(--mono)' }} /></div>
          <div className="field"><label>{t('qe.factor')}</label><input type="number" step="0.1" min="1" max="5" value={f.factor || 1.5} onChange={e => s('factor', +e.target.value)} style={{ fontFamily: 'var(--mono)' }} /></div>
          <div className="field"><label>{t('qe.priority')}</label>
            <SearchSelect value={String(f.prio || 2)} options={[{ id: '1', label: `⏫ 1 ${t('critical')}` }, { id: '2', label: `▲ 2 ${t('high')}` }, { id: '3', label: `▬ 3 ${t('medium')}` }, { id: '4', label: `▼ 4 ${t('low')}` }]} onSelect={v => s('prio', +v)} />
          </div>
        </div>
        <div className="field"><label>{t('qe.confidence')}</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ flex: 1 }}><SearchSelect value={f.confidence || ''} options={CONF_OPTS} onSelect={v => s('confidence', v)} /></div>
            {(() => {
              const eff = confidence[node.id] || 'committed';
              const reason = confReasons[node.id];
              const isAuto = !f.confidence;
              return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 'var(--r)', border: `1px solid ${CONF_COLOR[eff]}`, fontSize: 10, color: CONF_COLOR[eff], cursor: 'help', whiteSpace: 'nowrap' }}
                data-htip={`${CONF_LABEL[eff]} — ${REASON_TIP[reason] || '?'}`}>
                {CONF_DOT[eff]} {isAuto ? 'auto' : ''} {CONF_LABEL[eff]}
              </span>;
            })()}
          </div>
        </div>
        {sc && <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 12, lineHeight: 1.6 }}>
          <span style={{ color: 'var(--tx3)' }}>{f.best}d best × {f.factor || 1.5} = </span>
          <b style={{ color: 'var(--am)' }}>{re(f.best || 0, f.factor || 1.5).toFixed(1)}d</b>
          <span style={{ color: 'var(--tx3)' }}> {t('qe.realisticSuffix')}{isCp ? ' · ⚡ CP' : ''}</span>
          <br />
          <span style={{ color: 'var(--tx3)' }}>{iso(sc.startD)} → {iso(sc.endD)} · {sc.weeks}w · {((f.assign || []).length > 1 ? f.assign.map(id => members.find(m => m.id === id)?.name || id).join(', ') : sc.person)} ({sc.capPct}% cap)</span>
        </div>}
        {!sc && f.best > 0 && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>
          {f.best}d best × {f.factor || 1.5} = {re(f.best || 0, f.factor || 1.5).toFixed(1)}d {t('qe.realisticSuffix')} · {t('qe.notScheduled')}
        </div>}
      </>}

      {/* ══════ TIMING TAB ══════ */}
      {activeNmTab === 'timing' && <>
        {isLeaf && <>
          <div className="frow">
            <div className="field"><label>{t('qe.decideBy')}</label>
              <input type="date" value={f.decideBy || ''} onChange={e => s('decideBy', e.target.value)} />
            </div>
            <div className="field"><label>{t('qe.pinnedStart')} {f.pinnedStart && <span style={{ fontSize: 10, color: 'var(--am)' }}>📌</span>}</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input ref={focusRefs.pinnedStart} type="date" value={f.pinnedStart || ''} onChange={e => s('pinnedStart', e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-sec btn-xs" onClick={() => s('pinnedStart', iso(new Date()))}>{t('nm.pinToday')}</button>
                {f.pinnedStart && <button className="btn btn-ghost btn-xs" onClick={() => s('pinnedStart', '')}>×</button>}
              </div>
            </div>
          </div>
          <div className="field"><label>{t('qe.completedAt')}</label>
            <input type="date" value={f.completedAt || ''} disabled={f.status !== 'done'} onChange={e => s('completedAt', e.target.value)} />
            <div className="helper">{t('qe.completedHint')}</div>
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
          <p className="helper" style={{ marginBottom: 12 }}>{t('qe.horizonHint')}</p>
        </>}

        <div className="field">
          <label>{t('qe.predecessors')} {!isLeaf && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{t('nm.appliesToAllLeaves')}</span>}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
            {(f.deps || []).map(d => { const dn = findById(d); const isHighlighted = highlightedDepId === d; return <div key={d} className="dep-row"
              ref={el => {
                if (el) depRowRefs.current[d] = el;
                else delete depRowRefs.current[d];
              }}
              style={isHighlighted ? { background: 'rgba(59,130,246,.10)', borderColor: 'rgba(59,130,246,.35)', boxShadow: '0 0 0 1px rgba(59,130,246,.25)' } : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{d}</span>
                {dn?.name && <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{dn.name}</span>}
              </div>
              <span className="tag-x" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx3)' }} onClick={() => setF(x => { const nd = (x.deps || []).filter(y => y !== d); const nl = { ...(x._depLabels || {}) }; delete nl[d]; return { ...x, deps: nd, _depLabels: nl }; })}>×</span>
            </div>; })}
            {inheritedDeps.map(({ dep, from }) => { const dn = findById(dep); return <div key={`inh_${dep}_${from}`} className="dep-row" style={{ opacity: 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0, fontWeight: 600 }}>{dep}</span>
                {dn?.name && <span style={{ fontSize: 11, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{dn.name}</span>}
              </div>
              <span style={{ fontSize: 9, color: 'var(--tx3)', flexShrink: 0 }}>{t('ph.via', from)}</span>
            </div>; })}
          </div>
          <div ref={focusRefs.deps}>
            <SearchSelect options={allIds.filter(i => !(f.deps || []).includes(i)).map(i => ({ id: i, label: findById(i)?.name || '' }))} onSelect={id => s('deps', [...new Set([...(f.deps || []), id])])} placeholder={`+ ${t('qe.predecessors')}`} showIds />
          </div>
        </div>
      </>}

      {/* ══════ ADVANCED TAB ══════ */}
      {activeNmTab === 'advanced' && <>
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
        {onDelete && <div style={{ marginTop: 16 }}>
          <button className="btn btn-danger" onClick={() => { if (confirm(hasChildren(tree, node.id) ? t('qe.confirmDeleteChildren', node.id) : t('qe.confirmDelete', node.id))) { onDelete(node.id); onClose(); } }}>{t('delete')}</button>
        </div>}
      </>}

      {/* ── ACTIONS ── */}
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
