import { useEffect, useRef, useState } from 'react';
import { useStableCallback } from './useStableCallback.js';

// The tab row scrolls sideways instead of wrapping (see .tab-bar-wrap in
// App.css). Two things have to follow from that: the active tab is brought
// into view whenever it changes — it can be selected from the palette or a
// shortcut, not only by clicking it — and the edges say when there is more
// row than pane, because a tab you cannot see must not read as a tab that
// is not there.
export function useTabBar(tab) {
  const tabBarRef = useRef(null);
  const activeTabRef = useRef(null);
  const [tabFades, setTabFades] = useState({ l: false, r: false });
  const syncTabFades = useStableCallback(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setTabFades(prev => {
      const next = { l: el.scrollLeft > 2, r: max > 2 && el.scrollLeft < max - 2 };
      return prev.l === next.l && prev.r === next.r ? prev : next;
    });
  });
  useEffect(() => {
    activeTabRef.current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    syncTabFades();
  }, [tab, syncTabFades]);
  useEffect(() => {
    const el = tabBarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(syncTabFades);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncTabFades]);
  // Keep every visited tab mounted (display:none for inactive) so switching
  // back is instant. Each view is wrapped in React.memo and its callbacks
  // are useCallback'd, so an App re-render that doesn't touch a view's data
  // skips its reconciliation entirely — no input-lag cascade.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([tab]));
  useEffect(() => {
    setVisitedTabs(s => (s.has(tab) ? s : new Set([...s, tab])));
  }, [tab]);
  return { tabBarRef, activeTabRef, tabFades, syncTabFades, visitedTabs };
}
