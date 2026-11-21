import { esc, formatPercentNumber, formatProgressDelta, progressToRouteT, MIN_VISIBLE_PROGRESS_DELTA } from './format.js';
import { ROUTE_T_LO, ROUTE_T_HI } from './board.js';
import { partialPath, pointAtFraction } from './geometry.js';
import { TRAIN_W, TRAIN_H } from './glyphs.js';
import { tipData } from './markup.js';

export function renderProgressOverlays(out, { lines, newSet, diffMode, renderLaneDeltaLabel, pastProgress, hasFuture, futureProgress }) {
  // ── Progress overlays — drawn AFTER every base route + station so they
  // can never be covered by a later route's faded backbone. Striped past
  // trail, striped plan trail, animated dots — all on top.
  lines.forEach(line => {
    const { route, trainT } = line;
    const isNewLine = newSet.has(line.root.id);
    if (isNewLine) {
      const trailD = trainT > ROUTE_T_LO ? partialPath(route, trainT) : null;
      if (trailD) {
        out.push(
          `<path d="${esc(trailD)}" fill="none" stroke="url(#rm-past-stripe)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" pointer-events="none"/>`,
        );
        if (diffMode && (line.progress || 0) > MIN_VISIBLE_PROGRESS_DELTA) {
          renderLaneDeltaLabel(route, ROUTE_T_LO, trainT, formatProgressDelta(line.progress || 0), '#f59e0b');
        }
      }
      return;
    }
    let pastT = null;
    let deltaProgressForTrail = 0;
    if (Object.prototype.hasOwnProperty.call(pastProgress, line.root.id)) {
      const pastPct = Math.max(0, Math.min(pastProgress[line.root.id] || 0, line.progress || 0));
      deltaProgressForTrail = Math.max(0, (line.progress || 0) - pastPct);
      pastT = Math.min(progressToRouteT(pastPct), line.trainT);
    }
    if (pastT != null) {
      let trailStartT = pastT;
      // If the train is station-gated and the raw progress still moved, the
      // true old/new train positions can collapse to the same pixel. Keep a
      // small striped segment immediately behind the train so the diff is not
      // reduced to a floating number with no visible rail movement.
      if (line.trainT - trailStartT <= MIN_VISIBLE_PROGRESS_DELTA && deltaProgressForTrail > 0.005) {
        const minVisualTrail = Math.min(0.05, Math.max(0.018, deltaProgressForTrail * (ROUTE_T_HI - ROUTE_T_LO)));
        trailStartT = Math.max(ROUTE_T_LO, line.trainT - minVisualTrail);
      }
      const trailD = line.trainT - trailStartT > MIN_VISIBLE_PROGRESS_DELTA ? partialPath(route, trainT, trailStartT) : null;
      if (trailD) {
        out.push(
          `<path d="${esc(trailD)}" fill="none" stroke="url(#rm-past-stripe)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" pointer-events="none"/>`,
        );
        out.push(`<circle r="4" fill="#fff" stroke="#f59e0b" stroke-width="1.5" pointer-events="none">`);
        out.push(`<animateMotion dur="3.2s" repeatCount="indefinite" path="${esc(trailD)}"/>`);
        out.push(`</circle>`);
        if (diffMode && deltaProgressForTrail > MIN_VISIBLE_PROGRESS_DELTA) {
          renderLaneDeltaLabel(route, trailStartT, trainT, formatProgressDelta(deltaProgressForTrail), '#f59e0b');
        }
      }
    }
    if (hasFuture && Object.prototype.hasOwnProperty.call(futureProgress, line.root.id)) {
      const futurePct = Math.max(0, Math.min(0.99, futureProgress[line.root.id] || 0));
      const fT = progressToRouteT(futurePct);
      if (futurePct - (line.progress || 0) > MIN_VISIBLE_PROGRESS_DELTA) {
        const planD = partialPath(route, fT, trainT);
        if (planD) {
          out.push(
            `<path d="${esc(planD)}" fill="none" stroke="url(#rm-plan-stripe)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" pointer-events="none"/>`,
          );
          out.push(`<circle r="3.5" fill="#fff" stroke="#3b82f6" stroke-width="1.5" pointer-events="none">`);
          out.push(`<animateMotion dur="4.2s" repeatCount="indefinite" path="${esc(planD)}"/>`);
          out.push(`</circle>`);
          renderLaneDeltaLabel(route, trainT, fT, formatProgressDelta(futurePct - (line.progress || 0)), '#3b82f6');
        }
      }
    }
  });
}

