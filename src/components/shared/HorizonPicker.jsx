import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n.jsx';

// Planning-horizon filter trigger. Same popup pattern as DiffPicker but with
// forward-looking presets ("+7 d", "+14 d", "+30 d") and a custom end-date.
// The underlying state lives in App.jsx so every consumer view stays in sync.
export function HorizonPicker({ horizonDays, persistHorizon, horizonEnd, compact = false }) {
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

  const isCustomDate = /^\d{4}-\d{2}-\d{2}$/.test(horizonDays);
  const isPresetDays = !isCustomDate && /^\d+$/.test(horizonDays);
  let triggerLabel;
  if (!horizonDays) triggerLabel = t('horizon.off');
  else if (isCustomDate) triggerLabel = `→ ${horizonDays}`;
  else if (isPresetDays) triggerLabel = t('horizon.days', horizonDays);
  else triggerLabel = horizonDays;

  const active = !!horizonDays;
  const presetBtn = (val, label) => (
    <button key={val || 'off'}
      className={`btn btn-xs ${horizonDays === val ? 'btn-pri' : 'btn-sec'}`}
      style={{ padding: '3px 8px', fontSize: 11 }}
      onClick={() => persistHorizon(val)}>{label}</button>
  );

  return (
    <span style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <button
        type="button"
        className={`btn btn-xs ${active ? 'btn-pri' : 'btn-sec'}`}
        data-htip={t('horizon.tip')}
        onClick={() => setOpen(v => !v)}
        style={{ padding: compact ? '2px 7px' : '4px 9px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <span style={{ fontSize: 10 }}>⏱</span>
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
            {t('horizon.label')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {presetBtn('', t('horizon.off'))}
            {presetBtn('7', t('horizon.days', 7))}
            {presetBtn('14', t('horizon.days', 14))}
            {presetBtn('30', t('horizon.days', 30))}
            {presetBtn('60', t('horizon.days', 60))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{t('horizon.until')}:</span>
            <input
              type="date"
              value={isCustomDate ? horizonDays : ''}
              onChange={e => persistHorizon(e.target.value)}
              style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--tx2)', borderRadius: 3, padding: '2px 4px', fontSize: 11 }}
            />
          </div>
        </div>
      )}
    </span>
  );
}
