import { Icon } from '../../shared/Icon.jsx';
import { SelectionActionBar } from '../../shared/SelectionActionBar.jsx';
import { statusChangePatch } from '../../../utils/completion.js';

// The bar that appears while several rows are selected: bulk edit and a
// one-click status for all of them. Stateless; the view owns the selection.
export function TreeBulkBar({ multiSel, tree, onClearSelection, onOpenBulkEdit, onTaskUpdate, t }) {
  return (
    <SelectionActionBar count={multiSel?.size || 0} onClear={() => onClearSelection?.()} testId="tree-selection-actionbar">
      <button
        type="button"
        className="sab-assign-trigger"
        onClick={() => onOpenBulkEdit?.()}
        data-htip={t('g.bulkEditTip')}
        data-testid="tree-bulk-edit-trigger"
      >
        <span className="sab-icon">
          <Icon name="checkSquare" size={13} />
        </span>
        <span>{t('g.bulkEdit') || 'Massenänderung…'}</span>
      </button>
      <span className="sab-divider" />
      {[
        ['open', t('tv.statusOpen') || 'open'],
        ['wip', t('tv.statusWip') || 'wip'],
        ['done', t('tv.statusDone') || 'done'],
      ].map(([stVal, label]) => (
        <button
          key={stVal}
          type="button"
          className="btn btn-sec"
          onClick={() => {
            (tree || []).forEach(node => {
              if (!multiSel?.has(node.id) || !onTaskUpdate) return;
              if (node.status === stVal) return;
              // statusChangePatch, not a bare { status } — see the Space
              // branch in utils/treeEdit.js. Setting a row to done here has
              // to stamp the same dates the dropdown does, or the Soll/Ist
              // comparison silently misses everything changed in bulk.
              onTaskUpdate({ ...node, ...statusChangePatch(node, stVal) });
            });
          }}
          data-htip={t('tv.bulkStatusTip', label)}
        >
          {label}
        </button>
      ))}
    </SelectionActionBar>
  );
}
