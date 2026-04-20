import { useState, useEffect, useMemo } from 'react';
import { SBadge } from '../shared/Badges.jsx';
import { SL, GT } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { PhaseList } from '../shared/Phases.jsx';
import { AutoAssignHint } from '../shared/AutoAssignHint.jsx';
import { hasChildren, isLeafNode, leafNodes, leafProgress, re, derivePhaseStatus } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';
import { normalizePhases } from '../../utils/phases.js';
import { useT } from '../../i18n.jsx';
import { DEFAULT_SIZES } from '../../utils/sizes.js';

// REASON_TIP is built inside the component using t() — see reasonTip helper below
const CONF_LABEL = { committed: 'Committed', estimated: 'Estimated', exploratory: 'Exploratory' };
const CONF_DOT = { committed: '●', estimated: '◐', exploratory: '○' };
const CONF_COLOR = { committed: 'var(--gr)', estimated: 'var(--am)', exploratory: 'var(--tx3)' };

export function QuickEdit({ node, tree, members, teams, taskTemplates, sizes: projectSizes, scheduled, cpSet, stats, confidence = {}, confReasons = {}, onUpdate, onDelete, onEstimate, onDuplicate, onReorderInQueue, tab: tabProp, onTabChange }) {
  const { t } = useT();
  const REASON_TIP = {
    'manual': t('g.reasonManual'), 'done': t('g.reasonDone'),
    'auto:person+estimate': t('g.reasonPersonEstimate'), 'auto:no-person': t('g.reasonNoPerson'),
    'auto:high-risk': t('g.reasonHighRisk'), 'auto:no-estimate': t('g.reasonNoEstimate'),
    'inherited': t('g.reasonInherited'),
  };
  const [f, setF] = useState({ ...node });

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
  const allIds = tree.map(r => r.id).filter(id => id !== node.id);
  const SIZES = (projectSizes?.length ? projectSizes : DEFAULT_SIZES).map(s => [s.label, s.days, s.factor, s.desc || '']);
  const nearestSize = f.best > 0 ? SIZES.reduce((best, size) => Math.abs(size[1] - f.best) < Math.abs(best[1] - f.best) ? size : best, SIZES[0]) : null;
  const phases = normalizePhases(f.phases);
  const memberLabel = member => `${member.name || member.id}${member.team ? ' — ' + (teams.find(team => team.id === member.team)?.name || member.team) : ''}`;
  const memberName = id => members.find(member => member.id === id)?.name || id;

  const tabs = [
    { id: 'overview', label: t('qe.tab.overview') },
    ...(!isRoot ? [{ id: 'workflow', label: t('qe.tab.workflow') }] : []),
    ...(isLeaf ? [{ id: 'effort', label: t('qe.tab.effort') }] : []),
    { id: 'timing', label: t('qe.tab.timing') },
  ];

  const activeTab = tabs.find(item => item.id === tabProp) ? tabProp : 'overview';
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
    const ownSet = new Set(f.deps || []);
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

  return <>
    {isCp && <div style={{ background: '#3d0a0e', border: '1px solid var(--re)', borderRadius: 'var(--r)', padding: '6px 10px', marginBottom: 10, fontSize: 11, color: '#fda4af', display: 'flex', gap: 6, alignItems: 'center' }}>⚡ {t('qe.cpItem')}</div>}

    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
      {isLeaf && <SBadge s={node.status} />}
      {!isLeaf && <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 10 }}>{SL[f.status] || f.status} <span style={{ fontSize: 8, color: 'var(--tx3)', fontWeight: 400 }}>{t('qe.autoStatus')}</span></span>}
      {!isRoot && phases.length > 0 && <span className="badge bo">{phases.length} {t('ph.phases').toLowerCase()}</span>}
      {isLeaf && onEstimate && <button className={`btn btn-pri${!f.best ? ' btn-cta' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => onEstimate(node)}>{t('qe.estimateNow')}</button>}
    </div>

    <div className="qe-tabs">
      {tabs.map(item => <button key={item.id} className={`qe-tab${activeTab === item.id ? ' active' : ''}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>

    {/* ══════ OVERVIEW TAB ══════ */}
    {activeTab === 'overview' && <>
      <div className="field"><label>{t('qe.name')}</label><input value={f.name || ''} onChange={e => bufferNode({ name: e.target.value })} onBlur={flushNode} /></div>
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

      {/* Status + Progress — manual only when NO phases */}
      {isLeaf && phases.length === 0 && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: '0 0 100px' }}>
          <SearchSelect value={f.status || 'open'} options={[{ id: 'open', label: t('open') }, { id: 'wip', label: t('wip') }, { id: 'done', label: t('done') }]} onSelect={value => patchNode({ status: value })} />
        </div>
        <input type="range" min="0" max="100" step="5" value={f.progress ?? leafProgress(f)}
          onChange={e => {
            const value = +e.target.value;
            const next = { ...f, progress: value };
            if (value >= 100 && f.status !== 'done') next.status = 'done';
            else if (value > 0 && value < 100 && f.status !== 'wip') next.status = 'wip';
            else if (value === 0 && f.status !== 'open') next.status = 'open';
            commitNode(next);
          }}
          style={{ flex: 1, accentColor: 'var(--ac)' }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', flexShrink: 0, width: 28, textAlign: 'right' }}>{f.progress ?? leafProgress(f)}%</span>
      </div>}

      {/* Phases — define status + progress when present */}
      {!isRoot && <PhaseList
        phases={f.phases}
        templates={taskTemplates}
        teams={teams}
        members={members}
        templateId={f.templateId}
        onChange={commitPhases}
      />}

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
            {st?._startD && <><span style={{ color: 'var(--tx3)' }}>{t('qe.period')}</span><span>{st._startD.toLocaleDateString('de-DE')} — {st._endD.toLocaleDateString('de-DE')}</span></>}
          </div>
        </div>;
      })()}
    </>}

    {/* ══════ WORKFLOW TAB ══════ */}
    {activeTab === 'workflow' && !isRoot && <>
      <div className="field"><label>{t('qe.team')}</label>
        <SearchSelect value={f.team || ''} options={teams.map(team => ({ id: team.id, label: team.name || team.id }))} onSelect={value => patchNode({ team: value })} allowEmpty />
      </div>

      {isLeaf && <div className="field"><label>{t('qe.assignee')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: (f.assign || []).length ? 6 : 0 }}>
          {(f.assign || []).map(id => <span key={id} className="tag">{memberName(id)}<span className="tag-x" onClick={() => patchNode({ assign: (f.assign || []).filter(entry => entry !== id) })}>×</span></span>)}
        </div>
        <AutoAssignHint node={f} scheduled={scheduled} members={members}
          onAccept={({ assign, team }) => patchNode({ assign, team })} />
        <SearchSelect
          options={members.filter(member => !(f.assign || []).includes(member.id)).map(member => ({ id: member.id, label: memberLabel(member) }))}
          onSelect={id => {
            const member = members.find(entry => entry.id === id);
            patchNode({ assign: [...new Set([...(f.assign || []), id])], team: member?.team || f.team });
          }}
          placeholder={t('qe.assignPerson')}
        />
      </div>}
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
        <div className="field"><label>{t('qe.bestDays')}</label><input type="number" min="0" value={f.best || 0} onChange={e => bufferNode({ best: +e.target.value })} onBlur={flushNode} /></div>
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
        <span style={{ color: 'var(--tx3)' }}> {t('qe.realisticSuffix')}{isCp ? ' · ⚡ CP' : ''}</span>
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
          <div className="field"><label>{t('qe.pinnedStart')} {f.pinnedStart && <span style={{ fontSize: 10, color: 'var(--am)' }}>📌</span>}</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="date" value={f.pinnedStart || ''} onChange={e => patchNode({ pinnedStart: e.target.value })} style={{ flex: 1 }} />
              {f.pinnedStart && <button className="btn btn-ghost btn-sm" onClick={() => patchNode({ pinnedStart: '' })}>×</button>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--tx2)', margin: 0 }}>{t('qe.parallel')}</label>
          <label className="toggle"><input type="checkbox" checked={!!f.parallel} onChange={e => patchNode({ parallel: e.target.checked })} /><span className="slider" /></label>
          {f.parallel && <span style={{ fontSize: 10, color: 'var(--am)' }}>≡</span>}
          {onReorderInQueue && !f.parallel && <>
            <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 'auto' }}>{t('qe.queue')}</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'first')} style={{ padding: '2px 5px' }} data-htip={t('nm.first')}>⤒</button>
              <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'earlier')} style={{ padding: '2px 5px' }} data-htip={t('nm.earlier')}>▲</button>
              <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'later')} style={{ padding: '2px 5px' }} data-htip={t('nm.later')}>▼</button>
              <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'last')} style={{ padding: '2px 5px' }} data-htip={t('nm.last')}>⤓</button>
            </div>
          </>}
        </div>
        <p className="helper" style={{ marginBottom: 12 }}>{t('qe.horizonHint')}</p>
      </>}

      <div className="field"><label>{t('qe.predecessors')}{!isLeaf ? ` (${t('qe.allLeaves')})` : ''}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
          {(f.deps || []).map(dep => {
            const target = tree.find(entry => entry.id === dep);
            const label = (f._depLabels || {})[dep] || '';
            return <div key={dep} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{dep}</span>
                {target?.name && <span style={{ fontSize: 10, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{target.name}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <input value={label} onChange={e => patchNode({ _depLabels: { ...(f._depLabels || {}), [dep]: e.target.value } })} placeholder="label" style={{ width: 50, background: 'var(--bg)', border: '1px solid var(--b2)', borderRadius: 4, color: 'var(--tx3)', fontSize: 9, padding: '1px 4px', outline: 'none', fontFamily: 'var(--mono)' }} />
                <span className="tag-x" style={{ cursor: 'pointer', opacity: 0.6, fontSize: 11, color: 'var(--tx3)' }} onClick={() => {
                  const nextDeps = (f.deps || []).filter(id => id !== dep);
                  const nextLabels = { ...(f._depLabels || {}) };
                  delete nextLabels[dep];
                  patchNode({ deps: nextDeps, _depLabels: nextLabels });
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
        <SearchSelect options={allIds.map(id => {
          const entry = tree.find(row => row.id === id);
          return { id, label: entry?.name || '' };
        })} onSelect={id => patchNode({ deps: [...new Set([...(f.deps || []), id])] })} placeholder={`+ ${t('qe.predecessors')}`} showIds />
      </div>
    </>}

    <hr className="divider" />
    <div style={{ display: 'flex', gap: 6 }}>
      {onDuplicate && <button className="btn btn-sec" style={{ flex: 1 }} onClick={() => {
        const subTreeSize = tree.filter(entry => entry.id === node.id || entry.id.startsWith(node.id + '.')).length;
        if (confirm(subTreeSize > 1 ? t('qe.confirmDuplicateN', node.name, subTreeSize - 1) : t('qe.confirmDuplicate', node.name))) onDuplicate(node.id);
      }}>⧉ {t('qe.duplicate')}</button>}
      {onDelete && <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => {
        if (confirm(hasChildren(tree, node.id) ? t('qe.confirmDeleteChildren', node.id) : t('qe.confirmDelete', node.id))) onDelete(node.id);
      }}>{t('delete')}</button>}
    </div>
  </>;
}
