import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { useT } from '../../../i18n.jsx';
import { PredecessorList } from './PredecessorList.jsx';

export function PredecessorsField({
  allIds,
  bufferNode,
  depAddKind,
  f,
  flushNode,
  focusRefs,
  inheritedDeps,
  isLeaf,
  patchNode,
  setDepAddKind,
  tree,
}) {
  const { t } = useT();
  return (
    <div className="field">
      <label>
        {t('qe.predecessors')}
        {!isLeaf ? ` (${t('qe.allLeaves')})` : ''}
      </label>
      <PredecessorList
        bufferNode={bufferNode}
        f={f}
        flushNode={flushNode}
        inheritedDeps={inheritedDeps}
        patchNode={patchNode}
        tree={tree}
      />
      <div ref={focusRefs.deps} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <SearchSelect
          options={allIds.map(id => {
            const entry = tree.find(row => row.id === id);
            return { id, label: entry?.name || '' };
          })}
          onSelect={id => {
            if (depAddKind === 'hard') patchNode({ deps: [...new Set([...(f.deps || []), id])] });
            else patchNode({ softDeps: [...new Set([...(f.softDeps || []), id])] });
          }}
          placeholder={`+ ${depAddKind === 'hard' ? 'Hard' : 'Soft'} ${t('qe.predecessors')}`}
          showIds
        />
        <div className="btn-group" style={{ display: 'flex', flexShrink: 0 }}>
          <button
            type="button"
            className={`btn btn-xs ${depAddKind === 'hard' ? 'btn-pri' : 'btn-sec'}`}
            style={{ padding: '2px 6px', fontSize: 10 }}
            onClick={() => setDepAddKind('hard')}
            title={t('qe.dep.hard')}
          >
            H
          </button>
          <button
            type="button"
            className={`btn btn-xs ${depAddKind === 'soft' ? 'btn-pri' : 'btn-sec'}`}
            style={{ padding: '2px 6px', fontSize: 10 }}
            onClick={() => setDepAddKind('soft')}
            title={t('qe.dep.soft')}
          >
            S
          </button>
        </div>
      </div>
    </div>
  );
}
