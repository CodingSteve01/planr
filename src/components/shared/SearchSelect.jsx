import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fixedFrame, toFixedPoint, usePortalRoot } from '../../utils/embedHost.js';
import { useT } from '../../i18n.jsx';

// Drop-in replacement for <select> with built-in search.
// - "Add mode" (no `value` prop): used to add items to a list, clears after select
// - "Controlled mode" (with `value` prop): shows current selection, replaces <select>
//
// The popup renders into a portal on the host root so it can escape modal overflow
// clipping and z-index sandwiching (e.g. sticky modal footers covering the popup).
// Position is computed from the wrapper's bounding rect; the popup auto-flips
// upward when there isn't enough room below.
// The two defaults used to be English string literals — `'+ Add...'` and
// `'— None —'`. Every call that did not pass its own therefore printed English
// into a German dialog, which is most of them: the empty option in Settings,
// in the add dialog's team picker, everywhere `allowEmpty` appears alone.
export function SearchSelect({ value, options, onSelect, placeholder, renderOption, allowEmpty = false, emptyLabel, showIds = false, compact = false, testId, inputRef, ariaLabel }) {
  const { t } = useT();
  placeholder = placeholder ?? t('ss.add');
  emptyLabel = emptyLabel ?? t('none');
  const portalRoot = usePortalRoot();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef(null);
  const popupRef = useRef(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const isControlled = value !== undefined;
  const currentLabel = isControlled
    ? (() => {
        const match = options.find(o => o.id === value);
        if (match) return match.label;
        if (value) return value;
        return allowEmpty ? emptyLabel : '';
      })()
    : '';

  // Close on outside click, accounting for the portal-rendered popup
  useEffect(() => {
    const h = (e) => {
      const inWrapper = ref.current && ref.current.contains(e.target);
      const inPopup = popupRef.current && popupRef.current.contains(e.target);
      if (!inWrapper && !inPopup) { setOpen(false); setQ(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Position the popup whenever it opens, and keep it positioned during scroll/resize
  useEffect(() => {
    if (!open || !ref.current) return;
    const POPUP_MAX_H = 220;
    const update = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      // The trigger's rect is in viewport coordinates, the popup is fixed and
      // therefore placed in its containing block — the same thing on the web,
      // not inside a host. See utils/embedHost.js.
      const frame = fixedFrame(portalRoot);
      const top = toFixedPoint(r.left, r.top, frame);
      const bottom = toFixedPoint(r.right, r.bottom, frame);
      const spaceBelow = frame.height - bottom.y;
      const spaceAbove = top.y;
      // Open upward when there's not enough room below AND there is enough above.
      const openUp = spaceBelow < POPUP_MAX_H + 16 && spaceAbove > spaceBelow;
      // Popup width expands beyond the trigger when the trigger is narrow
      // (e.g. inside a side panel). Cap at the frame's edge so it doesn't
      // run off-screen. Min width = max(trigger, 280) so task names stay
      // readable; max = what is left to the right of the trigger, less 16.
      const desired = Math.max(bottom.x - top.x, 320);
      const maxAvail = Math.max(160, frame.width - top.x - 16);
      const width = Math.min(desired, maxAvail);
      setPopupPos({
        top: bottom.y + 2,
        bottom: frame.height - top.y + 2,
        left: top.x,
        width,
        openUp,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, portalRoot]);

  const filtered = q
    ? options.filter(o => (o.label || o.id || '').toLowerCase().includes(q.toLowerCase()))
    : options;

  // Build navigable list: optional empty row + filtered options.
  const hasEmptyRow = isControlled && allowEmpty;
  const navItems = hasEmptyRow ? [{ id: '', _empty: true }, ...filtered] : filtered;

  const select = (id) => {
    onSelect(id);
    setOpen(false);
    setQ('');
    setActiveIdx(0);
  };

  // Reset active row whenever the result list shrinks past the current index
  // (e.g. user typed and filtered down). Clamp to 0..navItems.length-1.
  useEffect(() => {
    if (activeIdx >= navItems.length) setActiveIdx(Math.max(0, navItems.length - 1));
  }, [navItems.length, activeIdx]);

  // Reset to top on every re-open.
  useEffect(() => { if (open) setActiveIdx(0); }, [open]);

  // When the user is typing a query, jump the highlight past the "— None —"
  // row onto the first actual match — Enter should confirm a match, not clear.
  useEffect(() => {
    if (!open || !q) return;
    if (hasEmptyRow && activeIdx === 0 && filtered.length > 0) setActiveIdx(1);
  }, [q, open, hasEmptyRow, filtered.length, activeIdx]);

  // Keep active row scrolled into view inside the popup.
  useEffect(() => {
    if (!open || !popupRef.current) return;
    const el = popupRef.current.querySelector('[data-ss-idx="' + activeIdx + '"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx, open]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); setQ(''); return; }
      if (!navItems.length) return;
      setActiveIdx(i => (i + 1) % navItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open || !navItems.length) return;
      setActiveIdx(i => (i - 1 + navItems.length) % navItems.length);
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      const item = navItems[activeIdx];
      if (item) select(item._empty ? '' : item.id);
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); setQ(''); }
    }
    // Home and End are deliberately not handled: this is a text field, and
    // jumping the caret to the start or the end of what you typed is what
    // they do everywhere else. Taking them for "first / last option" traded a
    // universal editing key for a shortcut that ArrowUp/ArrowDown already
    // cover.
  };

  // Focus opens the popup, which is what you want when you tab into a field
  // you came to change. Until now nothing closed it again on the way out, so
  // tabbing through the four inline fields of a row left four popups stacked
  // over each other. Leaving by keyboard closes it; leaving by mouse is the
  // document listener above, because a mousedown on a popup row blurs the
  // input before the click lands and closing here would eat the choice.
  const onBlur = e => {
    const next = e.relatedTarget;
    if (!next) return;
    if (ref.current?.contains(next) || popupRef.current?.contains(next)) return;
    setOpen(false);
    setQ('');
  };

  return <div ref={ref} onBlur={onBlur} style={{ position: 'relative' }}>
    <input
      ref={inputRef}
      data-testid={testId}
      role="combobox"
      aria-expanded={open}
      aria-label={ariaLabel}
      value={open ? q : currentLabel}
      onChange={e => {
        const next = e.target.value;
        setQ(next);
        if (!open) setOpen(true);
        // With a query, highlight the first real match (past the "— None —"
        // row); without one, start at the top.
        setActiveIdx(next && hasEmptyRow ? 1 : 0);
      }}
      onKeyDown={onKeyDown}
      onFocus={() => { setOpen(true); setQ(''); setActiveIdx(0); }}
      onClick={() => { if (!open) { setOpen(true); setQ(''); setActiveIdx(0); } }}
      placeholder={isControlled ? (currentLabel || placeholder) : placeholder}
      readOnly={false}
      style={{
        width: '100%', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)',
        color: isControlled && !value && allowEmpty ? 'var(--tx3)' : 'var(--tx)',
        fontFamily: 'var(--font)', outline: 'none', cursor: 'pointer',
        // `compact` is the in-table size — the panel padding is twice a
        // table row's height and would push every row apart.
        ...(compact ? { fontSize: 11, padding: '2px 5px', height: 21 } : { fontSize: 12, padding: '7px 10px' }),
      }}
    />
    {open && createPortal(
      <div ref={popupRef} data-searchselect-popup="" style={{
        position: 'fixed',
        top: popupPos.openUp ? 'auto' : popupPos.top,
        bottom: popupPos.openUp ? popupPos.bottom : 'auto',
        left: popupPos.left,
        width: popupPos.width,
        maxHeight: 220, overflowY: 'auto',
        background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 'var(--r)',
        boxShadow: 'var(--sh)',
        // Above modal sticky footers (z 5), modal overlays (z 50-1000), and any in-app SVG overlays.
        zIndex: 9999,
      }}>
        {hasEmptyRow && <div
          data-ss-idx={0}
          onMouseEnter={() => setActiveIdx(0)}
          style={{
            padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--b)', color: 'var(--tx3)', fontStyle: 'italic',
            background: activeIdx === 0 ? 'var(--bg4)' : '',
          }} onClick={() => select('')}>{emptyLabel}</div>}
        {filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--tx3)' }}>No results</div>}
        {filtered.map((o, i) => {
          const idx = hasEmptyRow ? i + 1 : i;
          const isActive = activeIdx === idx;
          const isSelected = isControlled && o.id === value;
          return <div
            key={o.id}
            data-ss-idx={idx}
            onMouseEnter={() => setActiveIdx(idx)}
            style={{
              padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              background: isActive ? 'var(--bg4)' : isSelected ? 'var(--bg3)' : '',
            }}
            onClick={() => select(o.id)}
          >
            {renderOption ? renderOption(o) : (showIds ? <><span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginRight: 6 }}>{o.id}</span>{o.label}</> : o.label)}
          </div>;
        })}
      </div>,
      portalRoot,
    )}
  </div>;
}
