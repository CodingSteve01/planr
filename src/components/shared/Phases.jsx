import { useState } from 'react';
import { SearchSelect } from './SearchSelect.jsx';
import { createPhaseDraft, instantiateTemplatePhases, normalizePhases, phaseAssigneeIds, phaseTeamIds } from '../../utils/phases.js';
import { derivePhaseStatus } from '../../utils/scheduler.js';
import { useT } from '../../i18n.jsx';

/* ══════════════════════════════════════════════════════════════════════
   PhaseEditPopout — modal dialog for editing a single phase.
   Used in QuickEdit, NodeModal, BatchEdit, and SettingsModal.
   ══════════════════════════════════════════════════════════════════════ */
export function PhaseEditPopout({ phase, teams, members, onSave, onClose }) {
  const { t } = useT();
  const [d, setD] = useState({ ...phase });
  const tIds = phaseTeamIds(d);
  const mIds = phaseAssigneeIds(d);
  const showAssignees = members?.length > 0;
  const memberLabel = m => `${m.name || m.id}${m.team ? ' — ' + (teams.find(tm => tm.id === m.team)?.name || m.team) : ''}`;

  const patch = (k, v) => setD(prev => ({ ...prev, [k]: v }));

  return <div className="overlay" style={{ zIndex: 300 }} onClick={onClose}>
    <div className="modal" style={{ width: 'min(420px, 90%)' }} onClick={e => e.stopPropagation()}>
      <h2 style={{ fontSize: 14 }}>{d.name || t('ph.freePhase')}</h2>

      <div className="field"><label>{t('ph.phaseName')}</label>
        <input value={d.name || ''} onChange={e => patch('name', e.target.value)} autoFocus />
      </div>

      <div className="field"><label>{t('ph.phaseTeams')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: tIds.length ? 6 : 0 }}>
          {tIds.map(tid => <span key={tid} className="tag">{teams.find(tm => tm.id === tid)?.name || tid}<span className="tag-x" onClick={() => patch('teams', tIds.filter(id => id !== tid))}>×</span></span>)}
        </div>
        <SearchSelect
          options={teams.filter(tm => !tIds.includes(tm.id)).map(tm => ({ id: tm.id, label: tm.name || tm.id }))}
          onSelect={tid => patch('teams', [...new Set([...tIds, tid])])}
          allowEmpty placeholder={t('ph.phaseTeamAdd')} />
      </div>

      {showAssignees && <div className="field"><label>{t('ph.phaseAssignees')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: mIds.length ? 6 : 0 }}>
          {mIds.map(mid => <span key={mid} className="tag">{members.find(m => m.id === mid)?.name || mid}<span className="tag-x" onClick={() => patch('assign', mIds.filter(id => id !== mid))}>×</span></span>)}
        </div>
        <SearchSelect
          options={members.filter(m => !mIds.includes(m.id)).map(m => ({ id: m.id, label: memberLabel(m) }))}
          onSelect={mid => {
            const member = members.find(m => m.id === mid);
            setD(prev => ({
              ...prev,
              assign: [...new Set([...phaseAssigneeIds(prev), mid])],
              teams: [...new Set([...phaseTeamIds(prev), ...(member?.team ? [member.team] : [])])],
            }));
          }}
          allowEmpty placeholder={t('ph.phaseAssigneeAdd')} />
      </div>}

      <div className="field"><label>Effort %</label>
        <input type="number" min="1" max="100" value={d.effortPct || ''} placeholder="%"
          onChange={e => patch('effortPct', e.target.value ? +e.target.value : undefined)}
          style={{ width: 100 }} />
        <p className="helper">{t('ph.effortHelp')}</p>
      </div>

      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-pri" onClick={() => { onSave(createPhaseDraft(d)); onClose(); }}>{t('save')}</button>
      </div>
    </div>
  </div>;
}

/* ══════════════════════════════════════════════════════════════════════
   PhaseList — complete phase management: progress bar, compact rows,
   template selection, add/remove/reorder, popout editing.
   Used in QuickEdit overview tab, NodeModal overview tab, batch edit.
   ══════════════════════════════════════════════════════════════════════ */
