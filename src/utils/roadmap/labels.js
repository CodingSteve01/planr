import { SVG_H, SVG_W } from './board.js';

// ─── Station label placement ──────────────────────────────────────────────
// Every station used to print its abbreviation at a fixed (+8, -8) offset.
// With 60+ stations on one canvas that guarantees collisions: two labels of
// different lines print over each other ("PRI2PRI1UPP"), or a label lands on
// another line's dot. The label is the only thing on the map that names a
// station without hovering, so an unreadable one is worse than none.
//
// So place them globally instead: try a handful of offsets per station, take
// the first that hits neither another label nor any station dot, and drop the
// label entirely if none fits — the tooltip still carries the full name.
// Important stations are placed first so they get the prime slot.
const LABEL_CH_W = 6.4; // px per character at 10.5px JetBrains Mono
const LABEL_H = 12;
const DOT_KEEPOUT = 9; // px — biggest station glyph plus a little air
const LABEL_SLOTS = [
  { dx: 8, dy: -8, anchor: 'start' },
  { dx: -8, dy: -8, anchor: 'end' },
  { dx: 8, dy: 15, anchor: 'start' },
  { dx: -8, dy: 15, anchor: 'end' },
  { dx: 0, dy: -19, anchor: 'middle' },
  { dx: 0, dy: 24, anchor: 'middle' },
];

const boxesOverlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function labelBox(x, y, width, anchor) {
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return { x0: x0 - 2, x1: x0 + width + 2, y0: y - LABEL_H + 2, y1: y + 3 };
}

export function placeStationLabels(lines, isVisible = () => true) {
  const placement = new Map();
  const occupied = [];
  const candidates = [];
  // How far down labels may be placed. Follows the lanes actually in use —
  // a fixed board height would have silently dropped every label on the
  // lanes a plan with more than eight projects grew.
  const allYs = lines.flatMap(line => (line.route || []).map(pt => pt.y)).filter(Number.isFinite);
  const labelFloor = Math.max(SVG_H, allYs.length ? Math.max(...allYs) + 60 : 0);

  lines.forEach((line, lineIdx) => {
    // The project's name, drawn above the start of its own line, is an
    // obstacle like any dot. It was not, so a station near the start of a
    // line had its abbreviation placed straight through the name — reported
    // on the real plan, where nearly every line has an early stop.
    // Measured the way labelBox does it: ~8px per character at 16px, plus the
    // line's own height above the route.
    const nameW = Math.min(String(line.root?.name || '').length, 42) * 8.2;
    const nameX = (line.route?.[0]?.x ?? 0) - 30;
    const nameY = (line.route?.[0]?.y ?? 0) - 15;
    if (nameW > 0) {
      occupied.push({
        owner: `__name_${line.root?.id ?? lineIdx}`,
        x0: nameX - 4,
        x1: nameX + nameW + 4,
        y0: nameY - 16,
        y1: nameY + 5,
      });
    }

    [...line.majorStations, ...line.minorStations].forEach(station => {
      // Dots are obstacles whether or not they carry a label — except for the
      // station's OWN dot. A label always sits next to its dot, so counting
      // that as a collision would push every label into the same far slot and
      // break the association it exists to make.
      occupied.push({
        owner: station.id,
        x0: station.x - DOT_KEEPOUT,
        x1: station.x + DOT_KEEPOUT,
        y0: station.y - DOT_KEEPOUT,
        y1: station.y + DOT_KEEPOUT,
      });
      if (!isVisible(line, station)) return;
      const isCurrent = station.id === line.currentId && !station.allDone;
      candidates.push({
        station,
        lineIdx,
        // 0 = the station the train is approaching, 1 = a real milestone,
        // 2 = a minor stop. Ties break by position for stable output.
        priority: isCurrent ? 0 : station.kind === 'major' ? 1 : 2,
      });
    });
  });

  candidates.sort((a, b) => a.priority - b.priority || a.lineIdx - b.lineIdx || a.station.t - b.station.t);

  candidates.forEach(({ station }) => {
    const width = String(station.abbrev || '').length * LABEL_CH_W + 4;
    const slot = LABEL_SLOTS.map(({ dx, dy, anchor }) => ({ x: station.x + dx, y: station.y + dy, anchor }))
      .filter(pos => pos.x > 6 && pos.x < SVG_W - 6 && pos.y > 12 && pos.y < labelFloor - 6)
      .find(pos => {
        const box = labelBox(pos.x, pos.y, width, pos.anchor);
        return !occupied.some(other => other.owner !== station.id && boxesOverlap(box, other));
      });
    if (!slot) return; // no room — the tooltip is the fallback
    occupied.push({ owner: station.id, ...labelBox(slot.x, slot.y, width, slot.anchor) });
    placement.set(station.id, slot);
  });

  return placement;
}
