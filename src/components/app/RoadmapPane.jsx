import { RoadmapLens } from '../shared/RoadmapLens.jsx';

/* Project lens (docs/features.md, Roadmap lenses) — the calendar-style
          per-project roadmap, a TAB of its own beside the Gantt rather than a
          panel hanging off it. It was a chip in the filter row opening a
          380px sidebar, and nobody found it: a view is not a filter, and the
          ask was for a roadmap *next to* the Gantt, in the same style. Same
          data scope as the chart it sits beside (activeTree/activeScheduled:
          rootFilter/team/person + archive applied). */
export function RoadmapPane({
  activeScheduled,
  activeTree,
  cpLabels,
  data,
  diffDoneSet,
  diffOnlyChanged,
  diffProgressedSet,
  ganttRoadmapFocus,
  members,
  onMoveBehind,
  onOpenItemDialog,
  projectWaitsOf,
  setGanttRoadmapFocus,
  sinceDate,
  stats,
  tab,
  teams,
  viewCpSet,
}) {
  return (
    <div className="pane-full" style={{ display: tab === 'roadmap' ? 'flex' : 'none' }} data-testid="roadmap-pane">
      <RoadmapLens
        tree={activeTree}
        scheduled={activeScheduled}
        stats={stats}
        roadmapAssignment={data?.roadmapAssignment || null}
        teams={teams}
        members={members}
        cpSet={viewCpSet}
        cpLabels={cpLabels}
        focusId={ganttRoadmapFocus}
        onFocusChange={setGanttRoadmapFocus}
        diffDoneIds={diffDoneSet}
        diffProgressedIds={diffProgressedSet}
        sinceDate={sinceDate}
        onlyChanged={diffOnlyChanged}
        onOpenItem={onOpenItemDialog}
        projectWaitsOf={projectWaitsOf}
        onMoveBehind={onMoveBehind}
      />
    </div>
  );
}
