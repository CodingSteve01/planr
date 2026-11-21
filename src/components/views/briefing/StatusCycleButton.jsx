import { nextStatus } from '../../../utils/treeEdit.js';
import { statusChangePatch } from '../../../utils/completion.js';
import { S_DOT, S_COLOR } from '../../../utils/statusMarks.js';
import { useT } from '../../../i18n.jsx';

// Status dot, clicked to cycle open → wip → done → open — the same field a
// keyboard Space does in the Work Tree (utils/treeEdit.js `nextStatus`), but
// also stamping the completedAt/-Start/progress side effects QuickEdit's
// status dropdown already applies (utils/completion.js `statusChangePatch`),
// since Run mode is exactly the "I'm starting this now" / "this is done"
// moment those dates exist to capture. Writes through the same onUpdate →
// updateNode → mutate() path every other status control in the app uses —
// one undo step, no second write path.
export function StatusCycleButton({ node, onUpdate }) {
  const { t } = useT();
  if (!node || !onUpdate) return null;
  const next = nextStatus(node.status);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs"
      style={{ padding: '1px 4px', fontSize: 12, flexShrink: 0, color: S_COLOR[node.status], lineHeight: 1 }}
      data-htip={t('bv.cycleStatusTip', t(next))}
      data-testid={`bv-status-${node.id}`}
      onClick={e => {
        e.stopPropagation();
        onUpdate({ ...node, ...statusChangePatch(node, next) });
      }}
    >
      {S_DOT[node.status]}
    </button>
  );
}
