import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { SBadge } from '../shared/Badges.jsx';
import { SL, GT } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { HandoffPlanEditor } from '../shared/HandoffPlanEditor.jsx';
import { PhaseList } from '../shared/Phases.jsx';
import { AutoAssignHint } from '../shared/AutoAssignHint.jsx';
import { CustomFieldInput } from '../shared/CustomFieldInput.jsx';
import { TaskInsights } from '../shared/TaskInsights.jsx';
import { CriticalPathBadge } from '../shared/CriticalPathBadge.jsx';
import { hasChildren, isLeafNode, leafNodes, leafProgress, re, derivePhaseStatus, parentId } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';
import { computeSollIst } from '../../utils/sollIst.js';
import { normalizePhases } from '../../utils/phases.js';
import { deadlineRootIdForNode, isDeadlineRelevantForRoot } from '../../utils/deadlines.js';
import { summarizeNodeTimeline } from '../../utils/timeline.js';
import { useT } from '../../i18n.jsx';
import { DEFAULT_SIZES } from '../../utils/sizes.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';

// REASON_TIP is built inside the component using t() — see reasonTip helper below
const CONF_LABEL = { committed: 'Committed', estimated: 'Estimated', exploratory: 'Exploratory' };
const CONF_DOT = { committed: '●', estimated: '◐', exploratory: '○' };
const CONF_COLOR = { committed: 'var(--gr)', estimated: 'var(--am)', exploratory: 'var(--tx3)' };

