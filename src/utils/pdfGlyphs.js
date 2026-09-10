// pdfmake ships exactly one font family — Roboto, in `pdfmake/build/vfs_fonts`
// — and it draws a missing-glyph box for anything that font does not cover. No
// warning, no fallback: the character just turns into a rectangle in a document
// you are about to hand to management.
//
// The app's own vocabulary is full of symbols that are NOT in that font: `✓`
// for done work, `→` in date ranges, `◐` for half-progress, `⚠` on warnings.
// They render fine on screen (system fonts) and break only in the PDF, which is
// exactly the kind of difference nobody notices until the PDF is out.
//
// So: the supported set below is read from the actual cmap of the bundled
// Roboto-Regular (927 code points, 82 ranges — regenerate with the snippet in
// docs/import-export.md if pdfmake ever bumps its font). Every string that
// reaches pdfmake goes through `sanitizePdfDoc`, which substitutes the symbols
// we care about and drops the rest rather than drawing a box. A test asserts
// that nothing outside the set survives, so a new symbol is caught here rather
// than in a printed document.
const SUPPORTED = [
  0x0000, 0x0002, 0x000D, [0x0020, 0x007E], [0x00A0, 0x017F], 0x018F, 0x0192, [0x01A0, 0x01A1],
  [0x01AF, 0x01B0], 0x01F0, [0x01FA, 0x01FF], [0x0218, 0x021B], 0x0237, 0x0259, 0x02BC,
  [0x02C6, 0x02C7], 0x02C9, [0x02D8, 0x02DD], 0x02F3, [0x0300, 0x0301], 0x0303, 0x0309, 0x030F,
  0x0323, [0x0384, 0x038A], 0x038C, [0x038E, 0x03A1], [0x03A3, 0x03CE], [0x03D1, 0x03D2], 0x03D6,
  [0x0400, 0x0486], [0x0488, 0x0513], [0x1E00, 0x1E01], [0x1E3E, 0x1E3F], [0x1E80, 0x1E85], 0x1E9E,
  [0x1EA0, 0x1EF9], 0x1F4D, [0x2000, 0x200B], [0x2010, 0x2011], [0x2013, 0x2015], [0x2017, 0x201E],
  [0x2020, 0x2022], [0x2025, 0x2027], 0x2030, [0x2032, 0x2033], [0x2039, 0x203A], 0x203C, 0x2044,
  0x2070, [0x2074, 0x208E], [0x20A3, 0x20A4], [0x20A6, 0x20AC], 0x20B1, [0x20B9, 0x20BA],
  [0x20BC, 0x20BD], 0x20C1, 0x2105, 0x2113, 0x2116, 0x2122, 0x2126, 0x212E, [0x215B, 0x215E],
  0x2202, 0x2206, 0x220F, [0x2211, 0x2212], 0x221A, 0x221E, 0x222B, 0x2248, 0x2260,
  [0x2264, 0x2265], 0x25A0, [0x25CA, 0x25CB], 0x25CF, [0xEE01, 0xEE02], 0xF6C3, [0xFB01, 0xFB04],
  0xFEFF, [0xFFFC, 0xFFFD],
];

const singles = new Set();
const spans = [];
SUPPORTED.forEach(entry => {
  if (Array.isArray(entry)) spans.push(entry);
  else singles.add(entry);
});

export function isPdfSafeCodePoint(cp) {
  if (singles.has(cp)) return true;
  // 82 ranges — a linear scan is cheaper than the binary search's bookkeeping
  // at this size, and this runs once per character of a document.
  for (let i = 0; i < spans.length; i++) {
    if (cp >= spans[i][0] && cp <= spans[i][1]) return true;
  }
  return false;
}

// Deliberate substitutions, all verified present in the bundled Roboto.
// Anything not listed and not supported is dropped: a silently missing symbol
// beats a box, and the label next to it always carries the meaning in words.
export const PDF_GLYPH_MAP = {
  '✓': '√', '✔': '√', '☑': '√',
  '◐': '●', '◑': '●', '◗': '●',       // no half-filled circle exists in Roboto
  '▪': '■', '◼': '■', '◾': '■', '□': '■', '☐': '■',
  '→': '»', '⇒': '»', '➔': '»', '↦': '»',
  '←': '«', '⇐': '«',
  '↑': '^', '↓': 'v',
  '⚠': '!', '⚡': '!', '❗': '!',
  '⊕': '+', '⊖': '-', '✗': 'x', '✘': 'x',
  '★': '*', '☆': '*', '▶': '»', '◀': '«', '▲': '^', '▼': 'v',
  '🚆': '', '🎯': '', '⏰': '', '💾': '', '📦': '', '⤢': '', '↶': '',
};

export function sanitizePdfText(text) {
  const input = String(text);
  // Fast path: plain ASCII, which most strings are.
  let needsWork = false;
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) > 0x7e) { needsWork = true; break; }
  }
  if (!needsWork) return input;

  let out = '';
  let dropped = false;
  for (const ch of input) {
    const mapped = PDF_GLYPH_MAP[ch];
    // Mapping to '' is a deliberate removal (decorative emoji), so it needs
    // the same whitespace tidy-up as an unknown character.
    if (mapped !== undefined) { out += mapped; if (mapped === '') dropped = true; continue; }
    if (isPdfSafeCodePoint(ch.codePointAt(0))) { out += ch; continue; }
    dropped = true;   // unknown AND unsupported: leave it out entirely
  }
  // Only tidy whitespace when something was actually removed, so every other
  // string comes out byte-identical.
  return dropped ? out.replace(/ {2,}/g, ' ').trim() : out;
}

// Deep-map every string in a pdfmake docDefinition. Keys are left alone (they
// are pdfmake's own property names); embedded SVG markup is skipped because
// svg-to-pdfkit draws it with its own font handling and the roadmap renderers
// already prepare theirs.
export function sanitizePdfDoc(node) {
  if (typeof node === 'string') {
    return node.startsWith('<svg') ? node : sanitizePdfText(node);
  }
  if (Array.isArray(node)) return node.map(sanitizePdfDoc);
  if (node && typeof node === 'object') {
    if (node instanceof Date) return node;
    const out = {};
    Object.keys(node).forEach(key => { out[key] = sanitizePdfDoc(node[key]); });
    return out;
  }
  return node;
}
