// What an embedding host may influence.
//
// Planr normally owns the page: it portals popups to `document.body`, and
// "Auto" theme means whatever the OS says. A host that mounts the app into a
// corner of its own UI — the Obsidian plugin — needs both answers to change,
// and announces itself on `window.__planrHost`:
//
//   { portalRoot: Element, theme(): 'light'|'dark', onThemeChange(cb): () => void }
//
// Every field is optional; nothing here is required for the web build, where
// no host exists and each helper falls back to the browser answer.
function host() {
  return (typeof window !== 'undefined' && window.__planrHost) || null;
}

// Where floating UI (modals, dropdown popups) mounts. It has to escape the
// modal's `overflow:hidden`, which on the web means the body. Inside a host
// the stylesheet is scoped to the host's root and the design tokens live
// there, so a portal on `document.body` would come out unstyled — same
// markup, no colours, no fonts.
export function portalHost() {
  return host()?.portalRoot || document.body;
}

// What "Auto" resolves to. A host that has its own light/dark setting should
// answer here, so Planr follows the app it is embedded in rather than the OS
// underneath it. Returns null when nobody is embedding us.
export function hostTheme() {
  const theme = host()?.theme?.();
  return theme === 'light' || theme === 'dark' ? theme : null;
}

// Subscribe to the host's theme changes. Returns an unsubscribe function, and
// a no-op one when there is no host.
export function onHostThemeChange(callback) {
  return host()?.onThemeChange?.(callback) || (() => {});
}

// The box that `position: fixed` actually resolves against.
//
// On a page Planr owns that is the viewport, and viewport coordinates — a
// mouse event's clientX/clientY, an element's bounding rect — can be used for
// a fixed popup as they are. Inside a host they cannot: an ancestor with a
// transform, filter or containment becomes the containing block for fixed
// descendants, and Obsidian animates its workspace leaves. A tooltip placed
// at the cursor's viewport coordinates then lands offset by the leaf's own
// origin — a pane or two to the right of the mouse.
//
// Measured, not derived: a probe pinned to all four edges reports exactly
// which box it was laid out in, whatever the reason, and reports the viewport
// when there is no such ancestor. Cached briefly because this is read from
// mousemove handlers, and refreshed often enough that dragging a pane divider
// is corrected within a frame or two.
const FRAME_TTL_MS = 500;
let frame = null;
let frameAt = 0;

export function fixedFrame() {
  const root = host()?.portalRoot;
  if (!root) return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const now = Date.now();
  if (frame && now - frameAt < FRAME_TTL_MS && root.isConnected) return frame;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
  root.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  frame = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  frameAt = now;
  return frame;
}
