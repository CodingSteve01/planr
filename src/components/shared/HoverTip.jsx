import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fixedFrame } from '../../utils/embedHost.js';

/**
 * Lightweight global tooltip — mount once at app root; any element with
 * `data-htip="text"` gets a styled tooltip on hover.
 * Uses event delegation — no per-element listeners, minimal overhead.
 */
export function HoverTipProvider() {
  const [tip, setTip] = useState(null); // { text, x, y }
  const tipRef = useRef(null);
  const hideTimer = useRef(null);

  const onMove = useCallback(e => {
    const el = e.target?.closest?.('[data-htip]');
    if (el) {
      const text = el.getAttribute('data-htip');
      if (text) {
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        setTip({ text, x: e.clientX, y: e.clientY });
        return;
      }
    }
    if (!hideTimer.current) {
      hideTimer.current = setTimeout(() => { setTip(null); hideTimer.current = null; }, 80);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', () => setTip(null));
    return () => { document.removeEventListener('mousemove', onMove); };
  }, [onMove]);

  // Edge-flip: measure after render, adjust position if overflowing.
  // The mouse reports viewport coordinates; a fixed element is placed in its
  // containing block, which is the viewport only when nothing is embedding us.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const tw = tipRef.current.offsetWidth;
    const th = tipRef.current.offsetHeight;
    const frame = fixedFrame();
    const x = tip.x - frame.left;
    const y = tip.y - frame.top;
    let nx = x + 14;
    let ny = y + 14;
    if (nx + tw > frame.width - 8) nx = x - tw - 14;
    if (nx < 8) nx = 8;
    if (ny + th > frame.height - 8) ny = y - th - 14;
    if (ny < 8) ny = 8;
    tipRef.current.style.left = nx + 'px';
    tipRef.current.style.top = ny + 'px';
  }, [tip]);

  if (!tip) return null;
  // First paint, before the layout effect corrects it.
  const frame = fixedFrame();
  const left = tip.x - frame.left + 14;
  const top = tip.y - frame.top + 14;
  return tip.text.startsWith('html:') ? (
    <div
      ref={tipRef}
      className="htip-pop"
      style={{ position: 'fixed', left, top, pointerEvents: 'none', zIndex: 9999 }}
      dangerouslySetInnerHTML={{ __html: tip.text.slice(5) }}
    />
  ) : (
    <div
      ref={tipRef}
      className="htip-pop"
      style={{ position: 'fixed', left, top, pointerEvents: 'none', zIndex: 9999 }}
    >
      {tip.text}
    </div>
  );
}
