import { useEffect } from 'react';
import { LazyInput } from '../../shared/LazyInput.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { PlannedChanges, useDescribeChange } from '../../shared/Effective.jsx';
import { DatedHint } from './DatedHint.jsx';
import { PlanPicker } from './PlanPicker.jsx';

export { TeamEditModal };

/* ─── TeamEditModal ───────────────────────────────────────────────────── */
function TeamEditModal({ team, idx, meetingPlans = [], onUpd, onDel, onClose, t }) {
  const describe = useDescribeChange(meetingPlans);
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{t('rv.editTeam')}</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose} title={t('rv.close')}>
            <Icon name="x" size={11} />
          </button>
        </div>

        {/* Body */}
        <div className="field">
          <label>{t('rv.teamColor')}</label>
          <input
            type="color"
            value={team.color || '#3b82f6'}
            onChange={e => onUpd(idx, 'color', e.target.value)}
            className="res-color-pick"
          />
        </div>
        <div className="field">
          <label>{t('rv.teamName')}</label>
          <LazyInput value={team.name || ''} onCommit={v => onUpd(idx, 'name', v)} placeholder={t('rv.teamName')} />
        </div>

        {/* Meeting-Plans für das Team (werden allen Mitgliedern zugewiesen). */}
        <PlanPicker
          label="Meeting-Pläne (Team)"
          hint="Wirken auf alle Team-Mitglieder mit derived-Cap."
          plans={meetingPlans}
          selected={team.meetingPlanIds || []}
          onChange={ids => onUpd(idx, 'meetingPlanIds', ids)}
        />
        <DatedHint />
        <PlannedChanges kind="teams" id={team.id} describe={describe} />

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-danger"
            onClick={() => {
              onDel(idx);
              onClose();
            }}
          >
            {t('rv.remove')}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec" onClick={onClose}>
            {t('rv.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
