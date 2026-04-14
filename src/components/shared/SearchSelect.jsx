import { useState, useRef, useEffect } from 'react';

export function SearchSelect({ options, onSelect, placeholder = '+ Add...', renderOption }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = q
    ? options.filter(o => (o.label || o.id || '').toLowerCase().includes(q.toLowerCase()))
    : options;

  return <div ref={ref} style={{ position: 'relative' }}>
    <input
      value={open ? q : ''}
      onChange={e => { setQ(e.target.value); if (!open) setOpen(true); }}
      onFocus={() => setOpen(true)}
      placeholder={placeholder}
      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', color: 'var(--tx)', fontFamily: 'var(--font)', fontSize: 12, padding: '7px 10px', outline: 'none' }}
    />
    {open && <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 200, overflowY: 'auto',
      background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 'var(--r)',
      boxShadow: 'var(--sh)', zIndex: 50, marginTop: 2
    }}>
      {filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--tx3)' }}>No results</div>}
      {filtered.map(o => <div key={o.id} style={{
        padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--b)'
      }} className="tr" onClick={() => { onSelect(o.id); setOpen(false); setQ(''); }}>
        {renderOption ? renderOption(o) : <><span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginRight: 6 }}>{o.id}</span>{o.label}</>}
      </div>)}
    </div>}
  </div>;
}
