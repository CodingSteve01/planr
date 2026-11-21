import { leafProgress } from '../scheduler.js';
import { esc, truncate, clamp, formatPercentNumber, formatProgressDelta, contrastText } from './format.js';
import { statusIcon } from './glyphs.js';

export function renderLegend(
  out,
  {
    lines,
    labels,
    nodeMap,
    pastProgress,
    newSet,
    hasFuture,
    futureProgress,
    doneInWindow,
    changedInWindow,
    diffMode,
    expandedLegendIds,
    horizonOn,
    horizonIdSet,
  },
) {
  // ── Legend (HTML below SVG) ────────────────────────────────────────────────
  // Custom bin-packing instead of CSS multi-column: we know each block's
  // approximate height up-front, so we run First-Fit-Decreasing across a
  // fixed column count. Yields a tightly packed layout where short blocks
  // slot into the leftover vertical space of every column, not just the
  // last one. Falls back to a single column on narrow screens via media
  // wrapping at the flex layer.
  const ROW_H = 22,
    EXTRA_H = 14,
    HEADER_H = 28,
    BLOCK_MARGIN = 14;
  const estimateBlockHeight = line => {
    const stations = [...line.majorStations, ...line.minorStations];
    let h = HEADER_H;
    for (const st of stations) {
      h += ROW_H;
      if (st.clusterSize > 1) {
        const extras = (st.clusterItems || []).filter(c => c.id !== st.id);
        h += extras.length * EXTRA_H;
      }
    }
    return h + BLOCK_MARGIN;
  };

  // Render each line's HTML once, paired with its estimated height + a
  // stable sort key (line index in `lines`) so column order within a bin
  // matches the natural project order.
  const blockHeights = new Map();
  const linesForLegend = lines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => line.majorStations.length + line.minorStations.length > 0);
  linesForLegend.forEach(({ line, idx }) => {
    blockHeights.set(idx, estimateBlockHeight(line));
  });

  // FFD bin-pack: tallest block goes into the currently-shortest column.
  // Target 3 columns on wide screens — fits SVG_W of 1200 with ~200–300px
  // per legend column. Bins are returned as ordered arrays of line indices.
  const COLS = 3;
  const bins = Array.from({ length: COLS }, () => ({ items: [], h: 0 }));
  const packOrder = [...linesForLegend].sort((a, b) => blockHeights.get(b.idx) - blockHeights.get(a.idx));
  for (const { idx } of packOrder) {
    let best = bins[0];
    for (let i = 1; i < bins.length; i++) if (bins[i].h < best.h) best = bins[i];
    best.items.push(idx);
    best.h += blockHeights.get(idx);
  }
  // Inside each bin: re-sort by natural line index so projects appear in
  // their original creation order top-to-bottom.
  bins.forEach(b => b.items.sort((a, b2) => a - b2));

  out.push(`<div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:20px;padding:0 4px;align-items:flex-start">`);

  bins.forEach(bin => {
    if (!bin.items.length) return;
    out.push(`<div style="flex:1 1 220px;min-width:200px;max-width:340px">`);
    bin.items.forEach(lineIdx => {
      const line = lines[lineIdx];
      out.push(renderLegendBlock(line));
    });
    out.push(`</div>`);
  });

  out.push(`</div>`);

  // Helper: render one project's legend block as an HTML string. Closes over
  // every piece of state the inline rendering needs (labels, sets, nodeMap).
  function renderLineProgressPills(line) {
    const currentProgress = clamp(line.progress || 0, 0, 1);
    const currentPct = formatPercentNumber(currentProgress);
    const textParts = [`${currentPct}%`];
    const titleParts = [`Jetzt ${currentPct}%`];
    if (Object.prototype.hasOwnProperty.call(pastProgress, line.root.id) && !newSet.has(line.root.id)) {
      const pastProgressValue = clamp(pastProgress[line.root.id] || 0, 0, 1);
      const pastPct = formatPercentNumber(pastProgressValue);
      const deltaProgress = currentProgress - pastProgressValue;
      const deltaLabel = formatProgressDelta(deltaProgress);
      if (deltaLabel !== '0%') textParts.push(deltaLabel);
      titleParts.push(`Vorher ${pastPct}%`, `Differenz: ${deltaLabel}`);
    }
    if (hasFuture && Object.prototype.hasOwnProperty.call(futureProgress, line.root.id)) {
      const futureProgressValue = clamp(futureProgress[line.root.id] || 0, 0, 1);
      const futurePct = formatPercentNumber(futureProgressValue);
      const deltaProgress = futureProgressValue - currentProgress;
      const deltaLabel = formatProgressDelta(deltaProgress);
      textParts.push(`→${futurePct}%`);
      titleParts.push(`Plan ${futurePct}%`);
      if (deltaLabel !== '0%') titleParts.push(`Plan-Differenz: ${deltaLabel}`);
    }
    return `<span title="${esc(titleParts.join(' · '))}" style="font:800 9px/1 'JetBrains Mono',monospace;background:${line.color};color:${contrastText(line.color)};border-radius:3px;padding:2px 5px;white-space:nowrap;flex-shrink:0">${esc(textParts.join(' '))}</span>`;
  }

  function renderLegendBlock(line) {
    const block = [];
    const allStations = [...line.majorStations, ...line.minorStations].sort((a, b) => a.t - b.t);
    if (!allStations.length) return '';
    const stationMoved = station => (station.clusterItems || []).some(c => doneInWindow.has(c.id) || changedInWindow.has(c.id));
    const stationCurrent = station => station.id === line.currentId && !station.allDone;
    const compactStations = diffMode
      ? allStations.filter(station => station.allDone || stationCurrent(station) || stationMoved(station))
      : allStations;
    const isLegendExpanded = expandedLegendIds.has(line.root.id);
    const visibleStations = diffMode && !isLegendExpanded ? compactStations : allStations;
    const extrasOf = station => (station.clusterSize > 1 ? (station.clusterItems || []).filter(c => c.id !== station.id) : []);
    const movedOrLive = c => {
      const n = nodeMap[c.id];
      return doneInWindow.has(c.id) || changedInWindow.has(c.id) || n?.status === 'done' || n?.status === 'wip';
    };
    // A station names a stop; what sits under it is a drill-down. Collapsed,
    // a line lists its stations and nothing else — otherwise a line with two
    // hundred leaves buries the map under its own legend. Diff mode keeps
    // whatever moved in the window visible even while collapsed.
    const visibleExtrasOf = station => (isLegendExpanded ? extrasOf(station) : diffMode ? extrasOf(station).filter(movedOrLive) : []);
    const rowsExpanded = allStations.reduce((n, st) => n + 1 + extrasOf(st).length, 0);
    const rowsNow = visibleStations.reduce((n, st) => n + 1 + visibleExtrasOf(st).length, 0);
    const hiddenRowCount = rowsExpanded - rowsNow;
    // Line-level diff: two pills in the header — completions (✓) and
    // progress-only movements (▲). Either can be zero; the row stays quiet
    // when both are.
    const lineDoneCount =
      doneInWindow.size > 0
        ? allStations.reduce((sum, st) => sum + (st.clusterItems || []).filter(c => doneInWindow.has(c.id)).length, 0)
        : 0;
    const lineProgCount =
      changedInWindow.size > 0
        ? allStations.reduce(
            (sum, st) => sum + (st.clusterItems || []).filter(c => changedInWindow.has(c.id) && !doneInWindow.has(c.id)).length,
            0,
          )
        : 0;
    block.push(`<div style="margin-bottom:14px">`);
    // Line header
    block.push(`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">`);
    block.push(`<span style="display:inline-block;width:28px;height:12px;border-radius:3px;background:${line.color}"></span>`);
    block.push(`<span style="font:700 11px/1 'JetBrains Mono',monospace;color:${line.color}">${esc(line.root.id)}</span>`);
    block.push(
      `<span style="font:500 10px/1 'Inter',system-ui,sans-serif;color:var(--tx2,#94a3b8);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;flex:1 1 auto">${esc(truncate(line.root.name, 22))}</span>`,
    );
    block.push(renderLineProgressPills(line));
    if (lineDoneCount > 0 || lineProgCount > 0) {
      const statusParts = [];
      const titleParts = [];
      if (lineDoneCount > 0) {
        statusParts.push(`<span style="color:#10b981">✓ ${lineDoneCount}</span>`);
        titleParts.push(`${labels.tipDone || 'Done in window'}: ${lineDoneCount}`);
      }
      if (lineProgCount > 0) {
        statusParts.push(`<span style="color:#f59e0b">▲ ${lineProgCount}</span>`);
        titleParts.push(`${labels.tipProgress || 'Progress in window'}: ${lineProgCount}`);
      }
      block.push(
        `<span title="${esc(titleParts.join(' · '))}" style="font:800 9px/1 'JetBrains Mono',monospace;background:var(--bg3,#232830);border:1px solid var(--b2,#364456);border-radius:3px;padding:1px 5px;display:inline-flex;gap:5px;white-space:nowrap;flex-shrink:0">${statusParts.join('')}</span>`,
      );
    }
    block.push(`</div>`);

    // Station rows
    visibleStations.forEach(station => {
      const stProg = Math.max(0, Math.min(1, station.prog || 0));
      const stStatus = station.allDone ? 'done' : stProg > 0 ? 'wip' : 'open';
      const stIcon = statusIcon(stStatus, line.color, stProg, 13);
      const doneStyle = station.allDone ? 'text-decoration:line-through;opacity:.5' : '';
      const statusBadge = station.allDone ? '' : stProg > 0 ? ` ${Math.round(stProg * 100)}%` : ` ${station.done}/${station.total}`;
      // Same split per station: ✓-pill for done-in-window, ▲-pill for
      // progress-only edits. Row background lights up when either is non-zero.
      const stDoneItems = doneInWindow.size > 0 ? (station.clusterItems || []).filter(c => doneInWindow.has(c.id)) : [];
      const stProgItems =
        changedInWindow.size > 0 ? (station.clusterItems || []).filter(c => changedInWindow.has(c.id) && !doneInWindow.has(c.id)) : [];
      const stationDeltaPill =
        stDoneItems.length || stProgItems.length
          ? `<span style="margin-left:auto;display:inline-flex;gap:3px">${
              stDoneItems.length
                ? `<span style="font:700 9px/1 'JetBrains Mono',monospace;background:#10b981;color:#0a0a0a;border-radius:3px;padding:1px 4px">✓ ${stDoneItems.length}</span>`
                : ''
            }${
              stProgItems.length
                ? `<span style="font:700 9px/1 'JetBrains Mono',monospace;background:#f59e0b;color:#1a1a1a;border-radius:3px;padding:1px 4px">▲ ${stProgItems.length}</span>`
                : ''
            }</span>`
          : '';
      const rowBg = stDoneItems.length || stProgItems.length ? ';background:rgba(245,158,11,.10)' : '';

      const stInHorizon = !horizonOn || (station.clusterItems || []).some(c => horizonIdSet.has(c.id));
      const horizonDim = !stInHorizon ? ';opacity:.32' : '';
      block.push(
        `<div class="rm-legend-item" data-item-id="${esc(station.id)}" style="display:flex;align-items:center;gap:6px;margin-top:6px;margin-bottom:2px;cursor:pointer;border-radius:4px;padding:2px 3px;margin-left:-3px;margin-right:-3px${rowBg}${horizonDim}">`,
      );
      block.push(`<span style="flex-shrink:0;display:inline-flex;line-height:0">${stIcon}</span>`);
      block.push(
        `<span style="font:700 10px/1 'JetBrains Mono',monospace;color:${line.color};min-width:30px;${doneStyle}">${esc(station.abbrev)}</span>`,
      );
      block.push(
        `<span style="font:500 10px/1.2 'Inter',system-ui,sans-serif;color:var(--tx2,#94a3b8);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;${doneStyle}">${esc(truncate(station.name, 26))}${esc(statusBadge)}</span>`,
      );
      block.push(stationDeltaPill);
      block.push(`</div>`);

      // Cluster details — indented rows below, each with own icon+text centered, clickable
      if (station.clusterSize > 1) {
        const visibleExtras = visibleExtrasOf(station);
        visibleExtras.forEach(c => {
          const itemNode = nodeMap[c.id];
          const itemStatus = itemNode?.status === 'done' ? 'done' : itemNode?.status === 'wip' ? 'wip' : 'open';
          const itemProg = leafProgress(itemNode || c) / 100;
          const itemIcon = statusIcon(itemStatus, line.color, itemProg, 10);
          const itemStyle =
            itemStatus === 'done'
              ? 'text-decoration:line-through;opacity:.55'
              : itemStatus === 'wip'
                ? `color:${line.color}`
                : 'color:var(--tx2,#94a3b8)';
          const wentDone = doneInWindow.has(c.id);
          const wentProg = !wentDone && changedInWindow.has(c.id);
          const itemDiffPill = wentDone
            ? `<span style="margin-left:auto;font:700 8px/1 'JetBrains Mono',monospace;background:#10b981;color:#0a0a0a;border-radius:2px;padding:1px 3px">✓</span>`
            : wentProg
              ? `<span style="margin-left:auto;font:700 8px/1 'JetBrains Mono',monospace;background:#f59e0b;color:#1a1a1a;border-radius:2px;padding:1px 3px">▲</span>`
              : '';
          const itemRowBg = wentDone || wentProg ? ';background:rgba(245,158,11,.10)' : '';
          const itemHorizonDim = horizonOn && !horizonIdSet.has(c.id) ? ';opacity:.32' : '';
          block.push(
            `<div class="rm-legend-item" data-item-id="${esc(c.id)}" style="display:flex;align-items:center;gap:5px;padding:1px 3px 1px 36px;margin:0 -3px;border-radius:4px;cursor:pointer;${itemStyle}${itemRowBg}${itemHorizonDim}">`,
          );
          block.push(`<span style="flex-shrink:0;display:inline-flex;line-height:0">${itemIcon}</span>`);
          block.push(
            `<span style="font:400 9px/1.2 'Inter',system-ui,sans-serif;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(truncate(c.name, 24))}</span>`,
          );
          block.push(itemDiffPill);
          block.push(`</div>`);
        });
      }
    });

    if (hiddenRowCount > 0 || isLegendExpanded) {
      const toggleLabel = isLegendExpanded
        ? labels.showLess || 'Show fewer'
        : (labels.showMore || '+{0} more').replace('{0}', hiddenRowCount);
      block.push(
        `<button type="button" data-rm-toggle="${esc(line.root.id)}" style="margin-top:6px;padding:2px 5px;font:700 9px/1.2 'Inter',system-ui,sans-serif;color:var(--tx2,#cbd5e1);background:transparent;border:1px solid var(--b2,#364456);border-radius:4px;cursor:pointer">${esc(toggleLabel)}</button>`,
      );
    }

    block.push(`</div>`);
    return block.join('');
  }
}
