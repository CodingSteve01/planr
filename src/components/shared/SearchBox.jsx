import { useState, useEffect, useRef } from 'react';
import { useT } from '../../i18n.jsx';
import { withKey } from '../../utils/shortcuts.js';

// Search input with local state + debounced commit. Critical for perf: the
// App component renders dozens of children via `display:none` tab panes;
// if the search input lived directly in App, every keystroke would cascade
// re-renders through every mounted view (TreeView, GanttView, NetGraph, …).
// By keeping the raw input state here, only this sub-tree re-renders while
// the user types; the parent only sees the debounced value.
export function SearchBox({ searchRef, onCommit, onResetIdx, onPrev, onNext, onGoToResults, committedSearch }) {
  const { t } = useT();
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
        placeholder={withKey(t('sb.searchPlaceholder'), 'find')}
        value={v}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setV(''); lastSentRef.current = ''; onCommit(''); e.target.blur(); return; }
          if (e.key === 'Enter') {
            e.preventDefault();
            // Flush immediately, skip debounce.
            if (v !== lastSentRef.current) { lastSentRef.current = v; onCommit(v); }
            // ⇧Enter still steps through matches from here. A plain Enter
            // means "I'm done typing, take me to the results" — it hands the
            // keyboard to the view and puts the cursor on the first match,
            // instead of leaving you in the input where the arrow keys move
            // a text caret.
            if (e.shiftKey) { onPrev?.(); return; }
            if (onGoToResults) onGoToResults(v); else onNext?.();
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') { e.preventDefault(); onNext?.(); }
          if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') { e.preventDefault(); onPrev?.(); }
        }}
      />
      {v && <>
        <button className="btn btn-ghost btn-xs" onClick={onPrev}
          data-htip={t('sb.prevMatchTip', isMac ? '⌘' : 'Ctrl')}
          style={{ padding: '2px 5px', fontSize: 13 }}>▲</button>
        <button className="btn btn-ghost btn-xs" onClick={onNext}
          data-htip={t('sb.nextMatchTip', isMac ? '⌘' : 'Ctrl')}
          style={{ padding: '2px 5px', fontSize: 13 }}>▼</button>
        <button className="btn btn-ghost btn-xs"
          onClick={() => { setV(''); lastSentRef.current = ''; onCommit(''); }}
          data-htip={withKey(t('sb.clearSearchLabel'), 'closeDialog')}
          style={{ padding: '2px 7px', fontSize: 11 }}>×</button>
      </>}
    </>
  );
}
