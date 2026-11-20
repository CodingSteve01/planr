// What a tooltip may say, and how it says it.
//
// Tooltips used to carry HTML — `html:<div><b>…</b><br/>…</div>` — which the
// hover layer handed to `innerHTML`. Every string that reached it had to be
// escaped by hand on the way in, and one forgotten `htmlEsc` around a task
// name was all it would have taken. Obsidian's plugin guidelines rule
// `innerHTML` out outright, which made the question concrete rather than
// theoretical.
//
// So: three symbols, no markup, no escaping, and the strings in i18n.jsx stay
// readable.
//
//   **bold**       a heading, a name, a number that carries the sentence
//   __muted__      an aside — the "what to do about it" line under a warning
//   a newline      a line break
//   "- " at the start of a line   an indented detail line, dimmed
//
// Anything else is text. A stray `*` is text too: only a matched pair marks.

const MARKS = /(\*\*[^*\n]+\*\*|__[^_\n]+__)/g;

/**
 * @returns {{indent: boolean, parts: {text: string, tone: 'normal'|'bold'|'muted'}[]}[]}
 *          One entry per line, ready to render as elements.
 */
export function parseTip(text) {
  return String(text ?? '').split('\n').map(line => ({
    indent: line.startsWith('- '),
    parts: line.split(MARKS).filter(Boolean).map(chunk => {
      if (chunk.length > 4 && chunk.startsWith('**') && chunk.endsWith('**')) {
        return { text: chunk.slice(2, -2), tone: 'bold' };
      }
      if (chunk.length > 4 && chunk.startsWith('__') && chunk.endsWith('__')) {
        return { text: chunk.slice(2, -2), tone: 'muted' };
      }
      return { text: chunk, tone: 'normal' };
    }),
  }));
}

/**
 * Join the lines of a tooltip. A piece that came out as null or false is a
 * line the caller decided not to write; an empty string is a blank line the
 * caller asked for.
 */
export function tipLines(...lines) {
  return lines.filter(line => line != null && line !== false).join('\n');
}
