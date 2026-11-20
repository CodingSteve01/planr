// Dependency arrows drawn over the timeline: one SVG with the pinned and hovered
// lines, their arrowheads and the delete badge. Stateless; hover and pin state live in the parent.

export function DepLinesSvg({
  renderedDepLines,
  tw,
  FLAG_ROW_H,
  rowLayout,
  pinnedLineKey,
  hoverLineKey,
  hoverDepId,
  hoverClearTimerRef,
  dismissTooltip,
  setHoverLineKey,
  setPinnedLineKey,
  t,
  onRemoveDep,
}) {
  return (
    <>
      {renderedDepLines.length > 0 && (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: tw,
            height: FLAG_ROW_H + rowLayout.height,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          <defs>
            <marker id="gar" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--re)" />
            </marker>
            <marker id="garH" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--ac)" />
            </marker>
            <marker id="garN" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0.5 L6,3 L0,5.5 Z" fill="var(--tx3)" />
            </marker>
          </defs>
          {(() => {
            // Gantt-style orthogonal routing (MS-Project FS arrow): right-stub
            // out of source → vertical drop → horizontal into target. Backward
            // arrows (cycle/violation) use a 5-segment S-loop that exits the
            // source on the right, loops over/under, and re-enters the target
            // from the left so the arrowhead direction stays consistent.
            const STUB = 12;
            const buildPathParts = l => {
              const isForward = l.x2 > l.x1 + STUB * 2;
              if (isForward) {
                // L-shape with source-side stub: (x1,y1) → (sx,y1) → (sx,y2) → (x2,y2).
                // The vertical drop sits right next to the source so the FIRST knick
                // is always reachable next to the bar the link originates from.
                const sx = l.x1 + STUB;
                const sxS = Math.round(sx) + 0.5;
                return {
                  d: `M${l.x1},${l.y1} L${sxS},${l.y1} L${sxS},${l.y2} L${l.x2 - 1},${l.y2}`,
                  // Bend point = source-side knick.
                  bendX: sxS,
                  bendY: l.y1,
                };
              }
              // Backward: 5-segment S-loop. Exit right of source, loop horizontally
              // halfway between rows, re-enter target from left.
              const sx = l.x1 + STUB;
              const tx = l.x2 - STUB;
              const my = (l.y1 + l.y2) / 2;
              return {
                d: `M${l.x1},${l.y1} L${sx},${l.y1} L${sx},${my} L${tx},${my} L${tx},${l.y2} L${l.x2 - 1},${l.y2}`,
                // Bend point = FIRST knick from source side.
                bendX: sx,
                bendY: l.y1,
              };
            };
            // Render hovered/pinned line LAST so its × badge always sits on
            // top of overlapping neighbour lines (SVG has no z-index — paint
            // order wins).
            const topKey = pinnedLineKey || hoverLineKey;
            const orderedLines = topKey
              ? [...renderedDepLines.filter(l => l.key !== topKey), ...renderedDepLines.filter(l => l.key === topKey)]
              : renderedDepLines;
            return orderedLines.map(l => {
              const parts = buildPathParts(l);
              const path = parts.d;
              const isHovered = hoverLineKey === l.key;
              const isPinned = pinnedLineKey === l.key;
              const isHoveredTask = hoverDepId && (hoverDepId === l.srcId || hoverDepId === l.tgtId);
              const emphasized = isHovered || isPinned || isHoveredTask;
              const col = l.isCp ? 'var(--re)' : emphasized ? 'var(--ac)' : 'var(--tx3)';
              const marker = l.isCp ? 'url(#gar)' : emphasized ? 'url(#garH)' : 'url(#garN)';
              // All links are hard deps now — uniform solid stroke. CP path
              // still gets its red emphasis.
              const opacity = emphasized ? 0.95 : l.isCp ? 0.75 : 0.7;
              const strokeWidth = emphasized ? 1.8 : 1.4;
              const dash = undefined;
              // × badge sits at the SECOND bend (vertical-segment midpoint of
              // the L) so it lands in the whitespace between source and target
              // rows — clear of either bar. For straight same-row arrows there
              // is no vertical segment, fall back to a fixed 18 px source-side
              // offset on the row.
              const midX = parts.bendX;
              const midY = Math.abs(l.y2 - l.y1) > 4 ? (l.y1 + l.y2) / 2 : l.y1;
              // Hover persists for 80ms after the cursor leaves the line so the
              // user has time to move onto the × badge without it vanishing.
              const enterLine = () => {
                if (hoverClearTimerRef.current) {
                  clearTimeout(hoverClearTimerRef.current);
                  hoverClearTimerRef.current = null;
                }
                dismissTooltip(true);
                setHoverLineKey(l.key);
              };
              const leaveLine = () => {
                if (hoverClearTimerRef.current) clearTimeout(hoverClearTimerRef.current);
                hoverClearTimerRef.current = setTimeout(() => {
                  setHoverLineKey(k => (k === l.key ? null : k));
                  hoverClearTimerRef.current = null;
                }, 120);
              };
              return (
                <g key={l.key}>
                  <path
                    d={path}
                    fill="none"
                    stroke={col}
                    strokeWidth={isPinned ? 2.4 : strokeWidth}
                    opacity={opacity}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    markerEnd={marker}
                    strokeDasharray={dash}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Wide invisible hit zone — hover highlights; click pins the
              arrow so it stays selected after the cursor leaves. */}
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onMouseEnter={enterLine}
                    onMouseLeave={leaveLine}
                    onClick={e => {
                      e.stopPropagation();
                      setPinnedLineKey(k => (k === l.key ? null : l.key));
                    }}
                  >
                    <title>{`${t('qe.predecessors')}: ${l.removeDepId} → ${l.removeFromId} — Click to pin`}</title>
                  </path>
                  {/* × delete badge — shown while hovered OR pinned. */}
                  {(isHovered || isPinned) &&
                    onRemoveDep &&
                    (() => {
                      const handleClick = e => {
                        e.stopPropagation();
                        onRemoveDep(l.removeFromId, l.removeDepId);
                        setHoverLineKey(null);
                        setPinnedLineKey(null);
                      };
                      return (
                        <g style={{ cursor: 'pointer' }} onMouseEnter={enterLine} onMouseLeave={leaveLine} onClick={handleClick}>
                          <title>{`Remove dep: ${l.removeDepId} → ${l.removeFromId}`}</title>
                          {/* `pointerEvents="all"` is critical: an SVG element with
                  fill="transparent" does NOT receive clicks under the
                  default `visiblePainted` pointer-events mode. Without
                  this, clicks landing in the enlarged hit zone (between
                  r=10 and r=18) silently missed. */}
                          <circle cx={midX} cy={midY} r={18} fill="transparent" pointerEvents="all" style={{ cursor: 'pointer' }} />
                          <circle
                            cx={midX}
                            cy={midY}
                            r={8}
                            fill="var(--re)"
                            stroke="rgba(255,255,255,.75)"
                            strokeWidth={1}
                            style={{
                              cursor: 'pointer',
                              filter: 'drop-shadow(0 1px 4px rgba(0,0,0,.45)) drop-shadow(0 0 0 rgba(0,0,0,.15))',
                            }}
                          />
                          <path
                            d={`M${midX - 3.8},${midY - 3.8} L${midX + 3.8},${midY + 3.8} M${midX + 3.8},${midY - 3.8} L${midX - 3.8},${midY + 3.8}`}
                            stroke="#fff"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })()}
                </g>
              );
            });
          })()}
        </svg>
      )}
    </>
  );
}
