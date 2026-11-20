import { EffectiveProvider } from '../shared/Effective.jsx';
import { Frozen } from '../shared/Frozen.jsx';
import { ResView } from '../views/ResView.jsx';

export function ResourcesPane({ plan, view, handlers }) {
  const { effContext, scheduled, tree, vacations, weeks } = plan;
  const { personFilter, resLens, tab, teamFilter } = view;
  const {
    onResMeetingPlansUpd,
    onResMemberAdd,
    onResMemberClone,
    onResMemberDel,
    onResMemberUpd,
    onResTeamAdd,
    onResTeamDel,
    onResTeamUpd,
    onResVacUpd,
  } = handlers;
  return (
    <div className="pane" style={{ display: tab === 'resources' ? undefined : 'none' }}>
      <Frozen active={tab === 'resources'}>
        <EffectiveProvider value={effContext}>
          <ResView
            members={resLens.members}
            teams={resLens.teams}
            vacations={vacations}
            meetingPlans={resLens.meetingPlans}
            tree={tree}
            scheduled={scheduled}
            weeks={weeks}
            teamFilter={teamFilter}
            personFilter={personFilter}
            onMeetingPlansUpd={onResMeetingPlansUpd}
            onUpd={onResMemberUpd}
            onAdd={onResMemberAdd}
            onClone={onResMemberClone}
            onDel={onResMemberDel}
            onVac={onResVacUpd}
            onTeamUpd={onResTeamUpd}
            onTeamAdd={onResTeamAdd}
            onTeamDel={onResTeamDel}
          />
        </EffectiveProvider>
      </Frozen>
    </div>
  );
}
