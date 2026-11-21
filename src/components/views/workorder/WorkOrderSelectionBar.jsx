import { useT } from '../../../i18n.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { statusChangePatch } from '../../../utils/completion.js';
import { SelectionActionBar } from '../../shared/SelectionActionBar.jsx';

export function WorkOrderSelectionBar({ picked, allById, onClear, onOpenBulkEdit, onQueueReorder, onTaskUpdate }) {
  const { t } = useT();
  return (
    <SelectionActionBar count={picked.size > 1 ? picked.size : 0} onClear={onClear} testId="wo-selection-actionbar">
      {onOpenBulkEdit && (
        <button
          type="button"
          className="sab-assign-trigger"
          onClick={() => onOpenBulkEdit([...picked])}
          data-htip={t('g.bulkEditTip')}
          data-testid="wo-bulk-edit"
        >
          <span className="sab-icon">
            <Icon name="checkSquare" size={13} />
          </span>
          <span>{t('g.bulkEdit')}</span>
        </button>
      )}
      <span className="sab-divider" />
      <button type="button" className="btn btn-sec" data-testid="wo-move-first" onClick={() => onQueueReorder?.([...picked], 'first')}>
        {t('g.ctxRunFirst')}
      </button>
      <button type="button" className="btn btn-sec" data-testid="wo-move-last" onClick={() => onQueueReorder?.([...picked], 'last')}>
        {t('g.ctxRunLast')}
      </button>
      <span className="sab-divider" />
      {[
        ['open', t('tv.statusOpen')],
        ['wip', t('tv.statusWip')],
        ['done', t('tv.statusDone')],
      ].map(([status, label]) => (
        <button
          key={status}
          type="button"
          className="btn btn-sec"
          data-testid={`wo-status-${status}`}
          data-htip={t('tv.bulkStatusTip', label)}
          onClick={() => {
            for (const id of picked) {
              const node = allById.get(id);
              if (node && node.status !== status) onTaskUpdate?.({ ...node, ...statusChangePatch(node, status) });
            }
          }}
        >
          {label}
        </button>
      ))}
    </SelectionActionBar>
  );
}
