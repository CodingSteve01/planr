import { useEffect, useRef } from 'react';
import { splitSvgMarkup } from '../../utils/roadmap.js';

// Markup that Planr generated as a string, put into the page without handing
// a string to `innerHTML`.
//
// The roadmap and the onboarding preview are drawn by building markup —
// `renderRoadmapSvg` returns a document, not a component tree — and that
// markup used to go in through `dangerouslySetInnerHTML`. It is our own
// output, so nothing untrusted was ever in it, but Obsidian's plugin
// guidelines rule out `innerHTML` regardless of where the string came from,
// and a rule that only holds while everybody remembers why is not much of a
// rule.
//
// `DOMParser` parses into an inert document — no scripting context, nothing
// fetched — and the result is adopted node by node. Same pixels, no HTML
// string ever assigned to a live node.
//
// Two parsers, because the roadmap is two documents in one string: the map,
// and then an HTML legend as its sibling. XML mode accepts exactly one root
// element, so it reads that legend as "extra content at the end of the
// document", fails the whole parse, and leaves the map blank — which is
// exactly what it did. The drawing is parsed as SVG, what follows it as HTML.

export function SvgMarkup({ markup, className, style }) {
  const ref = useRef(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren();
    if (!markup) return;

    const [svg, rest] = splitSvgMarkup(markup);
    const drawing = new DOMParser().parseFromString(svg, 'image/svg+xml');
    // A parse error comes back as a <parsererror> document rather than a
    // throw. Nothing to render then — and nothing to inject either.
    if (drawing.querySelector('parsererror')) return;
    host.appendChild(document.importNode(drawing.documentElement, true));

    if (!rest.trim()) return;
    const legend = new DOMParser().parseFromString(rest, 'text/html');
    for (const child of [...legend.body.childNodes]) {
      host.appendChild(document.importNode(child, true));
    }
  }, [markup]);

  return <div ref={ref} className={className} style={style} />;
}
