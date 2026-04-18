// ─── Metro/Subway Roadmap Renderer ────────────────────────────────────────────
// Each project becomes a colored subway line. Stations are depth-2 milestones.
// Routes are pre-computed fixed shapes (like U-Bahn lines), assigned by duration.

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const DAY = 864e5;

// ─── Fixed metro route network (1400×800 canvas) ─────────────────────────────
// Each route is an array of {x,y} waypoints using 45° and 90° angles only.
const ROUTES = [
  // Route 0: long east-west with two bends (like U6 Berlin)
  [
    { x: 60, y: 680 }, { x: 220, y: 680 }, { x: 280, y: 620 }, { x: 520, y: 620 },
    { x: 580, y: 560 }, { x: 880, y: 560 }, { x: 940, y: 500 }, { x: 1180, y: 500 },
    { x: 1340, y: 500 },
  ],
  // Route 1: top-left to bottom-right long diagonal (like U7)
  [
    { x: 80, y: 80 }, { x: 200, y: 80 }, { x: 260, y: 140 }, { x: 420, y: 140 },
    { x: 480, y: 200 }, { x: 620, y: 200 }, { x: 680, y: 260 }, { x: 820, y: 260 },
    { x: 880, y: 320 }, { x: 1020, y: 320 }, { x: 1080, y: 380 }, { x: 1220, y: 380 },
    { x: 1280, y: 440 }, { x: 1340, y: 440 },
  ],
  // Route 2: vertical north-south with jog (like U8)
  [
    { x: 700, y: 40 }, { x: 700, y: 180 }, { x: 640, y: 240 }, { x: 640, y: 420 },
    { x: 700, y: 480 }, { x: 700, y: 620 }, { x: 700, y: 760 },
  ],
  // Route 3: medium east-west through center
  [
    { x: 280, y: 380 }, { x: 500, y: 380 }, { x: 560, y: 320 }, { x: 760, y: 320 },
    { x: 820, y: 380 }, { x: 1020, y: 380 },
  ],
  // Route 4: top-right sweeping to center-left (like U2)
  [
    { x: 1320, y: 60 }, { x: 1200, y: 60 }, { x: 1140, y: 120 }, { x: 980, y: 120 },
    { x: 920, y: 180 }, { x: 720, y: 180 }, { x: 660, y: 240 }, { x: 500, y: 240 },
    { x: 440, y: 300 }, { x: 280, y: 300 },
  ],
  // Route 5: bottom-left arc upward (like U3)
  [
    { x: 60, y: 520 }, { x: 200, y: 520 }, { x: 260, y: 460 }, { x: 420, y: 460 },
    { x: 480, y: 400 }, { x: 620, y: 400 }, { x: 660, y: 360 },
  ],
  // Route 6: short north-east diagonal (spur line)
  [
    { x: 880, y: 620 }, { x: 940, y: 560 }, { x: 1060, y: 560 }, { x: 1120, y: 500 },
    { x: 1240, y: 500 }, { x: 1300, y: 440 },
  ],
  // Route 7: small U-shape at left side
  [
    { x: 160, y: 320 }, { x: 160, y: 200 }, { x: 220, y: 140 }, { x: 400, y: 140 },
    { x: 460, y: 200 }, { x: 460, y: 320 },
  ],
];

// ─── Canvas dimensions ────────────────────────────────────────────────────────
const SVG_W = 1400;
const SVG_H = 800;

// ─── Helpers (preserved from original) ───────────────────────────────────────
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

  const MAX_MINOR_PER_ROOT = 5;
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

// ─── Metro-specific helpers ───────────────────────────────────────────────────

/** Compute total pixel length of a route (sum of all segment lengths). */
function routeLength(waypoints) {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/** Return the {x, y} point at fraction t (0–1) along the route. */
function pointAtFraction(waypoints, t) {
  if (waypoints.length === 1) return { ...waypoints[0] };
  const total = routeLength(waypoints);
  const target = clamp(t, 0, 1) * total;
  let traveled = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (traveled + segLen >= target || i === waypoints.length - 1) {
      const rem = target - traveled;
      const frac = segLen > 0 ? rem / segLen : 0;
      return {
        x: waypoints[i - 1].x + dx * frac,
        y: waypoints[i - 1].y + dy * frac,
      };
    }
    traveled += segLen;
  }
  return { ...waypoints[waypoints.length - 1] };
}

