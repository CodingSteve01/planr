// Where floating UI (modals, dropdown popups) mounts.
//
// On the web that is `document.body`: the popup has to escape the modal's
// `overflow:hidden`, and the body is the one element guaranteed to be an
// ancestor of nothing that clips.
//
// An embedded host — the Obsidian plugin — renders Planr into a workspace
// leaf instead of into the page body. The stylesheet is scoped to that
// container and the design tokens (`--bg`, `--tx`, …) are defined on it, so
// a portal on `document.body` would come out unstyled: same markup, no
// colours, no fonts. The host announces its root via `__planrPortalHost`
// and everything lands inside the scope while still escaping the modal.
export function portalHost() {
  if (typeof window !== 'undefined' && window.__planrPortalHost) return window.__planrPortalHost;
  return document.body;
}
