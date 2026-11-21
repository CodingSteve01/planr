import { esc, clamp, contrastText } from './format.js';
import { SVG_W, SVG_H, ROUTE_T_LO, ROUTE_T_HI } from './board.js';
import { pointAtFraction } from './geometry.js';
import { placeStationLabels } from './labels.js';
import { computeRoadmapModel } from './model.js';
import { renderRouteLines, renderStations } from './renderLines.js';
import { renderProgressOverlays, renderTrains } from './renderProgress.js';
import { renderLegend } from './renderLegend.js';

// ─── renderRoadmapSvg ─────────────────────────────────────────────────────────

export function renderRoadmapSvg(args) {
  const model = computeRoadmapModel(args);
  const labels = args.labels || {};
  if (!model?.lines.length) return '';

  const { lines, nodeMap } = model;
  // Optional diff overlay. Fields:
  //   pastProgressByRootId — past line progress per root id (0..1)
  //   newRootIds           — roots whose subtree had no leaf at the cutoff
  //   doneInWindowIds      — leaves that transitioned to done (badge "✓ +N")
  //   changedInWindowIds   — leaves with ANY movement (done OR progress-only),
  //                          drives the legend/station "moved in window" mark
  const diff = args.diff || null;
  const diffMode = !!diff;
  // Ids of tasks a scenario moves (a Set, or a Map keyed by id).
  const scenarioIds = args.scenarioIds && typeof args.scenarioIds.has === 'function' && args.scenarioIds.size ? args.scenarioIds : null;
  const pastProgress = diff?.pastProgressByRootId || {};
  const newSet = new Set(diff?.newRootIds || []);
  const doneInWindow = new Set(diff?.doneInWindowIds || []);
  const changedInWindow = new Set(diff?.changedInWindowIds || doneInWindow);
  // Planning-horizon overlay. When `horizonIds` is set, items/stations whose
  // ids aren't in the set get a muted treatment so the map still tells the
  // full story but the eye locks onto what's planned in the window.
  const horizonIdSet = args.horizonIds instanceof Set ? args.horizonIds : Array.isArray(args.horizonIds) ? new Set(args.horizonIds) : null;
  const horizonOn = !!horizonIdSet;
  // Forward-looking projection per root: where would the train sit at the
  // horizon end? Drawn as a blue segment + ghost-train AHEAD of the live one
  // so the map tells the Diff/Ist/Plan story in one glance.
  const futureProgress = args.futureProgressByRootId || {};
  const hasFuture = Object.keys(futureProgress).length > 0;
  const expandedLegendIds =
    args.expandedLegendIds instanceof Set
      ? args.expandedLegendIds
      : Array.isArray(args.expandedLegendIds)
        ? new Set(args.expandedLegendIds)
        : new Set();
  // Mirrors the per-station label conditions in the render loops below, so the
  // placement pass reserves space for exactly the labels that get drawn.
  const stationLabelPlacement = placeStationLabels(lines, (line, station) => {
    const isDone = station.allDone;
    const isCurrent = station.id === line.currentId && !isDone;
    if (station.kind !== 'major') return isCurrent;
    const reachedInWindow = changedInWindow.size > 0 && (station.clusterItems || []).some(c => changedInWindow.has(c.id));
    return !diffMode || isDone || isCurrent || reachedInWindow;
  });
  const out = [];

  const renderLaneDeltaLabel = (route, fromT, toT, label, fill) => {
    if (!label || label === '0%' || !Number.isFinite(fromT) || !Number.isFinite(toT)) return;
    const midT = clamp((fromT + toT) / 2, ROUTE_T_LO, ROUTE_T_HI);
    const pt = pointAtFraction(route, midT);
    const w = Math.max(34, 14 + label.length * 7);
    const x = clamp(pt.x - w / 2, 4, SVG_W - w - 4);
    const yRaw = pt.y - 24;
    const y = yRaw < 4 ? pt.y + 12 : yRaw;
    out.push(`<g class="rm-diff-label" pointer-events="none">`);
    out.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="16" rx="8" fill="${fill}" opacity="0.96" stroke="rgba(17,19,24,.65)" stroke-width="1"/>`,
    );
    out.push(
      `<text x="${(x + w / 2).toFixed(1)}" y="${(y + 11.5).toFixed(1)}" text-anchor="middle" font="800 10px/1 'JetBrains Mono',monospace" fill="${contrastText(fill)}" font-size="10" font-weight="800">${esc(label)}</text>`,
    );
    out.push(`</g>`);
  };

  // Crop the canvas to the routes actually in use. The network is fixed
  // geometry on a 1400x800 board, so a plan with four projects left roughly a
  // quarter of the map as empty margin — measured on a 676px-wide pane: 65
  // units of nothing above the first line and 120 below the last, about 90px
  // of dead height directly under a headline that is competing for the same
  // space. The padding covers what is drawn AROUND a route: station labels
  // above, the line badge and the end marker below.
  const ROUTE_PAD_TOP = 58;
  const ROUTE_PAD_BOTTOM = 46;
  const usedYs = lines.flatMap(line => (line.route || []).map(pt => pt.y)).filter(Number.isFinite);
  // The board is as tall as the lanes in use, which is more than the eight
  // lanes' worth once a plan has more projects than that. Clamping to a fixed
  // 800 here would have cropped the very lines the board grew for.
  const boardH = Math.max(SVG_H, usedYs.length ? Math.max(...usedYs) + ROUTE_PAD_BOTTOM : 0);
  const viewY = usedYs.length ? clamp(Math.min(...usedYs) - ROUTE_PAD_TOP, 0, boardH) : 0;
  const viewH = usedYs.length ? clamp(Math.max(...usedYs) + ROUTE_PAD_BOTTOM - viewY, 120, boardH - viewY) : boardH;
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${viewY.toFixed(0)} ${SVG_W} ${viewH.toFixed(0)}" style="display:block;width:100%;height:auto;max-width:100%" preserveAspectRatio="xMidYMin meet">`,
  );

  // ── Styles ──────────────────────────────────────────────────────────────────
  // Construction-tape pattern for the diff trails — base colour stays amber
  // (past) / blue (future) so the semantic colour story is intact, but the
  // diagonal dark stripes make the trail readable on top of any line colour
  // the project palette might happen to use.
  // `paint-order: stroke fill` on the station abbrev so the text gets a dark
  // outline that survives whichever route colour sits underneath it.
  // Construction-tape stripes — simple alternating bands at 22° so they are
  // never parallel to any common route segment (0°, 45°, 90°, 135°). Single
  // direction, no cross-hatch giraffe, but always crosses the line.
  out.push(`<defs>
    <pattern id="rm-past-stripe" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
      <rect width="12" height="12" fill="#f59e0b"/>
      <rect x="6" width="6" height="12" fill="#fde68a"/>
    </pattern>
    <pattern id="rm-plan-stripe" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
      <rect width="12" height="12" fill="#3b82f6"/>
      <rect x="6" width="6" height="12" fill="#bfdbfe"/>
    </pattern>
  </defs>`);
  out.push(`<style>
    .rm-badge{font:800 13px/1 'JetBrains Mono',monospace;fill:#fff;letter-spacing:.04em}
    .rm-line-name{font:600 16px/1 var(--font);letter-spacing:.005em}
    .rm-line-retired{opacity:.4}
    .rm-line-retired .rm-line-name{font-weight:500}
    .rm-abbrev{font:600 12px/1 var(--mono);fill:var(--tx2);paint-order:stroke fill;stroke:var(--bg2);stroke-width:3.6;stroke-linejoin:round}
    /* No fill override for active / done — the inline fill attribute
       (project colour) drives readability. The previous .rm-abbrev-active
       white-fill rule cascaded over the inline colour and made the label
       white-on-white over the bg-coloured halo. */
    .rm-abbrev-done{opacity:.65}
    .rm-risk-tri{fill:var(--st-risk,#e08276)}
    g[style*=cursor]{pointer-events:all}
  </style>`);

  const ctx = {
    lines,
    nodeMap,
    labels,
    diffMode,
    scenarioIds,
    pastProgress,
    newSet,
    doneInWindow,
    changedInWindow,
    horizonIdSet,
    horizonOn,
    futureProgress,
    hasFuture,
    expandedLegendIds,
    stationLabelPlacement,
    renderLaneDeltaLabel,
  };
  renderRouteLines(out, ctx);
  renderStations(out, ctx);
  renderProgressOverlays(out, ctx);
  renderTrains(out, ctx);

  out.push(`</svg>`);

  renderLegend(out, ctx);
  return out.join('');
}
