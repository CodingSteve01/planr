import { sumMeetingHours } from '../../../utils/capacity.js';
import { MeetingPlanReadRow } from './MeetingPlanModal.jsx';

export function ResPlansSection({ t, fMeetingPlans, fTeams, fMembers, setEditingPlanId }) {
  return fMeetingPlans.length === 0 ? (
    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('rv.plansEmpty')}</div>
  ) : (
    <table className="res-table">
      <colgroup>
        <col style={{ width: 30 }} />
        <col />
        <col style={{ width: '40%' }} />
        <col style={{ width: 200 }} />
      </colgroup>
      <thead>
        <tr>
          <th />
          <th>{t('rv.name')}</th>
          <th>{t('rv.appointments')}</th>
          <th style={{ textAlign: 'right' }}>{t('rv.assigns')}</th>
        </tr>
      </thead>
      <tbody>
        {fMeetingPlans.map(pl => {
          const teamCount = fTeams.filter(tm => (tm.meetingPlanIds || []).includes(pl.id)).length;
          const memberCount = fMembers.filter(m => (m.meetingPlanIds || []).includes(pl.id)).length;
          const totalH = sumMeetingHours(pl.meetings || []);
          return (
            <MeetingPlanReadRow
              key={pl.id}
              plan={pl}
              teamCount={teamCount}
              memberCount={memberCount}
              totalHours={totalH}
              onClick={() => setEditingPlanId(pl.id)}
              t={t}
            />
          );
        })}
      </tbody>
    </table>
  );
}