/** Build an SVG path `d` attribute from waypoints. */
function waypointsToPath(waypoints) {
  return waypoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/**
 * Build an SVG path `d` for the portion of a route from t=0 to t=fraction.
 * Splits at the exact fractional point and returns only the traveled portion.
 */
function partialPath(waypoints, fraction) {
  if (fraction <= 0) return null;
  const total = routeLength(waypoints);
  const target = clamp(fraction, 0, 1) * total;

  const parts = [`M ${waypoints[0].x} ${waypoints[0].y}`];
  let traveled = 0;

  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (traveled + segLen >= target) {
      const rem = target - traveled;
      const frac = segLen > 0 ? rem / segLen : 0;
      const ex = waypoints[i - 1].x + dx * frac;
      const ey = waypoints[i - 1].y + dy * frac;
      parts.push(`L ${ex} ${ey}`);
      break;
    }

    parts.push(`L ${waypoints[i].x} ${waypoints[i].y}`);
    traveled += segLen;

    if (traveled >= target) break;
  }

  return parts.join(' ');
}

/**
 * Simple string hash → integer (djb2-style).
 * Used to create stable route assignment based on root ID.
 */
function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Generate a short abbreviation for a station name (up to 3 chars).
 * Takes first letter of each word; falls back to first 2 chars.
 */
function makeAbbrev(name) {
  if (!name) return '?';
  // Strip parenthetical content, leading articles/prefixes, technical noise
  const clean = name
    .replace(/\(.*?\)/g, '')
    .replace(/\b(Ursache|Erstellung|Anpassung|Entwicklung|Umstellung|Integration|Domain|UI\s+Migration)\b:?\s*/gi, '')
    .trim();
  const words = (clean || name).trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    return words.slice(0, 3).map(w => w[0]?.toUpperCase() || '').join('').slice(0, 3);
  }
  return (words[0] || name).slice(0, 3).toUpperCase();
}

/**
 * Ensure abbreviations are unique within a line by appending numeric suffixes.
 */
function deduplicateAbbrevs(stations) {
  const counts = {};
  stations.forEach(st => {
    counts[st.abbrev] = (counts[st.abbrev] || 0) + 1;
  });
  const seen = {};
  stations.forEach(st => {
    if (counts[st.abbrev] > 1) {
      seen[st.abbrev] = (seen[st.abbrev] || 0) + 1;
      st.abbrev = st.abbrev + seen[st.abbrev];
    }
  });
}

