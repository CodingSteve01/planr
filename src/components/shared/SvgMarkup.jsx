import { useEffect, useRef } from 'react';

// An SVG that Planr generated as a string, put into the page without handing
// a string to the DOM parser's HTML mode.
//
// The roadmap and the onboarding preview are drawn by building SVG markup —
// `renderRoadmapSvg` returns a document, not a component tree — and that
// markup used to go in through `dangerouslySetInnerHTML`. It is our own
// output, so nothing untrusted was ever in it, but Obsidian's plugin
// guidelines rule out `innerHTML` regardless of where the string came from,
// and a rule that only holds while everybody remembers why is not much of a
// rule.
//
// `DOMParser` in image/svg+xml mode parses without a scripting context and
// without an HTML tokenizer: the result is a document whose root element we
// adopt. Same pixels, no HTML string ever assigned to a live node.
export function SvgMarkup({ markup, className, style }) {
  const ref = useRef(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren();
    if (!markup) return;
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    // A parse error comes back as an <parsererror> document rather than a
    // throw. Nothing to render then — and nothing to inject either.
    if (parsed.querySelector('parsererror')) return;
    host.appendChild(document.importNode(parsed.documentElement, true));
  }, [markup]);

  return <div ref={ref} className={className} style={style} />;
}
