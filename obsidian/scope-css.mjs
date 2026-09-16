// Confine the app stylesheet to the Planr view.
//
// src/App.css is written for a page Planr owns outright: it resets every
// element (`*{margin:0}`), paints the body, styles the scrollbars, and hangs
// the design tokens off `:root`. Dropped into Obsidian unchanged it would
// restyle the entire window. This pass rewrites every selector so nothing
// reaches past `.planr-view`, the container the plugin mounts React into.
//
// Four rewrites, in order of trickiness:
//   `:root`                    → `.planr-view`            (tokens live on the container)
//   `:root[data-theme=light]`  → `html[data-theme=light] .planr-view`
//        — the theme attribute is set on <html> by i18n.jsx and stays there
//   `html`, `body`, `#root`    → `.planr-view`            (the app's page frame)
//   anything else              → `.planr-view <selector>`
// plus `100vh` → `100%`: a leaf is not the window, and a Gantt sized to the
// viewport would run straight out the bottom of its tab.

import postcss from 'postcss';

const SCOPE = '.planr-view';
// `*` is deliberately not here: the universal reset has to keep applying to
// everything inside the container, so it goes through the generic prefix.
const PAGE_ROOTS = new Set(['html', 'body', '#root', ':root']);

function scopeSelector(selector) {
  const part = selector.trim();
  if (!part) return part;
  if (part.startsWith(SCOPE)) return part; // already scoped

  if (part.startsWith(':root')) {
    // Split `:root<compound><rest>` — the compound qualifies the theme, the
    // rest is ordinary app markup that must sit inside the container.
    const after = part.slice(':root'.length);
    const cut = after.search(/[\s>+~]/);
    const compound = cut === -1 ? after : after.slice(0, cut);
    const rest = cut === -1 ? '' : after.slice(cut);
    if (!compound) return `${SCOPE}${rest}`;
    return `html${compound} ${SCOPE}${rest}`.trim();
  }

  if (PAGE_ROOTS.has(part)) return SCOPE;
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