// ─── computeRoadmapModel ──────────────────────────────────────────────────────

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
      abbrev: makeAbbrev(node.name),
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

  // Build raw lines (one per root)
  const rawLines = roots.map((root) => {
    const rootInfo = meta[root.id] || {};

    // ── Scheduled-item clustering ─────────────────────────────────────────────
    // Get all scheduled items for this root project
    const rootScheduled = (scheduled || []).filter(s => s.id.startsWith(root.id + '.'));
    const schedIds = new Set(rootScheduled.map(s => s.id));

    // Also include DONE leaf nodes that aren't in scheduled (scheduler skips done tasks).
    // Use their meta dates so they appear as "reached stations" on the map.
    const doneLeaves = tree
      .filter(n => n.id.startsWith(root.id + '.') && n.status === 'done')
      .filter(n => !schedIds.has(n.id) && !(childMap[n.id]?.length))  // leaf only, not already scheduled
      .map(n => {
        const m = meta[n.id] || {};
        const end = m.latestEnd || m.earliestStart || toDate(n.pinnedStart) || toDate(n.date);
        const start = m.earliestStart || end;
        return { id: n.id, name: n.name, status: 'done', startD: start, endD: end };
      })
      .filter(s => s.endD);

    // Combine scheduled + done leaves, sort by endD
    const sorted = [...rootScheduled.filter(s => s.endD), ...doneLeaves]
      .sort((a, b) => +new Date(a.endD) - +new Date(b.endD));

    // Cluster: group items whose endD are within 14 days of each other
    const CLUSTER_GAP_DAYS = 14;
    const clusters = [];
    let currentCluster = [];

    sorted.forEach(item => {
      if (!currentCluster.length) {
        currentCluster.push(item);
        return;
      }
      const lastEnd = new Date(currentCluster[currentCluster.length - 1].endD);
      const thisEnd = new Date(item.endD);
      if ((+thisEnd - +lastEnd) / 864e5 <= CLUSTER_GAP_DAYS) {
        currentCluster.push(item);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
      }
    });
    if (currentCluster.length) clusters.push(currentCluster);

    // Build stations from clusters
    const majorStations = clusters.map(cluster => {
      const representative = cluster.reduce((best, item) =>
        (item.name || '').length > (best.name || '').length ? item : best, cluster[0]);
      const earliestStart = cluster.reduce((min, item) => {
        const d = toDate(item.startD);
        return d && (!min || d < min) ? d : min;
      }, null);
      const latestEnd = cluster.reduce((max, item) => {
        const d = toDate(item.endD);
        return d && (!max || d > max) ? d : max;
      }, null);
      const done = cluster.filter(item => item.status === 'done').length;
      const total = cluster.length;

      return {
        id: representative.id,
        name: representative.name,
        abbrev: makeAbbrev(representative.name),
        clusterSize: cluster.length,
        clusterItems: cluster.map(c => ({ id: c.id, name: c.name })),
        kind: 'major',
        anchorDate: earliestStart || latestEnd,
        endDate: latestEnd || earliestStart,
        prog: total > 0 ? done / total : 0,
        done,
        total,
        allDone: done === total && total > 0,
        depth: 1,
      };
    });

    const minorStations = [];

    const timeline = [...majorStations].sort(compareByTime);

    // De-duplicate abbreviations within this line
    deduplicateAbbrevs(majorStations);

    const rootLatest = rootInfo.latestEnd || timeline.reduce((max, s) => !max || s.endDate > max ? s.endDate : max, null);
    const rootEarliest = rootInfo.earliestStart || timeline.reduce((min, s) => !min || s.anchorDate < min ? s.anchorDate : min, null);
    const rootStats = stats?.[root.id];
    const atRisk = root.date && rootStats?._endD && rootStats._endD > new Date(root.date);

    // Duration in days for route-length matching
    const durationDays = rootEarliest && rootLatest
      ? Math.max(1, (+rootLatest - +rootEarliest) / DAY)
      : 1;

    return {
      root,
      progress: rootInfo.prog || 0,
      atRisk,
      hiddenMinorCount: 0,
      timeline,
      majorStations,
      minorStations,
      earliestDate: rootEarliest,
      latestDate: rootLatest,
      durationDays,
    };
  }).filter(line => line.timeline.length > 0 || line.majorStations.length === 0);

  if (!rawLines.length) return null;

  // ── Route assignment ──────────────────────────────────────────────────────
  // Sort routes by pixel length (longest first).
  const routesWithLen = ROUTES.map((wp, idx) => ({ idx, wp, len: routeLength(wp) }))
    .sort((a, b) => b.len - a.len);

  // Sort projects by duration (longest first). Ties broken by hash of root.id for stability.
  const sortedLines = [...rawLines].sort((a, b) => {
    if (b.durationDays !== a.durationDays) return b.durationDays - a.durationDays;
    return hashStr(a.root.id) - hashStr(b.root.id);
  });

  // Assign route and palette color by rank.
  const assignedLines = sortedLines.map((line, rank) => {
    const routeEntry = routesWithLen[rank % routesWithLen.length];
    const color = PALETTE[rank % PALETTE.length];
    return { ...line, color, route: routeEntry.wp, routeLen: routeEntry.len };
  });

  // ── Station placement on routes ───────────────────────────────────────────
  const positionedLines = assignedLines.map(line => {
    const { earliestDate, latestDate, route, routeLen } = line;
    const span = earliestDate && latestDate ? Math.max(+latestDate - +earliestDate, DAY) : DAY;

    const placeOnRoute = (station) => {
      let t = 0;
      if (station.anchorDate && earliestDate && latestDate) {
        t = clamp((+station.anchorDate - +earliestDate) / span, 0, 1);
      }
      // Keep small margin so stations don't fall exactly on endpoints
      t = clamp(t, 0.02, 0.98);
      const pt = pointAtFraction(route, t);
      return { ...station, t, x: pt.x, y: pt.y };
    };

    const majors = line.majorStations.map(s => placeOnRoute(s));
    const minors = line.minorStations.map(s => placeOnRoute(s));

    // Current / next station logic
    const currentStation = line.timeline.find(s => s.prog > 0 && !s.allDone)
      || line.timeline.find(s => !s.allDone)
      || line.timeline[line.timeline.length - 1];
    const currentId = currentStation?.id || null;

    // Train position: use overall project progress directly (e.g. 31% done = 31% along route).
    // This is the most intuitive mapping — the train's position on the line represents
    // how much of the project's work is complete, regardless of which cluster it falls in.
    const trainT = clamp(line.progress, 0, 1);
    const trainPt = pointAtFraction(route, trainT);

    return {
      ...line,
      majorStations: majors,
      minorStations: minors,
      currentId,
      trainT,
      trainPt,
    };
  });

  return {
    lines: positionedLines,
    nodeMap,
  };
}

