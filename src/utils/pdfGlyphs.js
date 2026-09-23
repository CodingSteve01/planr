// The PDFs are set in the app's own face — IBM Plex Sans, embedded and
// subsetted in `pdfFonts.js` — and pdfmake draws a missing-glyph box for
// anything the font does not cover. No warning, no fallback: the character
// just turns into a rectangle in a document you are about to hand to
// management.
//
// The app's own vocabulary is full of symbols that are NOT in that font: `✓`
// for done work, `→` in date ranges, `◐` for half-progress, `⚠` on warnings.
// They render fine on screen (system fonts) and break only in the PDF, which is
// exactly the kind of difference nobody notices until the PDF is out.
//
// So: the supported set below is read from the actual cmap of the embedded
// faces — the intersection of Plex Sans Regular and Bold, 804 code points in
// 74 ranges. Regenerate with the snippet in docs/import-export.md whenever the
// embedded font changes; `tools/build-pdf-fonts.mjs` reads this table back to
// decide what to subset, so the two define each other.
//
// It was Roboto's 927 until the PDFs took the app's typeface. The trade is not
// one-sided: Plex has real arrows and a real tick, which Roboto did not, so
// `→` and `✓` now print as themselves instead of `»` and `√`. What it lacks is
// the geometric shapes — `●` `○` `■` — and some archaic Cyrillic. Every modern
// Greek and Cyrillic letter is still there. Every string that
// reaches pdfmake goes through `sanitizePdfDoc`, which substitutes the symbols
// we care about and drops the rest rather than drawing a box. A test asserts
// that nothing outside the set survives, so a new symbol is caught here rather
// than in a printed document.
const SUPPORTED = [
  [0x0020, 0x007E], [0x00A0, 0x017F], 0x018F, 0x0192, [0x01A0, 0x01A1], [0x01AF, 0x01B0],
  [0x01FA, 0x01FF], [0x0218, 0x021B], 0x0237, 0x0259, 0x02BC, [0x02C6, 0x02C7], [0x02D8, 0x02DD],
  [0x0300, 0x0301], 0x0303, 0x0309, 0x0323, [0x0384, 0x038A], 0x038C, [0x038E, 0x03A1],
  [0x03A3, 0x03CE], [0x0400, 0x045F], [0x0462, 0x0463], [0x046A, 0x046B], [0x0472, 0x0475],
  [0x0490, 0x04C2], [0x04CF, 0x04D9], [0x04DC, 0x04E9], [0x04EE, 0x04F9], [0x1E80, 0x1E85],
  0x1E9E, [0x1EA0, 0x1EF9], [0x2000, 0x200B], [0x2010, 0x2011], [0x2013, 0x2015],
  [0x2018, 0x201A], [0x201C, 0x201E], [0x2020, 0x2022], 0x2026, 0x2030, [0x2032, 0x2033],
  [0x2039, 0x203A], 0x2044, 0x2070, [0x2074, 0x2079], [0x2080, 0x2089], 0x20A4, 0x20A6,
  [0x20A8, 0x20AC], 0x20B1, [0x20B9, 0x20BA], 0x20BD, 0x2113, 0x2116, 0x2122, 0x2126, 0x212E,
  [0x215B, 0x215E], [0x2190, 0x2193], 0x2202, 0x2206, 0x220F, [0x2211, 0x2212], 0x221A, 0x221E,
  0x222B, 0x2248, 0x2260, [0x2264, 0x2265], 0x25CA, 0x2713, [0xFB01, 0xFB02], 0xFEFF, 0xFFFD,
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

// Deliberate substitutions, all verified present in the embedded Plex Sans.
// Anything not listed and not supported is dropped: a silently missing symbol
// beats a box, and the label next to it always carries the meaning in words.
export const PDF_GLYPH_MAP = {
  // Plex draws these itself, so the map only NORMALISES the variants onto the
  // one it has. Under Roboto every one of them had to become an ASCII
  // stand-in — `»` for an arrow, `√` for a tick — which is the sort of thing
  // that looks like a typo in a printed document.
  '✔': '✓', '☑': '✓',
  '⇒': '→', '➔': '→', '↦': '→', '▶': '→', '▸': '→',
  '⇐': '←', '◀': '←', '◂': '←',
  '⇧': '↑', '▲': '↑', '⇩': '↓', '▼': '↓',
  // No geometric shapes in Plex Sans. The status triple keeps its meaning
  // through fill rather than outline: a bullet for work that is under way or
  // done, a lozenge for work that is not.
  '●': '•', '◐': '•', '◑': '•', '◗': '•',
  '■': '•', '▪': '•', '◼': '•', '◾': '•',
  '○': '◊', '□': '◊', '☐': '◊',
  '⚠': '!', '⚡': '!', '❗': '!',
  '⊕': '+', '⊖': '-', '✗': 'x', '✘': 'x',
  '★': '*', '☆': '*',
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
  // string comes out byte-identical. Dropping a decorative symbol also leaves
  // a space stranded in front of whatever followed it — a project named
  // "Abrechnung in VOffice ⏰" printed inside quotes as „Abrechnung in VOffice "
  // — so a space that now sits before closing punctuation goes with it.
  if (!dropped) return out;
  return out
    .replace(/ {2,}/g, ' ')
    .replace(/ +([,.;:!?)\]}»"'“”’])/g, '$1')
    .trim();
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
