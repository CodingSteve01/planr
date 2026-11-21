import { TaskInsights } from '../../shared/TaskInsights.jsx';
import { insightTarget } from '../../../utils/insightTargets.js';

// Insights renders from `f`, the panel's local copy — which is exactly
// what went stale when an edit arrived from somewhere else. Tagged with
// the copy's own status so a test can hold it to following along.
export function InsightsTab({
  confReasons,
  confidence,
  cpSet,
  customFields,
  f,
  members,
  onOpenItem,
  onSplitHandoff,
  onSplitTaskAtProgress,
  scheduled,
  setFocusHint,
  setTab,
  stats,
  tabs,
  teams,
  togglePhase,
  tree,
}) {
  return (
    <div data-testid="qe-insights" data-status={f.status || 'open'} style={{ display: 'contents' }}>
      <TaskInsights
        node={f}
        tree={tree}
        members={members}
        teams={teams}
        scheduled={scheduled}
        cpSet={cpSet}
        stats={stats}
        confidence={confidence}
        confReasons={confReasons}
        customFields={customFields}
        onPhaseToggle={togglePhase}
        // The blocker link and the dependency chips open the item they name —
        // here that means selecting it, so the panel shows it. Without this they
        // were drawn as links and did nothing on click.
        onOpenItem={onOpenItem}
        onSplitHandoff={onSplitHandoff}
        onSplitTaskAtProgress={onSplitTaskAtProgress}
        onEditSection={sectionId => {
          const target = insightTarget(sectionId, tabs);
          setTab(target.tab);
          setFocusHint(target.focus);
        }}
      />
    </div>
  );
}
