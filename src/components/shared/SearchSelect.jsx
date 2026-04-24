import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Drop-in replacement for <select> with built-in search.
// - "Add mode" (no `value` prop): used to add items to a list, clears after select
// - "Controlled mode" (with `value` prop): shows current selection, replaces <select>
//
// The popup renders into a portal on document.body so it can escape modal overflow
// clipping and z-index sandwiching (e.g. sticky modal footers covering the popup).
// Position is computed from the wrapper's bounding rect; the popup auto-flips
// upward when there isn't enough room below.
export function SearchSelect({ value, options, onSelect, placeholder = '+ Add...', renderOption, allowEmpty = false, emptyLabel = '— None —', showIds = false }) {
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
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      // Open upward when there's not enough room below AND there is enough above.
      const openUp = spaceBelow < POPUP_MAX_H + 16 && spaceAbove > spaceBelow;
      setPopupPos({
        top: r.bottom + 2,
        bottom: window.innerHeight - r.top + 2,
        left: r.left,
        width: r.width,
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
  }, [open]);

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
    } else if (e.key === 'Home') {
      if (!open || !navItems.length) return;
      e.preventDefault(); setActiveIdx(0);
    } else if (e.key === 'End') {
      if (!open || !navItems.length) return;
      e.preventDefault(); setActiveIdx(navItems.length - 1);
    }
  };

  return <div ref={ref} style={{ position: 'relative' }}>
    <input
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
      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', color: isControlled && !value && allowEmpty ? 'var(--tx3)' : 'var(--tx)', fontFamily: 'var(--font)', fontSize: 12, padding: '7px 10px', outline: 'none', cursor: 'pointer' }}
    />
    {open && createPortal(
      <div ref={popupRef} style={{
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
      document.body
    )}
  </div>;
}
