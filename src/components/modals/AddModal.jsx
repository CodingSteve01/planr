import { useState, useMemo, useEffect } from 'react';
import { Icon } from '../shared/Icon.jsx';
import { nextChildId } from '../../utils/scheduler.js';
import { instantiateTemplatePhases } from '../../utils/phases.js';
import { deadlineRootIdForNode, isDeadlineRelevantForRoot } from '../../utils/deadlines.js';
import { GT, GT_ICON, GL } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { DEFAULT_SIZES } from '../../utils/sizes.js';
import { useT } from '../../i18n.jsx';
import { memberTeamNames } from '../../utils/memberTeams.js';

export function AddModal({ tree, teams, members = [], taskTemplates, sizes: projectSizes, selected, onAdd, onClose }) {
  const { t } = useT();
  const defParent = useMemo(() => selected?.id || '', [selected]);
  const memberLabel = member => `${member.name || member.id}${member.team ? ' — ' + memberTeamNames(member, teams).join(' + ') : ''}`;

  const parents = useMemo(() => {
    const opts = [{ id: '', label: t('add.newTopItemPlaceholder') }];
    tree.forEach(r => opts.push({ id: r.id, label: `${r.id} — ${r.name} (add child)` }));
    return opts;
  }, [tree]);

  const [pid, setPid] = useState(defParent);
  const autoId = nextChildId(tree, pid);
  const autoLvl = pid ? pid.split('.').length + 1 : 1;
  const parentNode = useMemo(() => tree.find(r => r.id === pid) || null, [tree, pid]);
  const isTopLevel = !pid;
  const deadlineRootId = useMemo(() => deadlineRootIdForNode(tree, pid), [tree, pid]);
  const deadlineRoot = useMemo(() => deadlineRootId ? tree.find(entry => entry.id === deadlineRootId) : null, [tree, deadlineRootId]);
  const showDeadlineRelevant = !!deadlineRootId && !!pid;
  const deadlineParentExcluded = useMemo(() => {
    if (!deadlineRootId || !pid) return false;
    return !isDeadlineRelevantForRoot(tree, deadlineRootId, pid);
  }, [tree, pid, deadlineRootId]);

  const [f, setF] = useState({ name: '', status: 'open', team: '', best: 0, factor: 1.5, prio: 2, deps: [], note: '', assign: [], type: '', severity: 'high', date: '', description: '' });
  const s = (k, v) => setF(x => ({ ...x, [k]: v }));

  const isDirty = !!f.name; // only "dirty" once user has typed something
  const safeClose = () => { if (isDirty && !confirm('Discard this new item?')) return; onClose(); };
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') safeClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isDirty]);

  return <div className="overlay">
    <div className="modal fade" onClick={e => e.stopPropagation()}>
      <h2>{isTopLevel ? t('add.titleTop') : t('add.titleChild')}</h2>
      <div className="frow">
        <div className="field"><label>{t('add.parent')}</label>
          <SearchSelect value={pid} options={parents} onSelect={v => setPid(v)} placeholder={t('add.newTopItemPlaceholder')} />
        </div>
        <div className="field" style={{ flex: '0 0 120px' }}><label>{t('add.idAuto')}</label>
          <input value={autoId} readOnly style={{ opacity: .7, cursor: 'default' }} tabIndex={-1} />
          <p className="helper">{parentNode ? t('add.levelUnder', autoLvl, parentNode.id) : t('add.levelTop', autoLvl)}</p>
        </div>
      </div>
      <div className="field"><label>{t('qe.name')}</label><input value={f.name} onChange={e => s('name', e.target.value)} placeholder={isTopLevel ? t('add.namePlaceholderTop') : t('add.namePlaceholderChild')} autoFocus /></div>

      {isTopLevel && <>
        <div className="frow">
          <div className="field"><label>{t('add.focusType')}</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['goal', 'painpoint', 'deadline'].map(t =>
                <button key={t} type="button" className={`goal-type-btn${f.type === t ? ' active' : ''}`} onClick={() => s('type', f.type === t ? '' : t)}><Icon name={GT_ICON[t]} size={12} />{GL[t]}</button>)}
            </div>
          </div>
          {f.type && <div className="field" style={{ flex: '0 0 110px' }}><label>{t('add.severity')}</label>
            <SearchSelect value={f.severity} options={[{ id: 'critical', label: t('sev.critical') }, { id: 'high', label: t('sev.high') }, { id: 'medium', label: t('sev.medium') }]} onSelect={v => s('severity', v)} />
          </div>}
          {f.type === 'deadline' && <div className="field" style={{ flex: '0 0 140px' }}><label>{t('add.date')}</label><input type="date" value={f.date} onChange={e => s('date', e.target.value)} /></div>}
        </div>
        {f.type && <div className="field"><label>{t('add.description')}</label><input value={f.description} onChange={e => s('description', e.target.value)} placeholder={t('qe.descPlaceholder')} /></div>}
        <div className="field"><label>{t('add.teamOptional')}</label>
          <SearchSelect value={f.team} options={teams.map(t => ({ id: t.id, label: t.name }))} onSelect={v => s('team', v)} placeholder={t('bulk.chooseTeam')} allowEmpty />
        </div>
        <div className="field"><label>{t('qe.assignee')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: (f.assign || []).length ? 6 : 0 }}>
            {(f.assign || []).map(id => <span key={id} className="tag">{members.find(member => member.id === id)?.name || id}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(entry => entry !== id))}><Icon name="x" size={9} /></span></span>)}
          </div>
          <SearchSelect
            options={members.filter(member => !(f.assign || []).includes(member.id)).map(member => ({ id: member.id, label: memberLabel(member) }))}
            onSelect={id => {
              const member = members.find(entry => entry.id === id);
              s('assign', [...new Set([...(f.assign || []), id])]);
              if (member?.team && !f.team) s('team', member.team);
            }}
            placeholder={t('qe.assignPerson')}
          />
        </div>
      </>}

      {!isTopLevel && <>
        <div className="frow">
          <div className="field"><label>{t('qe.team')}</label>
            <SearchSelect value={f.team} options={teams.map(t => ({ id: t.id, label: t.name }))} onSelect={v => s('team', v)} placeholder={t('bulk.chooseTeam')} allowEmpty />
          </div>
          <div className="field"><label>{t('qe.status')}</label>
            <SearchSelect value={f.status} options={[{ id: 'open', label: t('open') }, { id: 'wip', label: t('wip') }, { id: 'done', label: t('done') }]} onSelect={v => s('status', v)} />
          </div>
        </div>
        <div className="field"><label>{t('qe.assignee')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: (f.assign || []).length ? 6 : 0 }}>
            {(f.assign || []).map(id => <span key={id} className="tag">{members.find(member => member.id === id)?.name || id}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(entry => entry !== id))}><Icon name="x" size={9} /></span></span>)}
          </div>
          <SearchSelect
            options={members.filter(member => !(f.assign || []).includes(member.id)).map(member => ({ id: member.id, label: memberLabel(member) }))}
            onSelect={id => {
              const member = members.find(entry => entry.id === id);
              s('assign', [...new Set([...(f.assign || []), id])]);
              if (member?.team && !f.team) s('team', member.team);
            }}
            placeholder={t('qe.assignPerson')}
          />
        </div>
        {showDeadlineRelevant && <div className="field">
          <label>{t('qe.affectsDeadline')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="toggle">
              <input
                type="checkbox"
                checked={f.deadlineRelevant !== false}
                disabled={deadlineParentExcluded}
                onChange={e => s('deadlineRelevant', e.target.checked ? undefined : false)}
              />
              <span className="slider" />
            </label>
            <span style={{ fontSize: 11, color: deadlineParentExcluded ? 'var(--tx3)' : (f.deadlineRelevant === false ? 'var(--am)' : 'var(--tx2)') }}>
              {f.deadlineRelevant === false ? t('no') : t('yes')}
            </span>
          </div>
          <p className="helper">
            {deadlineParentExcluded ? t('qe.affectsDeadlineInheritedOff') : t('qe.affectsDeadlineHint', deadlineRoot?.name || deadlineRootId)}
          </p>
        </div>}
        {(taskTemplates || []).length > 0 && <div className="field"><label>{t('add.workflowTemplate')}</label>
          <SearchSelect value={f.templateId || ''} options={[{ id: '', label: t('none') }, ...(taskTemplates || []).map(tp => ({ id: tp.id, label: tp.name }))]}
            onSelect={tplId => {
              if (!tplId) { setF(x => ({ ...x, phases: undefined, templateId: undefined })); return; }
              const tpl = (taskTemplates || []).find(tp => tp.id === tplId);
              if (!tpl) return;
              const phases = instantiateTemplatePhases(tpl.phases);
              setF(x => ({ ...x, phases, templateId: tplId }));
            }} allowEmpty />
        </div>}
        <div className="field"><label>{t('add.quickEstimate')}</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(projectSizes?.length ? projectSizes : DEFAULT_SIZES).map(sz =>
              <button key={sz.label} type="button" className={`btn ${f.best === sz.days ? 'btn-pri' : 'btn-sec'} btn-sm`}
                data-htip={sz.desc || undefined}
                onClick={() => { s('best', sz.days); s('factor', sz.factor); }}>{sz.label}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{sz.days}d</span></button>)}
          </div>
          <p className="helper">{t('add.quickEstimateHint')}</p>
        </div>
        <div className="frow">
          <div className="field"><label>{t('qe.bestDays')}</label><input type="number" min="0" step="0.1" value={f.best} onChange={e => s('best', +e.target.value)} /></div>
          <div className="field"><label>{t('qe.factor')}</label><input type="number" step="0.1" min="1" value={f.factor} onChange={e => s('factor', +e.target.value)} /></div>
          <div className="field"><label>{t('qe.priority')}</label>
            <SearchSelect value={String(f.prio)} options={[1, 2, 3, 4].map(n => ({ id: String(n), label: t(`prio.${n}`) }))} onSelect={v => s('prio', +v)} />
          </div>
        </div>
      </>}
      <div className="field"><label>{t('qe.notes')}</label><textarea value={f.note} onChange={e => s('note', e.target.value)} rows={2} /></div>
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={safeClose}>{t('cancel')}</button>
        <button className="btn btn-pri" disabled={!f.name}
          onClick={() => { if (!f.name) return; const item = { ...f, id: autoId, lvl: autoLvl }; if (!isTopLevel) { delete item.type; delete item.severity; delete item.date; delete item.description; } onAdd(item); onClose(); }}>{isTopLevel ? t('add.submitTop') : t('add.submitChild')}</button>
      </div>
    </div>
  </div>;
}
