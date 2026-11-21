import { Icon } from '../../shared/Icon.jsx';
import { useT } from '../../../i18n.jsx';
import { computeSollIst } from '../../../utils/sollIst.js';

export function LeafTimingFields({ f, focusRefs, holidayIso, patchCompletion, patchNode, workDays }) {
  const { t } = useT();
  return (
    <>
      <div className="frow">
        <div className="field">
          <label>{t('qe.decideBy')}</label>
          <input type="date" value={f.decideBy || ''} onChange={e => patchNode({ decideBy: e.target.value })} />
        </div>
        <div className="field">
          <label>
            {t('qe.due')} {f.due && <span style={{ fontSize: 11, color: 'var(--re)' }}>~</span>}
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="date" value={f.due || ''} onChange={e => patchNode({ due: e.target.value })} style={{ flex: 1 }} />
            {f.due && (
              <button className="btn btn-ghost btn-sm" onClick={() => patchNode({ due: '' })}>
                <Icon name="x" size={11} />
              </button>
            )}
          </div>
        </div>
        <div className="field">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {t('qe.pinnedStart')}
            {f.pinnedStart && <Icon name="pin" size={10} style={{ color: 'var(--am)' }} />}
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              ref={focusRefs.pinnedStart}
              type="date"
              value={f.pinnedStart || ''}
              onChange={e => patchNode({ pinnedStart: e.target.value })}
              style={{ flex: 1 }}
            />
            {f.pinnedStart && (
              <button className="btn btn-ghost btn-sm" onClick={() => patchNode({ pinnedStart: '' })}>
                <Icon name="x" size={11} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="frow">
        <div className="field">
          <label>{t('qe.completedStart')}</label>
          <input
            type="date"
            value={f.completedStart || ''}
            disabled={f.status === 'open'}
            onChange={e => patchCompletion({ completedStart: e.target.value })}
          />
        </div>
        <div className="field">
          <label>{t('qe.completedEnd')}</label>
          <input
            type="date"
            value={f.completedEnd || ''}
            disabled={f.status !== 'done'}
            onChange={e => patchCompletion({ completedEnd: e.target.value })}
          />
        </div>
        <div className="field">
          <label>{t('qe.completedAt')}</label>
          <input
            type="date"
            value={f.completedAt || ''}
            disabled={f.status !== 'done'}
            onChange={e => patchCompletion({ completedAt: e.target.value })}
          />
        </div>
      </div>
      <div className="helper" style={{ marginTop: -8, marginBottom: 10 }}>
        {t('qe.completedHint')}
      </div>
      {/* Soll/Ist: planned window (Soll) vs actual completion (Ist).
            Renders for done tasks AND for in-flight tasks where the user
            captured plan-start/end before the task slipped. Diff in working
            days exposed so the user sees overrun/underrun at a glance. */}
      {(f.plannedStart || f.plannedEnd || f.completedStart || f.completedEnd) && (
        <div className="frow">
          <div className="field">
            <label>{t('qe.plannedStart')}</label>
            <input type="date" value={f.plannedStart || ''} onChange={e => patchNode({ plannedStart: e.target.value })} />
          </div>
          <div className="field">
            <label>{t('qe.plannedEnd')}</label>
            <input type="date" value={f.plannedEnd || ''} onChange={e => patchNode({ plannedEnd: e.target.value })} />
          </div>
        </div>
      )}
      {f.status === 'done' &&
        (f.completedStart || f.completedEnd) &&
        (() => {
          // Workday-aware Soll/Ist: estimate (best × factor) vs actual workdays
          // between completedStart and completedEnd, with weekends + holidays
          // filtered out so the delta reflects real effort overrun rather
          // than chronological gap.
          const si = computeSollIst(f, { workDays, holidayIso });
          if (!si) return null;
          const tone =
            si.delta?.tone === 'over'
              ? 'var(--re)'
              : si.delta?.tone === 'under'
                ? 'var(--gr)'
                : si.delta?.tone === 'on'
                  ? 'var(--am)'
                  : 'var(--tx3)';
          const sign = si.delta?.workDays > 0 ? `+${si.delta.workDays}d` : `${si.delta?.workDays ?? 0}d`;
          const confTip = t('qe.sollIstCalendarTip', si.ist.calDays, si.confounders.weekends, si.confounders.holidays);
          return (
            <div style={{ marginBottom: 10, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: si.delta ? 4 : 0 }}>
                <span style={{ color: 'var(--tx3)' }}>Soll:</span>
                <span style={{ fontFamily: 'var(--mono)' }} data-htip={t('qe.sollBestFactorTip', si.soll.best, si.soll.factor)}>
                  {si.soll.realistic > 0 ? `${si.soll.realistic}d` : '—'}
                </span>
                <span style={{ color: 'var(--tx3)', marginLeft: 14 }}>Ist:</span>
                <span style={{ fontFamily: 'var(--mono)' }} data-htip={confTip}>
                  {si.ist.workDays}d
                </span>
                <span style={{ color: 'var(--tx3)', fontSize: 11 }}>
                  ({si.ist.startD.toISOString().slice(0, 10)} → {si.ist.endD.toISOString().slice(0, 10)})
                </span>
                {si.delta && (
                  <span
                    style={{ marginLeft: 'auto', color: tone, fontWeight: 700 }}
                    data-htip={t(
                      'qe.sollIstFactorTip',
                      si.soll.realistic,
                      si.ist.workDays,
                      (si.ist.workDays / Math.max(1, si.soll.best)).toFixed(2),
                    )}
                  >
                    Δ {sign} ({si.delta.percent > 0 ? '+' : ''}
                    {si.delta.percent}%)
                  </span>
                )}
              </div>
              {si.planned && si.planned.workDays > 0 && (
                <div style={{ fontSize: 11, color: 'var(--tx3)', display: 'flex', gap: 6 }}>
                  <span>Plan:</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>
                    {si.planned.startD.toISOString().slice(0, 10)} → {si.planned.endD.toISOString().slice(0, 10)} ({si.planned.workDays}d)
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      <p className="helper" style={{ marginBottom: 12 }}>
        {t('qe.horizonHint')}
      </p>
    </>
  );
}
