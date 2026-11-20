// Viewport overlay for the live drag-to-link line: a fixed SVG that draws a dashed
// curve from the drag source to the pointer. Stateless; the parent decides when to show it.

import { fixedFrame, toFixedPoint } from '../../../utils/embedHost.js';

export function LinkDragOverlay({ linkDrag, portalRoot }) {
  return (
    <>
      {/* Viewport overlay for the live drag-to-link line */}
      {linkDrag && (
        <svg className="layer-drag" style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <marker id="ldArr" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--ac)" />
            </marker>
          </defs>
          {(() => {
            const el = document.querySelector(`[data-link-from="${linkDrag.fromId}"]`);
            const rect = el?.getBoundingClientRect();
            // Everything here is in viewport coordinates; the overlay is fixed and
            // spans its containing block, which is the viewport only when nothing
            // is embedding us. See utils/embedHost.js.
            const frame = fixedFrame(portalRoot);
            const from = toFixedPoint(rect ? rect.right : linkDrag.mouseX, rect ? rect.top + rect.height / 2 : linkDrag.mouseY, frame);
            const to = toFixedPoint(linkDrag.mouseX, linkDrag.mouseY, frame);
            const x1 = from.x,
              y1 = from.y;
            const x2 = to.x,
              y2 = to.y;
            const stub = 10;
            const sx = x1 + stub;
            const tx = x2 - stub;
            const dx = Math.max(Math.abs(tx - sx) * 0.5, 30);
            const c1x = sx + dx,
              c2x = tx - dx;
            const d = `M${x1},${y1} L${sx},${y1} C${c1x},${y1} ${c2x},${y2} ${tx},${y2} L${x2 - 1},${y2}`;
            return (
              <path
                d={d}
                stroke="var(--ac)"
                strokeWidth={2}
                fill="none"
                strokeDasharray="4 3"
                strokeLinejoin="round"
                strokeLinecap="round"
                markerEnd="url(#ldArr)"
              />
            );
          })()}
        </svg>
      )}
    </>
  );
}
