import { useState, useRef, useEffect } from 'react';

// Scroll behaviour of the Gantt body: the measured scrollbar height, the jump
// to the active search match, the landing on today and the scroll-to-today action.
export function useGanttScrollTo({ bR, visibleRows, tw, showDays, WPX, RH, dateToX, todayX, activeMatchId }) {
  const [bodyScrollbarH, setBodyScrollbarH] = useState(0);
  useEffect(() => {
    const measureScrollbar = () => {
      if (!bR.current) return;
      const next = Math.max(0, bR.current.offsetHeight - bR.current.clientHeight);
      setBodyScrollbarH(prev => (prev === next ? prev : next));
    };
    measureScrollbar();
    window.addEventListener('resize', measureScrollbar);
    const id = window.setTimeout(measureScrollbar, 0);
    return () => {
      window.removeEventListener('resize', measureScrollbar);
      window.clearTimeout(id);
    };
  }, [visibleRows.length, tw, showDays]);

  // Scroll to the active match (driven by search text + searchIdx for prev/next cycling).
  // Only programmatically scrolls bR — syncS keeps lR + hR in sync automatically.
  useEffect(() => {
    if (!activeMatchId || !bR.current) return;
    const id = setTimeout(() => {
      const rowIndex = visibleRows.findIndex(r => r.type === 'task' && r.s?.id === activeMatchId);
      if (rowIndex < 0 || !bR.current) return;
      const targetY = rowIndex * RH;
      const s = visibleRows[rowIndex].s;
      const targetX = s._unestimated ? undefined : Math.max(0, (showDays && s?.startD ? dateToX(s.startD) : (s?.startWi ?? 0) * WPX) - 80);
      const scrollTop = Math.max(0, targetY - bR.current.clientHeight / 2 + RH);
      bR.current.scrollTo({ top: scrollTop, left: targetX ?? bR.current.scrollLeft, behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(id);
  }, [activeMatchId, visibleRows, showDays, WPX]);

  // Scroll to today on first render so the user lands on the current time window.
  const didScrollToToday = useRef(false);
  useEffect(() => {
    if (didScrollToToday.current || todayX < 0 || !bR.current) return;
    didScrollToToday.current = true;
    // Delay so the DOM has its final layout before we measure clientWidth.
    const id = setTimeout(() => {
      if (!bR.current) return;
      bR.current.scrollTo({ left: Math.max(0, todayX - 40), behavior: 'auto' });
    }, 150);
    return () => clearTimeout(id);
  }, [todayX]);

  function scrollToToday() {
    if (todayX >= 0 && bR.current) bR.current.scrollTo({ left: Math.max(0, todayX - 40), behavior: 'smooth' });
  }
  return { bodyScrollbarH, scrollToToday };
}
