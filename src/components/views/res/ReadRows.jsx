import { useMemo } from 'react';
import { deriveCap } from '../../../utils/capacity.js';
import { memberTeams, realisedTeamShares } from '../../../utils/memberTeams.js';
import { initials } from '../../../utils/res/initials.js';

export { TeamReadRow, Avatar, MemberReadRow };

/* ─── Teams ───────────────────────────────────────────────────────────── */
function TeamReadRow({ team, memberCount, meetingPlans = [], teamLockCount = 0, onClick, t }) {
  const plans = (team.meetingPlanIds || []).map(id => meetingPlans.find(p => p.id === id)).filter(Boolean);
  return (
    <tr onClick={onClick}>
      <td className="res-td-avatar">
        <span className="res-dot" style={{ background: team.color || 'var(--ac)' }} />
      </td>
      <td className="res-row-name">
        {team.name || team.id}
        {teamLockCount > 0 && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 3,
              border: '1px solid var(--am)',
              background: 'rgba(245,158,11,.10)',
              color: 'var(--am)',
            }}
            data-htip={t('rv.teamLockTip', teamLockCount)}
          >
            {' '}
            {teamLockCount}
          </span>
        )}
      </td>
      <td>
        <span className="res-plan-tags">
          {plans.map(p => (
            <span key={p.id} className="res-plan-tag res-plan-tag-team" title={t('rv.planTeamWideTip')}>
              {p.name}
            </span>
          ))}
        </span>
      </td>
      <td className="res-row-meta" style={{ textAlign: 'right' }}>
        {memberCount} {t('rv.members')}
      </td>
    </tr>
  );
}

/* ─── Members ─────────────────────────────────────────────────────────── */
function Avatar({ member, teams }) {
  const team = teams.find(t => t.id === member.team);
  const bg = team?.color || 'var(--ac)';
  return (
    <span className="res-avatar" style={{ background: bg }}>
      {initials(member.name || member.id)}
    </span>
  );
}

function MemberReadRow({ member, teams, shortMap, meetingPlans = [], scheduled = [], weeks = [], onClick, t }) {
  const rowTeams = memberTeams(member)
    .map(tid => teams.find(t => t.id === tid))
    .filter(Boolean);
  const shares = useMemo(() => realisedTeamShares(member, scheduled), [member, scheduled]);
  const cap = Math.round(deriveCap(member, { plans: meetingPlans, teams }) * 100);
  const vac = member.vac ?? 25;
  const today = new Date();
  const endD = member.end ? new Date(member.end) : null;
  const offboarded = endD && endD < today;
  const offboardingSoon = endD && endD >= today && (endD - today) / 86400000 <= 60;
  const dates = [member.start, member.end].filter(Boolean).join(' – ');
  // Build plan tag list: team-inherited plans flagged, member plans plain.
  const teamPlanIds = new Set(rowTeams.flatMap(tm => tm.meetingPlanIds || []));
  const memberPlanIds = new Set(member.meetingPlanIds || []);
  const allPlanIds = [...teamPlanIds, ...[...memberPlanIds].filter(id => !teamPlanIds.has(id))];
  const planObjs = allPlanIds.map(id => meetingPlans.find(p => p.id === id)).filter(Boolean);
  return (
    <tr onClick={onClick} style={{ opacity: offboarded ? 0.5 : 1 }}>
      <td className="res-td-avatar">
        <Avatar member={member} teams={teams} />
      </td>
      <td className="res-row-name">
        {member.name || member.id}
        {shortMap[member.id] && (
          <span className="res-row-short" data-htip={t('rv.shortHint')}>
            {shortMap[member.id]}
          </span>
        )}
        {offboarded && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'var(--re)',
              color: '#fff',
            }}
            data-htip={t('rv.offboardedOn', member.end)}
          >
            {t('rv.offboarded')}
          </span>
        )}
        {offboardingSoon && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'var(--am)',
              color: '#fff',
            }}
            data-htip={t('rv.leavingOn', member.end)}
          >
            {t('rv.leavingSoon')}
          </span>
        )}
      </td>
      <td className="res-td-teams">
        {/* One chip per team, wrapping, with the realised share inside it.
            It was a row of fixed chips plus a second line carrying the split
            as prose; in a 40% column two chips already overflowed, so the
            second team read "Front…" and the split "78 % Backend ·…" — the
            one thing a multi-team row is for, cut off. The share is an
            outcome of the scheduled tasks, never an input, and only shown
            when the work actually spans several teams. */}
        <span className="res-team-chips" data-htip={shares.length > 1 ? `${t('rv.teamShareTip')}` : undefined}>
          {rowTeams.map(team => {
            const share = shares.length > 1 ? shares.find(sh => sh.team === team.id) : null;
            return (
              <span
                key={team.id}
                className="res-team-badge"
                data-team-chip={team.id}
                style={{ borderColor: team.color, color: team.color }}
              >
                {team.name}
                {share && <span className="res-team-share">{Math.round(share.pct * 100)} %</span>}
              </span>
            );
          })}
          {/* Work on tasks of a team the person is not in (or of no team):
              still part of the split, so it gets a chip of its own. */}
          {shares.length > 1 &&
            shares
              .filter(sh => !rowTeams.some(tm => tm.id === sh.team))
              .map(sh => (
                <span key={sh.team || '-'} className="res-team-badge res-team-badge-other" data-team-chip={sh.team || ''}>
                  {teams.find(tm => tm.id === sh.team)?.name || sh.team || t('noTeam')}
                  <span className="res-team-share">{Math.round(sh.pct * 100)} %</span>
                </span>
              ))}
        </span>
      </td>
      <td>
        <span className="res-plan-tags">
          {planObjs.map(p => (
            <span key={p.id} className={`res-plan-tag${teamPlanIds.has(p.id) ? ' res-plan-tag-team' : ''}`}>
              {p.name}
            </span>
          ))}
        </span>
      </td>
      <td className="res-row-meta" style={{ textAlign: 'right' }}>
        {cap}% · {vac}d
      </td>
      <td className="res-row-meta" style={{ textAlign: 'right' }}>
        {dates || ''}
      </td>
    </tr>
  );
}
