import { useState, useEffect, memo } from 'react';
import { buildMemberShortMap } from '../../App.jsx';
import { useT } from '../../i18n.jsx';
import { iso } from '../../utils/date.js';
import { inTeam } from '../../utils/memberTeams.js';
import { RES_JOB_EVENT } from '../../utils/events.js';
import { TeamEditModal } from './res/TeamEditModal.jsx';
import { MemberEditModal } from './res/MemberEditModal.jsx';
import { MeetingPlanEditModal } from './res/MeetingPlanModal.jsx';
import { VacationEditModal } from './res/VacationEditModal.jsx';
import { ResSectionBar } from './res/ResSectionBar.jsx';
import { ResPlansSection } from './res/ResPlansSection.jsx';
import { ResTeamsSection } from './res/ResTeamsSection.jsx';
import { ResMembersSection } from './res/ResMembersSection.jsx';
import { ResVacationsSection } from './res/ResVacationsSection.jsx';

/* ─── Main component ──────────────────────────────────────────────────── */

function ResViewImpl({
  members,
  teams,
  vacations,
  meetingPlans = [],
  teamFilter = '',
  personFilter = '',
  tree = [],
  scheduled = [],
  onMeetingPlansUpd,
  onUpd,
  onAdd,
  onClone,
  onDel,
  onVac,
  onTeamUpd,
  onTeamAdd,
  onTeamDel,
}) {
  const { t } = useT();
  const shortMap = buildMemberShortMap(members);

  const [section, setSection] = useState('members');
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editingVacIdx, setEditingVacIdx] = useState(null);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const editingPlan = editingPlanId != null ? meetingPlans.find(p => p.id === editingPlanId) : null;
  // Offboarded toggle — persisted so the view sticks across navigations.
  // Default off: most planning happens against the current roster.
  const [showOffboarded, setShowOffboarded] = useState(() => {
    try {
      return localStorage.getItem('planr_res_show_offboarded') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('planr_res_show_offboarded', showOffboarded ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [showOffboarded]);
  const todayIso = iso(new Date());
  const isOffboarded = m => !!m.end && m.end < todayIso;

  // Apply the global topbar filters. personFilter pins to one member; the
  // visible team set narrows to that member's team. teamFilter pins the team
  // and the member set narrows to that team. Filters intersect.
  const fMembers = members.filter(m => {
    if (personFilter && m.id !== personFilter) return false;
    if (teamFilter && !inTeam(m, teamFilter)) return false;
    if (!showOffboarded && isOffboarded(m)) return false;
    return true;
  });
  const visibleMemberIds = new Set(fMembers.map(m => m.id));
  const fTeams = teams.filter(tm => {
    if (teamFilter && tm.id !== teamFilter) return false;
    if (personFilter) {
      const p = members.find(x => x.id === personFilter);
      if (p && !inTeam(p, tm.id)) return false;
    }
    // Hide team when every member is offboarded and the toggle is off.
    // Empty teams (no members at all) still show so they can be populated.
    if (!showOffboarded) {
      const teamMembers = members.filter(m => inTeam(m, tm.id));
      if (teamMembers.length > 0 && teamMembers.every(isOffboarded)) return false;
    }
    return true;
  });
  const fVacations = vacations.filter(v => (!personFilter && !teamFilter ? true : visibleMemberIds.has(v.person)));
  const fMeetingPlans =
    personFilter || teamFilter
      ? meetingPlans.filter(p => {
          const onTeam = fTeams.some(tm => (tm.meetingPlanIds || []).includes(p.id));
          const onMember = fMembers.some(m => (m.meetingPlanIds || []).includes(p.id));
          return onTeam || onMember;
        })
      : meetingPlans;

  const memberCountForTeam = tid => fMembers.filter(m => inTeam(m, tid)).length;

  const editingTeam = editingTeamId != null ? teams.find(tm => tm.id === editingTeamId) : null;
  const editingTeamIdx = editingTeam != null ? teams.indexOf(editingTeam) : -1;
  const editingMember = editingMemberId != null ? members.find(m => m.id === editingMemberId) : null;

  // Local vacation filters — narrow on top of the global topbar filters.
  // Persisted across tab switches so a long vacation list stays focused on
  // the slice the user is currently triaging.
  const [vacMember, setVacMember] = useState(() => {
    try {
      return localStorage.getItem('planr_vac_member') || '';
    } catch {
      return '';
    }
  });
  const [vacYear, setVacYear] = useState(() => {
    try {
      return localStorage.getItem('planr_vac_year') || '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('planr_vac_member', vacMember);
    } catch {
      /* ignore */
    }
  }, [vacMember]);
  useEffect(() => {
    try {
      localStorage.setItem('planr_vac_year', vacYear);
    } catch {
      /* ignore */
    }
  }, [vacYear]);

  /* sort vacations: latest first within year */
  const sortedVacs = [...fVacations]
    .filter(v => !vacMember || v.person === vacMember)
    .filter(v => !vacYear || (v.from || '').slice(0, 4) === vacYear)
    .sort((a, b) => ((a.from || '') < (b.from || '') ? 1 : -1));
  const vacsByYear = sortedVacs.reduce((acc, v) => {
    const y = (v.from || '').slice(0, 4) || '—';
    (acc[y] ||= []).push(v);
    return acc;
  }, {});
  const vacYears = Object.keys(vacsByYear).sort((a, b) => b.localeCompare(a));
  // All available years across the unfiltered set so the year dropdown
  // doesn't shrink as the user narrows the list.
  const allVacYears = [...new Set(fVacations.map(v => (v.from || '').slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  // Drop stale filter values when the underlying option is gone.
  useEffect(() => {
    if (vacMember && !fMembers.some(m => m.id === vacMember)) setVacMember('');
  }, [fMembers, vacMember]);
  useEffect(() => {
    if (vacYear && !allVacYears.includes(vacYear)) setVacYear('');
  }, [allVacYears, vacYear]);

  const addVacation = () => {
    const newVacs = [...vacations, { person: members[0]?.id || '', from: '', to: '', note: '' }];
    onVac(newVacs);
    setEditingVacIdx(newVacs.length - 1);
  };

  // Two jobs that come back every week — booking a holiday and taking someone
  // on — arrive here as commands rather than as a hunt for the right section
  // pill and the Add button under it. The command lands on the work started,
  // not on the tab that contains it: the row exists, the editor is open.
  const [pendingOnboard, setPendingOnboard] = useState(false);
  // Whether the editor that is about to open belongs to somebody who has just
  // been created — the difference between "here is Anna" and "type the name".
  const [focusNewMember, setFocusNewMember] = useState(false);
  useEffect(() => {
    const onJob = e => {
      const job = e.detail?.job;
      if (job === 'vacation') {
        setSection('vacations');
        addVacation();
        return;
      }
      if (job === 'onboard') {
        setSection('members');
        // `onAdd` appends to the members array in App, so the new id is not
        // knowable here until the next render — hence the flag below.
        setPendingOnboard(true);
        onAdd?.();
      }
    };
    window.addEventListener(RES_JOB_EVENT, onJob);
    return () => window.removeEventListener(RES_JOB_EVENT, onJob);
  });
  useEffect(() => {
    if (!pendingOnboard || !members.length) return;
    setPendingOnboard(false);
    setFocusNewMember(true);
    setEditingMemberId(members[members.length - 1].id);
  }, [pendingOnboard, members]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Section pills */}
      <ResSectionBar
        t={t}
        section={section}
        setSection={setSection}
        fMeetingPlans={fMeetingPlans}
        fTeams={fTeams}
        fMembers={fMembers}
        fVacations={fVacations}
        showOffboarded={showOffboarded}
        setShowOffboarded={setShowOffboarded}
        onTeamAdd={onTeamAdd}
        addVacation={addVacation}
        meetingPlans={meetingPlans}
        onMeetingPlansUpd={onMeetingPlansUpd}
        setEditingPlanId={setEditingPlanId}
      />

      {/* ═══════════════ MEETING-PLÄNE ═══════════════ */}
      {section === 'plans' && (
        <ResPlansSection t={t} fMeetingPlans={fMeetingPlans} fTeams={fTeams} fMembers={fMembers} setEditingPlanId={setEditingPlanId} />
      )}

      {/* ═══════════════ TEAMS ═══════════════ */}
      {section === 'teams' && (
        <ResTeamsSection
          t={t}
          fTeams={fTeams}
          tree={tree}
          memberCountForTeam={memberCountForTeam}
          meetingPlans={meetingPlans}
          setEditingTeamId={setEditingTeamId}
        />
      )}

      {/* ═══════════════ MEMBERS ═══════════════ */}
      {section === 'members' && (
        <ResMembersSection
          t={t}
          fMembers={fMembers}
          fTeams={fTeams}
          teamFilter={teamFilter}
          teams={teams}
          shortMap={shortMap}
          meetingPlans={meetingPlans}
          scheduled={scheduled}
          onAdd={onAdd}
          setEditingMemberId={setEditingMemberId}
        />
      )}

      {/* ═══════════════ VACATIONS ═══════════════ */}
      {section === 'vacations' && (
        <ResVacationsSection
          t={t}
          fMembers={fMembers}
          fVacations={fVacations}
          sortedVacs={sortedVacs}
          vacsByYear={vacsByYear}
          vacYears={vacYears}
          allVacYears={allVacYears}
          vacMember={vacMember}
          setVacMember={setVacMember}
          vacYear={vacYear}
          setVacYear={setVacYear}
          vacations={vacations}
          members={members}
          teams={teams}
          setEditingVacIdx={setEditingVacIdx}
        />
      )}

      {/* ═══════════════ MODALS ═══════════════ */}
      {editingTeam && (
        <TeamEditModal
          team={editingTeam}
          idx={editingTeamIdx}
          meetingPlans={meetingPlans}
          onUpd={onTeamUpd}
          onDel={onTeamDel}
          onClose={() => setEditingTeamId(null)}
          t={t}
        />
      )}
      {editingMember && (
        <MemberEditModal
          member={editingMember}
          teams={teams}
          shortMap={shortMap}
          meetingPlans={meetingPlans}
          autoFocusName={focusNewMember}
          onUpd={onUpd}
          onClone={onClone}
          onDel={id => {
            onDel(id);
            setEditingMemberId(null);
          }}
          onClose={() => {
            setEditingMemberId(null);
            setFocusNewMember(false);
          }}
          t={t}
        />
      )}
      {editingVacIdx != null && vacations[editingVacIdx] && (
        <VacationEditModal
          vacation={vacations[editingVacIdx]}
          members={members}
          onUpd={patch => onVac(vacations.map((x, j) => (j === editingVacIdx ? { ...x, ...patch } : x)))}
          onDel={() => {
            onVac(vacations.filter((_, j) => j !== editingVacIdx));
            setEditingVacIdx(null);
          }}
          onClose={() => setEditingVacIdx(null)}
          t={t}
        />
      )}
      {editingPlan && (
        <MeetingPlanEditModal
          plan={editingPlan}
          onUpd={p => onMeetingPlansUpd(meetingPlans.map(x => (x.id === p.id ? p : x)))}
          onDel={pid => onMeetingPlansUpd(meetingPlans.filter(x => x.id !== pid))}
          onClose={() => setEditingPlanId(null)}
        />
      )}
    </div>
  );
}

export const ResView = memo(ResViewImpl);
