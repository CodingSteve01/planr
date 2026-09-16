// Confine the app stylesheet to the Planr view.
//
// src/App.css is written for a page Planr owns outright: it resets every
// element (`*{margin:0}`), paints the body, styles the scrollbars, and hangs
// the design tokens off `:root`. Dropped into Obsidian unchanged it would
// restyle the entire window. This pass rewrites every selector so nothing
// reaches past `.planr-view`, the container the plugin mounts React into.
//
// Three rewrites, in order of trickiness:
//
//   1. Selectors that start at the document element. `:root`, `html`, and —
//      the one that is easy to miss — a bare `[data-theme="light"] .foo`:
//      i18n.jsx puts the theme attribute on <html>, so that condition has to
//      stay an ancestor of the container and cannot be prefixed like anything
//      else. `.planr-view [data-theme="light"] .foo` would ask for a themed
//      element *inside* Planr and match nothing, which is exactly how the
//      whole light palette goes missing while the tokens themselves flip.
//   2. The page frame — `html`, `body`, `#root` — becomes the container.
//   3. Everything else gets `.planr-view ` in front.
//
// Plus `100vh` → `100%`: a leaf is not the window, and a Gantt sized to the
// viewport would run straight out the bottom of its tab.

import postcss from 'postcss';

const SCOPE = '.planr-view';
// `*` is deliberately not here: the universal reset has to keep applying to
// everything inside the container, so it goes through the generic prefix.
const PAGE_ROOTS = new Set(['html', 'body', '#root', ':root']);
// A leading compound that describes the document element rather than app
// markup. Only `[data-theme…]` counts among the bare attribute selectors:
// hoisting something out of the scope by mistake is the one failure mode that
// leaks into the user's vault, so anything else stays inside.
const DOC_ROOT = /^(?::root|html|\[data-theme[^\]]*\])/;

function scopeSelector(selector) {
  const part = selector.trim();
  if (!part) return part;
  if (part.startsWith(SCOPE)) return part; // already scoped
  if (PAGE_ROOTS.has(part)) return SCOPE;

  const docRoot = part.match(DOC_ROOT);
  if (docRoot) {
    // Split into the qualifier on <html> and the rest of the selector, which
    // is ordinary app markup and belongs inside the container.
    const after = part.slice(docRoot[0].length);
    const cut = after.search(/[\s>+~]/);
    const qualifier = docRoot[0].replace(/^(?::root|html)/, '') + (cut === -1 ? after : after.slice(0, cut));
    const rest = (cut === -1 ? '' : after.slice(cut)).trim();
    const root = qualifier ? `html${qualifier} ` : '';
    // `[data-theme="light"] body` styles the app's own frame, not a body
    // inside it.
    if (!rest || PAGE_ROOTS.has(rest)) return `${root}${SCOPE}`;
    return `${root}${SCOPE} ${rest}`;
  }

  return `${SCOPE} ${part}`;
}

export function scopeCss(css) {
  const root = postcss.parse(css);

  root.walkRules(rule => {
    // Keyframe stops (`0%`, `from`) are not selectors.
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const scoped = rule.selectors.map(scopeSelector);
    rule.selectors = [...new Set(scoped)];
  });

  root.walkDecls(decl => {
    if (decl.value.includes('vh')) decl.value = decl.value.replace(/\b100(?:d|l|s)?vh\b/g, '100%');
  });

  return root.toString();
}
