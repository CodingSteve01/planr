// How much of a name fits on one line of a node at fontSize 7.5.
export const NAME_CHARS = 26;

// Break a name over at most two lines, at a space rather than mid-word, and
// mark it with an ellipsis when even two lines are not enough. Returns
// [firstLine, secondLine] with an empty second line when one line was plenty.
//
// SVG <text> does no wrapping, so a node's label is broken here or not at all.
// It used to be `slice(0, 26)` and `slice(26, 52)`, which cut wherever the
// count landed: "Zulieferung aus dem Betrieb steht" arrived as "Zulieferung
// aus dem Betrie" over "b steht".
export function wrapTwoLines(name, limit = NAME_CHARS) {
  const text = String(name ?? '').trim();
  if (text.length <= limit) return [text, ''];
  const breakAt = str => {
    const space = str.lastIndexOf(' ', limit);
    // A single word longer than the line has nowhere to break; cut it rather
    // than let it run past the node.
    return space > limit * 0.5 ? space : limit;
  };
  const cut = breakAt(text);
  const first = text.slice(0, cut).trimEnd();
  const restRaw = text.slice(cut).trimStart();
  if (restRaw.length <= limit) return [first, restRaw];
  const cut2 = breakAt(restRaw);
  return [first, `${restRaw.slice(0, cut2).trimEnd()}…`];
}
