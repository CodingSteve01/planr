// Floating action bar for the Gantt multi-selection, plus the assign modal it opens.

import { SelectionActionBar } from '../../shared/SelectionActionBar.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { AssignModal } from '../../modals/AssignModal.jsx';

export function GanttSelectionBar({
  selectedTaskIds,
  setSelectedIds,
  linkSelectedInOrder,
  t,
  reorderSelectionInTime,
  adjustSelectionPrio,
  onOpenBulkEdit,
  clearSelectedLinks,
  showAssignModal,
  teams,
  members,
  setShowAssignModal,
  tree,
  onTaskUpdate,
}) {
  return (
    <>
      <SelectionActionBar count={selectedTaskIds.length} onClear={() => setSelectedIds(new Set())} testId="gantt-selection-actionbar">
        {selectedTaskIds.length > 1 && (
          <button
            data-testid="gantt-link-selected"
            className="btn btn-pri"
            onClick={linkSelectedInOrder}
            data-htip={t('g.linkSelectedTip')}
          >
            {t('g.linkSelected')}
          </button>
        )}
        {/* Z-order style reorder: shifts the whole selection in the scheduler
        processing order (writes seq). Mirrors media-player jump controls. */}
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => reorderSelectionInTime('first')}
            data-htip={t('g.reorderFirstTip')}
            aria-label={t('g.reorderFirstTip')}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px' }}
          >
            <Icon name="skipBack" size={13} />
          </button>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => reorderSelectionInTime('up')}
            data-htip={t('g.reorderUpTip')}
            aria-label={t('g.reorderUpTip')}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px' }}
          >
            <Icon name="chevronLeft" size={13} />
          </button>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => reorderSelectionInTime('down')}
            data-htip={t('g.reorderDownTip')}
            aria-label={t('g.reorderDownTip')}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px' }}
          >
            <Icon name="chevronRight" size={13} />
          </button>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => reorderSelectionInTime('last')}
            data-htip={t('g.reorderLastTip')}
            aria-label={t('g.reorderLastTip')}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px' }}
          >
            <Icon name="skipForward" size={13} />
          </button>
        </span>
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => adjustSelectionPrio(-1)}
            data-htip={t('g.prioUpTip')}
            aria-label={t('g.prioUpTip')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            Prio
            <Icon name="chevronUp" size={12} />
          </button>
          <button
            type="button"
            className="btn btn-sec"
            onClick={() => adjustSelectionPrio(1)}
            data-htip={t('g.prioDownTip')}
            aria-label={t('g.prioDownTip')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            Prio
            <Icon name="chevronDown" size={12} />
          </button>
        </span>
        <button
          type="button"
          className="sab-assign-trigger"
          onClick={() => onOpenBulkEdit?.(selectedTaskIds)}
          data-htip={t('g.bulkEditTip')}
          data-testid="gantt-bulk-edit-trigger"
        >
          <span className="sab-icon">
            <Icon name="checkSquare" size={13} />
          </span>
          <span>{t('g.bulkEdit')}</span>
        </button>
        <span className="sab-divider" />
        <button
          data-testid="gantt-clear-selected-links"
          className="btn btn-sec"
          onClick={() => clearSelectedLinks('all')}
          data-htip={t('g.clearSelectedLinksTip')}
        >
          {t('g.clearSelectedLinks')}
        </button>
      </SelectionActionBar>
      {showAssignModal && (
        <AssignModal
          count={selectedTaskIds.length}
          teams={teams}
          members={members}
          onClose={() => setShowAssignModal(false)}
          onApply={({ team, persons }) => {
            const sel = new Set(selectedTaskIds);
            (tree || []).forEach(node => {
              if (!sel.has(node.id) || !onTaskUpdate) return;
              const patch = { ...node };
              let changed = false;
              if (team !== null && team !== undefined && (node.team || '') !== (team || '')) {
                patch.team = team || '';
                changed = true;
              }
              if (Array.isArray(persons)) {
                const cur = (node.assign || []).slice().sort().join(',');
                const nxt = persons.slice().sort().join(',');
                if (cur !== nxt) {
                  patch.assign = persons.slice();
                  changed = true;
                }
              }
              if (changed) onTaskUpdate(patch);
            });
          }}
        />
      )}
    </>
  );
}
