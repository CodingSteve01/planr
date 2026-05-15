import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n.jsx';

// Unified "view filter" popup. Consolidates the Sprint Review (diff) and
// Planning Horizon (forward) filters into a single trigger with a badge
// counting how many sections are active. Replaces the previous two inline
// chips so the sub-toolbar stays compact and the controls feel discoverable.
//
// The underlying state still lives in App.jsx — this component is pure UI
// chrome. Sections render only if their `persist*` setter is supplied so
// surfaces can opt in/out of which filters they expose.
export function ViewFilters({
  // Diff (Sprint Review)
  sinceDays, persistSince, sinceDate,
  diffOnlyChanged, persistDiffOnlyChanged,
  hasHistory,
  // Horizon (Planning)
  horizonDays, persistHorizon, horizonEnd,
  horizonOnlyPlanned, persistHorizonOnly,
  // Status (hide done)
  hideDone, setHideDone,
}) {
  // Diff (past review) and Horizon (future plan) are mutually exclusive: a
  // single screen can only tell one of those stories cleanly at a time, so
  // turning one on auto-clears the other. Keeps the legend / map honest.
  const setSince = (val) => {
    if (val && horizonDays && persistHorizon) persistHorizon('');
    persistSince?.(val);
  };
  const setHorizon = (val) => {
    if (val && sinceDays && persistSince) persistSince('');
    persistHorizon?.(val);
  };
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const showDiff = !!persistSince && hasHistory;
  const showHorizon = !!persistHorizon;
  const showHideDone = typeof setHideDone === 'function';
  if (!showDiff && !showHorizon && !showHideDone) return null;

  const activeCount = (sinceDays ? 1 : 0) + (horizonDays ? 1 : 0) + (hideDone ? 1 : 0);

  // Summary string on the trigger: "—" when no filter, otherwise a compact
  // marker like "Δ14T · ▶+30T" so the user reads the state without opening.
  const parts = [];
  if (sinceDays) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(sinceDays)) parts.push(`Δ ${sinceDays}`);
    else parts.push(`Δ ${t('diff.days', sinceDays)}`);
  }
  if (horizonDays) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(horizonDays)) parts.push(`▶ ${horizonDays}`);
    else parts.push(`▶ ${t('horizon.days', horizonDays)}`);
  }
  const triggerLabel = parts.length ? parts.join(' · ') : t('vf.off');

  const presetBtn = (current, val, label, onClick) => (
    <button key={val || 'off'}
      className={`btn btn-xs ${current === val ? 'btn-pri' : 'btn-sec'}`}
      style={{ padding: '3px 8px', fontSize: 11 }}
      onClick={() => onClick(val)}>{label}</button>
  );

  return (
    <span style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <button
        type="button"
        className={`btn btn-xs ${activeCount ? 'btn-pri' : 'btn-sec'}`}
        data-htip={t('vf.tip')}
        onClick={() => setOpen(v => !v)}
        style={{ padding: '3px 9px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ fontSize: 12, lineHeight: 1 }}>⚙</span>
        <span style={{ fontFamily: 'var(--mono)', letterSpacing: '.03em' }}>{t('vf.label')}</span>
        {activeCount > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(0,0,0,.22)', color: '#fff',
            borderRadius: 8, padding: '1px 5px', minWidth: 14, textAlign: 'center' }}>{activeCount}</span>
        )}
        <span style={{ fontFamily: 'var(--mono)', letterSpacing: '.03em', color: activeCount ? '#fff' : 'var(--tx3)', fontSize: 10 }}>{triggerLabel}</span>
      </button>
      {open && (
        <div
          role="dialog"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
            background: 'var(--bg2)', border: '1px solid var(--b2)',
            borderRadius: 8, boxShadow: '0 10px 32px rgba(0,0,0,.5)',
            padding: 12, width: 320, fontSize: 11,
          }}
        >
          {showHideDone && (
            <section style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={!!hideDone} onChange={e => setHideDone(e.target.checked)} />
                <span style={{ fontSize: 11 }}>{t('ui.hideDone')}</span>
              </label>
            </section>
          )}
          {showHideDone && (showDiff || showHorizon) && (
            <div style={{ height: 1, background: 'var(--b)', margin: '4px 0 12px' }} />
          )}

          {(showDiff || showHorizon) && (
            <div style={{ fontSize: 9, color: 'var(--tx3)', marginBottom: 8, fontStyle: 'italic' }}>
              {t('vf.exclusiveHint')}
            </div>
          )}

          {showDiff && (
            <section style={{ marginBottom: showHorizon ? 14 : 0, opacity: horizonDays ? 0.45 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                  padding: '1px 5px', borderRadius: 3, background: 'rgba(245,158,11,.18)', color: '#f59e0b' }}>Δ Review</span>
                <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{t('diff.since')}</span>
                {horizonDays && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--tx3)' }}>{t('vf.disabledByOther')}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {presetBtn(sinceDays, '', t('diff.off'), setSince)}
                {presetBtn(sinceDays, '7', t('diff.days', 7), setSince)}
                {presetBtn(sinceDays, '14', t('diff.days', 14), setSince)}
                {presetBtn(sinceDays, '30', t('diff.days', 30), setSince)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--tx3)', minWidth: 60 }}>{t('diff.customDate')}:</span>
                <input type="date"
                  value={/^\d{4}-\d{2}-\d{2}$/.test(sinceDays) ? sinceDays : ''}
                  onChange={e => setSince(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--tx2)', borderRadius: 3, padding: '2px 4px', fontSize: 11 }} />
              </div>
              {sinceDate && persistDiffOnlyChanged && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
                  data-htip={t('diff.onlyChangedTip')}>
                  <input type="checkbox" checked={!!diffOnlyChanged}
                    onChange={e => persistDiffOnlyChanged(e.target.checked)} />
                  <span>{t('diff.onlyChanged')}</span>
                </label>
              )}
            </section>
          )}

          {showDiff && showHorizon && (
            <div style={{ height: 1, background: 'var(--b)', margin: '4px 0 12px' }} />
          )}

          {showHorizon && (
            <section style={{ opacity: sinceDays ? 0.45 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                  padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,.18)', color: '#3b82f6' }}>▶ Plan</span>
                <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{t('horizon.label')}</span>
                {sinceDays && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--tx3)' }}>{t('vf.disabledByOther')}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {presetBtn(horizonDays, '', t('horizon.off'), setHorizon)}
                {presetBtn(horizonDays, '7', t('horizon.days', 7), setHorizon)}
                {presetBtn(horizonDays, '14', t('horizon.days', 14), setHorizon)}
                {presetBtn(horizonDays, '30', t('horizon.days', 30), setHorizon)}
                {presetBtn(horizonDays, '60', t('horizon.days', 60), setHorizon)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--tx3)', minWidth: 60 }}>{t('horizon.until')}:</span>
                <input type="date"
                  value={/^\d{4}-\d{2}-\d{2}$/.test(horizonDays) ? horizonDays : ''}
                  onChange={e => setHorizon(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--tx2)', borderRadius: 3, padding: '2px 4px', fontSize: 11 }} />
              </div>
              {horizonEnd && persistHorizonOnly && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
                  data-htip={t('horizon.onlyPlannedTip')}>
                  <input type="checkbox" checked={!!horizonOnlyPlanned}
                    onChange={e => persistHorizonOnly(e.target.checked)} />
                  <span>{t('horizon.onlyPlanned')}</span>
                </label>
              )}
            </section>
          )}
        </div>
      )}
    </span>
  );
}
