import { useState, useEffect, useRef } from 'react';

// Search input with local state + debounced commit. Critical for perf: the
// App component renders dozens of children via `display:none` tab panes;
// if the search input lived directly in App, every keystroke would cascade
// re-renders through every mounted view (TreeView, GanttView, NetGraph, …).
// By keeping the raw input state here, only this sub-tree re-renders while
// the user types; the parent only sees the debounced value.
export function SearchBox({ searchRef, onCommit, onResetIdx, onPrev, onNext, committedSearch }) {
  const [v, setV] = useState(committedSearch || '');
  const lastSentRef = useRef(committedSearch || '');

  // Keep local in sync when something else resets search (e.g. clear-button).
  useEffect(() => {
    if (committedSearch !== lastSentRef.current) {
      setV(committedSearch || '');
      lastSentRef.current = committedSearch || '';
    }
  }, [committedSearch]);

  // Debounced commit (~180 ms after the last keystroke).
  useEffect(() => {
    if (v === lastSentRef.current) return;
    const t = setTimeout(() => {
      lastSentRef.current = v;
      onCommit(v);
      onResetIdx?.();
    }, 180);
    return () => clearTimeout(t);
  }, [v, onCommit, onResetIdx]);

  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  return (
    <>
      <input
        ref={searchRef}
        className="btn btn-sec"
        style={{ padding: '5px 10px', width: 220 }}
        placeholder={`Search… (${isMac ? '⌘' : 'Ctrl'}+F)`}
        value={v}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setV(''); lastSentRef.current = ''; onCommit(''); e.target.blur(); return; }
          if (e.key === 'Enter') {
            e.preventDefault();
            // Flush immediately, skip debounce.
            if (v !== lastSentRef.current) { lastSentRef.current = v; onCommit(v); }
            if (e.shiftKey) onPrev?.(); else onNext?.();
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') { e.preventDefault(); onNext?.(); }
          if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') { e.preventDefault(); onPrev?.(); }
        }}
      />
      {v && <>
        <button className="btn btn-ghost btn-xs" onClick={onPrev}
          data-htip={`Previous match (Shift+Enter / ${isMac ? '⌘' : 'Ctrl'}+↑)`}
          style={{ padding: '2px 5px', fontSize: 13 }}>▲</button>
        <button className="btn btn-ghost btn-xs" onClick={onNext}
          data-htip={`Next match (Enter / ${isMac ? '⌘' : 'Ctrl'}+↓)`}
          style={{ padding: '2px 5px', fontSize: 13 }}>▼</button>
        <button className="btn btn-ghost btn-xs"
          onClick={() => { setV(''); lastSentRef.current = ''; onCommit(''); }}
          data-htip="Clear search (Esc)"
          style={{ padding: '2px 7px', fontSize: 11 }}>×</button>
      </>}
    </>
  );
}
