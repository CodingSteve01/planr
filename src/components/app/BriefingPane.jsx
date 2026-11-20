import { BriefingView } from '../views/BriefingView.jsx';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { Frozen } from '../shared/Frozen.jsx';

export function BriefingPane({
  confidence,
  cpLabels,
  data,
  diffFilterSet,
  diffVisibleSet,
  hideDone,
  horizonFilterSet,
  members,
  onBriefingUpdate,
  onJiraApplyStatus,
  onOpenItemDialog,
  onSumExportTodo,
  personFilter,
  rootFilter,
  tab,
  teamFilter,
  teams,
  tree,
  vacations,
  viewCpSet,
  viewScheduled,
  viewStats,
  visibleTreeForViews,
}) {
  return (
    <div className="pane" style={{ display: tab === 'briefing' ? undefined : 'none' }}>
      <Frozen active={tab === 'briefing'}>
        <BriefingView
          tree={visibleTreeForViews}
          scheduled={viewScheduled}
          vacations={vacations}
          members={members}
          teams={teams}
          stats={viewStats}
          confidence={confidence}
          cpSet={viewCpSet}
          cpLabels={cpLabels}
          rootFilter={rootFilter}
          teamFilter={teamFilter}
          personFilter={personFilter}
          hideDone={hideDone}
          planTree={tree}
          horizonIds={horizonFilterSet}
          diffChangedIds={diffFilterSet}
          diffVisibleIds={diffVisibleSet}
          customFields={data.customFields || DEFAULT_CUSTOM_FIELDS}
          onOpenItem={onOpenItemDialog}
          onUpdate={onBriefingUpdate}
          onApplyStatus={onJiraApplyStatus}
          onExportTodo={onSumExportTodo}
        />
      </Frozen>
    </div>
  );
}
