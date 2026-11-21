import { Frozen } from '../shared/Frozen.jsx';
import { PlanReview } from '../views/PlanReview.jsx';

export function PlanPane({ plan, view, handlers }) {
  const {
    confReasons,
    confidence,
    cpData,
    cpLabels,
    data,
    diffFilterSet,
    diffVisibleSet,
    horizonFilterSet,
    members,
    teams,
    tree,
    vacations,
    viewCpSet,
    viewScheduled,
    visibleTreeForViews,
    weeks,
  } = plan;
  const { hideDone, personFilter, rootFilter, tab, teamFilter } = view;
  const { onApplyOrder, onOpenItemDialog, onPlanReviewUpdate, reschedule } = handlers;
  return (
    <div className="pane" style={{ display: tab === 'plan' ? undefined : 'none' }}>
      <Frozen active={tab === 'plan'}>
        <PlanReview
          tree={visibleTreeForViews}
          scheduled={viewScheduled}
          members={members}
          teams={teams}
          weeks={weeks}
          vacations={vacations}
          meetingPlans={data?.meetingPlans || []}
          confidence={confidence}
          confReasons={confReasons}
          cpSet={viewCpSet}
          cpLabels={cpLabels}
          cpPaths={cpData.rootPaths}
          rootFilter={rootFilter}
          teamFilter={teamFilter}
          personFilter={personFilter}
          hideDone={hideDone}
          horizonIds={horizonFilterSet}
          diffChangedIds={diffFilterSet}
          diffVisibleIds={diffVisibleSet}
          onOpenItem={onOpenItemDialog}
          onUpdate={onPlanReviewUpdate}
          planTree={tree}
          reschedule={reschedule}
          onApplyOrder={onApplyOrder}
        />
      </Frozen>
    </div>
  );
}
