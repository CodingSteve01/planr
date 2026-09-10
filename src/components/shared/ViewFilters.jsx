import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n.jsx';
import { ARCHIVE_DAY_PRESETS } from '../../utils/archive.js';

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
  // Archive (long-finished projects / long-offboarded people)
  archive = null, showArchived = false, setShowArchived, archiveDays, setArchiveDays,
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
  // The archive section is only worth showing where the caller can act on it
  // AND something is actually old enough to archive.
  const showArchive = typeof setShowArchived === 'function';
  if (!showDiff && !showHorizon && !showHideDone && !showArchive) return null;

  const showHideDoneInner = typeof setHideDone === 'function';
  // The trigger counts only the Review/Plan overlays (and hide-done). The
  // archive section lives in this popup because it needs a home for its day
  // threshold, but its *state* is announced by the chip / pill next to the
  // trigger — counting it here as well just said the same thing twice.
  const activeCount = (sinceDays ? 1 : 0) + (horizonDays ? 1 : 0)
    + (showHideDoneInner && hideDone ? 1 : 0);

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
  if (showHideDoneInner && hideDone) parts.push(`✓ ${t('ui.hideDoneShort')}`);
  const archiveSummary = archive?.count
    ? [archive.roots.length ? t(archive.roots.length === 1 ? 'arch.root' : 'arch.roots', archive.roots.length) : '',
       archive.members.length ? t(archive.members.length === 1 ? 'arch.member' : 'arch.members', archive.members.length) : '',
      ].filter(Boolean).join(' · ')
    : '';
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
              <button
                type="button"
                className={`btn btn-xs ${hideDone ? 'btn-pri' : 'btn-sec'}`}
                aria-pressed={!!hideDone}
                data-htip={t('ui.hideDoneTip')}
                onClick={() => setHideDone(!hideDone)}
                style={{
                  padding: '4px 9px',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>
                  {hideDone ? '☑' : '☐'}
                </span>
                {t('ui.hideDone')}
              </button>
            </section>
          )}
          {showArchive && (
            <section style={{ marginBottom: 12 }}>
              {/* Header row carries the toggle itself — the explanation lives in
                  its tooltip rather than as a paragraph nobody re-reads. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                  padding: '1px 5px', borderRadius: 3, background: 'rgba(148,163,184,.18)', color: 'var(--tx2)' }}
                  data-htip={t('arch.desc')}>📦 {t('arch.section')}</span>
                <button
                  type="button"
                  className={`btn btn-xs ${showArchived ? 'btn-pri' : 'btn-sec'}`}
                  aria-pressed={!!showArchived}
                  data-htip={t('arch.desc')}
                  onClick={() => setShowArchived(!showArchived)}
                  style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>{showArchived ? '☑' : '☐'}</span>
                  {t('arch.show')}
                </button>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
                  {archiveSummary || t('arch.none')}
                </span>
              </div>
              {typeof setArchiveDays === 'function' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: 'var(--tx3)' }} data-htip={t('arch.olderThanTip')}>{t('arch.olderThan')}</span>
                  {ARCHIVE_DAY_PRESETS.map(days => presetBtn(String(archiveDays), String(days), t('arch.days', days),
                    val => setArchiveDays(Number(val))))}
                </div>
              )}
              {!!archive?.count && (
                <div style={{ marginTop: 6, maxHeight: 108, overflow: 'auto' }}>
                  {archive.roots.map(root => (
                    <div key={root.id} style={{ display: 'flex', gap: 6, fontSize: 10, padding: '1px 0' }}>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', width: 34, flexShrink: 0 }}>{root.id}</span>
                      <span style={{ flex: 1, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{root.name}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', flexShrink: 0 }}>{t('arch.ageDays', root.ageDays)}</span>
                    </div>
                  ))}
                  {archive.members.map(member => (
                    <div key={member.id} style={{ display: 'flex', gap: 6, fontSize: 10, padding: '1px 0' }}>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', width: 34, flexShrink: 0 }}>👤</span>
                      <span style={{ flex: 1, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', flexShrink: 0 }}>{t('arch.ageDays', member.ageDays)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {(showArchive || showHideDone) && (showDiff || showHorizon) && (
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
