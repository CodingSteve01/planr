import { useEffect } from 'react';
import { LazyInput } from '../../shared/LazyInput.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { useT } from '../../../i18n.jsx';
import { PlannedChanges, useDescribeChange } from '../../shared/Effective.jsx';
import { DatedHint } from './DatedHint.jsx';

export { MeetingPlanReadRow, MeetingPlanEditModal };

/* ─── Meeting-Plan: row + popout edit modal ──────────────────────────────── */
function MeetingPlanReadRow({ plan, teamCount, memberCount, totalHours, onClick, t }) {
  return (
    <tr onClick={onClick}>
      <td className="res-td-avatar">
        <span className="res-dot" style={{ background: 'var(--ac)' }} />
      </td>
      <td className="res-row-name">{plan.name || t('rv.planUnnamed')}</td>
      <td className="res-row-meta">{t('rv.planTermCount', (plan.meetings || []).length, totalHours.toFixed(2))}</td>
      <td className="res-row-meta" style={{ textAlign: 'right' }}>
        {t('rv.planAssignCount', teamCount, memberCount)}
      </td>
    </tr>
  );
}

function MeetingPlanEditModal({ plan, onUpd, onDel, onClose }) {
  const describe = useDescribeChange([]);
  const { t } = useT();
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const addMeeting = () =>
    onUpd({
      ...plan,
      meetings: [
        ...(plan.meetings || []),
        { id: 'mt_' + Math.random().toString(36).slice(2, 8), name: '', hours: 0.5, frequency: 'weekly' },
      ],
    });
  const updMeeting = (mid, patch) =>
    onUpd({
      ...plan,
      meetings: (plan.meetings || []).map(m => (m.id === mid ? { ...m, ...patch } : m)),
    });
  const delMeeting = mid =>
    onUpd({
      ...plan,
      meetings: (plan.meetings || []).filter(m => m.id !== mid),
    });
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal cap-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Meeting-Plan</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose} title={t('rv.close')}>
            <Icon name="x" size={11} />
          </button>
        </div>
        <div className="field">
          <label>Name</label>
          <LazyInput value={plan.name || ''} onCommit={v => onUpd({ ...plan, name: v })} placeholder={t('rv.planNamePlaceholder')} />
        </div>
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 130px 28px',
              gap: 6,
              fontSize: 11,
              color: 'var(--tx3)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            <span>Meeting</span>
            <span>Stunden</span>
            <span>Rhythmus</span>
            <span />
          </div>
          {(plan.meetings || []).map(mt => (
            <div
              key={mt.id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 90px 130px 28px', gap: 6, alignItems: 'center', marginBottom: 4 }}
            >
              <LazyInput
                value={mt.name || ''}
                onCommit={v => updMeeting(mt.id, { name: v })}
                placeholder={t('rv.meetingNamePlaceholder')}
              />
              <LazyInput type="number" min="0" step="0.25" value={mt.hours ?? 0} onCommit={v => updMeeting(mt.id, { hours: Number(v) })} />
              <select value={mt.frequency || 'weekly'} onChange={e => updMeeting(mt.id, { frequency: e.target.value })}>
                <option value="daily">täglich</option>
                <option value="weekly">wöchentl.</option>
                <option value="biweekly">14-tägl.</option>
                <option value="monthly">monatl.</option>
              </select>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => delMeeting(mt.id)}
                aria-label={t('delete')}
                style={{ color: 'var(--re)', padding: '2px 6px' }}
              >
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
          <button className="btn btn-sec btn-xs" onClick={addMeeting} style={{ marginTop: 6 }}>
            + Meeting
          </button>
        </div>
        <DatedHint />
        <PlannedChanges kind="meetingPlans" id={plan.id} describe={describe} />
        <div className="modal-footer">
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('Plan löschen? Zuweisungen bleiben als tote Referenz zurück.')) {
                onDel(plan.id);
                onClose();
              }
            }}
          >
            Entfernen
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
