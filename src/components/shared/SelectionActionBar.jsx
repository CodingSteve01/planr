import { useT } from '../../i18n.jsx';

// Floating action bar used by Gantt + Tree multi-select. Same styling +
// position across views so the UX feels consistent. Caller passes children
// for view-specific buttons; count + clear are baked in.
export function SelectionActionBar({ count, onClear, children, testId = 'selection-actionbar' }) {
  const { t } = useT();
  if (!count) return null;
  return (
    <div className="gantt-selection-actionbar" data-testid={testId}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 20, padding: '0 6px', background: 'var(--ac)', color: '#fff', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>{count}</span>
      <span style={{ color: 'var(--tx)', fontSize: 11 }}>{t('g.selectedTasks', count)}</span>
      <span style={{ width: 1, height: 16, background: 'var(--b2)' }} />
      {children}
      <span style={{ width: 1, height: 16, background: 'var(--b2)' }} />
      <button
        className="btn btn-xs btn-sec"
        onClick={onClear}
        data-testid={`${testId}-clear`}
        style={{ padding: '3px 8px', fontSize: 10 }}>×</button>
    </div>
  );
}