export function QuickEdit({ node, tree, members, teams, taskTemplates, sizes: projectSizes, customFields: projectCustomFields, scheduled, cpSet, cpLabels = {}, stats, confidence = {}, confReasons = {}, workDays, holidayIso, onUpdate, onDelete, onEstimate, onDuplicate, onReorderInQueue, onSplitHandoff, onSplitTaskAtProgress, tab: tabProp, onTabChange }) {
  const { t } = useT();
  const REASON_TIP = {
    'manual': t('g.reasonManual'), 'done': t('g.reasonDone'),
    'auto:person+estimate': t('g.reasonPersonEstimate'), 'auto:no-person': t('g.reasonNoPerson'),
    'auto:high-risk': t('g.reasonHighRisk'), 'auto:no-estimate': t('g.reasonNoEstimate'),
    'inherited': t('g.reasonInherited'),
  };
  const [f, setF] = useState({ ...node });
  const [focusHint, setFocusHint] = useState(null);
  const [depAddKind, setDepAddKind] = useState('soft');
  const activateTab = (e, action) => {
    if (e.button !== 0) return;
    e.preventDefault();
    action();
  };

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

  useLayoutEffect(() => {
    if (!focusHint) return;
    const el = focusRefs[focusHint]?.current;
    if (el) {
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
  }, [focusHint, tabProp]);

  useEffect(() => {
    setF({ ...node });
  }, [node?.id]);

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
  const deadlineRootId = useMemo(() => deadlineRootIdForNode(tree, node.id), [tree, node.id]);
  const deadlineRoot = useMemo(() => deadlineRootId ? tree.find(entry => entry.id === deadlineRootId) : null, [tree, deadlineRootId]);
  const deadlineParentExcluded = useMemo(() => {
    if (!deadlineRootId || node.id === deadlineRootId) return false;
    const parent = parentId(node.id);
    return !!parent && !isDeadlineRelevantForRoot(tree, deadlineRootId, parent);
  }, [tree, node.id, deadlineRootId]);
  const showDeadlineRelevant = !!deadlineRootId && node.id !== deadlineRootId;
  const allIds = tree.map(r => r.id).filter(id => id !== node.id);
  const SIZES = (projectSizes?.length ? projectSizes : DEFAULT_SIZES).map(s => [s.label, s.days, s.factor, s.desc || '']);
  const nearestSize = f.best > 0 ? SIZES.reduce((best, size) => Math.abs(size[1] - f.best) < Math.abs(best[1] - f.best) ? size : best, SIZES[0]) : null;
  const phases = normalizePhases(f.phases);
  const memberLabel = member => `${member.name || member.id}${member.team ? ' — ' + (teams.find(team => team.id === member.team)?.name || member.team) : ''}`;
  const memberName = id => members.find(member => member.id === id)?.name || id;
  const customFields = projectCustomFields?.length ? projectCustomFields : DEFAULT_CUSTOM_FIELDS;
  const timeline = useMemo(() => summarizeNodeTimeline(tree, scheduled, f), [tree, scheduled, f]);

  const hasPhases = isLeaf && (node.phases?.length > 0 || node.best > 0);
  const tabs = [
    { id: 'insights', label: t('nm.tab.insights') },
    { id: 'overview', label: t('qe.tab.overview') },
    { id: 'workflow', label: t('qe.tab.workflow') },
    ...(isLeaf ? [{ id: 'effort', label: t('qe.tab.effort') }] : []),
    { id: 'timing', label: t('qe.tab.timing') },
  ];

  const activeTab = tabs.find(item => item.id === tabProp) ? tabProp : 'insights';
  const setTab = onTabChange || (() => {});
  useEffect(() => { if (activeTab !== tabProp && onTabChange) onTabChange(activeTab); }, [activeTab]);

  const commitNode = next => {
    setF(next);
    onUpdate(next);
  };

  const patchNode = patch => {
    commitNode({ ...f, ...patch });
  };

  const bufferNode = patch => {
    setF(prev => ({ ...prev, ...patch }));
  };

  const flushNode = () => onUpdate(f);

  // Phase inline toggle from Insights: cycle open → wip → done → open
  const togglePhase = phaseId => {
    const nextPhases = (f.phases || []).map(p => {
      if (p.id !== phaseId) return p;
      const next = p.status === 'open' ? 'wip' : p.status === 'wip' ? 'done' : 'open';
      return { ...p, status: next };
    });
    const derived = derivePhaseStatus(nextPhases);
    commitNode({ ...f, phases: nextPhases, ...(derived ? { status: derived.status, progress: derived.progress } : {}) });
  };

  // Phases onChange: phases define status + progress when present
  const commitPhases = (nextPhases, extra = {}) => {
    const clean = nextPhases.length ? nextPhases : undefined;
    const next = {
      ...f,
      ...extra,
      phases: clean,
      templateId: clean ? (extra.templateId ?? f.templateId) : undefined,
    };
    const derived = derivePhaseStatus(nextPhases);
    if (derived) {
      next.status = derived.status;
      next.progress = derived.progress;
    }
    commitNode(next);
  };

  const inheritedDeps = (() => {
    const ownSet = new Set([...(f.deps || []), ...(f.softDeps || [])]);
    const inherited = [];
    let ancestorId = node.id.split('.').slice(0, -1).join('.');
    while (ancestorId) {
      const ancestor = tree.find(entry => entry.id === ancestorId);
      if (ancestor?.deps) {
        ancestor.deps.forEach(dep => {
          if (!ownSet.has(dep)) {
            inherited.push({ dep, from: ancestorId });
            ownSet.add(dep);
          }
        });
      }
      ancestorId = ancestorId.split('.').slice(0, -1).join('.');
    }
    return inherited;
  })();

  // Direct successors (read-only Nachfolger list): every other task whose
  // deps OR softDeps point to *this* node. Doesn't follow ancestor chains —
  // only the explicit graph edges, which is what the user drew.
  const directSuccessors = (() => {
    const out = [];
    for (const r of (tree || [])) {
      if (r.id === node.id) continue;
      const hard = (r.deps || []).includes(node.id);
      const soft = (r.softDeps || []).includes(node.id);
      if (hard || soft) out.push({ id: r.id, name: r.name, soft: !hard && soft });
    }
    return out;
  })();

  return <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
      {isLeaf && <SBadge s={node.status} />}
      {!isLeaf && <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 10 }}>{SL[f.status] || f.status} <span style={{ fontSize: 8, color: 'var(--tx3)', fontWeight: 400 }}>{t('qe.autoStatus')}</span></span>}
      {!isRoot && phases.length > 0 && <span className="badge bo">{phases.length} {t('ph.phases').toLowerCase()}</span>}
      {isCp && <CriticalPathBadge id={node.id} labels={cpLabels} />}
      {isLeaf && onEstimate && <button className={`btn btn-pri${!f.best ? ' btn-cta' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => onEstimate(node)}>{t('qe.estimateNow')}</button>}
    </div>

    <div className="qe-tabs">
      {tabs.map(item => <button
        key={item.id}
        className={`qe-tab${activeTab === item.id ? ' active' : ''}`}
        onMouseDown={e => activateTab(e, () => setTab(item.id))}
        onClick={e => { if (e.detail === 0) setTab(item.id); }}
      >{item.label}</button>)}
    </div>

    {/* ══════ INSIGHTS TAB ══════ */}
    {activeTab === 'insights' && <TaskInsights
      node={f}
      tree={tree}
      members={members}
      teams={teams}
      scheduled={scheduled}
      cpSet={cpSet}
      stats={stats}
      confidence={confidence}
      confReasons={confReasons}
      customFields={customFields}
      onPhaseToggle={togglePhase}
      onSplitHandoff={onSplitHandoff}
      onSplitTaskAtProgress={onSplitTaskAtProgress}
      onEditSection={sectionId => {
        const tabMap = { details: 'overview', timing: 'timing', effort: 'effort', people: 'workflow', phases: 'workflow', status: 'workflow', dependencies: 'timing', customFields: 'overview' };
        const fieldMap = { details: 'name', timing: 'pinnedStart', effort: 'bestDays', people: 'assign', phases: 'phases', status: 'status', dependencies: 'deps', customFields: 'customFields' };
        const requested = tabMap[sectionId];
        // Fallback: if requested tab is hidden (e.g. workflow not shown), land on overview so user is never stuck.
        const target = tabs.find(x => x.id === requested) ? requested : 'overview';
        setTab(target);
        setFocusHint(fieldMap[sectionId] || null);
      }}
    />}

    {/* ══════ OVERVIEW TAB ══════ */}
    {activeTab === 'overview' && <>
      <div className="field"><label>{t('qe.name')}</label><input ref={focusRefs.name} value={f.name || ''} onChange={e => bufferNode({ name: e.target.value })} onBlur={flushNode} /></div>
      <div className="field"><label>{t('qe.notes')}</label><textarea value={f.note || ''} onChange={e => bufferNode({ note: e.target.value })} onBlur={flushNode} rows={2} /></div>

      {isRoot && <>
        <div className="field"><label>{t('qe.focusType')}</label>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {['', 'goal', 'painpoint', 'deadline'].map(ft =>
              <button key={ft} className={`goal-type-btn${(f.type || '') === ft ? ' active' : ''}`} style={{ fontSize: 10, padding: '3px 7px' }}
                onClick={() => patchNode({ type: ft })}>{ft ? `${GT[ft]} ${t(ft)}` : t('none')}</button>)}
          </div>
        </div>
        {f.type && <div className="frow">
          <div className="field"><label>{t('qe.severity')}</label>
            <SearchSelect value={f.severity || 'high'} options={[{ id: 'critical', label: t('critical') }, { id: 'high', label: t('high') }, { id: 'medium', label: t('medium') }]} onSelect={value => patchNode({ severity: value })} />
          </div>
          {f.type === 'deadline' && <div className="field"><label>{t('qe.date')}</label><input type="date" value={f.date || ''} onChange={e => patchNode({ date: e.target.value })} /></div>}
        </div>}
        {f.type && <div className="field"><label>{t('qe.description')}</label><input value={f.description || ''} onChange={e => bufferNode({ description: e.target.value })} onBlur={flushNode} placeholder={t('qe.descPlaceholder')} /></div>}
      </>}

      {(timeline?.period || timeline?.actual || timeline?.deadline) && <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--tx2)' }}>{t('ins.timing')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontFamily: 'var(--mono)', fontSize: 11 }}>
          {timeline?.actual && <><span style={{ color: 'var(--tx3)' }}>{t('ins.actual')}</span><span>{timeline.actual.start.toLocaleDateString('de-DE')} — {timeline.actual.end.toLocaleDateString('de-DE')}</span></>}
          {!timeline?.actual && timeline?.period && <><span style={{ color: 'var(--tx3)' }}>{t('ins.period')}</span><span>{timeline.period.start.toLocaleDateString('de-DE')} — {timeline.period.end.toLocaleDateString('de-DE')}</span></>}
          {timeline?.actual && timeline?.planned && (timeline.planned.start.getTime() !== timeline.actual.start.getTime() || timeline.planned.end.getTime() !== timeline.actual.end.getTime()) && <><span style={{ color: 'var(--tx3)' }}>{t('ins.planned')}</span><span>{timeline.planned.start.toLocaleDateString('de-DE')} — {timeline.planned.end.toLocaleDateString('de-DE')}</span></>}
          {timeline?.deadline && <><span style={{ color: 'var(--tx3)' }}>{t('qe.affectsDeadline')}</span><span>{timeline.deadline.start.toLocaleDateString('de-DE')} — {timeline.deadline.end.toLocaleDateString('de-DE')}</span></>}
        </div>
      </div>}

      {/* Parent aggregate stats (non-leaf, no phases) */}
      {!isLeaf && phases.length === 0 && (() => {
        const st = stats?.[node.id];
        const leafCount = leafNodes(tree).filter(child => child.id.startsWith(node.id + '.')).length;
        const doneCount = leafNodes(tree).filter(child => child.id.startsWith(node.id + '.') && child.status === 'done').length;
        return <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--tx2)' }}>{doneCount}/{leafCount} {t('qe.leafItems')} {t('done')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontFamily: 'var(--mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--tx3)' }}>{t('qe.best')}</span><span>{st?._b?.toFixed(0) || 0}d</span>
            <span style={{ color: 'var(--tx3)' }}>{t('qe.realistic')}</span><span style={{ color: 'var(--am)' }}>{st?._r?.toFixed(1) || 0}d</span>
            {timeline?.period && <><span style={{ color: 'var(--tx3)' }}>{t('ins.period')}</span><span>{timeline.period.start.toLocaleDateString('de-DE')} — {timeline.period.end.toLocaleDateString('de-DE')}</span></>}
            {timeline?.deadline && <><span style={{ color: 'var(--tx3)' }}>{t('qe.affectsDeadline')}</span><span>{timeline.deadline.start.toLocaleDateString('de-DE')} — {timeline.deadline.end.toLocaleDateString('de-DE')}</span></>}
          </div>
        </div>;
      })()}

      {/* ── Custom fields ── */}
      {customFields.length > 0 && <div ref={focusRefs.customFields} style={{ marginTop: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{t('cf.fieldValues')}</div>
        {customFields.map(cf => <div key={cf.id} className="field">
          <label>{cf.name}</label>
          <CustomFieldInput field={cf} value={(f.customValues || {})[cf.id] ?? ''}
            onChange={val => patchNode({ customValues: { ...(f.customValues || {}), [cf.id]: val } })} />
        </div>)}
      </div>}
    </>}

    {/* ══════ WORKFLOW TAB ══════ */}
    {activeTab === 'workflow' && <>
      {/* Status + Progress — manual only when NO phases */}
      {isLeaf && phases.length === 0 && <div ref={focusRefs.status} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: '0 0 100px' }}>
          <SearchSelect value={f.status || 'open'} options={[{ id: 'open', label: t('open') }, { id: 'wip', label: t('wip') }, { id: 'done', label: t('done') }]} onSelect={value => {
            // Sync progress when status changes manually. Done → completedAt
            // clamps to today: a task marked done now is finished now, never
            // in the future (would otherwise inherit a stale planned-end).
            if (value === 'done') {
              const today = iso(new Date());
              const ca = (f.completedAt && f.completedAt <= today) ? f.completedAt : today;
              patchNode({ status: 'done', progress: 100, completedAt: ca });
            }
            else if (value === 'open') patchNode({ status: 'open', progress: 0 });
            else if (value === 'wip') patchNode({ status: 'wip', progress: (f.progress && f.progress > 0 && f.progress < 100) ? f.progress : 50 });
          }} />
        </div>
        {/* Slider buffers locally on every onChange (so the thumb tracks) but
            only commits to the parent — and re-runs the scheduler — when the
            user releases the pointer or blurs. Without this every drag step
            triggered a full setData → reschedule loop. */}
        <input type="range" min="0" max="100" step="5" value={f.progress ?? leafProgress(f)}
          onChange={e => {
            const value = +e.target.value;
            const next = { ...f, progress: value };
            if (value >= 100 && f.status !== 'done') {
              next.status = 'done';
              const today = iso(new Date());
              next.completedAt = (f.completedAt && f.completedAt <= today) ? f.completedAt : today;
            }
            else if (value > 0 && value < 100 && f.status !== 'wip') next.status = 'wip';
            else if (value === 0 && f.status !== 'open') next.status = 'open';
            bufferNode(next);
          }}
          onPointerUp={() => flushNode()}
          onKeyUp={() => flushNode()}
          onBlur={() => flushNode()}
          style={{ flex: 1, accentColor: 'var(--ac)' }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', flexShrink: 0, width: 28, textAlign: 'right' }}>{f.progress ?? leafProgress(f)}%</span>
      </div>}

      {/* Phases — define status + progress when present */}
      {isLeaf && <div ref={focusRefs.phases}><PhaseList
        phases={f.phases}
        templates={taskTemplates}
        teams={teams}
        members={members}
        templateId={f.templateId}
        onChange={commitPhases}
      /></div>}

      <div className="field"><label>{t('qe.team')}</label>
        <SearchSelect value={f.team || ''} options={teams.map(team => ({ id: team.id, label: team.name || team.id }))} onSelect={value => patchNode({ team: value })} allowEmpty />
        {/* Team-lock pill — bordered chip next to the team picker, no
            orphan slider. Same styling as the NodeModal counterpart. */}
        {isLeaf && f.team && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '2px 8px', borderRadius: 4, border: `1px solid ${f.teamLock ? 'var(--am)' : 'var(--b)'}`, background: f.teamLock ? 'rgba(245,158,11,.08)' : 'transparent', fontSize: 11, color: 'var(--tx2)' }} data-htip={t('qe.teamLockTip')}>
            <span>{t('qe.teamLock')}</span>
            <label className="toggle" style={{ margin: 0 }}><input type="checkbox" checked={!!f.teamLock} onChange={e => patchNode({ teamLock: e.target.checked })} /><span className="slider" /></label>
          </div>
        )}
      </div>

      <div className="field"><label>{t('qe.assignee')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: (f.assign || []).length ? 6 : 0 }}>
          {(f.assign || []).map(id => <span key={id} className="tag">{memberName(id)}<span className="tag-x" onClick={() => patchNode({ assign: (f.assign || []).filter(entry => entry !== id) })}>×</span></span>)}
        </div>
        {isLeaf && <AutoAssignHint node={f} scheduled={scheduled} members={members}
          onAccept={({ assign, team }) => patchNode({ assign, team })} />
        }
        <div ref={focusRefs.assign}>
          <SearchSelect
            options={members.filter(member => !(f.assign || []).includes(member.id)).map(member => ({ id: member.id, label: memberLabel(member) }))}
            onSelect={id => {
              const member = members.find(entry => entry.id === id);
              patchNode({ assign: [...new Set([...(f.assign || []), id])], team: member?.team || f.team });
            }}
            placeholder={t('qe.assignPerson')}
          />
        </div>
      </div>
      {/* HandoffPlanEditor disabled — auto-cascade is off by default;
          users handle offboard truncation via the explicit ↳ Split flow.
          Re-enable here only if pre-planned multi-stage handoffs become
          a real workflow again. */}
    </>}

    {/* ══════ EFFORT TAB ══════ */}
    {activeTab === 'effort' && isLeaf && <>
      <div className="field">
        <label>{t('qe.quickEstimate')}</label>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
          {SIZES.map(([sizeLabel, days, factor, desc]) => {
            const exact = f.best === days;
            const nearest = !exact && nearestSize?.[0] === sizeLabel && f.best > 0;
            return <button key={sizeLabel} className={`btn ${exact ? 'btn-pri' : 'btn-sec'} btn-sm`}
              style={nearest ? { borderColor: 'var(--ac)', opacity: 0.8 } : undefined}
              data-htip={desc || undefined}
              onClick={() => patchNode({ best: days, factor })}>{sizeLabel}<span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>{days}d</span></button>;
          })}
        </div>
        {onEstimate && <button className="btn btn-pri btn-sm" onClick={() => onEstimate(node)}>{t('qe.estimateNow')}</button>}
      </div>

      <div className="frow">
        <div className="field"><label>{t('qe.bestDays')}</label><input ref={focusRefs.bestDays} type="number" min="0" value={f.best || 0} onChange={e => bufferNode({ best: +e.target.value })} onBlur={flushNode} /></div>
        <div className="field"><label>{t('qe.factor')}</label><input type="number" step="0.1" min="1" max="5" value={f.factor || 1.5} onChange={e => bufferNode({ factor: +e.target.value })} onBlur={flushNode} /></div>
        <div className="field"><label>{t('qe.priority')}</label>
          <SearchSelect value={String(f.prio || 2)} options={[{ id: '1', label: `1 ${t('critical')}` }, { id: '2', label: `2 ${t('high')}` }, { id: '3', label: `3 ${t('medium')}` }, { id: '4', label: `4 ${t('low')}` }]} onSelect={value => patchNode({ prio: +value })} />
        </div>
      </div>

      <div className="field"><label>{t('qe.confidence')}</label>
        <SearchSelect value={f.confidence || ''} options={CONF_OPTS} onSelect={value => patchNode({ confidence: value })} />
        {/* Effective confidence tag — same style as AutoAssignHint */}
        {(() => {
          const eff = confidence[node.id] || 'committed';
          const reason = confReasons[node.id];
          const isAuto = !f.confidence;
          return <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '6px 8px', background: 'var(--bg3)', border: `1px dashed ${CONF_COLOR[eff]}`, borderRadius: 'var(--r)', fontSize: 11 }}>
            <span style={{ color: CONF_COLOR[eff] }}>{CONF_DOT[eff]}</span>
            <span style={{ color: CONF_COLOR[eff], fontWeight: 600 }}>{CONF_LABEL[eff]}</span>
            {isAuto && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>auto</span>}
            <span style={{ fontSize: 9, color: 'var(--tx3)', marginLeft: 'auto' }}>{REASON_TIP[reason] || ''}</span>
          </div>;
        })()}
      </div>

      {sc && <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 12, lineHeight: 1.6 }}>
        <span style={{ color: 'var(--tx3)' }}>{f.best}d × {f.factor || 1.5} = </span>
        <b style={{ color: 'var(--am)' }}>{re(f.best || 0, f.factor || 1.5).toFixed(1)}d</b>
        <span style={{ color: 'var(--tx3)' }}> {t('qe.realisticSuffix')}</span>
        <br />
        <span style={{ color: 'var(--tx3)' }}>{iso(sc.startD)} → {iso(sc.endD)} · {sc.weeks}w · {((f.assign || []).length > 1 ? f.assign.map(id => members.find(m => m.id === id)?.name || id).join(', ') : sc.person)}</span>
      </div>}
      {!sc && f.best > 0 && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>
        {f.best}d × {f.factor || 1.5} = {re(f.best || 0, f.factor || 1.5).toFixed(1)}d {t('qe.realisticSuffix')} · {t('qe.notScheduled')}
      </div>}
    </>}

    {/* ══════ TIMING TAB ══════ */}
    {activeTab === 'timing' && <>
      {isLeaf && <>
        <div className="frow">
          <div className="field"><label>{t('qe.decideBy')}</label>
            <input type="date" value={f.decideBy || ''} onChange={e => patchNode({ decideBy: e.target.value })} />
          </div>
          <div className="field"><label>{t('qe.due')} {f.due && <span style={{ fontSize: 10, color: 'var(--re)' }}>⏳</span>}</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="date" value={f.due || ''} onChange={e => patchNode({ due: e.target.value })} style={{ flex: 1 }} />
              {f.due && <button className="btn btn-ghost btn-sm" onClick={() => patchNode({ due: '' })}>×</button>}
            </div>
          </div>
          <div className="field"><label>{t('qe.pinnedStart')} {f.pinnedStart && <span style={{ fontSize: 10, color: 'var(--am)' }}>📌</span>}</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input ref={focusRefs.pinnedStart} type="date" value={f.pinnedStart || ''} onChange={e => patchNode({ pinnedStart: e.target.value })} style={{ flex: 1 }} />
              {f.pinnedStart && <button className="btn btn-ghost btn-sm" onClick={() => patchNode({ pinnedStart: '' })}>×</button>}
            </div>
          </div>
        </div>
        <div className="field"><label>{t('qe.completedAt')}</label>
          <input type="date" value={f.completedAt || ''} disabled={f.status !== 'done'} onChange={e => patchNode({ completedAt: e.target.value })} />
          <div className="helper">{t('qe.completedHint')}</div>
        </div>
        {/* Soll/Ist: planned window (Soll) vs actual completion (Ist).
            Renders for done tasks AND for in-flight tasks where the user
            captured plan-start/end before the task slipped. Diff in working
            days exposed so the user sees overrun/underrun at a glance. */}
        {(f.plannedStart || f.plannedEnd || f.completedStart || f.completedEnd) && (
          <div className="frow">
            <div className="field"><label>{t('qe.plannedStart') || 'Soll Start'}</label>
              <input type="date" value={f.plannedStart || ''} onChange={e => patchNode({ plannedStart: e.target.value })} />
            </div>
            <div className="field"><label>{t('qe.plannedEnd') || 'Soll Ende'}</label>
              <input type="date" value={f.plannedEnd || ''} onChange={e => patchNode({ plannedEnd: e.target.value })} />
            </div>
          </div>
        )}
        {f.status === 'done' && (f.completedStart || f.completedEnd) && (() => {
          // Workday-aware Soll/Ist: estimate (best × factor) vs actual workdays
          // between completedStart and completedEnd, with weekends + holidays
          // filtered out so the delta reflects real effort overrun rather
          // than chronological gap.
          const si = computeSollIst(f, { workDays, holidayIso });
          if (!si) return null;
          const tone = si.delta?.tone === 'over' ? 'var(--re)'
            : si.delta?.tone === 'under' ? 'var(--gr)'
            : si.delta?.tone === 'on' ? 'var(--am)' : 'var(--tx3)';
          const sign = si.delta?.workDays > 0 ? `+${si.delta.workDays}d` : `${si.delta?.workDays ?? 0}d`;
          const confTip = `Kalendertage: ${si.ist.calDays} · Wochenenden: ${si.confounders.weekends} · Feiertage: ${si.confounders.holidays}`;
          return (
            <div style={{ marginBottom: 10, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: si.delta ? 4 : 0 }}>
                <span style={{ color: 'var(--tx3)' }}>Soll:</span>
                <span style={{ fontFamily: 'var(--mono)' }} data-htip={`best ${si.soll.best}T × factor ${si.soll.factor}`}>
                  {si.soll.realistic > 0 ? `${si.soll.realistic}d` : '—'}
                </span>
                <span style={{ color: 'var(--tx3)', marginLeft: 14 }}>Ist:</span>
                <span style={{ fontFamily: 'var(--mono)' }} data-htip={confTip}>
                  {si.ist.workDays}d
                </span>
                <span style={{ color: 'var(--tx3)', fontSize: 10 }}>
                  ({si.ist.startD.toISOString().slice(0,10)} → {si.ist.endD.toISOString().slice(0,10)})
                </span>
                {si.delta && (
                  <span style={{ marginLeft: 'auto', color: tone, fontWeight: 700 }}
                    data-htip={`Schätzung ${si.soll.realistic}d → Ist ${si.ist.workDays}d. Faktor-Realität: ${(si.ist.workDays / Math.max(1, si.soll.best)).toFixed(2)}`}>
                    Δ {sign} ({si.delta.percent > 0 ? '+' : ''}{si.delta.percent}%)
                  </span>
                )}
              </div>
              {si.planned && si.planned.workDays > 0 && (
                <div style={{ fontSize: 10, color: 'var(--tx3)', display: 'flex', gap: 6 }}>
                  <span>Plan:</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{si.planned.startD.toISOString().slice(0,10)} → {si.planned.endD.toISOString().slice(0,10)} ({si.planned.workDays}d)</span>
                </div>
              )}
            </div>
          );
        })()}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--tx2)', margin: 0 }}>{t('qe.parallel')}</label>
          <label className="toggle"><input type="checkbox" checked={!!f.parallel} onChange={e => patchNode({ parallel: e.target.checked })} /><span className="slider" /></label>
          {f.parallel && <span style={{ fontSize: 10, color: 'var(--am)' }}>≡</span>}
          {/* seq-based queue reorder gone — ordering now lives in the
              dep + softDep graph, edited via Gantt drag-link or the
              Benötigt list. */}
        </div>
        <p className="helper" style={{ marginBottom: 12 }}>{t('qe.horizonHint')}</p>
      </>}
      {showDeadlineRelevant && <div className="field">
        <label>{t('qe.affectsDeadline')}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="toggle">
            <input
              type="checkbox"
              checked={f.deadlineRelevant !== false}
              disabled={deadlineParentExcluded}
              onChange={e => patchNode({ deadlineRelevant: e.target.checked ? undefined : false })}
            />
            <span className="slider" />
          </label>
          <span style={{ fontSize: 11, color: deadlineParentExcluded ? 'var(--tx3)' : (f.deadlineRelevant === false ? 'var(--am)' : 'var(--tx2)') }}>
            {f.deadlineRelevant === false ? t('no') : t('yes')}
          </span>
        </div>
        <div className="helper">
          {deadlineParentExcluded ? t('qe.affectsDeadlineInheritedOff') : t('qe.affectsDeadlineHint', deadlineRoot?.name || deadlineRootId)}
        </div>
      </div>}

      <div className="field"><label>{t('qe.predecessors')}{!isLeaf ? ` (${t('qe.allLeaves')})` : ''}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
          {(f.deps || []).map(dep => {
            const target = tree.find(entry => entry.id === dep);
            const label = (f._depLabels || {})[dep] || '';
            return <div key={'h_' + dep} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span title="Hard dep — A must finish before B" style={{ fontSize: 8, color: 'var(--am)', flexShrink: 0, fontWeight: 700, letterSpacing: '.05em' }}>H</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{dep}</span>
                {target?.name && <span style={{ fontSize: 10, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{target.name}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <input value={label} onChange={e => bufferNode({ _depLabels: { ...(f._depLabels || {}), [dep]: e.target.value } })} onBlur={flushNode} placeholder="label" style={{ width: 50, background: 'var(--bg)', border: '1px solid var(--b2)', borderRadius: 4, color: 'var(--tx3)', fontSize: 9, padding: '1px 4px', outline: 'none', fontFamily: 'var(--mono)' }} />
                <span title="Convert to soft" style={{ cursor: 'pointer', opacity: 0.7, fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)' }} onClick={() => {
                  patchNode({
                    deps: (f.deps || []).filter(id => id !== dep),
                    softDeps: [...new Set([...(f.softDeps || []), dep])],
                  });
                }}>→S</span>
                <span className="tag-x" style={{ cursor: 'pointer', opacity: 0.6, fontSize: 11, color: 'var(--tx3)' }} onClick={() => {
                  const nextDeps = (f.deps || []).filter(id => id !== dep);
                  const nextLabels = { ...(f._depLabels || {}) };
                  delete nextLabels[dep];
                  patchNode({ deps: nextDeps, _depLabels: nextLabels });
                }}>×</span>
              </div>
            </div>;
          })}
          {(f.softDeps || []).map(dep => {
            const target = tree.find(entry => entry.id === dep);
            return <div key={'s_' + dep} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span title="Soft dep — planner-set sequencing, scheduler still waits" style={{ fontSize: 8, color: 'var(--tx3)', flexShrink: 0, fontWeight: 700, letterSpacing: '.05em' }}>S</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0, fontWeight: 500, fontStyle: 'italic' }}>~{dep}</span>
                {target?.name && <span style={{ fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontStyle: 'italic' }}>{target.name}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <span title="Convert to hard" style={{ cursor: 'pointer', opacity: 0.7, fontSize: 9, color: 'var(--am)', fontFamily: 'var(--mono)' }} onClick={() => {
                  patchNode({
                    softDeps: (f.softDeps || []).filter(id => id !== dep),
                    deps: [...new Set([...(f.deps || []), dep])],
                  });
                }}>→H</span>
                <span className="tag-x" style={{ cursor: 'pointer', opacity: 0.6, fontSize: 11, color: 'var(--tx3)' }} onClick={() => {
                  patchNode({ softDeps: (f.softDeps || []).filter(id => id !== dep) });
                }}>×</span>
              </div>
            </div>;
          })}

          {inheritedDeps.map(({ dep, from }) => {
            const target = tree.find(entry => entry.id === dep);
            return <div key={`inh_${dep}_${from}`} className="dep-row" style={{ opacity: 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{dep}</span>
                {target?.name && <span style={{ fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{target.name}</span>}
              </div>
              <span style={{ fontSize: 9, color: 'var(--tx3)', flexShrink: 0 }}>{t('ph.via', from)}</span>
            </div>;
          })}
        </div>
        <div ref={focusRefs.deps} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <SearchSelect options={allIds.map(id => {
            const entry = tree.find(row => row.id === id);
            return { id, label: entry?.name || '' };
          })} onSelect={id => {
            if (depAddKind === 'hard') patchNode({ deps: [...new Set([...(f.deps || []), id])] });
            else patchNode({ softDeps: [...new Set([...(f.softDeps || []), id])] });
          }} placeholder={`+ ${depAddKind === 'hard' ? 'Hard' : 'Soft'} ${t('qe.predecessors')}`} showIds />
          <div className="btn-group" style={{ display: 'flex', flexShrink: 0 }}>
            <button type="button" className={`btn btn-xs ${depAddKind === 'hard' ? 'btn-pri' : 'btn-sec'}`} style={{ padding: '2px 6px', fontSize: 9 }} onClick={() => setDepAddKind('hard')} title="Hard dep">H</button>
            <button type="button" className={`btn btn-xs ${depAddKind === 'soft' ? 'btn-pri' : 'btn-sec'}`} style={{ padding: '2px 6px', fontSize: 9 }} onClick={() => setDepAddKind('soft')} title="Soft dep">S</button>
          </div>
        </div>
      </div>

      {directSuccessors.length > 0 && <div className="field"><label>Nachfolger</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {directSuccessors.map(s => <div key={s.id} className="dep-row" style={{ opacity: s.soft ? 0.7 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 8, color: s.soft ? 'var(--tx3)' : 'var(--am)', flexShrink: 0, fontWeight: 700, letterSpacing: '.05em' }}>{s.soft ? 'S' : 'H'}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: s.soft ? 'var(--tx3)' : 'var(--ac)', flexShrink: 0, fontWeight: 600, fontStyle: s.soft ? 'italic' : 'normal' }}>{s.id}</span>
              {s.name && <span style={{ fontSize: 10, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontStyle: s.soft ? 'italic' : 'normal' }}>{s.name}</span>}
            </div>
          </div>)}
        </div>
        <div className="helper" style={{ fontSize: 9, marginTop: 4 }}>Direkte Nachfolger werden auf der Nachfolger-Karte bearbeitet.</div>
      </div>}
    </>}

    <hr className="divider" />
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {onDuplicate && <button className="btn btn-sec" style={{ flex: 1, minWidth: 100 }} onClick={() => {
        const subTreeSize = tree.filter(entry => entry.id === node.id || entry.id.startsWith(node.id + '.')).length;
        if (confirm(subTreeSize > 1 ? t('qe.confirmDuplicateN', node.name, subTreeSize - 1) : t('qe.confirmDuplicate', node.name))) onDuplicate(node.id);
      }}>⧉ {t('qe.duplicate')}</button>}
      {/* Split — only when wip with progress > 0. The button asks for the
          consumed % (defaults to current progress) and creates a new
          sibling task with the remaining effort + dep on the original. */}
      {onSplitTaskAtProgress && f.status === 'wip' && f.progress > 0 && f.progress < 100
        && !hasChildren(tree, node.id) && (
        <button className="btn btn-sec" style={{ flex: 1, minWidth: 100 }}
          data-htip={t('split.task.tip')}
          onClick={() => {
            const raw = prompt(t('split.task.prompt', f.progress), String(f.progress));
            if (raw == null) return;
            const p = parseInt(raw, 10);
            if (!Number.isFinite(p) || p <= 0 || p >= 100) {
              alert(t('split.task.invalid'));
              return;
            }
            onSplitTaskAtProgress(node.id, p);
          }}>{t('split.btn')}</button>
      )}
      {onDelete && <button className="btn btn-danger" style={{ flex: 1, minWidth: 100 }} onClick={() => {
        if (confirm(hasChildren(tree, node.id) ? t('qe.confirmDeleteChildren', node.id) : t('qe.confirmDelete', node.id))) onDelete(node.id);
      }}>{t('delete')}</button>}
    </div>
  </>;
}