export function renderTrains(out, { lines, labels, newSet, pastProgress, hasFuture, futureProgress }) {
  // ── Trains ── drawn last so they appear on top of everything ───────────────
  lines.forEach((line, lineIdx) => {
    const { color, trainT, trainPt, progress } = line;
    // A finished line used to lose its train, which is the one thing that made
    // finished hard to see: an empty line reads the same whether the work is
    // all done or has not started, and the only difference left was a slightly
    // dimmer colour. The train stays and stands at the terminus — which is
    // what "arrived" looks like on a map with trains on it. It does stop
    // pulsing: a project that is finished is not asking for attention.
    const arrived = progress >= 1;
    if (trainT <= 0 && !arrived) return;

    const pct = formatPercentNumber(progress);
    const lTrain = labels.train || 'Train';
    const lCurrentPos = (labels.currentPos || 'Current position: {0}% of route').replace('{0}', pct);
    const lArrived = labels.arrived || 'Arrived — every work package done';
    const lAtRisk = labels.atRisk || 'AT RISK';
    const trainTip = tipData({
      kind: 'line',
      id: line.root.id,
      name: line.root.name,
      color,
      glyph: '🚆',
      badge: lTrain,
      note: arrived ? lArrived : lCurrentPos,
      atRisk: line.atRisk ? lAtRisk : null,
    });
    const tx = trainPt.x.toFixed(1),
      ty = trainPt.y.toFixed(1);
    const halfW = TRAIN_W / 2,
      halfH = TRAIN_H / 2;
    // The train stands for the project's position, so clicking it opens the
    // project — same reason as the stations above: it offers a pointer.
    out.push(
      `<g id="rm-train-${lineIdx}" style="cursor:pointer" pointer-events="all" data-item-id="${esc(line.root.id)}" data-tip="${esc(trainTip)}">`,
    );
    if (!arrived) {
      // Halo / pulse glow
      out.push(`<circle cx="${tx}" cy="${ty}" r="16" fill="${color}" opacity="0.15">`);
      out.push(`<animate attributeName="r" values="13;18;13" dur="2.4s" repeatCount="indefinite"/>`);
      out.push(`<animate attributeName="opacity" values="0.22;0.06;0.22" dur="2.4s" repeatCount="indefinite"/>`);
      out.push(`</circle>`);
    }
    // A rounded rectangle rather than a circle, so the train is never mistaken
    // for a station — and bigger than one, because it is the thing you look
    // for first on a line.
    out.push(
      `<rect x="${(+tx - halfW).toFixed(1)}" y="${(+ty - halfH).toFixed(1)}" width="${TRAIN_W}" height="${TRAIN_H}" rx="4.5" fill="${color}" stroke="var(--bg,#111318)" stroke-width="1.8"/>`,
    );
    // Window slits — two small rectangles like train windows. An arrived train
    // keeps them: replacing them with a tick made the car unrecognisable as a
    // train, which is the one thing it has to stay. The tick is a badge ON it
    // instead, the way a station wears one.
    out.push(`<rect x="${(+tx - 8).toFixed(1)}" y="${(+ty - 4).toFixed(1)}" width="6" height="3.4" rx="0.7" fill="#fff" opacity="0.95"/>`);
    out.push(`<rect x="${(+tx + 2).toFixed(1)}" y="${(+ty - 4).toFixed(1)}" width="6" height="3.4" rx="0.7" fill="#fff" opacity="0.95"/>`);
    if (arrived) {
      const bx = +tx + halfW - 2,
        by = +ty - halfH + 1;
      out.push(
        `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="6.4" fill="var(--st-done,#6fbf8a)" stroke="var(--bg,#111318)" stroke-width="1.6"/>`,
      );
      out.push(
        `<path d="M${(bx - 2.9).toFixed(1)} ${(by + 0.1).toFixed(1)} l 2 2.1 l 3.7 -4.2" fill="none" stroke="var(--bg,#111318)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
    out.push(`</g>`);
    // Ghost train marker at the past position — only when there's a real gap
    if (Object.prototype.hasOwnProperty.call(pastProgress, line.root.id) && !newSet.has(line.root.id)) {
      const pastPct = Math.max(0, Math.min(pastProgress[line.root.id] || 0, line.progress || 0));
      const pastT = Math.min(progressToRouteT(pastPct), line.trainT);
      if (line.trainT - pastT > MIN_VISIBLE_PROGRESS_DELTA) {
        const gp = pointAtFraction(line.route, pastT);
        const gx = gp.x.toFixed(1),
          gy = gp.y.toFixed(1);
        out.push(`<g pointer-events="none" data-tip="${esc(labels.prevPos || 'Previous position')}">`);
        out.push(
          `<rect x="${(+gx - 9).toFixed(1)}" y="${(+gy - 6).toFixed(1)}" width="18" height="12" rx="3" fill="${color}" opacity="0.32" stroke="${color}" stroke-width="1" stroke-dasharray="2,2"/>`,
        );
        out.push(`</g>`);
      }
    }
    // Planned ghost-train ahead of the live train. Blue colour
    // intentionally mirrors the ▶ Plan filter chip so the Diff/Ist/Plan
    // story reads as a coherent palette.
    if (hasFuture && Object.prototype.hasOwnProperty.call(futureProgress, line.root.id)) {
      const futurePct = Math.max(0, Math.min(0.99, futureProgress[line.root.id] || 0));
      const fT = progressToRouteT(futurePct);
      if (futurePct - (line.progress || 0) > MIN_VISIBLE_PROGRESS_DELTA) {
        const fp = pointAtFraction(line.route, fT);
        const fx = fp.x.toFixed(1),
          fy = fp.y.toFixed(1);
        out.push(`<g pointer-events="none" data-tip="${esc(labels.plannedPos || 'Planned position')}">`);
        out.push(
          `<rect x="${(+fx - 9).toFixed(1)}" y="${(+fy - 6).toFixed(1)}" width="18" height="12" rx="3" fill="rgba(59,130,246,.18)" stroke="#3b82f6" stroke-width="1.4" stroke-dasharray="3,2"/>`,
        );
        out.push(`</g>`);
      }
    }
  });
}
