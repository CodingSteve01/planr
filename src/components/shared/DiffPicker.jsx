import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n.jsx';

// Compact "sprint review" filter trigger. Renders a single button labelled
// with the current cutoff state ("Off" / "14 d" / a specific date) and pops
// a small dialog with presets + custom date + "only changed" toggle. The
// underlying state (sinceDays/persistSince) is owned by App.jsx so every
// surface stays in sync — this component is purely the chrome.
export function DiffPicker({ sinceDays, persistSince, sinceDate, onlyChanged, persistOnlyChanged, compact = false }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Click-outside / Escape closes the popup.
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

  const isCustomDate = /^\d{4}-\d{2}-\d{2}$/.test(sinceDays);
  const isPresetDays = !isCustomDate && /^\d+$/.test(sinceDays);
  let triggerLabel;
  if (!sinceDays) triggerLabel = t('diff.off');
  else if (isCustomDate) triggerLabel = sinceDays;
  else if (isPresetDays) triggerLabel = t('diff.days', sinceDays);
  else triggerLabel = sinceDays;

  const active = !!sinceDays;
  const presetBtn = (val, label) => (
    <button key={val || 'off'}
      className={`btn btn-xs ${sinceDays === val ? 'btn-pri' : 'btn-sec'}`}
      style={{ padding: '3px 8px', fontSize: 11 }}
      onClick={() => persistSince(val)}>{label}</button>
  );

  return (
    <span style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <button
        type="button"
        className={`btn btn-xs ${active ? 'btn-pri' : 'btn-sec'}`}
        data-htip={t('diff.since')}
        onClick={() => setOpen(v => !v)}
        style={{ padding: compact ? '2px 7px' : '4px 9px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <span style={{ fontSize: 10 }}>↻</span>
        <span style={{ fontFamily: 'var(--mono)', letterSpacing: '.03em' }}>{triggerLabel}</span>
      </button>
      {open && (
        <div
          role="dialog"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100,
            background: 'var(--bg2)', border: '1px solid var(--b2)',
            borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,.45)',
            padding: 10, minWidth: 260, fontSize: 11,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
            {t('diff.since')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {presetBtn('', t('diff.off'))}
            {presetBtn('7', t('diff.days', 7))}
            {presetBtn('14', t('diff.days', 14))}
            {presetBtn('30', t('diff.days', 30))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{t('diff.customDate')}:</span>
            <input
              type="date"
              value={isCustomDate ? sinceDays : ''}
              onChange={e => persistSince(e.target.value)}
              style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--tx2)', borderRadius: 3, padding: '2px 4px', fontSize: 11 }}
            />
          </div>
          {sinceDate && persistOnlyChanged && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
              data-htip={t('diff.onlyChangedTip')}>
              <input
                type="checkbox"
                checked={!!onlyChanged}
                onChange={e => persistOnlyChanged(e.target.checked)}
              />
              <span>{t('diff.onlyChanged')}</span>
            </label>
          )}
        </div>
      )}
    </span>
  );
}
