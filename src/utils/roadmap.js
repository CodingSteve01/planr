const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const DAY = 864e5;

const PAD_X = 18;
const PAD_Y = 24;
const LEFT_GUTTER = 220;
const RIGHT_PAD = 96;
const AXIS_H = 52;
const ROW_H = 128;
const BADGE_W = 168;
const BADGE_H = 34;
const MONTH_W = 58;
const MIN_LINE_LEN = 80;

const LINE_W = 5;
const MAJOR_R = 6;
const MINOR_R = 2.8;
const TRAIN_R = 9;
const LABEL_ANGLE = 38;
const LABEL_DY = 13;
const MIN_LABEL_GAP = 26;

const MAX_MINOR_PER_ROOT = 5;

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
    const lineY = rowTop + 42;
    const minX = LEFT_GUTTER + 8;
    const maxX = svgW - RIGHT_PAD - 8;

    const rawStart = line.earliestDate ? xAt(line.earliestDate) : minX;
    const rawEnd = line.latestDate ? xAt(line.latestDate) : rawStart + MIN_LINE_LEN;
    const lineStartX = clamp(rawStart, minX, maxX - MIN_LINE_LEN);
    const lineEndX = clamp(Math.max(rawEnd, lineStartX + MIN_LINE_LEN), lineStartX + MIN_LINE_LEN, maxX);

    const placeStation = station => ({
      ...station,
      x: clamp(xAt(station.anchorDate), lineStartX, lineEndX),
      y: lineY,
    });

    const majors = line.majorStations.map(placeStation).sort((a, b) => a.x - b.x);
    const minors = line.minorStations.map(placeStation).sort((a, b) => a.x - b.x);

    const currentId = line.currentStation?.id || null;
    const nextIds = new Set(line.nextStations.map(station => station.id));

    // Label visibility: majors → labels with collision check (keep important ones).
    // minors → label only if it's the current station or a NEXT station.
    let prevMajorLabelX = -Infinity;
    majors.forEach(st => {
      const important = st.id === currentId || nextIds.has(st.id) || st.allDone === false;
      // Important labels always win collisions against later labels.
      if (st.x - prevMajorLabelX >= MIN_LABEL_GAP) {
        st.showLabel = true;
        prevMajorLabelX = st.x;
      } else if (important && st.id === currentId) {
        st.showLabel = true;
        prevMajorLabelX = st.x;
      } else {
        st.showLabel = false;
      }
    });

    minors.forEach(st => {
      st.showLabel = st.id === currentId || nextIds.has(st.id);
    });

    // Train position: progress along the SORTED major stations.
    // done stations are behind, current station is reached proportionally.
    let trainX = null;
    const doneMajors = majors.filter(m => m.allDone);
    const nextMajor = majors.find(m => !m.allDone);
    if (!majors.length) {
      trainX = line.progress > 0 ? lineStartX + (lineEndX - lineStartX) * line.progress : null;
    } else if (!nextMajor) {
      trainX = lineEndX;
    } else {
      const prevX = doneMajors.length ? doneMajors[doneMajors.length - 1].x : lineStartX;
      const segProg = nextMajor.prog || (nextMajor.id === currentId ? 0.1 : 0);
      trainX = prevX + (nextMajor.x - prevX) * segProg;
    }

    return {
      ...line,
      rowTop,
      lineY,
      lineStartX,
      lineEndX,
      majorStations: majors,
      minorStations: minors,
      trainX,
      currentStationId: currentId,
      nextIds,
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
    .rm-month{font:600 9px/1 'Inter',system-ui,sans-serif;fill:var(--tx3,#7a839a)}
    .rm-year{font:700 9px/1 'JetBrains Mono',monospace;fill:var(--tx2,#4a5268)}
    .rm-badge-id{font:800 11px/1 'JetBrains Mono',monospace;fill:#fff}
    .rm-badge-name{font:600 8px/1 'Inter',system-ui,sans-serif;fill:rgba(255,255,255,.92)}
    .rm-badge-pct{font:800 12px/1 'JetBrains Mono',monospace;fill:#fff}
    .rm-major{font:600 9.5px/1.1 'Inter',system-ui,sans-serif;fill:var(--tx2,#cbd5e1)}
    .rm-major-active{font-weight:800}
    .rm-minor{font:500 8px/1.1 'Inter',system-ui,sans-serif;fill:var(--tx3,#94a3b8)}
    .rm-done{fill:var(--tx3,#64748b);text-decoration:line-through}
    .rm-count{font:500 7px/1 'JetBrains Mono',monospace;fill:var(--tx3,#7a839a)}
    .rm-today{font:700 8px/1 'JetBrains Mono',monospace;fill:var(--tx2,#4a5268)}
    .rm-more{font:700 8px/1 'JetBrains Mono',monospace;fill:var(--tx3,#7a839a)}
    .rm-risk{font:700 8px/1 'JetBrains Mono',monospace;fill:var(--re,#dc2626)}
    .rm-tag{font:700 7px/1 'JetBrains Mono',monospace;letter-spacing:.06em}
  </style>`);

  model.monthTicks.forEach((tick, index) => {
    out.push(`<g>`);
    out.push(`<line x1="${tick.x}" y1="${AXIS_H - 12}" x2="${tick.x}" y2="${model.svgH - PAD_Y}" stroke="${tick.isQuarter ? 'rgba(59,130,246,.22)' : 'rgba(148,163,184,.08)'}" stroke-width="${tick.isQuarter ? 1.2 : 1}"/>`);
    out.push(`<text x="${tick.x + 5}" y="20" class="rm-month">${esc(tick.label)}</text>`);
    if (tick.isYearStart || index === 0) out.push(`<text x="${tick.x + 5}" y="33" class="rm-year">${esc(tick.year)}</text>`);
    out.push(`</g>`);
  });

  out.push(`<line x1="${model.todayX}" y1="16" x2="${model.todayX}" y2="${model.svgH - PAD_Y}" stroke="rgba(16,185,129,.55)" stroke-width="1.3" stroke-dasharray="4 4"/>`);
  out.push(`<text x="${model.todayX + 6}" y="14" class="rm-today">TODAY</text>`);

  model.lines.forEach(line => {
    out.push(`<g>`);

    // Badge (fixed, left gutter)
    const badgeY = line.lineY - BADGE_H / 2;
    out.push(`<rect x="${PAD_X}" y="${badgeY}" width="${BADGE_W}" height="${BADGE_H}" rx="7" fill="${line.color}"/>`);
    out.push(`<text x="${PAD_X + 10}" y="${badgeY + 13}" class="rm-badge-id">${esc(line.root.id)}</text>`);
    out.push(`<text x="${PAD_X + 10}" y="${badgeY + 26}" class="rm-badge-name">${esc(truncate(line.root.name, 24))}</text>`);
    out.push(`<text x="${PAD_X + BADGE_W - 10}" y="${badgeY + 22}" text-anchor="end" class="rm-badge-pct">${Math.round(line.progress * 100)}%</text>`);

    // Full gray line (the whole route)
    out.push(`<line x1="${line.lineStartX}" y1="${line.lineY}" x2="${line.lineEndX}" y2="${line.lineY}" stroke="rgba(148,163,184,.32)" stroke-width="${LINE_W}" stroke-linecap="round"/>`);

    // Coloured "traveled" segment up to train
    if (line.trainX != null && line.trainX > line.lineStartX) {
      out.push(`<line x1="${line.lineStartX}" y1="${line.lineY}" x2="${line.trainX}" y2="${line.lineY}" stroke="${line.color}" stroke-width="${LINE_W}" stroke-linecap="round"/>`);
    }

    // Station & label rendering. Majors first (labels below line), minors above.
    line.majorStations.forEach(station => {
      const isDone = station.allDone;
      const isCurrent = station.id === line.currentStationId && !isDone;
      const isNext = line.nextIds.has(station.id);

      // Dot
      if (isDone) {
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MAJOR_R}" fill="${line.color}"/>`);
      } else if (isCurrent) {
        // Current station becomes the train hub — render below with train.
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MAJOR_R + 1}" fill="var(--bg,#111318)"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MAJOR_R}" fill="var(--bg2,#171a21)" stroke="${line.color}" stroke-width="2.4"/>`);
      } else {
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MAJOR_R + 1}" fill="var(--bg,#111318)"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MAJOR_R}" fill="var(--bg2,#171a21)" stroke="${isNext ? line.color : 'var(--b3,#8898b0)'}" stroke-width="${isNext ? 2.2 : 1.8}"/>`);
      }

      // Label (angled 38° CW under the line, growing down-right)
      if (station.showLabel) {
        const lx = station.x + 3;
        const ly = station.y + LABEL_DY;
        const labelClass = [
          'rm-major',
          isDone ? 'rm-done' : '',
          (isCurrent || isNext) ? 'rm-major-active' : '',
        ].filter(Boolean).join(' ');
        const labelFill = isCurrent || isNext ? ` fill="${line.color}"` : '';
        out.push(`<text x="${lx}" y="${ly}" transform="rotate(${LABEL_ANGLE} ${lx} ${ly})" text-anchor="start" class="${labelClass}"${labelFill}>${esc(truncate(station.name, 20))}</text>`);

        // NOW / NEXT tag above station
        if (isCurrent) out.push(`<text x="${station.x}" y="${station.y - 12}" text-anchor="middle" class="rm-tag" fill="${line.color}">NOW</text>`);
        else if (isNext) out.push(`<text x="${station.x}" y="${station.y - 12}" text-anchor="middle" class="rm-tag" fill="${line.color}">NEXT</text>`);
      }
    });

    // Minor stations: small dots above the line, labels only for NOW/NEXT
    line.minorStations.forEach(station => {
      const isDone = station.allDone;
      const isCurrent = station.id === line.currentStationId && !isDone;
      const isNext = line.nextIds.has(station.id);

      if (isDone) {
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MINOR_R}" fill="${line.color}" opacity=".85"/>`);
      } else if (isCurrent) {
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MINOR_R + 0.7}" fill="var(--bg,#111318)"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MINOR_R}" fill="${line.color}"/>`);
      } else {
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MINOR_R + 0.7}" fill="var(--bg,#111318)"/>`);
        out.push(`<circle cx="${station.x}" cy="${station.y}" r="${MINOR_R}" fill="var(--bg2,#171a21)" stroke="${isNext ? line.color : 'var(--b3,#8898b0)'}" stroke-width="1.4"/>`);
      }

      if (station.showLabel) {
        // Minors with labels go ABOVE the line so they don't clash with major labels below
        const lx = station.x + 3;
        const ly = station.y - LABEL_DY;
        const labelClass = `rm-minor ${isDone ? 'rm-done' : ''}`.trim();
        const labelFill = isCurrent || isNext ? ` fill="${line.color}"` : '';
        out.push(`<text x="${lx}" y="${ly}" transform="rotate(-${LABEL_ANGLE} ${lx} ${ly})" text-anchor="start" class="${labelClass}"${labelFill}>${esc(truncate(station.name, 20))}</text>`);
        if (isCurrent) out.push(`<text x="${station.x}" y="${station.y + 18}" text-anchor="middle" class="rm-tag" fill="${line.color}">NOW</text>`);
        else if (isNext) out.push(`<text x="${station.x}" y="${station.y + 18}" text-anchor="middle" class="rm-tag" fill="${line.color}">NEXT</text>`);
      }
    });

    // Train: bold coloured disc at the current position
    if (line.trainX != null && line.progress < 1 && line.trainX > line.lineStartX) {
      out.push(`<circle cx="${line.trainX}" cy="${line.lineY}" r="${TRAIN_R + 4}" fill="${line.color}" opacity="0.22">`);
      out.push(`<animate attributeName="r" values="${TRAIN_R + 2};${TRAIN_R + 6};${TRAIN_R + 2}" dur="2.4s" repeatCount="indefinite"/>`);
      out.push(`</circle>`);
      out.push(`<circle cx="${line.trainX}" cy="${line.lineY}" r="${TRAIN_R}" fill="${line.color}" stroke="var(--bg,#111318)" stroke-width="2.2"/>`);
      out.push(`<circle cx="${line.trainX}" cy="${line.lineY}" r="${TRAIN_R - 4}" fill="#fff"/>`);
    }

    if (line.hiddenMinorCount > 0) out.push(`<text x="${line.lineEndX + 8}" y="${line.lineY - 4}" class="rm-more">+${line.hiddenMinorCount}</text>`);
    if (line.atRisk) out.push(`<text x="${line.lineEndX + 8}" y="${line.lineY + 10}" class="rm-risk">AT RISK</text>`);

    out.push(`</g>`);
  });

  out.push(`</svg>`);
  return out.join('');
}
