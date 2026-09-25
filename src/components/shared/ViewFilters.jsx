import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalRoot } from '../../utils/embedHost.js';
import { Icon } from './Icon.jsx';
import { SearchSelect } from './SearchSelect.jsx';
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
  // Quick filters — the row of toggles that used to sit in the sub-toolbar.
  // Each is { id, label, tip, active, onToggle }. They live in here at rest
  // and reappear in the toolbar as chips once they are on, so a filtered view
  // still says so (principles.md, "a view is never the truth") without eight
  // switched-off toggles claiming attention first.
  quickFilters = [],
  // Archive (long-finished projects / long-offboarded people)
  archive = null, showArchived = false, setShowArchived, archiveDays, setArchiveDays,
  // Scope — which part of the plan is on screen: one project, one team, one
  // person. Same reasoning as the quick filters above and the same home. As
  // three always-visible pickers in the toolbar they were ~380px of controls
  // reading "Alle Pakete / Alle Teams / Alle Personen", which is three empty
  // fields waiting to be filled in — the opposite of what they are. Setting
  // one is rare; seeing that one is set has to be unmissable, and that is
  // what the chips are for.
  scope = null,
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
  // The panel is portalled out of the toolbar, the way SearchSelect's popup
  // already is. Two reasons, and the second is the one that bites: an
  // absolutely-positioned panel is clipped by any scrolling ancestor, and the
  // sub-toolbar scrolls sideways now — so the panel was cut off at the
  // toolbar's edge rather than merely stacked wrongly. A fixed-position
  // portal is subject to neither the clip nor the ancestor's stacking
  // context, which is what "a dropdown must never end up under the content"
  // actually requires.
  const portalRoot = usePortalRoot();
  const panelRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    // Stay inside the window. The panel hangs off the trigger, and the
    // trigger moved left when the scope pickers left the toolbar — so a
    // right-aligned 320px panel ran off the LEFT edge and was cut in half.
    // Prefer right-aligned (it reads as belonging to the button), slide left
    // only as far as the viewport forces, and never past the margin.
    const PANEL_W = 320;
    const M = 8;
    const sync = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const wanted = r.right - PANEL_W;
      const left = Math.min(Math.max(M, wanted), Math.max(M, window.innerWidth - PANEL_W - M));
      // Flip above the trigger when there is more room up than down.
      const below = window.innerHeight - r.bottom;
      setAnchor({
        left,
        top: below > 260 || below >= r.top ? r.bottom + 6 : null,
        bottom: below > 260 || below >= r.top ? null : window.innerHeight - r.top + 6,
        maxH: Math.max(200, (below > 260 || below >= r.top ? below : r.top) - 16),
      });
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // The panel is portalled, so it is no longer inside the trigger's element:
    // a click in it has to be checked against the panel as well, or the panel
    // closes the moment you touch anything in it.
    const onDoc = (e) => {
      const inTrigger = ref.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      // A SearchSelect inside the panel portals its own list out, so a click
      // on an option is in neither of the two above — and this closed the
      // panel on mousedown before the option's click ever ran, which read as
      // "the filter just doesn't take".
      const inSelectPopup = e.target?.closest?.('[data-searchselect-popup]');
      if (!inTrigger && !inPanel && !inSelectPopup) setOpen(false);
    };
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
  const showQuick = quickFilters.length > 0;
  const showScope = !!scope;
  if (!showDiff && !showHorizon && !showHideDone && !showArchive && !showQuick && !showScope) return null;

  const showHideDoneInner = typeof setHideDone === 'function';
  // The trigger counts only the Review/Plan overlays (and hide-done). The
  // archive section lives in this popup because it needs a home for its day
  // threshold, but its *state* is announced by the chip / pill next to the
  // trigger — counting it here as well just said the same thing twice.
  const activeCount = (sinceDays ? 1 : 0) + (horizonDays ? 1 : 0)
    + (showHideDoneInner && hideDone ? 1 : 0)
    + (showScope ? (scope.fields || []).filter(f => f.value).length : 0);

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
  if (showHideDoneInner && hideDone) parts.push(`● ${t('ui.hideDoneShort')}`);
  const archiveSummary = archive?.count
    ? [archive.roots.length ? t(archive.roots.length === 1 ? 'arch.root' : 'arch.roots', archive.roots.length) : '',
       archive.members.length ? t(archive.members.length === 1 ? 'arch.member' : 'arch.members', archive.members.length) : '',
      ].filter(Boolean).join(' · ')
    : '';
  const archiveDetail = archive?.count
    ? [...archive.roots.map(r => `${r.id} ${r.name}`), ...archive.members.map(m => m.name)].join(' · ')
    : '';
  // Nothing to say when nothing is filtered: the old "none" was a label for
  // the absence of state, which is the definition of chrome.
  const triggerLabel = parts.join(' · ');

  // One voice for section titles. There used to be three: a grey box badge
  // with an emoji, an amber "Δ Review" pill and a blue "▶ Plan" pill, each
  // announcing itself louder than the controls underneath it.
  const sectionTitle = (label, tip) => (
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
      color: 'var(--tx3)', marginBottom: 6 }} data-htip={tip}>{label}</div>
  );

  const presetBtn = (current, val, label, onClick) => (
    <button key={val || 'off'}
      className={`btn btn-xs ${current === val ? 'btn-pri' : 'btn-sec'}`}
      style={{ padding: '3px 8px', fontSize: 12 }}
      onClick={() => onClick(val)}>{label}</button>
  );

  return (
    <span style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <button
        type="button"
        className={`btn btn-xs ${activeCount ? 'btn-pri' : 'btn-sec'}`}
        data-htip={t('vf.tip')}
        data-testid="view-filters-trigger"
        onClick={() => setOpen(v => !v)}
        style={{ padding: '3px 9px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="gear" size={12} />
        <span style={{ fontFamily: 'var(--mono)', letterSpacing: '.03em' }}>{t('vf.label')}</span>
        {activeCount > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,.22)', color: '#fff',
            borderRadius: 8, padding: '1px 5px', minWidth: 14, textAlign: 'center' }}>{activeCount}</span>
        )}
        {triggerLabel && <span style={{ fontFamily: 'var(--mono)', letterSpacing: '.03em', color: activeCount ? '#fff' : 'var(--tx3)', fontSize: 11 }}>{triggerLabel}</span>}
      </button>
      {open && anchor && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          data-testid="view-filters-panel"
          className="layer-popover"
          style={{
            position: 'fixed',
            top: anchor.top ?? 'auto', bottom: anchor.bottom ?? 'auto',
            left: anchor.left,
            maxHeight: anchor.maxH, overflowY: 'auto',
            background: 'var(--bg2)', border: '1px solid var(--b2)',
            borderRadius: 8, boxShadow: '0 10px 32px rgba(0,0,0,.5)',
            padding: 12, width: 320, fontSize: 12,
          }}
        >
          {showScope && (
            <section style={{ marginBottom: 12 }} data-testid="scope-section">
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)', marginBottom: 6 }}>
                {scope.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(scope.fields || []).map(field => (
                  <div key={field.id} data-testid={`scope-field-${field.id}`}>
                    <SearchSelect
                      value={field.value}
                      options={field.options}
                      onSelect={field.onSelect}
                      placeholder={field.placeholder}
                      allowEmpty
                      emptyLabel={field.placeholder}
                      showIds={field.showIds}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
          {showQuick && (
            <section style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)', marginBottom: 6 }}>
                {t('vf.quick')}
              </div>
              <div data-testid="quick-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {quickFilters.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className={`chip${f.active ? ' on' : ''}`}
                    aria-pressed={!!f.active}
                    data-htip={f.tip}
                    onClick={() => f.onToggle()}
                  >{f.label}</button>
                ))}
              </div>
            </section>
          )}
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
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {t('ui.hideDone')}
              </button>
            </section>
          )}
          {showArchive && (
            <section style={{ marginBottom: 12 }}>
              {sectionTitle(t('arch.section'), t('arch.desc'))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <button
                  type="button"
                  className={`btn btn-xs ${showArchived ? 'btn-pri' : 'btn-sec'}`}
                  aria-pressed={!!showArchived}
                  data-htip={t('arch.desc')}
                  onClick={() => setShowArchived(!showArchived)}
                  style={{ padding: '3px 8px', fontSize: 12 }}
                >{t('arch.show')}</button>
                {/* What is archived used to be listed here, row by row, inside
                    a filter popup — a readout where a control was expected.
                    The count says as much as anyone reads. */}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}
                  data-htip={archiveDetail}>
                  {archiveSummary || t('arch.none')}
                </span>
              </div>
              {typeof setArchiveDays === 'function' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}
                  data-htip={t('arch.olderThanTip')}>
                  {ARCHIVE_DAY_PRESETS.map(days => presetBtn(String(archiveDays), String(days), t('arch.days', days),
                    val => setArchiveDays(Number(val))))}
                </div>
              )}
            </section>
          )}
          {(showArchive || showHideDone) && (showDiff || showHorizon) && (
            <div style={{ height: 1, background: 'var(--b)', margin: '4px 0 12px' }} />
          )}

          {/* The sentence explaining that Review and Plan exclude each other
              is gone: turning one on already clears the other, and the section
              that went quiet says so where it happened. */}
          {showDiff && (
            <section style={{ marginBottom: showHorizon ? 14 : 0, opacity: horizonDays ? 0.45 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {sectionTitle(t('diff.since'))}
                {horizonDays && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--tx3)' }}>{t('vf.disabledByOther')}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {presetBtn(sinceDays, '', t('diff.off'), setSince)}
                {presetBtn(sinceDays, '7', t('diff.days', 7), setSince)}
                {presetBtn(sinceDays, '14', t('diff.days', 14), setSince)}
                {presetBtn(sinceDays, '30', t('diff.days', 30), setSince)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }} data-htip={t('diff.customDate')}>
                <input type="date"
                  value={/^\d{4}-\d{2}-\d{2}$/.test(sinceDays) ? sinceDays : ''}
                  onChange={e => setSince(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--tx2)', borderRadius: 3, padding: '2px 4px', fontSize: 12 }} />
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {sectionTitle(t('horizon.label'))}
                {sinceDays && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--tx3)' }}>{t('vf.disabledByOther')}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {presetBtn(horizonDays, '', t('horizon.off'), setHorizon)}
                {presetBtn(horizonDays, '7', t('horizon.days', 7), setHorizon)}
                {presetBtn(horizonDays, '14', t('horizon.days', 14), setHorizon)}
                {presetBtn(horizonDays, '30', t('horizon.days', 30), setHorizon)}
                {presetBtn(horizonDays, '60', t('horizon.days', 60), setHorizon)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }} data-htip={t('horizon.until')}>
                <input type="date"
                  value={/^\d{4}-\d{2}-\d{2}$/.test(horizonDays) ? horizonDays : ''}
                  onChange={e => setHorizon(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--tx2)', borderRadius: 3, padding: '2px 4px', fontSize: 12 }} />
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
        </div>,
        portalRoot,
      )}
    </span>
  );
}
