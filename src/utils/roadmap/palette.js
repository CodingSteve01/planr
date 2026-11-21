// Line colours. One family rather than eight unrelated brights: they share a
// chroma and a lightness, so no line shouts over its neighbours and the map
// reads as one drawing. The old set was the default Tailwind ramp
// (#3b82f6, #10b981, #f59e0b …), which is high-chroma and unrelated hue to
// hue — fine for a badge, wrong for eight lines on one canvas.
//
// Each one is picked to clear 3:1 against BOTH grounds, because the same hex
// is drawn on near-white and on near-black; a colour tuned for one goes muddy
// on the other. Guarded in src/utils/__tests__/roadmapPalette.test.js.
const PALETTE = ['#3d7ab0', '#4a8f63', '#c08a3a', '#8f6ba1', '#bf5a4d', '#3d8a92', '#a06f8c', '#6f8440'];

// Looks up the Subway-Map line color for a top-level root id. Returns null
// when no assignment has been computed yet (user hasn't opened the Subway
// view) so the caller can fall back to its default styling.
export function getLineColor(rootId, assignment) {
  if (!rootId || !assignment) return null;
  const stored = assignment[rootId];
  if (stored?.colorIdx == null) return null;
  return PALETTE[stored.colorIdx % PALETTE.length];
}

export { PALETTE };
