import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { DAY_ZOOM } from '../../../utils/gantt/helpers.js';

// Zoom of the Gantt timeline: pixels per week, the ctrl/cmd + wheel gesture
// that changes it, and the scroll anchoring that keeps the pointer's date still.
export function useGanttZoom({ hR, bR }) {
  // Zoom: WPX = pixels per week. 20 = default, lower zooms out (months), higher zooms in (toward day-level)
  const [zoom, setZoom] = useState(() => {
    try {
      return +localStorage.getItem('planr_gantt_zoom') || DAY_ZOOM;
    } catch {
      return DAY_ZOOM;
    }
  });
  const clampZoom = v => Math.max(8, Math.min(140, v));
  const setZ = v => {
    const c = clampZoom(v);
    setZoom(c);
    try {
      localStorage.setItem('planr_gantt_zoom', String(c));
    } catch {}
    return c;
  };
  const WPX = zoom;
  const showDays = WPX >= 70; // at this zoom, individual days fit (~14 px each)
  const zoomMode = showDays ? 'day' : WPX <= 12 ? 'month' : 'week';
  const zoomAnchorRef = useRef(null);
  const onTimelineWheel = useCallback(
    e => {
      const isZoomGesture = e.ctrlKey || e.metaKey;
      if (!isZoomGesture) return;
      e.preventDefault();
      e.stopPropagation();
      const body = bR.current;
      if (!body) {
        setZ(WPX * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
        return;
      }
      const rect = body.getBoundingClientRect();
      const anchorX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const timeAtPointer = (body.scrollLeft + anchorX) / Math.max(WPX, 1);
      zoomAnchorRef.current = { timeAtPointer, anchorX };
      setZ(WPX * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    },
    [WPX],
  );
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    if (!anchor || !bR.current) return;
    zoomAnchorRef.current = null;
    bR.current.scrollLeft = Math.max(0, anchor.timeAtPointer * WPX - anchor.anchorX);
    if (hR.current) hR.current.scrollLeft = bR.current.scrollLeft;
  }, [WPX]);
  useEffect(() => {
    const targets = [hR.current, bR.current].filter(Boolean);
    if (!targets.length) return undefined;
    targets.forEach(el => el.addEventListener('wheel', onTimelineWheel, { passive: false }));
    return () => targets.forEach(el => el.removeEventListener('wheel', onTimelineWheel));
  }, [onTimelineWheel]);
  return { zoom, setZ, WPX, showDays, zoomMode };
}
