import { createContext, useContext } from 'react';

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
//
// `theme` is genuinely global — one vault, one appearance — so it stays on the
// window. `portalRoot` is not: a host can show two Planr views side by side,
// and a global last-one-wins pointer sends the left pane's dropdown into the
// right pane's DOM, where it is invisible. The root therefore travels down the
// React tree instead; see PortalRootContext below.
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

// The root *this* app instance owns. A host renders one provider per view; the
// web build has none and falls through to the window answer, which is the body.
export const PortalRootContext = createContext(null);

export function usePortalRoot() {
  return useContext(PortalRootContext) || portalHost();
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

// The box that `position: fixed` actually resolves against, and the factor
// between what a popup writes and what the screen shows.
//
// Two things bend the coordinates a popup is placed with:
//
//   · An ancestor with a transform, filter or containment becomes the
//     containing block for fixed descendants — Obsidian animates its
//     workspace leaves — so the box no longer starts at the viewport's 0,0
//     and a tooltip placed at the mouse's viewport coordinates lands a pane
//     to the right of the cursor.
//   · `zoom` on the app root (the UI scale setting) multiplies every length
//     underneath it. A mouse event still reports viewport pixels, while
//     `style.left = '400px'` now means 400 × scale of them.
//
// Both are measured rather than derived: a probe pinned to all four edges
// reports the box it was laid out in, and a ruler of known width inside it
// reports the factor. With no host and no zoom this is the viewport and 1,
// and every call site reduces to the arithmetic it had before.
//
// Cached briefly: this is read from mousemove handlers, and refreshed often
// enough that dragging a pane divider is corrected within a frame or two. The
// cache is per root, because two side-by-side views measure two different
// boxes and would otherwise invalidate each other on every mousemove.
const FRAME_TTL_MS = 500;
const RULER_PX = 100;
const frames = new WeakMap();

export function fixedFrame(root = portalHost()) {
  const now = Date.now();
  const cached = frames.get(root);
  if (cached && now - cached.at < FRAME_TTL_MS && root.isConnected) return cached.frame;

  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
  const ruler = document.createElement('div');
  ruler.style.cssText = `width:${RULER_PX}px;height:${RULER_PX}px`;
  probe.appendChild(ruler);
  root.appendChild(probe);
  const box = probe.getBoundingClientRect();
  const scale = (ruler.getBoundingClientRect().width / RULER_PX) || 1;
  probe.remove();

  // A box that measured nothing was never laid out — a detached container, a
  // test environment without layout. The viewport is the honest answer there,
  // and the one this returned before anything was measured at all.
  const frame = {
    root,
    scale,
    // Where the box starts, in the viewport pixels a mouse event speaks.
    left: box.left,
    top: box.top,
    // How much room a popup has, in the pixels a popup writes.
    width: box.width ? box.width / scale : window.innerWidth,
    height: box.height ? box.height / scale : window.innerHeight,
  };
  frames.set(root, { frame, at: now });
  return frame;
}

/** A viewport point (clientX/clientY, a bounding rect) in popup coordinates. */
export function toFixedPoint(x, y, f = fixedFrame()) {
  return { x: (x - f.left) / f.scale, y: (y - f.top) / f.scale };
}


// Whether Planr is running inside a host at all. Chrome that only makes sense
// on a page of Planr's own — the wordmark, for one — can stand down when the
// host already says where you are.
export function isEmbedded() {
  return !!host();
}
