/**
 * Split `renderRoadmapSvg`'s output into the drawing and the legend.
 *
 * The renderer returns two documents in one string: an `<svg>` map, and then
 * an HTML legend as its sibling. Anything that hands the whole string to an
 * SVG parser gets a map-shaped nothing — XML accepts one root element and
 * reads the rest as extra content at the end of the document.
 *
 * Not the first `</svg>`: the legend embeds status icons that are SVGs of
 * their own, so the tag that ends the drawing is the one that brings the
 * nesting back to zero.
 */
export function splitSvgMarkup(markup) {
  const text = String(markup || '');
  const tag = /<svg\b|<\/svg\s*>/g;
  let depth = 0;
  let match;
  while ((match = tag.exec(text))) {
    depth += match[0][1] === '/' ? -1 : 1;
    if (depth === 0) return [text.slice(0, tag.lastIndex), text.slice(tag.lastIndex)];
  }
  return [text, ''];
}
// A tooltip payload, for the `data-tip` attribute. JSON rather than HTML: the
// hover layer parses it and renders components, so no string is ever handed to
// innerHTML — see components/shared/Roadmap.jsx and utils/tipText.js.
function tipData(payload) {
  return JSON.stringify(payload);
}

export { tipData };
