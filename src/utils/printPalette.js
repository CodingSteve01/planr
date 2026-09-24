// The palette everything printed uses — the PDFs and the HTML report.
//
// Both are always on white, so this mirrors the LIGHT block of App.css
// (`:root[data-theme="light"]`) rather than carrying a set of its own. It did
// carry one: an ink of #1a1e2a, headings in #1d4ed8, tables banded #edf2fa,
// greens at #16a34a and ambers at #d97706 — the Tailwind-ish blues the screen
// used before the palette was rebuilt. A management summary that does not look
// like the tool it came out of reads as a different document, and the numbers
// on it read as different numbers.
//
// The screen resolves these through CSS variables; a PDF cannot, so the values
// are written out once here and nowhere else. `printPalette.test.js` holds
// them to the stylesheet, so the two cannot drift.
export const PRINT = {
  // Ink
  ink: '#1a1a18',        // --tx
  ink2: '#4a4944',       // --tx2
  muted: '#5c5a54',      // --tx3

  // Ground
  paper: '#ffffff',      // --bg2
  ground: '#fafaf8',     // --bg
  band: '#f1efea',       // --bg3 — table header fill, zebra rows
  rule: '#e6e4de',       // --b
  rule2: '#d5d2ca',      // --b2

  // Accent
  accent: '#2b5c8a',     // --ac
  accentDeep: '#1e4467', // --ac2
  accentSoft: '#eaf0f6', // --ac-soft

  // State
  done: '#357049',       // --st-done
  wip: '#8a5a1a',        // --st-wip
  risk: '#a8443a',       // --st-risk
  doneSoft: '#e8f1ea',   // --st-done-soft
  wipSoft: '#f7efe2',    // --st-wip-soft
  riskSoft: '#f7eae8',   // --st-risk-soft

  // Planning confidence — an ordinal ramp in one hue, not three status
  // colours. See the note beside --cf-hi in App.css.
  confHi: '#1e4467',     // --cf-hi
  confMid: '#5d87ad',    // --cf-mid
  confLo: '#b6c9d9',     // --cf-lo
};

export default PRINT;
