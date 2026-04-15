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

  const select = (id) => {
    onSelect(id);
    setOpen(false);
    setQ('');
  };

  return <div ref={ref} style={{ position: 'relative' }}>
    <input
      value={open ? q : currentLabel}
      onChange={e => { setQ(e.target.value); if (!open) setOpen(true); }}
      onFocus={() => { setOpen(true); setQ(''); }}
      onClick={() => { if (!open) { setOpen(true); setQ(''); } }}
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
        {isControlled && allowEmpty && <div style={{
          padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--b)', color: 'var(--tx3)', fontStyle: 'italic'
        }} className="tr" onClick={() => select('')}>{emptyLabel}</div>}
        {filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--tx3)' }}>No results</div>}
        {filtered.map(o => <div key={o.id} style={{
          padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          background: isControlled && o.id === value ? 'var(--bg4)' : ''
        }} className="tr" onClick={() => select(o.id)}>
          {renderOption ? renderOption(o) : (showIds ? <><span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginRight: 6 }}>{o.id}</span>{o.label}</> : o.label)}
        </div>)}
      </div>,
      document.body
    )}
  </div>;
}
