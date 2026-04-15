import { useState, useRef, useEffect } from 'react';

// Drop-in replacement for <select> with built-in search.
// - "Add mode" (no `value` prop): used to add items to a list, clears after select
// - "Controlled mode" (with `value` prop): shows current selection, replaces <select>
export function SearchSelect({ value, options, onSelect, placeholder = '+ Add...', renderOption, allowEmpty = false, emptyLabel = '— None —' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const isControlled = value !== undefined;
  const currentLabel = isControlled
    ? (() => {
        const match = options.find(o => o.id === value);
        if (match) return match.label;
        if (value) return value;
        return allowEmpty ? emptyLabel : '';
      })()
    : '';

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

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
    {open && <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 220, overflowY: 'auto',
      background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 'var(--r)',
      boxShadow: 'var(--sh)', zIndex: 50, marginTop: 2
    }}>
      {isControlled && allowEmpty && <div style={{
        padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--b)', color: 'var(--tx3)', fontStyle: 'italic'
      }} className="tr" onClick={() => select('')}>{emptyLabel}</div>}
      {filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--tx3)' }}>No results</div>}
      {filtered.map(o => <div key={o.id} style={{
        padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        background: isControlled && o.id === value ? 'var(--bg4)' : ''
      }} className="tr" onClick={() => select(o.id)}>
        {renderOption ? renderOption(o) : <><span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginRight: 6 }}>{o.id}</span>{o.label}</>}
      </div>)}
    </div>}
  </div>;
}
