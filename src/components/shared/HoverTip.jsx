import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fixedFrame, toFixedPoint, usePortalRoot } from '../../utils/embedHost.js';
import { parseTip } from '../../utils/tipText.js';

/**
 * Where the tooltip goes, in the coordinates a fixed element is written in.
 * A size of 0 means "not measured yet" and simply does not flip.
 */
export function placeHoverTip(x, y, w, h, frame) {
  let nx = x + 14;
  let ny = y + 14;
  if (w && nx + w > frame.width - 8) nx = x - w - 14;
  if (h && ny + h > frame.height - 8) ny = y - h - 14;
  return { left: Math.max(8, nx), top: Math.max(8, ny) };
}

/**
 * Lightweight global tooltip — mount once at app root; any element with
 * `data-htip="text"` gets a styled tooltip on hover.
 * Uses event delegation — no per-element listeners, minimal overhead.
 */
export function HoverTipProvider() {
  const portalRoot = usePortalRoot();
  const [tip, setTip] = useState(null); // { text, x, y }
  const tipRef = useRef(null);
  const hideTimer = useRef(null);
  // Last measured size, so the first paint of the next position already knows
  // whether it has to flip.
  const sizeRef = useRef({ w: 0, h: 0 });

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

  // Near the right or bottom edge the tooltip flips to the other side of the
  // cursor, which needs its size — and its size is only knowable after it has
  // rendered. Measuring after every render and correcting meant that at the
  // right edge every mouse move painted the tooltip overflowing first and
  // pulled it back a frame later: a tooltip that visibly shivers while you
  // move along the edge. The size of a tooltip does not change while you hover
  // the same thing, so the last measurement is kept and the next position is
  // right on the first paint.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const frame = fixedFrame(portalRoot);
    const { x, y } = toFixedPoint(tip.x, tip.y, frame);
    const w = tipRef.current.offsetWidth;
    const h = tipRef.current.offsetHeight;
    sizeRef.current = { w, h };
    const { left, top } = placeHoverTip(x, y, w, h, frame);
    tipRef.current.style.left = left + 'px';
    tipRef.current.style.top = top + 'px';
  }, [tip]);

  if (!tip) return null;
  const frame = fixedFrame(portalRoot);
  const start = toFixedPoint(tip.x, tip.y, frame);
  const { left, top } = placeHoverTip(start.x, start.y, sizeRef.current.w, sizeRef.current.h, frame);
  return (
    <div
      ref={tipRef}
      className="htip-pop"
      style={{ position: 'fixed', left, top, pointerEvents: 'none', zIndex: 9999 }}
    >
      {parseTip(tip.text).map((line, li) => (
        <div key={li} className={line.indent ? 'htip-line htip-detail' : 'htip-line'}>
          {line.parts.map((part, pi) => (
            part.tone === 'bold' ? <b key={pi}>{part.text}</b>
              : part.tone === 'muted' ? <span key={pi} className="htip-muted">{part.text}</span>
                : <span key={pi}>{part.text}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
