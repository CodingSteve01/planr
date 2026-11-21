import { Icon } from '../../shared/Icon.jsx';
import { useT } from '../../../i18n.jsx';
import { hasChildren } from '../../../utils/scheduler.js';

// What can be done to the item as a whole: copy it, split it at its progress,
// delete it.
export function QuickEditActions({ f, node, onDelete, onDuplicate, onSplitTaskAtProgress, tree }) {
  const { t } = useT();
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {onDuplicate && (
        <button
          className="btn btn-sec"
          style={{ flex: 1, minWidth: 100 }}
          onClick={() => onDuplicate(node.id)}
          style={{ flex: 1, minWidth: 100, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Icon name="copy" size={12} />
          {t('qe.duplicate')}
        </button>
      )}
      {/* Split — only when wip with progress > 0. The button asks for the
          consumed % (defaults to current progress) and creates a new
          sibling task with the remaining effort + dep on the original. */}
      {onSplitTaskAtProgress && f.status === 'wip' && f.progress > 0 && f.progress < 100 && !hasChildren(tree, node.id) && (
        <button
          className="btn btn-sec"
          style={{ flex: 1, minWidth: 100 }}
          data-htip={t('split.task.tip')}
          onClick={() => {
            const raw = prompt(t('split.task.prompt', f.progress), String(f.progress));
            if (raw == null) return;
            const p = parseInt(raw, 10);
            if (!Number.isFinite(p) || p <= 0 || p >= 100) {
              alert(t('split.task.invalid'));
              return;
            }
            onSplitTaskAtProgress(node.id, p);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Icon name="subtask" size={12} />
          {t('split.btn')}
        </button>
      )}
      {onDelete && (
        <button className="btn btn-danger" style={{ flex: 1, minWidth: 100 }} onClick={() => onDelete(node.id)}>
          {t('delete')}
        </button>
      )}
    </div>
  );
}
