import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { CONF_COLOR } from '../../../constants.js';
import { re } from '../../../utils/scheduler.js';
import { iso } from '../../../utils/date.js';

const CONF_DOT = { committed: '●', estimated: '◐', exploratory: '○' };

export function EffortTab({
  t,
  f,
  s,
  node,
  sc,
  members,
  confidence,
  confReasons,
  isDirty,
  focusRefs,
  onClose,
  onEstimate,
  SIZES,
  nearestSize,
  CONF_OPTS,
  REASON_TIP,
}) {
  return (
    <>
      <div className="field">
        <label>{t('qe.quickEstimate')}</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
          {SIZES.map(([sz, d, fc, desc]) => {
            const exact = f.best === d;
            const nearest = !exact && nearestSize?.[0] === sz && f.best > 0;
            return (
              <button
                key={sz}
                className={`btn ${exact ? 'btn-pri' : 'btn-sec'} btn-sm`}
                style={nearest ? { borderColor: 'var(--ac)', opacity: 0.8 } : undefined}
                data-htip={desc || undefined}
                onClick={() => {
                  s('best', d);
                  s('factor', fc);
                }}
              >
                {sz}
                <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>{d}d</span>
              </button>
            );
          })}
        </div>
        {onEstimate && (
          <button
            className={`btn btn-pri${!f.best ? ' btn-cta' : ''}`}
            style={{ marginTop: 4 }}
            onClick={() => {
              if (isDirty && !confirm(t('nm.unsavedDiscard'))) return;
              onClose();
              onEstimate(node);
            }}
          >
            {t('qe.estimateNow')}
          </button>
        )}
      </div>
      <div className="frow">
        <div className="field">
          <label>{t('qe.bestDays')}</label>
          <input
            ref={focusRefs.bestDays}
            type="number"
            min="0"
            step="0.1"
            value={f.best || 0}
            onChange={e => s('best', +e.target.value)}
            style={{ fontFamily: 'var(--mono)' }}
          />
        </div>
        <div className="field">
          <label>{t('qe.factor')}</label>
          <input
            type="number"
            step="0.1"
            min="1"
            max="5"
            value={f.factor || 1.5}
            onChange={e => s('factor', +e.target.value)}
            style={{ fontFamily: 'var(--mono)' }}
          />
        </div>
      </div>
      <div className="field">
        <label>{t('qe.fixedDuration')}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="toggle" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={(f.fixedDurationDays || 0) > 0}
              onChange={e => s('fixedDurationDays', e.target.checked ? f.fixedDurationDays || Math.max(1, Math.ceil(f.best || 1)) : 0)}
            />
            <span className="slider" />
          </label>
          <input
            type="number"
            min="1"
            step="1"
            disabled={!(f.fixedDurationDays > 0)}
            value={f.fixedDurationDays || ''}
            onChange={e => s('fixedDurationDays', Math.max(1, Math.ceil(+e.target.value || 1)))}
            style={{ maxWidth: 110, fontFamily: 'var(--mono)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{t('qe.fixedDurationDays')}</span>
        </div>
        <div className="helper">{t('qe.fixedDurationHint')}</div>
      </div>
      <div className="field">
        <label>{t('qe.confidence')}</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <SearchSelect value={f.confidence || ''} options={CONF_OPTS} onSelect={v => s('confidence', v)} />
          </div>
          {(() => {
            const eff = confidence[node.id] || 'committed';
            const reason = confReasons[node.id];
            const isAuto = !f.confidence;
            return (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  borderRadius: 'var(--r)',
                  border: `1px solid ${CONF_COLOR[eff]}`,
                  fontSize: 11,
                  color: CONF_COLOR[eff],
                  cursor: 'help',
                  whiteSpace: 'nowrap',
                }}
                data-htip={`${t(`conf.${eff}`)} — ${REASON_TIP[reason] || '?'}`}
              >
                {CONF_DOT[eff]} {isAuto ? 'auto' : ''} {t(`conf.${eff}`)}
              </span>
            );
          })()}
        </div>
      </div>
      {sc && (
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 12, lineHeight: 1.6 }}>
          {f.fixedDurationDays > 0 ? (
            <>
              <span style={{ color: 'var(--tx3)' }}>{t('qe.fixedDuration')}: </span>
              <b style={{ color: 'var(--am)' }}>{f.fixedDurationDays}d</b>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--tx3)' }}>
                {f.best}d best × {f.factor || 1.5} ={' '}
              </span>
              <b style={{ color: 'var(--am)' }}>{re(f.best || 0, f.factor || 1.5).toFixed(1)}d</b>
              <span style={{ color: 'var(--tx3)' }}> {t('qe.realisticSuffix')}</span>
            </>
          )}
          <br />
          <span style={{ color: 'var(--tx3)' }}>
            {iso(sc.startD)} → {iso(sc.endD)} · {sc.weeks}w ·{' '}
            {(f.assign || []).length > 1 ? f.assign.map(id => members.find(m => m.id === id)?.name || id).join(', ') : sc.person} (
            {sc.capPct}% cap)
          </span>
        </div>
      )}
      {!sc && (f.best > 0 || f.fixedDurationDays > 0) && (
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>
          {f.fixedDurationDays > 0
            ? `${t('qe.fixedDuration')}: ${f.fixedDurationDays}d`
            : `${f.best}d best × ${f.factor || 1.5} = ${re(f.best || 0, f.factor || 1.5).toFixed(1)}d ${t('qe.realisticSuffix')}`}{' '}
          · {t('qe.notScheduled')}
        </div>
      )}
    </>
  );
}
