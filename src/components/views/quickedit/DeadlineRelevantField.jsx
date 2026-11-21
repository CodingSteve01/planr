import { useT } from '../../../i18n.jsx';

export function DeadlineRelevantField({ deadlineParentExcluded, deadlineRoot, deadlineRootId, f, patchNode }) {
  const { t } = useT();
  return (
    <div className="field">
      <label>{t('qe.affectsDeadline')}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label className="toggle">
          <input
            type="checkbox"
            checked={f.deadlineRelevant !== false}
            disabled={deadlineParentExcluded}
            onChange={e => patchNode({ deadlineRelevant: e.target.checked ? undefined : false })}
          />
          <span className="slider" />
        </label>
        <span
          style={{
            fontSize: 12,
            color: deadlineParentExcluded ? 'var(--tx3)' : f.deadlineRelevant === false ? 'var(--am)' : 'var(--tx2)',
          }}
        >
          {f.deadlineRelevant === false ? t('no') : t('yes')}
        </span>
      </div>
      <div className="helper">
        {deadlineParentExcluded ? t('qe.affectsDeadlineInheritedOff') : t('qe.affectsDeadlineHint', deadlineRoot?.name || deadlineRootId)}
      </div>
    </div>
  );
}
