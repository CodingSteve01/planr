export function ResSectionBar({
  t,
  section,
  setSection,
  fMeetingPlans,
  fTeams,
  fMembers,
  fVacations,
  showOffboarded,
  setShowOffboarded,
  onTeamAdd,
  addVacation,
  meetingPlans,
  onMeetingPlansUpd,
  setEditingPlanId,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
      {[
        ['plans', `${t('rv.plans')} (${fMeetingPlans.length})`],
        ['teams', `${t('rv.teams')} (${fTeams.length})`],
        ['members', `${t('rv.members')} (${fMembers.length})`],
        ['vacations', `${t('rv.vacations')} (${fVacations.length})`],
      ].map(([k, l]) => (
        <button
          key={k}
          data-testid={`rv-section-${k}`}
          className={`btn btn-xs ${section === k ? 'btn-pri' : 'btn-sec'}`}
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => setSection(k)}
        >
          {l}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      {(section === 'members' || section === 'teams') && (
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: 'var(--tx2)',
            cursor: 'pointer',
            marginRight: 8,
          }}
          data-htip={t('q.includeOffboardedTip')}
        >
          <input type="checkbox" checked={showOffboarded} onChange={e => setShowOffboarded(e.target.checked)} style={{ margin: 0 }} />
          {t('q.includeOffboarded')}
        </label>
      )}
      {section === 'teams' && (
        <button className="btn btn-sec btn-sm" onClick={onTeamAdd}>
          {t('rv.addTeam')}
        </button>
      )}
      {section === 'vacations' && (
        <button className="btn btn-sec btn-sm" onClick={addVacation}>
          {t('rv.addVacation')}
        </button>
      )}
      {section === 'plans' && (
        <button
          className="btn btn-sec btn-sm"
          onClick={() => {
            const id = 'mp_' + Math.random().toString(36).slice(2, 8);
            onMeetingPlansUpd([...meetingPlans, { id, name: t('rv.newPlan'), meetings: [] }]);
            setEditingPlanId(id);
          }}
        >
          {t('rv.addPlan')}
        </button>
      )}
    </div>
  );
}
