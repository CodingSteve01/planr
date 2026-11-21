import { inTeam } from '../../../utils/memberTeams.js';
import { MemberReadRow } from './ReadRows.jsx';

export function ResMembersSection({
  t,
  fMembers,
  fTeams,
  teamFilter,
  teams,
  shortMap,
  meetingPlans,
  scheduled,
  weeks,
  onAdd,
  setEditingMemberId,
}) {
  return (
    <>
      {!fMembers.length && !fTeams.length && (
        <div className="empty">
          <div style={{ fontSize: 24, marginBottom: 8 }}></div>
          {t('rv.noMembers')}
          <p>{t('rv.noMembersHint')}</p>
        </div>
      )}
      {[...fTeams, { id: '', name: t('noTeam'), color: 'var(--tx3)' }].map(tm => {
        // A member in several teams is listed under each of them.
        const teamMembers = fMembers.filter(m => (tm.id ? inTeam(m, tm.id) : !m.team));
        if (!teamMembers.length && tm.id === '') return null;
        if (teamFilter && tm.id && tm.id !== teamFilter) return null;
        return (
          <div key={tm.id || '__none__'} style={{ marginBottom: 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                paddingBottom: 4,
                borderBottom: `2px solid ${tm.color || 'var(--b)'}`,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: tm.color || 'var(--tx2)' }}>{tm.name}</span>
              <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{teamMembers.length}</span>
              {tm.id && (
                <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => onAdd(tm.id)}>
                  + {t('rv.addPerson')}
                </button>
              )}
            </div>
            <table className="res-table">
              <colgroup>
                <col style={{ width: 30 }} />
                <col style={{ width: '32%' }} />
                <col style={{ width: 120 }} />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th />
                  <th>{t('rv.name')}</th>
                  <th>{t('rv.team')}</th>
                  <th>{t('rv.plans')}</th>
                  <th style={{ textAlign: 'right' }} data-htip={t('rv.capVacTip')}>
                    {t('rv.capVac')}
                  </th>
                  <th style={{ textAlign: 'right' }} data-htip={t('rv.windowTip')}>
                    {t('rv.window')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map(m => (
                  <MemberReadRow
                    key={m.id}
                    member={m}
                    teams={teams}
                    shortMap={shortMap}
                    meetingPlans={meetingPlans}
                    scheduled={scheduled}
                    weeks={weeks}
                    onClick={() => setEditingMemberId(m.id)}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
