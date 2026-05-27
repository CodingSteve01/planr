import { useT } from '../../i18n.jsx';

// Floating action bar used by Gantt + Tree multi-select. Same styling +
// position across views so the UX feels consistent. Caller passes children
// for view-specific buttons; count + clear are baked in. Buttons sized
// comfortably (no fiddly micro buttons), single-line, no wrap.
export function SelectionActionBar({ count, onClear, children, testId = 'selection-actionbar' }) {
  const { t } = useT();
  if (!count) return null;
  return (
    <div className="gantt-selection-actionbar" data-testid={testId}>
      <span className="sab-count">
        <span className="sab-count-pill">{count}</span>
        <span className="sab-count-label">{t('g.selectedTasks', count)}</span>
      </span>
      <span className="sab-divider" />
      {children}
      <span className="sab-divider" />
      <button
        className="sab-close"
        onClick={onClear}
        data-testid={`${testId}-clear`}
        aria-label="Clear selection"
        title="Clear selection">×</button>
    </div>
  );
}
