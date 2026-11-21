import { Icon } from '../../shared/Icon.jsx';
import { hasChildren } from '../../../utils/scheduler.js';
import { withKey } from '../../../utils/shortcuts.js';

export function NodeFooter({ t, f, node, tree, isDirty, safeClose, save, onClose, onDelete, onDuplicate, onSplitTaskAtProgress }) {
  return (
    <div className="modal-footer">
      {onDelete && (
        <button
          className="btn btn-danger"
          onClick={() => {
            onDelete(node.id);
            onClose();
          }}
        >
          {t('delete')}
        </button>
      )}
      {onDuplicate && (
        <button
          className="btn btn-sec"
          onClick={() => {
            if (isDirty && !confirm(t('nm.unsavedDiscard'))) return;
            onDuplicate(node.id);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="copy" size={12} />
          {t('qe.duplicate')}
        </button>
      )}
      {onSplitTaskAtProgress && f.status === 'wip' && f.progress > 0 && f.progress < 100 && !hasChildren(tree, node.id) && (
        <button
          className="btn btn-sec"
          data-htip={t('split.task.tip')}
          onClick={() => {
            if (isDirty && !confirm(t('nm.unsavedDiscard'))) return;
            const raw = prompt(t('split.task.prompt', f.progress), String(f.progress));
            if (raw == null) return;
            const p = parseInt(raw, 10);
            if (!Number.isFinite(p) || p <= 0 || p >= 100) {
              alert(t('split.task.invalid'));
              return;
            }
            onSplitTaskAtProgress(node.id, p);
            onClose();
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="subtask" size={12} />
          {t('split.btn')}
        </button>
      )}
      <div style={{ flex: 1 }} />
      <button className="btn btn-sec" onClick={safeClose}>
        {t('cancel')}
      </button>
      <button
        className="btn btn-pri"
        data-testid="nm-save"
        data-htip={withKey(t('save'), 'dialogSave')}
        onClick={() => {
          save();
          onClose();
        }}
        disabled={!isDirty}
      >
        {isDirty ? t('save') : t('nm.noChanges')}
      </button>
    </div>
  );
}