export function PhaseList({ phases: raw, templates, teams, members, templateId, onChange, showStatus = true }) {
  const { t } = useT();
  const [editIdx, setEditIdx] = useState(null);
  const phases = normalizePhases(raw);
  const derived = showStatus ? derivePhaseStatus(phases) : null;
  const currentIdx = phases.findIndex(p => p.status !== 'done');
  const tpls = Array.isArray(templates) ? templates : [];

  const emit = (next, extra = {}) => onChange(next, extra);

  const advance = i => {
    emit(phases.map((p, j) => j === i
      ? createPhaseDraft({ ...p, status: p.status === 'open' ? 'wip' : p.status === 'wip' ? 'done' : 'open' })
      : createPhaseDraft(p)));
  };

  const move = (i, dir) => {
    const np = phases.map(p => createPhaseDraft(p));
    const [item] = np.splice(i, 1);
    np.splice(i + dir, 0, item);
    emit(np);
  };

  const remove = i => {
    emit(phases.filter((_, j) => j !== i).map(p => createPhaseDraft(p)));
    if (editIdx === i) setEditIdx(null);
    else if (editIdx > i) setEditIdx(editIdx - 1);
  };

  const save = (i, updated) => emit(phases.map((p, j) => j === i ? updated : createPhaseDraft(p)));

  const add = () => emit([...phases.map(p => createPhaseDraft(p)), createPhaseDraft({ name: t('ph.freePhase') })]);

  const applyTpl = tplId => {
    const tpl = tpls.find(tp => tp.id === tplId);
    if (tpl) emit(instantiateTemplatePhases(tpl.phases), { templateId: tplId });
  };

  const clear = () => { if (confirm(t('ph.confirmClear'))) emit([], { templateId: undefined }); };

  return <div>
    {/* ── Progress bar (derived from phases) ── */}
    {showStatus && phases.length > 0 && derived && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <span className={`badge b${derived.status[0]}`} style={{ fontSize: 10 }}>
        {derived.status === 'done' ? t('done') : derived.status === 'wip' ? t('wip') : t('open')}
      </span>
      <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: derived.progress + '%', height: '100%', background: 'var(--ac)', borderRadius: 2, transition: 'width .2s' }} />
      </div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{derived.progress}%</span>
    </div>}

    {/* ── Compact phase rows ── */}
    {phases.map((ph, i) => {
      const dot = ph.status === 'done' ? '✓' : ph.status === 'wip' ? '◐' : '○';
      const dotColor = ph.status === 'done' ? 'var(--gr)' : ph.status === 'wip' ? 'var(--ac)' : 'var(--tx3)';
      const tIds = phaseTeamIds(ph);
      const mIds = phaseAssigneeIds(ph);
      const isCurrent = showStatus && i === currentIdx;

      return <div key={ph.id || i} style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '3px 0 3px 6px', borderLeft: isCurrent ? '2px solid var(--ac)' : '2px solid transparent', marginLeft: -8 }}>
        {showStatus && <span style={{ cursor: 'pointer', fontSize: 13, color: dotColor, width: 16, textAlign: 'center', flexShrink: 0, userSelect: 'none' }}
          onClick={() => advance(i)}>{dot}</span>}
        <span style={{ fontSize: 12, color: ph.status === 'done' && showStatus ? 'var(--tx3)' : 'var(--tx)', textDecoration: ph.status === 'done' && showStatus ? 'line-through' : 'none', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 30, cursor: 'pointer', flex: '0 1 auto', maxWidth: 140 }}
          onClick={() => setEditIdx(i)}>{ph.name || t('ph.freePhase')}</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {tIds.map(tid => <span key={tid} className="tag" style={{ fontSize: 9, margin: 0, padding: '1px 4px' }}>{teams.find(tm => tm.id === tid)?.name || tid}</span>)}
          {mIds.map(mid => <span key={mid} className="tag" style={{ fontSize: 9, margin: 0, padding: '1px 4px', borderColor: 'var(--ac)', color: 'var(--ac)' }}>{(members || []).find(m => m.id === mid)?.name || mid}</span>)}
        </div>
        {ph.effortPct > 0 && <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{ph.effortPct}%</span>}
        <button className="btn btn-sec btn-xs" style={{ padding: '2px 5px' }} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
        <button className="btn btn-sec btn-xs" style={{ padding: '2px 5px' }} disabled={i === phases.length - 1} onClick={() => move(i, 1)}>▼</button>
        <button className="btn btn-danger btn-xs" style={{ padding: '2px 5px' }} onClick={() => remove(i)}>×</button>
      </div>;
    })}

    {/* ── Actions (add, template, clear) ── */}
    <div style={{ display: 'flex', gap: 4, marginTop: phases.length ? 6 : 0, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-sec btn-xs" onClick={add}>{t('ph.addPhase')}</button>
      {tpls.length > 0 && <div style={{ minWidth: 160 }}>
        <SearchSelect options={tpls.map(tp => ({ id: tp.id, label: tp.name }))} onSelect={applyTpl} placeholder={t('ph.applyTemplate')} />
      </div>}
      {phases.length > 0 && <>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, color: 'var(--tx3)' }} onClick={clear}>{t('ph.clearPhases')}</button>
      </>}
    </div>

    {/* ── Edit popout ── */}
    {editIdx !== null && editIdx < phases.length && <PhaseEditPopout
      phase={phases[editIdx]}
      teams={teams}
      members={members || []}
      onSave={updated => save(editIdx, updated)}
      onClose={() => setEditIdx(null)}
    />}
  </div>;
}
