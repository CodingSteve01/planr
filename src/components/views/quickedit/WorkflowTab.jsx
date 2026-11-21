import { Icon } from '../../shared/Icon.jsx';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { PhaseList } from '../../shared/Phases.jsx';
// Switched off, not removed (see the comment where it used to render): kept
// imported so the file stays part of the app and is found when it is wanted.
// eslint-disable-next-line no-unused-vars
import { HandoffPlanEditor } from '../../shared/HandoffPlanEditor.jsx';
import { ItemHistoryTimeline } from '../../shared/ItemHistoryTimeline.jsx';
import { useT } from '../../../i18n.jsx';
import { leafNodes, leafProgress } from '../../../utils/scheduler.js';
import { statusChangePatch } from '../../../utils/completion.js';

export function WorkflowTab({
  bufferNode,
  commitPhases,
  donePatch,
  f,
  flushNode,
  focusRefs,
  historyEvents,
  isLeaf,
  members,
  node,
  onHistoryChange,
  patchNode,
  phases,
  stats,
  taskTemplates,
  teams,
  timeline,
  tree,
  viewDay,
}) {
  const { t } = useT();
  return (
    <>
      {/* What a package's status is made of. */}
      {!isLeaf &&
        phases.length === 0 &&
        (() => {
          const st = stats?.[node.id];
          const leafCount = leafNodes(tree).filter(child => child.id.startsWith(node.id + '.')).length;
          const doneCount = leafNodes(tree).filter(child => child.id.startsWith(node.id + '.') && child.status === 'done').length;
          return (
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--tx2)' }}>
                {doneCount}/{leafCount} {t('qe.leafItems')} {t('done')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                <span style={{ color: 'var(--tx3)' }}>{t('qe.best')}</span>
                <span>{st?._b?.toFixed(0) || 0}d</span>
                <span style={{ color: 'var(--tx3)' }}>{t('qe.realistic')}</span>
                <span style={{ color: 'var(--am)' }}>{st?._r?.toFixed(1) || 0}d</span>
                {timeline?.period && (
                  <>
                    <span style={{ color: 'var(--tx3)' }}>{t('ins.period')}</span>
                    <span>
                      {timeline.period.start.toLocaleDateString('de-DE')} — {timeline.period.end.toLocaleDateString('de-DE')}
                    </span>
                  </>
                )}
                {timeline?.deadline && (
                  <>
                    <span style={{ color: 'var(--tx3)' }}>{t('qe.affectsDeadline')}</span>
                    <span>
                      {timeline.deadline.start.toLocaleDateString('de-DE')} — {timeline.deadline.end.toLocaleDateString('de-DE')}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })()}

      {/* Status + Progress — manual only when NO phases */}
      {isLeaf && phases.length === 0 && (
        <div ref={focusRefs.status} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: '0 0 100px' }}>
            <SearchSelect
              value={f.status || 'open'}
              options={[
                { id: 'open', label: t('open') },
                { id: 'wip', label: t('wip') },
                { id: 'done', label: t('done') },
              ]}
              onSelect={value => {
                // Sync progress when status changes manually. Done → completedAt
                // clamps to today: a task marked done now is finished now, never
                // in the future (would otherwise inherit a stale planned-end).
                if (value === 'done') {
                  patchNode(donePatch());
                } else if (value === 'open') patchNode({ status: 'open', progress: 0 });
                else if (value === 'wip') patchNode(statusChangePatch(f, 'wip'));
              }}
            />
          </div>
          {/* Slider buffers locally on every onChange (so the thumb tracks) but
            only commits to the parent — and re-runs the scheduler — when the
            user releases the pointer or blurs. Without this every drag step
            triggered a full setData → reschedule loop. */}
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={f.progress ?? leafProgress(f)}
            onChange={e => {
              const value = +e.target.value;
              const next = { ...f, progress: value };
              if (value >= 100 && f.status !== 'done') {
                Object.assign(next, donePatch());
              }
              // Only borrow completedStart here, not the whole wip patch — the
              // slider's own value is the progress we want, not the "keep
              // current progress, else default 50" rule statusChangePatch uses
              // when there is no slider to read from.
              else if (value > 0 && value < 100 && f.status !== 'wip') {
                next.status = 'wip';
                next.completedStart = statusChangePatch(f, 'wip').completedStart;
              } else if (value === 0 && f.status !== 'open') next.status = 'open';
              bufferNode(next);
            }}
            onPointerUp={() => flushNode()}
            onKeyUp={() => flushNode()}
            onBlur={() => flushNode()}
            style={{ flex: 1, accentColor: 'var(--ac)' }}
          />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx3)', flexShrink: 0, width: 28, textAlign: 'right' }}>
            {f.progress ?? leafProgress(f)}%
          </span>
        </div>
      )}

      {/* Phases — define status + progress when present */}
      {isLeaf && (
        <div ref={focusRefs.phases}>
          <PhaseList
            phases={f.phases}
            templates={taskTemplates}
            teams={teams}
            members={members}
            templateId={f.templateId}
            onChange={commitPhases}
          />
        </div>
      )}

      {/* HandoffPlanEditor disabled — auto-cascade is off by default;
          users handle offboard truncation via the explicit ↳ Split flow.
          Re-enable here only if pre-planned multi-stage handoffs become
          a real workflow again. */}

      {/* The history under the fields that write it, as in the dialog. The
          panel saves with every change, so there is no day to pick here:
          an entry's day is moved in the list, or backdating is switched on. */}
      {onHistoryChange && (
        <div style={{ marginTop: 14 }}>
          <ItemHistoryTimeline item={f} events={historyEvents} onEventsChange={onHistoryChange} viewDay={viewDay} />
        </div>
      )}

      {/* Last on the tab: the rarest thing done here. */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          data-testid="qe-drop-toggle"
          className={`btn btn-sm ${f.dropped ? 'btn-pri' : 'btn-sec'}`}
          data-htip={t('nm.dropHint')}
          onClick={() => patchNode({ dropped: f.dropped ? undefined : true })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0 }}
        >
          <Icon name={f.dropped ? 'undo' : 'x'} size={13} />
          {f.dropped ? t('nm.dropUndo') : t('nm.dropDo')}
        </button>
      </div>
    </>
  );
}
