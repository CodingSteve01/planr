import { contrastText } from './format.js';

// Every stop is the same size, whatever state it is in.
//
// It was not: a reached stop was drawn r=9 and an unreached one r=5, so a line
// visibly shrank towards its future and the two read as two kinds of thing
// rather than one thing in two states. On a metro map a station is a station.
// The state is carried by the FILL — solid and ticked for reached, a ring for
// still to come — at one outer diameter, so the row of them is a row.
const STATION_R = 9;
// The train is the one mark that is not a station, so it is bigger than one
// rather than the same size with a different outline.
const TRAIN_W = 26;
const TRAIN_H = 16;

// A stop, at `STATION_R` whatever it is.
//   reached  → filled, with a tick
//   current  → ring with a dot in it, thicker, in the line's colour
//   ahead    → ring
function stationGlyph(cx, cy, color, { done = false, current = false } = {}) {
  const x = Number(cx).toFixed(1),
    y = Number(cy).toFixed(1);
  if (done) {
    const ink = contrastText(color);
    return (
      `<circle cx="${x}" cy="${y}" r="${STATION_R}" fill="${color}"/>` +
      // The tick is what makes "reached" say so on its own — a filled circle
      // alone is only darker than its neighbour, and on a finished line every
      // circle is filled and nothing says why.
      `<path d="M${(+x - 3.9).toFixed(1)} ${(+y + 0.2).toFixed(1)}` +
      ` l 2.8 2.9 l 5 -5.6" fill="none" stroke="${ink}" stroke-width="2"` +
      ` stroke-linecap="round" stroke-linejoin="round"/>`
    );
  }
  if (current) {
    // r + half the stroke = STATION_R, so the outer edge lands where every
    // other stop's does.
    const sw = 3.4;
    return (
      `<circle cx="${x}" cy="${y}" r="${(STATION_R - sw / 2).toFixed(2)}" fill="var(--bg2,#1c1b17)" stroke="${color}" stroke-width="${sw}"/>` +
      `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`
    );
  }
  const sw = 2.5;
  return `<circle cx="${x}" cy="${y}" r="${(STATION_R - sw / 2).toFixed(2)}" fill="var(--bg,#111318)" stroke="${color}" stroke-width="${sw}"/>`;
}

/**
 * Inline SVG status indicator — same visual language across SVG and legend:
 * - 'done'   → filled circle with white checkmark
 * - 'wip'    → outlined circle with a pie-slice filled showing progress
 * - 'open'   → empty outlined circle
 * Progress in [0..1] only used for 'wip'.
 */
function statusIcon(status, color, progress = 0, size = 12) {
  const r = size / 2 - 1.2;
  const c = size / 2;
  if (status === 'done') {
    return (
      `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;vertical-align:middle">` +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="${color}"/>` +
      `<path d="M${c - r * 0.55},${c} L${c - r * 0.1},${c + r * 0.45} L${c + r * 0.65},${c - r * 0.45}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`
    );
  }
  if (status === 'wip' && progress > 0) {
    // Pie slice for progress
    const angle = Math.min(Math.max(progress, 0), 1) * Math.PI * 2;
    const ex = c + r * Math.sin(angle);
    const ey = c - r * Math.cos(angle);
    const large = angle > Math.PI ? 1 : 0;
    const path =
      progress >= 0.999
        ? `M${c},${c - r} A${r},${r} 0 1,1 ${c - 0.01},${c - r} Z`
        : `M${c},${c} L${c},${c - r} A${r},${r} 0 ${large},1 ${ex.toFixed(2)},${ey.toFixed(2)} Z`;
    return (
      `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;vertical-align:middle">` +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="1.4"/>` +
      `<path d="${path}" fill="${color}" opacity=".6"/>` +
      `</svg>`
    );
  }
  // open (includes wip with 0 progress)
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;vertical-align:middle">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `</svg>`
  );
}

export { TRAIN_W, TRAIN_H, stationGlyph, statusIcon };