// ─── renderRoadmapSvg ─────────────────────────────────────────────────────────

export function renderRoadmapSvg(args) {
  const model = computeRoadmapModel(args);
  if (!model?.lines.length) return '';

  const { lines, nodeMap } = model;
  const out = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" style="display:block;width:100%;height:auto;max-width:100%" preserveAspectRatio="xMidYMin meet">`);

  // ── Styles ──────────────────────────────────────────────────────────────────
  out.push(`<style>
    .rm-badge{font:800 13px/1 'JetBrains Mono',monospace;fill:#fff;letter-spacing:.04em}
    .rm-abbrev{font:700 8px/1 'JetBrains Mono',monospace;fill:var(--tx2,#cbd5e1)}
    .rm-abbrev-active{fill:#fff}
    .rm-abbrev-done{opacity:.65}
    .rm-risk-tri{fill:#ef4444}
    g[style*=cursor]{pointer-events:all}
  </style>`);

  // ── Route lines ─────────────────────────────────────────────────────────────
  lines.forEach((line, lineIdx) => {
    const { route, color, trainT } = line;
    const pathD = waypointsToPath(route);
    const progressD = trainT > 0 ? partialPath(route, trainT) : null;
    const gId = `rm-line-${lineIdx}`;

    out.push(`<g id="${gId}">`);

    // Full route (faded) — drawn first so progress overlays it
    out.push(`<path d="${esc(pathD)}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.22"/>`);

    // Traveled portion (full color)
    if (progressD) {
      out.push(`<path d="${esc(progressD)}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
    }

    // ── Line badges at start and end ─────────────────────────────────────────
    const startPt = route[0];
    const endPt = route[route.length - 1];
    const badgeLabel = esc(line.root.id);
    const badgeRx = 5;
    const badgeH = 20;
    // Measure label width approximately (13px mono ≈ 8.5px per char)
    const labelLen = String(line.root.id).length;
    const badgeW = Math.max(28, labelLen * 9 + 12);

    // Start badge (left-anchored from the start point)
    const sbx = startPt.x - badgeW - 8;
    const sby = startPt.y - badgeH / 2;
    out.push(`<rect x="${sbx}" y="${sby}" width="${badgeW}" height="${badgeH}" rx="${badgeRx}" fill="${color}"/>`);
    out.push(`<text x="${sbx + badgeW / 2}" y="${sby + 14}" text-anchor="middle" class="rm-badge">${badgeLabel}</text>`);

    // End badge (right of end point, unless near edge — then left)
    const ebx = endPt.x + 10;
    const eby = endPt.y - badgeH / 2;
    // Clamp so badge doesn't overflow SVG
    const ebxClamped = Math.min(ebx, SVG_W - badgeW - 4);
    out.push(`<rect x="${ebxClamped}" y="${eby}" width="${badgeW}" height="${badgeH}" rx="${badgeRx}" fill="${color}"/>`);
    out.push(`<text x="${ebxClamped + badgeW / 2}" y="${eby + 14}" text-anchor="middle" class="rm-badge">${badgeLabel}</text>`);

    // ── AT RISK warning triangle at end ────────────────────────────────────
    if (line.atRisk) {
      const tx = endPt.x + 10 + badgeW + 6;
      const ty = endPt.y;
      out.push(`<polygon points="${tx},${ty - 8} ${tx + 9},${ty + 4} ${tx - 9},${ty + 4}" class="rm-risk-tri"/>`);
      out.push(`<text x="${tx}" y="${ty + 2}" text-anchor="middle" font-size="6" font-weight="800" fill="#fff">!</text>`);
    }

    out.push(`</g>`);
  });

  // ── Stations ── drawn after all routes so dots sit on top ─────────────────
  lines.forEach((line, lineIdx) => {
    const { color, majorStations, minorStations, currentId } = line;

    out.push(`<g id="rm-stations-${lineIdx}">`);

    // Major stations (r=6 white circle with colored border)
    majorStations.forEach(station => {
      const isDone = station.allDone;
      const isCurrent = station.id === currentId && !isDone;
      const statusLabel = isDone ? '✓' : `${station.done}/${station.total}`;
      const tooltipItems = (station.clusterItems || []).map(c => {
        const node = nodeMap[c.id];
        const st = node?.status === 'done' ? '✓' : node?.status === 'wip' ? '▸' : '○';
        return `${st} ${c.name || c.id}`;
      }).join('\n');
      const tooltip = `${station.abbrev} — ${station.name}\n${statusLabel} erledigt\n${tooltipItems}`;
      const cx = station.x.toFixed(1), cy = station.y.toFixed(1);

      out.push(`<g style="cursor:pointer" pointer-events="all">`);
      // Invisible larger hit area for tooltip
      out.push(`<circle cx="${cx}" cy="${cy}" r="14" fill="transparent" pointer-events="all"><title>${esc(tooltip)}</title></circle>`);
      if (isDone) {
        out.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${color}"/>`);
      } else if (isCurrent) {
        out.push(`<circle cx="${cx}" cy="${cy}" r="7" fill="var(--bg,#111318)" stroke="${color}" stroke-width="2.5"/>`);
        out.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/>`);
      } else {
        out.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="var(--bg,#111318)" stroke="${color}" stroke-width="2"/>`);
      }
      out.push(`</g>`);

      // Abbreviation label
      const abbrevClass = isCurrent ? 'rm-abbrev rm-abbrev-active' : (isDone ? 'rm-abbrev rm-abbrev-done' : 'rm-abbrev');
      out.push(`<text x="${(station.x + 7).toFixed(1)}" y="${(station.y - 6).toFixed(1)}" class="${abbrevClass}" fill="${isDone ? color : isCurrent ? color : 'var(--tx3,#94a3b8)'}">${esc(station.abbrev)}</text>`);
    });

    // Minor stations (r=3)
    minorStations.forEach(station => {
      const isDone = station.allDone;
      const isCurrent = station.id === currentId && !isDone;

      if (isDone) {
        out.push(`<circle cx="${station.x.toFixed(1)}" cy="${station.y.toFixed(1)}" r="3" fill="${color}" opacity="0.8"/>`);
      } else {
        out.push(`<circle cx="${station.x.toFixed(1)}" cy="${station.y.toFixed(1)}" r="3" fill="var(--bg,#111318)" stroke="${color}" stroke-width="1.5" opacity="${isCurrent ? 1 : 0.7}"/>`);
      }

      if (isCurrent) {
        out.push(`<text x="${(station.x + 5).toFixed(1)}" y="${(station.y - 5).toFixed(1)}" class="rm-abbrev rm-abbrev-active" fill="${color}">${esc(station.abbrev)}</text>`);
      }
    });

    out.push(`</g>`);
  });

  // ── Trains ── drawn last so they appear on top of everything ───────────────
  lines.forEach((line, lineIdx) => {
    const { color, trainT, trainPt, progress } = line;
    if (trainT <= 0 || progress >= 1) return;

    const pct = Math.round(progress * 100);
    const trainTip = `${line.root.id} — ${line.root.name}\nFortschritt: ${pct}%\n${line.atRisk ? '⚠ AT RISK' : ''}`;
    const tx = trainPt.x.toFixed(1), ty = trainPt.y.toFixed(1);
    out.push(`<g id="rm-train-${lineIdx}" style="cursor:pointer" pointer-events="all">`);
    // Pulse glow
    out.push(`<circle cx="${tx}" cy="${ty}" r="14" fill="${color}" opacity="0.18">`);
    out.push(`<animate attributeName="r" values="11;16;11" dur="2.4s" repeatCount="indefinite"/>`);
    out.push(`<animate attributeName="opacity" values="0.22;0.08;0.22" dur="2.4s" repeatCount="indefinite"/>`);
    out.push(`</circle>`);
    // Train body
    out.push(`<circle cx="${tx}" cy="${ty}" r="7" fill="${color}" stroke="var(--bg,#111318)" stroke-width="2.2"><title>${esc(trainTip)}</title></circle>`);
    // White center dot
    out.push(`<circle cx="${tx}" cy="${ty}" r="2.5" fill="#fff"/>`);
    out.push(`</g>`);
  });

  out.push(`</svg>`);

  // ── Legend (HTML below SVG) ────────────────────────────────────────────────
  out.push(`<div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:20px;padding:0 4px">`);

  lines.forEach(line => {
    const allStations = [...line.majorStations, ...line.minorStations]
      .sort((a, b) => a.t - b.t);
    if (!allStations.length) return;

    out.push(`<div style="min-width:160px;max-width:220px">`);
    // Line header
    out.push(`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">`);
    out.push(`<span style="display:inline-block;width:28px;height:12px;border-radius:3px;background:${line.color}"></span>`);
    out.push(`<span style="font:700 11px/1 'JetBrains Mono',monospace;color:${line.color}">${esc(line.root.id)}</span>`);
    out.push(`<span style="font:500 10px/1 'Inter',system-ui,sans-serif;color:var(--tx2,#94a3b8);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(truncate(line.root.name, 22))}</span>`);
    out.push(`</div>`);

    // Station rows
    allStations.forEach(station => {
      const dotColor = station.allDone ? line.color : 'transparent';
      const borderColor = line.color;
      const doneStyle = station.allDone ? 'text-decoration:line-through;opacity:.55' : '';
      const statusBadge = station.allDone ? ' ✓' : station.done > 0 ? ` ${station.done}/${station.total}` : '';
      out.push(`<div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:3px">`);
      out.push(`<span style="flex-shrink:0;width:10px;height:10px;margin-top:1px;border-radius:50%;background:${dotColor};border:2px solid ${borderColor}"></span>`);
      out.push(`<span style="font:700 9px/1 'JetBrains Mono',monospace;color:${line.color};min-width:24px;margin-top:1px;${doneStyle}">${esc(station.abbrev)}</span>`);
      if (station.clusterSize > 1) {
        out.push(`<span style="font:400 9px/1.4 'Inter',system-ui,sans-serif;color:var(--tx2,#94a3b8);${doneStyle}">`);
        out.push(`<span style="display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(truncate(station.name, 26))}${esc(statusBadge)}</span>`);
        const extras = station.clusterItems.filter(c => c.id !== station.id);
        extras.forEach(c => {
          const itemNode = nodeMap[c.id];
          const itemDone = itemNode?.status === 'done';
          const itemStyle = itemDone ? 'text-decoration:line-through;opacity:.55' : '';
          const mark = itemDone ? '✓' : '○';
          out.push(`<span style="display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-left:4px;${itemStyle}">${mark} ${esc(truncate(c.name, 22))}</span>`);
        });
        out.push(`</span>`);
      } else {
        out.push(`<span style="font:400 9px/1.2 'Inter',system-ui,sans-serif;color:var(--tx2,#94a3b8);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;${doneStyle}">${esc(truncate(station.name, 26))}${esc(statusBadge)}</span>`);
      }
      out.push(`</div>`);
    });

    out.push(`</div>`);
  });

  out.push(`</div>`);

  return out.join('');
}
