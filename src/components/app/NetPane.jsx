import { Frozen } from '../shared/Frozen.jsx';
import { NetGraph } from '../views/NetGraph.jsx';

export function NetPane({
  archive,
  cpLabels,
  deferredSearch,
  diffDoneSet,
  diffOnlyChanged,
  diffProgressedSet,
  hideDone,
  horizonIds,
  horizonOnlyPlanned,
  members,
  onNetAddNode,
  onNetDeleteNode,
  onNetNodeClick,
  personFilter,
  rootFilter,
  searchIdx,
  setRootFilter,
  setSearchIdx,
  showArchived,
  tab,
  teamFilter,
  teams,
  viewCpSet,
  viewScheduled,
  viewStats,
  visibleTreeForViews,
}) {
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
