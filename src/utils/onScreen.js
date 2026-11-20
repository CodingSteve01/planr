// Whether an element is on the tab the user is looking at.
//
// Every visited tab stays mounted behind the active one (App.jsx
// `visitedTabs`, shared/Frozen.jsx), hidden with `display: none` on its pane.
// A view that listens on `window` keeps listening after the user has moved
// on, so a view with window-level keys has to ask this before acting on one.
// It walks the inline styles rather than reading `offsetParent`, which is the
// same answer in a browser and one that happy-dom does not compute.
export function isOnScreen(el) {
  if (!el || !el.isConnected) return false;
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (node.style?.display === 'none') return false;
  }
  return true;
}
