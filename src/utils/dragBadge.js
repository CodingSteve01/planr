// The picture under the pointer while a multi-selection is dragged.
//
// The browser's own drag image is the one row the drag started on, so moving
// five rows looked like moving one — the same trap the selection count in the
// Work order header exists to avoid. A small badge that names the count says
// what is actually in the hand. Tree and Work order both use it.
//
// The element has to be in the document when setDragImage runs and may go
// straight after; the browser has taken its picture by then.
export function setDragBadge(e, text) {
  const dt = e?.dataTransfer;
  if (!dt || typeof dt.setDragImage !== 'function' || typeof document === 'undefined') return;
  const badge = document.createElement('div');
  badge.className = 'drag-badge';
  badge.textContent = text;
  document.body.appendChild(badge);
  // Some environments declare setDragImage and throw from it; the drag
  // works without the badge, so it is never allowed to stop one.
  try { dt.setDragImage(badge, -10, -10); } catch { /* keep the default image */ }
  setTimeout(() => badge.remove(), 0);
}
