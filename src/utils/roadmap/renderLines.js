import { leafProgress } from '../scheduler.js';
import { esc, truncate, formatPercentNumber, contrastText } from './format.js';
import { SVG_W } from './board.js';
import { waypointsToPath, partialPath } from './geometry.js';
import { stationGlyph } from './glyphs.js';
import { tipData } from './markup.js';

export function renderRouteLines(out, { lines, labels, newSet }) {
  // ── Route lines ─────────────────────────────────────────────────────────────
  lines.forEach((line, lineIdx) => {
    const { route, color, reachedT } = line;
    const pathD = waypointsToPath(route);
    const progressD = reachedT > 0 ? partialPath(route, reachedT) : null;
    const gId = `rm-line-${lineIdx}`;

    // A finished or dropped project stays on the map — a finished one is part
    // of the picture, a dropped one has to stay visible so the decision can be
    // seen and taken back — but it stops competing with live work for
    // attention. One group-level opacity, so every part of the line dims
    // together and nothing has to know about it individually.
    const retiredG = line.retired ? ' class="rm-line-retired"' : '';

    out.push(`<g id="${gId}"${retiredG}>`);

    // Build the line-level tooltip so hovering anywhere on the route reveals
    // project id + name + progress, not just when the user finds the train.
    const lTrainHover = labels.train || 'Train';
    const linePct = formatPercentNumber(line.progress);
    const lineCurrentPos = (labels.currentPos || 'Effort-weighted progress: {0}%').replace('{0}', linePct);
    // The tooltip travels as data, not as markup: Roadmap.jsx renders it with
    // the same components as the rest of the app, and nothing hands an HTML
    // string to a live node. See components/shared/Roadmap.jsx.
    const lineTooltip = tipData({
      kind: 'line',
      id: line.root.id,
      name: line.root.name,
      color,
      badge: lTrainHover,
      note: lineCurrentPos,
      atRisk: line.atRisk ? labels.atRisk || 'AT RISK' : null,
    });

    // Invisible fat hit area so hovering anywhere along the route surfaces
    // the line tooltip — not only when the cursor lands on the train glyph.
    out.push(
      `<path d="${esc(pathD)}" fill="none" stroke="transparent" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" pointer-events="stroke" data-tip="${esc(lineTooltip)}" data-item-id="${esc(line.root.id)}" style="cursor:pointer"/>`,
    );

    // Full route (faded) — drawn first so progress overlays it
    // The route not yet travelled. It sat at 0.22, which made a project that
    // has barely started almost invisible — the map showed loudest what is
    // already done and whispered what is still ahead, which is the wrong way
    // round for a portfolio review. The track is now legible on its own, and
    // the travelled part is what stands out (full weight, on top of it) plus
    // the train marker. 0.42 is where the pale track still reads as a line
    // on the card surface without competing with the travelled portion.
    out.push(
      `<path d="${esc(pathD)}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.42" pointer-events="none"/>`,
    );

    // Traveled portion (full color)
    if (progressD) {
      out.push(
        `<path d="${esc(progressD)}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`,
      );
    }

    // Diff / Plan overlays moved out of this per-line loop — they're drawn
    // in a dedicated pass after all routes + stations so subsequent lines
    // can't paint over them. `isNewLine` still needed below for the
    // start-badge "⊕ NEU" sub-tag.
    const isNewLine = newSet.has(line.root.id);

    // ── Line badges at start and end ─────────────────────────────────────────
    const startPt = route[0];
    const endPt = route[route.length - 1];
    const badgeLabel = esc(line.root.id);
    const badgeRx = 5;
    const badgeH = 20;
    // Measure label width approximately (13px mono ≈ 8.5px per char)
    const labelLen = String(line.root.id).length;
    const badgeW = Math.max(28, labelLen * 9 + 12);

    // The project's NAME, above its own line. It used to live only in the
    // legend below the map as a two-letter badge you had to look up — so
    // reading the map meant looking down, matching a code, and looking back.
    // A metro map names its lines on the map.
    out.push(
      `<text x="${startPt.x - 30}" y="${startPt.y - 15}" class="rm-line-name" fill="var(--tx)">${esc(truncate(line.root.name, 42))}</text>`,
    );

    // Start badge (left-anchored from the start point)
    const sbx = startPt.x - badgeW - 8;
    const sby = startPt.y - badgeH / 2;
    out.push(`<rect x="${sbx}" y="${sby}" width="${badgeW}" height="${badgeH}" rx="${badgeRx}" fill="${color}"/>`);
    out.push(`<text x="${sbx + badgeW / 2}" y="${sby + 14}" text-anchor="middle" class="rm-badge">${badgeLabel}</text>`);
    // "NEU" sub-badge for lines that didn't exist at the cutoff
    if (isNewLine) {
      const nby = sby + badgeH + 2;
      out.push(`<rect x="${sbx}" y="${nby}" width="${badgeW}" height="14" rx="3" fill="#f59e0b"/>`);
      out.push(
        `<text x="${sbx + badgeW / 2}" y="${nby + 10.5}" text-anchor="middle" font="700 9px/1 'JetBrains Mono',monospace" fill="#1a1a1a" font-size="9" font-weight="700">⊕ NEU</text>`,
      );
    }

    // End badge (right of end point, unless near edge — then left)
    const ebx = endPt.x + 10;
    const eby = endPt.y - badgeH / 2;
    // The at-risk marker sits beside the badge, so the pair is clamped
    // together. It used to be clamped alone and the marker drawn at a fixed
    // offset past it, which put the triangle's left corner three pixels ON
    // the badge — over the line's own name.
    const riskW = line.atRisk ? badgeH + 8 : 0;
    const ebxClamped = Math.min(ebx, SVG_W - badgeW - riskW - 4);
    out.push(`<rect x="${ebxClamped}" y="${eby}" width="${badgeW}" height="${badgeH}" rx="${badgeRx}" fill="${color}"/>`);
    out.push(`<text x="${ebxClamped + badgeW / 2}" y="${eby + 14}" text-anchor="middle" class="rm-badge">${badgeLabel}</text>`);
    // A finished line says so at its terminus, in the same mark its reached
    // stations and its parked train wear. Dimming the whole line was the only
    // signal before, and dim reads as "inactive" rather than "done" — a
    // dropped project is dim too.
    if (line.allDoneUnderRoot) {
      const cx = ebxClamped + badgeW + 12;
      const cy = endPt.y;
      out.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="${color}"/>`);
      out.push(
        `<path d="M${(cx - 3.6).toFixed(1)} ${(cy + 0.2).toFixed(1)} l 2.6 2.7 l 4.6 -5.2" fill="none" stroke="${contrastText(color)}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }

    // ── AT RISK marker at the end ──────────────────────────────────────────
    // A rounded square the same height and radius as the ID badge it follows,
    // so the two read as one pair rather than a badge with a sticker on it.
    // It was a bare polygon with a 6px "!" typed into it, sized and positioned
    // by itself — which is what made it look stuck on.
    if (line.atRisk) {
      const rx0 = ebxClamped + badgeW + 8;
      const ry0 = endPt.y - badgeH / 2;
      const rcx = rx0 + badgeH / 2;
      out.push(
        `<rect x="${rx0.toFixed(1)}" y="${ry0.toFixed(1)}" width="${badgeH}" height="${badgeH}" rx="${badgeRx}" class="rm-risk-tri"/>`,
      );
      // A drawn warning mark: a stem and a dot, at the weight of the badge
      // letters next to it.
      out.push(
        `<path d="M${rcx.toFixed(1)} ${(endPt.y - 5.5).toFixed(1)} v 6" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/>`,
      );
      out.push(`<circle cx="${rcx.toFixed(1)}" cy="${(endPt.y + 4.6).toFixed(1)}" r="1.3" fill="#fff"/>`);
    }

    out.push(`</g>`);
  });
}

export function renderStations(
  out,
  { lines, nodeMap, changedInWindow, horizonOn, horizonIdSet, scenarioIds, diffMode, stationLabelPlacement },
) {
  // ── Stations ── drawn after all routes so dots sit on top ─────────────────
  lines.forEach((line, lineIdx) => {
    const { color, majorStations, currentId } = line;

    out.push(`<g id="rm-stations-${lineIdx}">`);

    // Major stations (r=6 white circle with colored border)
    majorStations.forEach(station => {
      const isDone = station.allDone;
      const isCurrent = station.id === currentId && !isDone;
      const stProg = Math.max(0, Math.min(1, station.prog || 0));
      const stStatus = isDone ? 'done' : stProg > 0 ? 'wip' : 'open';
      const tooltip = tipData({
        kind: 'station',
        color,
        abbrev: station.abbrev,
        name: station.name,
        status: stStatus,
        prog: stProg,
        count: isDone ? '✓' : stProg > 0 ? `${Math.round(stProg * 100)}%` : `${station.done}/${station.total}`,
        items: (station.clusterItems || []).map(c => {
          const node = nodeMap[c.id];
          return {
            name: c.name || c.id,
            status: node?.status === 'done' ? 'done' : node?.status === 'wip' ? 'wip' : 'open',
            prog: leafProgress(node || c) / 100,
          };
        }),
      });
      const cx = station.x.toFixed(1),
        cy = station.y.toFixed(1);

      // Did this station gain any movement in the diff window — either a
      // completion or a progress jump on a still-open task?
      const reachedInWindow = changedInWindow.size > 0 && (station.clusterItems || []).some(c => changedInWindow.has(c.id));
      // Horizon mute: station has no items inside the planning window. Lets
      // forward-looking presentations point at what's "in the next N months".
      const inHorizon = !horizonOn || (station.clusterItems || []).some(c => horizonIdSet.has(c.id));
      // `data-item-id` is what makes the pointer cursor honest: the click
      // handler in Roadmap.jsx looks for it, the legend rows underneath
      // carried it and the stations did not, so a station said it was
      // clickable and then swallowed the click. For a cluster this is the
      // station's own item — the same one its legend row opens.
      // `data-cluster-size` is the difference between "this is a task" and
      // "this is five tasks that finish in the same fortnight", which decides
      // which tooltip can honestly answer what is under the cursor.
      out.push(
        `<g class="rm-stop" style="cursor:pointer${!inHorizon ? ';opacity:.22' : ''}" pointer-events="all" data-item-id="${esc(station.id)}" data-cluster-size="${(station.clusterItems || []).length || 1}" data-tip="${esc(tooltip)}">`,
      );
      // Invisible larger hit area for tooltip
      out.push(`<circle cx="${cx}" cy="${cy}" r="14" fill="transparent" pointer-events="all"/>`);
      // Amber halo for stations reached in the diff window. Drawn before the
      // station glyph so it sits behind it.
      if (reachedInWindow) {
        out.push(`<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="#f59e0b" stroke-width="1.8" opacity="0.78"/>`);
      }
      // A scenario is on screen and it moves work at this station: the same
      // halo in the scenario's colour. A CSS variable on purpose — this mark
      // exists on screen only (the PDF path never passes `scenarioIds`), and
      // it has to follow the theme like the bar and the frame do.
      if (scenarioIds && (station.clusterItems || []).some(c => scenarioIds.has(c.id))) {
        out.push(
          `<circle class="rm-scenario-halo" cx="${cx}" cy="${cy}" r="10" fill="none" stroke="var(--sc)" stroke-width="2" stroke-dasharray="3 2"/>`,
        );
      }
      out.push(stationGlyph(cx, cy, color, { done: isDone, current: isCurrent }));
      out.push(`</g>`);

      // Abbreviation label
      const abbrevClass = isCurrent ? 'rm-abbrev rm-abbrev-active' : isDone ? 'rm-abbrev rm-abbrev-done' : 'rm-abbrev';
      const showLabel = !diffMode || isDone || isCurrent || reachedInWindow;
      const place = stationLabelPlacement.get(station.id);
      if (showLabel && place) {
        out.push(
          `<text x="${place.x.toFixed(1)}" y="${place.y.toFixed(1)}" text-anchor="${place.anchor}" class="${abbrevClass}" fill="${isDone ? color : isCurrent ? color : 'var(--tx3,#94a3b8)'}">${esc(station.abbrev)}</text>`,
        );
      }
    });

    // There is no second kind of station any more. Stops became work packages
    // (see "What a stop IS" above) and `minorStations` has been empty ever
    // since; the branch that drew them at r=6.5/7 was the other half of the
    // two-sizes problem and is gone with it. The field stays as an empty
    // array because the label placer and the collision pass both take the two
    // lists together.

    out.push(`</g>`);
  });
}
