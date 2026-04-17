const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const DAY = 864e5;

const PAD_X = 18;
const PAD_Y = 12;
const LEFT_GUTTER = 236;
const RIGHT_PAD = 48;
const AXIS_H = 58;
const ROW_H = 128;
const BADGE_W = 168;
const BADGE_H = 34;
const MONTH_W = 54;

const LINE_W = 5;
const MAJOR_R = 5.5;
const MINOR_R = 3.1;
const SPREAD_GAP = 28;
const MAJOR_LABEL_GAP = 18;
const MINOR_DOT_OFF = 17;
const MINOR_STEP = 12;
const ROUTE_DROP = 40;
const MAX_MINOR_PER_ROOT = 4;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parentId = id => id.split('.').slice(0, -1).join('.');
const depthOf = id => id.split('.').length;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const truncate = (text, len) => !text ? '' : text.length > len ? `${text.slice(0, len - 1)}...` : text;

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(+date)) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function monthIndex(date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function monthCountInclusive(start, end) {
  return monthIndex(end) - monthIndex(start) + 1;
}

function monthStartsBetween(start, end) {
  const ticks = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    ticks.push(new Date(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return ticks;
}

function compareByTime(a, b) {
  const ad = a.anchorDate ? +a.anchorDate : Infinity;
  const bd = b.anchorDate ? +b.anchorDate : Infinity;
  if (ad !== bd) return ad - bd;
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

function progressIndex(stations) {
  let idx = 0;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    if (station.allDone) idx = i + 1;
    else if (station.prog > 0) return i + station.prog;
    else return idx;
  }
  return idx;
}

function progressX(stations, idx, startX, fallbackX) {
  if (!stations.length || idx <= 0) return startX;
  if (idx >= stations.length) return fallbackX ?? stations[stations.length - 1].x;
  const floor = Math.floor(idx);
  const frac = idx - floor;
  if (floor === 0) return startX + (stations[0].x - startX) * frac;
  const from = stations[floor - 1];
  const to = stations[floor];
  return from.x + (to.x - from.x) * frac;
}

function spreadStations(stations, minGap, minX, maxX) {
  if (stations.length < 2) return stations.map(station => ({ ...station, x: station.rawX }));
  const sorted = [...stations].sort((a, b) => a.rawX - b.rawX || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const placed = [];
  let cluster = [];

  const flush = () => {
    if (!cluster.length) return;
    if (cluster.length === 1) {
      placed.push({ ...cluster[0], x: cluster[0].rawX });
      cluster = [];
      return;
    }
    const center = cluster.reduce((sum, station) => sum + station.rawX, 0) / cluster.length;
    const start = clamp(center - ((cluster.length - 1) * minGap) / 2, minX, maxX - (cluster.length - 1) * minGap);
    cluster.forEach((station, index) => placed.push({ ...station, x: start + index * minGap }));
    cluster = [];
  };

  sorted.forEach(station => {
    if (!cluster.length || station.rawX - cluster[cluster.length - 1].rawX < minGap) cluster.push(station);
    else {
      flush();
      cluster.push(station);
    }
  });
  flush();
  return placed.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function buildMeta(tree, childMap, nodeMap, schedMap, stats) {
  const ordered = [...tree].sort((a, b) => depthOf(b.id) - depthOf(a.id) || b.id.localeCompare(a.id));
  const leafIdsById = {};
  const result = {};

  ordered.forEach(node => {
    const children = childMap[node.id] || [];
    const leafIds = children.length
      ? children.flatMap(child => leafIdsById[child.id] || [])
      : [node.id];

    leafIdsById[node.id] = leafIds;

    let done = 0;
    let earliestStart = null;
    let latestEnd = null;

    leafIds.forEach(id => {
      if (nodeMap[id]?.status === 'done') done++;
      const sched = schedMap[id];
      const start = toDate(sched?.startD || nodeMap[id]?.pinnedStart || nodeMap[id]?.decideBy || nodeMap[id]?.date);
      const end = toDate(sched?.endD || nodeMap[id]?.date || nodeMap[id]?.pinnedStart || nodeMap[id]?.decideBy);
      if (start && (!earliestStart || start < earliestStart)) earliestStart = start;
      if (end && (!latestEnd || end > latestEnd)) latestEnd = end;
    });

    const ownDate = toDate(node.pinnedStart || node.decideBy || node.date);
    if (!earliestStart && ownDate) earliestStart = ownDate;
    if (!latestEnd && ownDate) latestEnd = ownDate;

    const progressPct = stats?.[node.id]?._progress ?? (leafIds.length ? Math.round(done / leafIds.length * 100) : 0);
    result[node.id] = {
      total: leafIds.length,
      done,
      prog: clamp(progressPct / 100, 0, 1),
      allDone: leafIds.length > 0 && done === leafIds.length,
      earliestStart,
      latestEnd,
      hasChildren: children.length > 0,
    };
  });

  return result;
}

function pickFeaturedMinors(minorNodes, meta) {
  if (!minorNodes.length) return { visible: [], hidden: 0 };
  const doneNodes = minorNodes.filter(node => meta[node.id]?.allDone);
  const activeNodes = minorNodes.filter(node => !meta[node.id]?.allDone && (meta[node.id]?.prog || 0) > 0);
  const futureNodes = minorNodes.filter(node => !meta[node.id]?.allDone && !(meta[node.id]?.prog > 0));

  const picked = [];
  const seen = new Set();
  const push = node => {
    if (!node || seen.has(node.id) || picked.length >= MAX_MINOR_PER_ROOT) return;
    seen.add(node.id);
    picked.push(node);
  };

  doneNodes.slice(-1).forEach(push);
  activeNodes.slice(0, 2).forEach(push);
  futureNodes.slice(0, 2).forEach(push);
  if (!picked.length) minorNodes.slice(0, MAX_MINOR_PER_ROOT).forEach(push);

  return {
    visible: picked.sort((a, b) => {
      const ad = meta[a.id]?.earliestStart || meta[a.id]?.latestEnd;
      const bd = meta[b.id]?.earliestStart || meta[b.id]?.latestEnd;
      if (ad && bd && +ad !== +bd) return ad - bd;
      if (ad) return -1;
      if (bd) return 1;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    }),
    hidden: Math.max(0, minorNodes.length - picked.length),
  };
}

export function computeRoadmapModel({ tree, scheduled, stats, now = new Date() }) {
  const nodeMap = Object.fromEntries(tree.map(node => [node.id, node]));
  const childMap = {};
  tree.forEach(node => {
    const pid = parentId(node.id);
    if (!childMap[pid]) childMap[pid] = [];
    childMap[pid].push(node);
  });
  const schedMap = scheduled ? Object.fromEntries(scheduled.map(item => [item.id, item])) : {};
  const meta = buildMeta(tree, childMap, nodeMap, schedMap, stats);

  const roots = tree.filter(node => !node.id.includes('.'));
  if (!roots.length) return null;

  const buildStation = (node, kind, fallbackDate) => {
    const info = meta[node.id] || {};
    const anchorDate = info.earliestStart
      || toDate(node.pinnedStart)
      || toDate(node.decideBy)
      || toDate(node.date)
      || info.latestEnd
      || fallbackDate;
    const endDate = info.latestEnd
      || toDate(node.date)
      || toDate(node.decideBy)
      || toDate(node.pinnedStart)
      || anchorDate;

    return {
      id: node.id,
      name: node.name,
      parentId: parentId(node.id),
      kind,
      anchorDate,
      endDate: endDate && endDate >= anchorDate ? endDate : anchorDate,
      prog: info.prog || 0,
      done: info.done || 0,
      total: info.total || 0,
      allDone: !!info.allDone,
      depth: depthOf(node.id),
    };
  };

  const lines = roots.map((root, rootIndex) => {
    const descendants = tree.filter(node => node.id.startsWith(root.id + '.'));
    const rootInfo = meta[root.id] || {};

    const majorNodes = descendants
      .filter(node => depthOf(node.id) === 2)
      .sort((a, b) => compareByTime({
        id: a.id,
        anchorDate: meta[a.id]?.earliestStart || meta[a.id]?.latestEnd || toDate(a.pinnedStart) || toDate(a.decideBy) || toDate(a.date),
      }, {
        id: b.id,
        anchorDate: meta[b.id]?.earliestStart || meta[b.id]?.latestEnd || toDate(b.pinnedStart) || toDate(b.decideBy) || toDate(b.date),
      }));

    const relevantMinorNodes = descendants
      .filter(node => depthOf(node.id) === 3)
      .filter(node => {
        const info = meta[node.id] || {};
        return info.earliestStart || info.latestEnd || info.prog > 0 || info.done > 0 || node.best > 0 || (node.deps || []).length > 0;
      })
      .sort((a, b) => compareByTime({
        id: a.id,
        anchorDate: meta[a.id]?.earliestStart || meta[a.id]?.latestEnd || toDate(a.pinnedStart) || toDate(a.decideBy) || toDate(a.date),
      }, {
        id: b.id,
        anchorDate: meta[b.id]?.earliestStart || meta[b.id]?.latestEnd || toDate(b.pinnedStart) || toDate(b.decideBy) || toDate(b.date),
      }));

    const { visible: minorNodes, hidden: hiddenMinorCount } = pickFeaturedMinors(relevantMinorNodes, meta);

    let syntheticDate = addDays(rootInfo.latestEnd || rootInfo.earliestStart || toDate(now), 21);
    const nextFallbackDate = () => {
      const date = syntheticDate;
      syntheticDate = addDays(syntheticDate, 28);
      return date;
    };

    const majorStations = majorNodes.map(node => buildStation(node, 'major', nextFallbackDate()));
    const minorStations = minorNodes.map(node => buildStation(node, 'minor', nextFallbackDate()));
    const timeline = [...majorStations, ...minorStations].sort(compareByTime);
    if (!timeline.length) return null;

    const currentStation = timeline.find(station => station.prog > 0 && !station.allDone)
      || timeline.find(station => !station.allDone)
      || timeline[timeline.length - 1];
    const currentIndex = timeline.findIndex(station => station.id === currentStation?.id);
    const nextStations = currentIndex >= 0
      ? timeline.slice(currentIndex + 1).filter(station => !station.allDone).slice(0, 2)
      : [];

    const rootLatest = rootInfo.latestEnd || timeline.reduce((max, station) => !max || station.endDate > max ? station.endDate : max, null);
    const rootEarliest = rootInfo.earliestStart || timeline.reduce((min, station) => !min || station.anchorDate < min ? station.anchorDate : min, null);
    const rootStats = stats?.[root.id];
    const atRisk = root.date && rootStats?._endD && rootStats._endD > new Date(root.date);

    return {
      root,
      color: PALETTE[rootIndex % PALETTE.length],
      progress: rootInfo.prog || 0,
      atRisk,
      hiddenMinorCount,
      timeline,
      majorStations,
      minorStations,
      earliestDate: rootEarliest,
      latestDate: rootLatest,
      currentStation,
      nextStations,
    };
  }).filter(Boolean);

  if (!lines.length) return null;

  const today = toDate(now);
  const allDates = [];
  lines.forEach(line => {
    if (line.earliestDate) allDates.push(line.earliestDate);
    if (line.latestDate) allDates.push(line.latestDate);
    line.timeline.forEach(station => {
      if (station.anchorDate) allDates.push(station.anchorDate);
      if (station.endDate) allDates.push(station.endDate);
    });
    if (line.root.date) allDates.push(toDate(line.root.date));
  });
  allDates.push(today);

  const minDate = addDays(new Date(Math.min(...allDates.map(date => +date))), -14);
  const maxDate = addDays(new Date(Math.max(...allDates.map(date => +date))), 14);
  const months = monthStartsBetween(minDate, maxDate);
  const timelineW = Math.max(820, monthCountInclusive(minDate, maxDate) * MONTH_W);
  const svgW = LEFT_GUTTER + timelineW + RIGHT_PAD;
  const svgH = AXIS_H + lines.length * ROW_H + PAD_Y;
  const span = Math.max(+maxDate - +minDate, DAY);
  const xAt = date => LEFT_GUTTER + ((+date - +minDate) / span) * timelineW;

  const monthTicks = months.map(date => ({
    date,
    x: xAt(date),
    label: MONTHS[date.getMonth()],
    year: String(date.getFullYear()),
    isQuarter: date.getMonth() % 3 === 0,
    isYearStart: date.getMonth() === 0,
  }));

  const todayX = xAt(today);
  const positionedLines = lines.map((line, index) => {
    const rowTop = AXIS_H + index * ROW_H;
    const rawStations = line.timeline.map(station => ({
      ...station,
      rawX: xAt(station.anchorDate),
      rawEndX: xAt(station.endDate),
    }));
    const spaced = spreadStations(rawStations, SPREAD_GAP, LEFT_GUTTER + 8, svgW - RIGHT_PAD - 8);
    const major = spaced.filter(station => station.kind === 'major').sort((a, b) => a.x - b.x || a.id.localeCompare(b.id, undefined, { numeric: true }));
    const minor = spaced.filter(station => station.kind === 'minor').sort((a, b) => a.x - b.x || a.id.localeCompare(b.id, undefined, { numeric: true }));

    const parentSide = {};
    const lastMajorXBySide = { [-1]: -Infinity, [1]: -Infinity };
    const laneBySide = { [-1]: 0, [1]: 0 };
    const majorPlaced = major.map((station, stationIndex) => {
      const preferredSide = stationIndex % 2 === 0 ? -1 : 1;
      const gap = station.x - lastMajorXBySide[preferredSide];
      laneBySide[preferredSide] = gap < 92 ? laneBySide[preferredSide] + 1 : 0;
      lastMajorXBySide[preferredSide] = station.x;
      parentSide[station.id] = preferredSide;
      return {
        ...station,
        side: preferredSide,
        lane: laneBySide[preferredSide],
        endX: Math.max(station.x + 10, station.rawEndX),
      };
    });

    const lastMinorXBySide = { [-1]: -Infinity, [1]: -Infinity };
    const minorLaneBySide = { [-1]: 0, [1]: 0 };
    const minorPlaced = minor.map((station, stationIndex) => {
      const preferredSide = parentSide[station.parentId] != null ? -parentSide[station.parentId] : (stationIndex % 2 === 0 ? -1 : 1);
      const gap = station.x - lastMinorXBySide[preferredSide];
      minorLaneBySide[preferredSide] = gap < 74 ? minorLaneBySide[preferredSide] + 1 : 0;
      lastMinorXBySide[preferredSide] = station.x;
      return {
        ...station,
        side: preferredSide,
        lane: minorLaneBySide[preferredSide],
        endX: Math.max(station.x + 8, station.rawEndX),
      };
    });

    const majorIds = new Set(majorPlaced.map(station => station.id));
    const currentStation = spaced.find(station => station.id === line.currentStation?.id)
      || majorPlaced.find(station => station.id === line.currentStation?.id)
      || minorPlaced.find(station => station.id === line.currentStation?.id)
      || line.currentStation;
    const nextIds = new Set(line.nextStations.map(station => station.id));

    const trackEndX = Math.max(
      xAt(line.latestDate),
      ...majorPlaced.map(station => station.endX),
      ...minorPlaced.map(station => station.x)
    );
    const trackStartX = LEFT_GUTTER;
    const lineLength = Math.max(trackEndX - trackStartX, 96);
    const bendStartX = trackStartX + Math.min(Math.max(lineLength * 0.18, 48), Math.max(48, lineLength - 72));
    const bendEndX = trackStartX + Math.min(Math.max(lineLength * 0.34, bendStartX - trackStartX + 44), Math.max(bendStartX - trackStartX + 44, lineLength - 8));
    const routeStartY = rowTop + 28;
    const routeEndY = routeStartY + ROUTE_DROP;
    const routeYAt = x => {
      if (x <= bendStartX) return routeStartY;
      if (x >= bendEndX) return routeEndY;
      const ratio = (x - bendStartX) / Math.max(bendEndX - bendStartX, 1);
      return routeStartY + (routeEndY - routeStartY) * ratio;
    };
    const buildRoutePathToX = x => {
      const cappedX = clamp(x, trackStartX, trackEndX);
      const pts = [{ x: trackStartX, y: routeStartY }];
      if (cappedX <= bendStartX) {
        pts.push({ x: cappedX, y: routeStartY });
        return pts;
      }
      pts.push({ x: bendStartX, y: routeStartY });
      if (cappedX <= bendEndX) {
        pts.push({ x: cappedX, y: routeYAt(cappedX) });
        return pts;
      }
      pts.push({ x: bendEndX, y: routeEndY });
      pts.push({ x: cappedX, y: routeEndY });
      return pts;
    };
    const pathFromPoints = points => points.map((pt, ptIndex) => `${ptIndex ? 'L' : 'M'}${pt.x},${pt.y}`).join(' ');
    const routePath = pathFromPoints(buildRoutePathToX(trackEndX));

    const majorAdjusted = majorPlaced.map((station, stationIndex) => {
      const routeY = routeYAt(station.x);
      return {
        ...station,
        routeY,
        labelY: routeY + station.side * (MAJOR_LABEL_GAP + station.lane * 12),
      };
    });

    const minorAdjusted = minorPlaced.map(station => {
      const routeY = routeYAt(station.x);
      const dotY = routeY + station.side * (MINOR_DOT_OFF + station.lane * MINOR_STEP);
      return {
        ...station,
        routeY,
        dotY,
        labelY: dotY + station.side * 10,
      };
    });

    const trainIdx = progressIndex(majorAdjusted);
    const trainX = line.progress > 0
      ? progressX(majorAdjusted, trainIdx, trackStartX, line.progress >= 1 ? trackEndX : undefined)
      : null;
    const progressPath = trainX != null ? pathFromPoints(buildRoutePathToX(trainX)) : '';
    const trainY = trainX != null ? routeYAt(trainX) : null;

    return {
      ...line,
      rowTop,
      routeStartY,
      routeEndY,
      bendStartX,
      bendEndX,
      routePath,
      progressPath,
      majorStations: majorAdjusted,
      minorStations: minorAdjusted,
      trackStartX,
      trackEndX,
      trainX,
      trainY,
      currentStationId: currentStation?.id || null,
      nextIds,
      majorIds,
      currentStation,
    };
  });

  return {
    svgW,
    svgH,
    todayX,
    monthTicks,
    lines: positionedLines,
  };
}

export function renderRoadmapSvg(args) {
  const model = computeRoadmapModel(args);
  if (!model?.lines.length) return '';

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${model.svgW} ${model.svgH}" style="display:block;width:100%;height:auto;max-width:100%" preserveAspectRatio="xMidYMin meet">`);
  out.push(`<style>
    .rm-month{font:600 8px/1 'Inter',system-ui,sans-serif;fill:var(--tx3,#7a839a)}
    .rm-year{font:700 8px/1 'JetBrains Mono',monospace;fill:var(--tx2,#4a5268)}
    .rm-badge-id{font:800 10px/1 'JetBrains Mono',monospace;fill:#fff}
    .rm-badge-name{font:600 7.5px/1 'Inter',system-ui,sans-serif;fill:rgba(255,255,255,.92)}
    .rm-badge-pct{font:800 11px/1 'JetBrains Mono',monospace;fill:#fff}
    .rm-summary-k{font:700 6.8px/1 'JetBrains Mono',monospace;fill:var(--tx3,#7a839a);text-transform:uppercase}
    .rm-summary-v{font:600 7.3px/1.1 'Inter',system-ui,sans-serif;fill:var(--tx,#1a1e2a)}
    .rm-major{font:600 8.5px/1.1 'Inter',system-ui,sans-serif;fill:var(--tx,#1a1e2a)}
    .rm-major-next{fill:var(--tx,#1a1e2a);font-weight:700}
    .rm-major-current{font-weight:800}
    .rm-minor{font:500 7px/1.1 'Inter',system-ui,sans-serif;fill:var(--tx2,#4a5268)}
    .rm-minor-next{font-weight:700}
    .rm-done{fill:var(--tx3,#7a839a);text-decoration:line-through}
    .rm-count{font:400 6.5px/1 'JetBrains Mono',monospace;fill:var(--tx3,#7a839a)}
    .rm-today{font:700 7px/1 'JetBrains Mono',monospace;fill:var(--tx2,#4a5268)}
    .rm-more{font:700 7px/1 'JetBrains Mono',monospace;fill:var(--tx3,#7a839a)}
    .rm-risk{font:700 7px/1 'JetBrains Mono',monospace;fill:var(--re,#dc2626)}
    .rm-now{font:700 6.4px/1 'JetBrains Mono',monospace;fill:var(--ac,#2563eb)}
    .rm-next{font:700 6.4px/1 'JetBrains Mono',monospace;fill:var(--am,#d97706)}
  </style>`);

  model.monthTicks.forEach((tick, index) => {
    out.push(`<g>`);
    out.push(`<line x1="${tick.x}" y1="${AXIS_H - 8}" x2="${tick.x}" y2="${model.svgH - PAD_Y}" stroke="${tick.isQuarter ? 'rgba(59,130,246,.28)' : 'rgba(148,163,184,.12)'}" stroke-width="${tick.isQuarter ? 1.2 : 1}"/>`);
    out.push(`<text x="${tick.x + 4}" y="18" class="rm-month">${esc(tick.label)}</text>`);
    if (tick.isYearStart || index === 0) out.push(`<text x="${tick.x + 4}" y="29" class="rm-year">${esc(tick.year)}</text>`);
    out.push(`</g>`);
  });

  out.push(`<line x1="${model.todayX}" y1="12" x2="${model.todayX}" y2="${model.svgH - PAD_Y}" stroke="rgba(16,185,129,.45)" stroke-width="1.2" stroke-dasharray="4 4"/>`);
  out.push(`<text x="${model.todayX + 6}" y="11" class="rm-today">TODAY</text>`);

  model.lines.forEach(line => {
    const currentSummary = line.currentStationId
      ? truncate(line.currentStation?.name || line.timeline.find(station => station.id === line.currentStationId)?.name || '', 24)
      : 'Complete';
    const nextSummary = line.nextStations.length
      ? line.nextStations.map(station => truncate(station.name, 14)).join('  |  ')
      : line.progress >= 1 ? 'Line complete' : 'Awaiting next stop';

    out.push(`<g>`);
    out.push(`<rect x="${PAD_X}" y="${line.routeStartY - BADGE_H / 2}" width="${BADGE_W}" height="${BADGE_H}" rx="7" fill="${line.color}"/>`);
    out.push(`<text x="${PAD_X + 9}" y="${line.routeStartY - 4}" class="rm-badge-id">${esc(line.root.id)}</text>`);
    out.push(`<text x="${PAD_X + 9}" y="${line.routeStartY + 8}" class="rm-badge-name">${esc(truncate(line.root.name, 24))}</text>`);
    out.push(`<text x="${PAD_X + BADGE_W - 9}" y="${line.routeStartY + 4}" text-anchor="end" class="rm-badge-pct">${Math.round(line.progress * 100)}%</text>`);

    out.push(`<text x="${PAD_X}" y="${line.routeStartY + 31}" class="rm-summary-k">Now</text>`);
    out.push(`<text x="${PAD_X + 28}" y="${line.routeStartY + 31}" class="rm-summary-v">${esc(currentSummary)}</text>`);
    out.push(`<text x="${PAD_X}" y="${line.routeStartY + 43}" class="rm-summary-k">Next</text>`);
    out.push(`<text x="${PAD_X + 28}" y="${line.routeStartY + 43}" class="rm-summary-v">${esc(nextSummary)}</text>`);

    out.push(`<path d="${line.routePath}" stroke="rgba(148,163,184,.38)" stroke-width="${LINE_W}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (line.progressPath) out.push(`<path d="${line.progressPath}" stroke="${line.color}" stroke-width="${LINE_W}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

    line.majorStations.forEach(station => {
      const isDone = station.allDone;
      const isCurrent = station.id === line.currentStationId && !isDone;
      const isNext = line.nextIds.has(station.id);
      const labelClass = [
        'rm-major',
        isDone ? 'rm-done' : '',
        isCurrent ? 'rm-major-current' : '',
        !isCurrent && isNext ? 'rm-major-next' : '',
      ].filter(Boolean).join(' ');
      if (isDone) {
        out.push(`<circle cx="${station.x}" cy="${station.routeY}" r="${MAJOR_R}" fill="${line.color}"/>`);
      } else if (isCurrent) {
        out.push(`<circle cx="${station.x}" cy="${station.routeY}" r="${MAJOR_R + 3}" fill="${line.color}" opacity="0.14"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.routeY}" r="${MAJOR_R + 1}" fill="var(--bg,#111318)"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.routeY}" r="${MAJOR_R}" fill="var(--bg2,#171a21)" stroke="${line.color}" stroke-width="2.4"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.routeY}" r="${MAJOR_R - 2.1}" fill="${line.color}"/>`);
      } else {
        out.push(`<circle cx="${station.x}" cy="${station.routeY}" r="${MAJOR_R + 1}" fill="var(--bg,#111318)"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.routeY}" r="${MAJOR_R}" fill="var(--bg2,#171a21)" stroke="${isNext ? line.color : 'var(--b3,#b0b8c8)'}" stroke-width="${isNext ? 2.2 : 2}"/>`);
      }
      out.push(`<text x="${station.x}" y="${station.labelY}" text-anchor="middle" class="${labelClass}" dominant-baseline="middle" fill="${isCurrent || isNext ? line.color : ''}">${esc(truncate(station.name, 22))}</text>`);
      if (station.total > 0) out.push(`<text x="${station.x}" y="${station.labelY + 9}" text-anchor="middle" class="rm-count">${station.done}/${station.total}</text>`);
      if (isCurrent) out.push(`<text x="${station.x}" y="${station.labelY - 10}" text-anchor="middle" class="rm-now">NOW</text>`);
      else if (isNext) out.push(`<text x="${station.x}" y="${station.labelY - 10}" text-anchor="middle" class="rm-next">NEXT</text>`);
    });

    line.minorStations.forEach(station => {
      const isDone = station.allDone;
      const isCurrent = station.id === line.currentStationId && !isDone;
      const isNext = line.nextIds.has(station.id);
      const labelAnchor = station.x > (model.svgW - RIGHT_PAD - 100) ? 'end' : 'start';
      const labelX = labelAnchor === 'end' ? station.x - 8 : station.x + 8;
      const labelClass = [
        'rm-minor',
        isDone ? 'rm-done' : '',
        !isDone && (isCurrent || isNext) ? 'rm-minor-next' : '',
      ].filter(Boolean).join(' ');
      out.push(`<line x1="${station.x}" y1="${station.routeY}" x2="${station.x}" y2="${station.dotY}" stroke="${line.color}" stroke-width="2" opacity="${isCurrent || isNext ? 0.56 : 0.34}" stroke-linecap="round"/>`);
      if (isDone) out.push(`<circle cx="${station.x}" cy="${station.dotY}" r="${MINOR_R}" fill="${line.color}"/>`);
      else if (isCurrent) {
        out.push(`<circle cx="${station.x}" cy="${station.dotY}" r="${MINOR_R + 2.2}" fill="${line.color}" opacity="0.14"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.dotY}" r="${MINOR_R + 0.7}" fill="var(--bg,#111318)"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.dotY}" r="${MINOR_R}" fill="var(--bg2,#171a21)" stroke="${line.color}" stroke-width="1.5"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.dotY}" r="1.65" fill="${line.color}"/>`);
      } else {
        out.push(`<circle cx="${station.x}" cy="${station.dotY}" r="${MINOR_R + 0.7}" fill="var(--bg,#111318)"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.dotY}" r="${MINOR_R}" fill="var(--bg2,#171a21)" stroke="${isNext ? line.color : 'var(--b3,#b0b8c8)'}" stroke-width="${isNext ? 1.5 : 1.2}"/>`);
      }
      out.push(`<text x="${labelX}" y="${station.labelY}" text-anchor="${labelAnchor}" class="${labelClass}" dominant-baseline="middle" fill="${isCurrent || isNext ? line.color : ''}">${esc(truncate(station.name, 18))}</text>`);
      if (isCurrent) out.push(`<text x="${labelX}" y="${station.labelY - 9}" text-anchor="${labelAnchor}" class="rm-now">NOW</text>`);
      else if (isNext) out.push(`<text x="${labelX}" y="${station.labelY - 9}" text-anchor="${labelAnchor}" class="rm-next">NEXT</text>`);
    });

    if (line.trainX != null && line.trainY != null && line.progress < 1) {
      out.push(`<circle cx="${line.trainX}" cy="${line.trainY}" r="${MAJOR_R + 4}" fill="${line.color}" opacity="0.18">`);
      out.push(`<animate attributeName="r" values="${MAJOR_R + 2};${MAJOR_R + 5};${MAJOR_R + 2}" dur="2.2s" repeatCount="indefinite"/>`);
      out.push(`</circle>`);
      out.push(`<circle cx="${line.trainX}" cy="${line.trainY}" r="${MAJOR_R + 1.5}" fill="${line.color}"/>`);
      out.push(`<circle cx="${line.trainX}" cy="${line.trainY}" r="${MAJOR_R - 1.7}" fill="#fff"/>`);
    }

    if (line.hiddenMinorCount > 0) out.push(`<text x="${line.trackEndX + 10}" y="${line.routeEndY - 10}" class="rm-more">+${line.hiddenMinorCount}</text>`);
    if (line.atRisk) out.push(`<text x="${line.trackEndX + 10}" y="${line.routeEndY + 11}" class="rm-risk">AT RISK</text>`);
    out.push(`</g>`);
  });

  out.push(`</svg>`);
  return out.join('');
}
