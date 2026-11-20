import { Frozen } from '../shared/Frozen.jsx';
import { NetGraph } from '../views/NetGraph.jsx';

export function NetPane({ plan, view, handlers }) {
  const {
    archive,
    cpLabels,
    diffDoneSet,
    diffProgressedSet,
    horizonIds,
    members,
    searchIdx,
    teams,
    viewCpSet,
    viewScheduled,
    viewStats,
    visibleTreeForViews,
  } = plan;
  const {
    deferredSearch,
    diffOnlyChanged,
    hideDone,
    horizonOnlyPlanned,
    personFilter,
    rootFilter,
    setRootFilter,
    setSearchIdx,
    showArchived,
    tab,
    teamFilter,
  } = view;
  const { onNetAddNode, onNetDeleteNode, onNetNodeClick } = handlers;
  return (
    <div className="pane-full" style={{ display: tab === 'net' ? 'flex' : 'none' }}>
      <Frozen active={tab === 'net'}>
        <NetGraph
          tree={visibleTreeForViews}
          scheduled={viewScheduled}
          teams={teams}
          members={members}
          cpSet={viewCpSet}
          cpLabels={cpLabels}
          stats={viewStats}
          search={deferredSearch}
          searchIdx={searchIdx}
          isFiltered={!!rootFilter || !!teamFilter || !!personFilter || hideDone || (!showArchived && archive.rootIds.size > 0)}
          diffDoneIds={diffDoneSet}
          diffProgressedIds={diffProgressedSet}
          onlyChanged={diffOnlyChanged}
          horizonIds={horizonIds}
          horizonOnlyPlanned={horizonOnlyPlanned}
          onNodeClick={onNetNodeClick}
          onPickRoot={id => {
            setRootFilter(id);
            setSearchIdx(0);
          }}
          onAddNode={onNetAddNode}
          onDeleteNode={onNetDeleteNode}
        />
      </Frozen>
    </div>
  );
}
