// The rubber band drawn while the selection rectangle is dragged.
export function GanttSelectionRect({ selectRect }) {
  const x = Math.min(selectRect.x1, selectRect.x2);
  const y = Math.min(selectRect.y1, selectRect.y2);
  const w = Math.abs(selectRect.x2 - selectRect.x1);
  const h = Math.abs(selectRect.y2 - selectRect.y1);
  return (
    <div
      data-testid="gantt-selection-rect"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        border: '1px solid var(--ac)',
        background: 'rgba(59,130,246,.14)',
        boxShadow: '0 0 0 1px rgba(255,255,255,.16) inset',
        zIndex: 7,
        pointerEvents: 'none',
      }}
    />
  );
}
