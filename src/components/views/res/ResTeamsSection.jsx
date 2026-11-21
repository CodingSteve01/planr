import { TeamReadRow } from './ReadRows.jsx';

export function ResTeamsSection({ t, fTeams, tree, memberCountForTeam, meetingPlans, setEditingTeamId }) {
  return fTeams.length === 0 ? (
    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('rv.noTeams') || '—'}</div>
  ) : (
    <table className="res-table">
      <colgroup>
        <col style={{ width: 30 }} />
        <col style={{ width: 220 }} />
        <col />
        <col style={{ width: 120 }} />
      </colgroup>
      <thead>
        <tr>
          <th />
          <th>{t('rv.name')}</th>
          <th>{t('rv.plans')}</th>
          <th style={{ textAlign: 'right' }}>{t('rv.members')}</th>
        </tr>
      </thead>
      <tbody>
        {fTeams.map(tm => {
          // Count leaves locked to this team so users see at a
          // glance which teams have whole-team-blocking work in
          // the pipeline.
          const lockCount = (tree || []).filter(r => r.teamLock && r.team === tm.id && r.status !== 'done').length;
          return (
            <TeamReadRow
              key={tm.id}
              team={tm}
              memberCount={memberCountForTeam(tm.id)}
              meetingPlans={meetingPlans}
              teamLockCount={lockCount}
              onClick={() => setEditingTeamId(tm.id)}
              t={t}
            />
          );
        })}
      </tbody>
    </table>
  );
}
