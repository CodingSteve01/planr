// ─── Metro/Subway Roadmap Renderer ────────────────────────────────────────────
// Each project becomes a colored subway line. Stations are depth-2 milestones.
// Routes are pre-computed fixed shapes (like U-Bahn lines), assigned by duration.
import { deadlineScopedScheduledItems } from './deadlines.js';

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
  // Route 2: vertical north-south with jog (like U8). Shifted LEFT from the
  // original x=700 spine so it doesn't crowd Route 1's diagonal sweep / Route
  // 4's top horizontal through the same band — those routes share the
  // (640..720, 180..260) area and auto-spacing struggled to pull the rails
  // apart visually.
  [
    { x: 600, y: 40 }, { x: 600, y: 180 }, { x: 540, y: 240 }, { x: 540, y: 420 },
    { x: 600, y: 480 }, { x: 600, y: 620 }, { x: 600, y: 760 },
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
function partialPath(waypoints, fraction, startFraction = 0) {
  if (fraction <= startFraction) return null;
  const total = routeLength(waypoints);
  const target = clamp(fraction, 0, 1) * total;
  const startTarget = clamp(startFraction, 0, 1) * total;

  // Two-pass: when startFraction > 0, find the start point on the route, emit
  // an `M` at that point, then accumulate intermediate vertices and the end
  // point.
  if (startFraction > 0) {
    const startPt = pointAtFraction(waypoints, startFraction);
    const parts = [`M ${startPt.x} ${startPt.y}`];
    let traveled = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i].x - waypoints[i - 1].x;
      const dy = waypoints[i].y - waypoints[i - 1].y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      const segStart = traveled;
      const segEnd = traveled + segLen;
      // Skip segments that lie entirely before start
      if (segEnd <= startTarget) { traveled = segEnd; continue; }
      // Final segment containing the target — emit and stop
      if (segEnd >= target) {
        const rem = target - traveled;
        const frac = segLen > 0 ? rem / segLen : 0;
        const ex = waypoints[i - 1].x + dx * frac;
        const ey = waypoints[i - 1].y + dy * frac;
        parts.push(`L ${ex} ${ey}`);
        return parts.join(' ');
      }
      // Mid segment, fully traversed in window — emit endpoint
      // (segStart may be < startTarget but we already emitted M at start)
      void segStart;
      parts.push(`L ${waypoints[i].x} ${waypoints[i].y}`);
      traveled = segEnd;
    }
    return parts.join(' ');
  }

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
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;vertical-align:middle">`
      + `<circle cx="${c}" cy="${c}" r="${r}" fill="${color}"/>`
      + `<path d="M${c - r * 0.55},${c} L${c - r * 0.1},${c + r * 0.45} L${c + r * 0.65},${c - r * 0.45}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + `</svg>`;
  }
  if (status === 'wip' && progress > 0) {
    // Pie slice for progress
    const angle = Math.min(Math.max(progress, 0), 1) * Math.PI * 2;
    const ex = c + r * Math.sin(angle);
    const ey = c - r * Math.cos(angle);
    const large = angle > Math.PI ? 1 : 0;
    const path = progress >= 0.999
      ? `M${c},${c - r} A${r},${r} 0 1,1 ${c - 0.01},${c - r} Z`
      : `M${c},${c} L${c},${c - r} A${r},${r} 0 ${large},1 ${ex.toFixed(2)},${ey.toFixed(2)} Z`;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;vertical-align:middle">`
      + `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="1.4"/>`
      + `<path d="${path}" fill="${color}" opacity=".6"/>`
      + `</svg>`;
  }
  // open (includes wip with 0 progress)
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;vertical-align:middle">`
    + `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="1.4"/>`
    + `</svg>`;
}

function makeAbbrev(name) {
  if (!name) return '?';
  // Strip parenthetical content, leading articles/prefixes, technical noise
  const clean = name
    .replace(/\(.*?\)/g, '')
    .replace(/\b(Ursache|Erstellung|Anpassung|Entwicklung|Umstellung|Integration|Domain|UI\s+Migration)\b:?\s*/gi, '')
    .trim();
  // Keep only words starting with a letter (drop arrows, symbols, numerals-only)
  const words = (clean || name).trim().split(/\s+/).filter(w => /^[A-Za-zÄÖÜäöüß]/.test(w));
  if (words.length >= 2) {
    return words.slice(0, 3).map(w => w[0]?.toUpperCase() || '').join('').slice(0, 3);
  }
  return (words[0] || name).replace(/[^A-Za-zÄÖÜäöüß0-9]/g, '').slice(0, 3).toUpperCase();
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
    // Done tasks = "the journey already traveled". They may lack dates from the scheduler,
    // so we give dateless done items a synthetic "past" date before the project's first event.
    const firstSchedDate = rootScheduled.reduce((min, s) => {
      const d = toDate(s.startD || s.endD);
      return d && (!min || d < min) ? d : min;
    }, null);
    const syntheticPast = firstSchedDate ? addDays(firstSchedDate, -14) : addDays(toDate(now), -30);

    const doneLeaves = tree
      .filter(n => n.id.startsWith(root.id + '.') && n.status === 'done')
      .filter(n => !schedIds.has(n.id) && !(childMap[n.id]?.length))  // leaf only, not already scheduled
      .map(n => {
        const m = meta[n.id] || {};
        const end = m.latestEnd || m.earliestStart || toDate(n.pinnedStart) || toDate(n.date) || syntheticPast;
        const start = m.earliestStart || end;
        return { id: n.id, name: n.name, status: 'done', startD: start, endD: end };
      });

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
    const deadlineScheduled = root.type === 'deadline' ? deadlineScopedScheduledItems(tree, scheduled, root.id) : [];
    const deadlineEnd = deadlineScheduled.length
      ? deadlineScheduled.reduce((max, item) => item.endD > max ? item.endD : max, new Date(0))
      : null;
    const atRisk = root.type === 'deadline'
      ? !!(root.date && deadlineEnd && deadlineEnd > new Date(root.date))
      : !!(root.date && rootStats?._endD && rootStats._endD > new Date(root.date));

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
  // Per-route deterministic micro-offset breaks up segments where two routes
  // share long stretches of identical waypoints (e.g. a vertical line riding
  // on top of a horizontal one for hundreds of pixels). Up to ±6 px in each
  // axis based on the route's original index in ROUTES — stations move with
  // the route so positioning stays consistent.
  // Pre-compute color assignment per root id — deterministic hash so a
  // project keeps the same line color across reloads + data edits. Walk
  // in sorted-line order and resolve collisions by stepping forward in
  // the palette until a free slot is found; first-touched id wins its
  // preferred colour.
  const colorByRoot = {};
  const usedColors = new Set();
  sortedLines.forEach(line => {
    const baseIdx = Math.abs(hashStr(line.root.id)) % PALETTE.length;
    let pick = PALETTE[baseIdx];
    if (usedColors.has(pick)) {
      for (let k = 1; k < PALETTE.length; k++) {
        const alt = PALETTE[(baseIdx + k) % PALETTE.length];
        if (!usedColors.has(alt)) { pick = alt; break; }
      }
    }
    colorByRoot[line.root.id] = pick;
    usedColors.add(pick);
  });

  const baseAssigned = sortedLines.map((line, rank) => {
    const routeEntry = routesWithLen[rank % routesWithLen.length];
    const color = colorByRoot[line.root.id];
    return { ...line, color, route: routeEntry.wp.map(p => ({ x: p.x, y: p.y })), routeLen: routeEntry.len };
  });

  // ── Parallel-rail spacing pass ───────────────────────────────────────────
  // Hard "minimum distance" constraint between parallel route segments:
  // whenever two horizontal-or-vertical segments of DIFFERENT routes overlap
  // on the shared axis and sit closer than MIN_DIST on the perpendicular
  // axis, both routes get pushed apart by half the deficit each. Two-sided
  // symmetric push avoids the "one route runs over another" bug we hit
  // before. Iterates a few passes; convergence is fast because the push
  // size is exactly the missing gap, not a fixed step.
  const MIN_DIST = 50;     // px — segments closer than this are visually glued
  const EPSILON = 0.001;   // px — guard for exactly-overlapping segments
  const PARALLEL_TOL = 2;  // px — slope tolerance for axis-aligned segments
  const SHARE_TOL = 4;     // px — span overlap must exceed this to count
  const DIAG_ANGLE_TOL = 0.45; // ~26° — diagonal pairs within this slope diff count as parallel
  const horiz = (a, b) => Math.abs(a.y - b.y) <= PARALLEL_TOL && Math.abs(b.x - a.x) > 8;
  const vert  = (a, b) => Math.abs(a.x - b.x) <= PARALLEL_TOL && Math.abs(b.y - a.y) > 8;
  const overlap1D = (lo1, hi1, lo2, hi2) =>
    Math.min(Math.max(lo1, hi1), Math.max(lo2, hi2)) - Math.max(Math.min(lo1, hi1), Math.min(lo2, hi2));
  // For a diagonal segment, return its angle in radians and the perpendicular
  // unit vector. Used to detect close-parallel diagonals between routes.
  const segAngle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const perpFrom = (a, b) => {
    const ang = segAngle(a, b);
    return { px: -Math.sin(ang), py: Math.cos(ang) };
  };
  // Point-to-line distance for two parallel-ish segments (use midpoint of b
  // projected onto a's perpendicular).
  const perpDist = (a1, a2, b1, b2) => {
    const ang = segAngle(a1, a2);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const bmx = (b1.x + b2.x) / 2, bmy = (b1.y + b2.y) / 2;
    return (bmx - a1.x) * nx + (bmy - a1.y) * ny;
  };

  for (let pass = 0; pass < 10; pass++) {
    const adjust = baseAssigned.map(() => ({ dx: 0, dy: 0 }));
    let collisionCount = 0;
    for (let i = 0; i < baseAssigned.length; i++) {
      const ri = baseAssigned[i].route;
      for (let j = i + 1; j < baseAssigned.length; j++) {
        const rj = baseAssigned[j].route;
        for (let si = 1; si < ri.length; si++) {
          const a1 = ri[si - 1], a2 = ri[si];
          const aH = horiz(a1, a2), aV = vert(a1, a2);
          if (!aH && !aV) continue;
          for (let sj = 1; sj < rj.length; sj++) {
            const b1 = rj[sj - 1], b2 = rj[sj];
            if (aH && horiz(b1, b2)) {
              const sx = overlap1D(a1.x, a2.x, b1.x, b2.x);
              if (sx <= SHARE_TOL) continue;
              const dy = a1.y - b1.y;
              if (Math.abs(dy) >= MIN_DIST) continue;
              const sign = dy === 0 ? 1 : Math.sign(dy);
              const push = (MIN_DIST - Math.abs(dy) + EPSILON) / 2;
              adjust[i].dy += sign * push;
              adjust[j].dy -= sign * push;
              collisionCount++;
              break;
            } else if (aV && vert(b1, b2)) {
              const sy = overlap1D(a1.y, a2.y, b1.y, b2.y);
              if (sy <= SHARE_TOL) continue;
              const dx = a1.x - b1.x;
              if (Math.abs(dx) >= MIN_DIST) continue;
              const sign = dx === 0 ? 1 : Math.sign(dx);
              const push = (MIN_DIST - Math.abs(dx) + EPSILON) / 2;
              adjust[i].dx += sign * push;
              adjust[j].dx -= sign * push;
              collisionCount++;
              break;
            } else if (!aH && !aV) {
              // Diagonal vs diagonal. Compare angles, fall through if too
              // different. Otherwise use perpendicular signed distance.
              const angA = segAngle(a1, a2);
              const angB = segAngle(b1, b2);
              // Normalize to [-π/2, π/2] so opposite-direction same line counts.
              const da = ((angA - angB + Math.PI * 1.5) % Math.PI) - Math.PI / 2;
              if (Math.abs(da) > DIAG_ANGLE_TOL) continue;
              const dist = perpDist(a1, a2, b1, b2);
              if (Math.abs(dist) >= MIN_DIST) continue;
              // Need at least some overlap along the segment direction.
              const along = (px, py) => (px - a1.x) * Math.cos(angA) + (py - a1.y) * Math.sin(angA);
              const aLen = Math.hypot(a2.x - a1.x, a2.y - a1.y);
              const tA0 = along(b1.x, b1.y), tA1 = along(b2.x, b2.y);
              const tLo = Math.min(tA0, tA1), tHi = Math.max(tA0, tA1);
              const proj = Math.min(tHi, aLen) - Math.max(tLo, 0);
              if (proj <= SHARE_TOL) continue;
              const sign = dist === 0 ? 1 : Math.sign(dist);
              const push = (MIN_DIST - Math.abs(dist) + EPSILON) / 2;
              const { px, py } = perpFrom(a1, a2);
              // a's side of the line gets pushed by -sign*push*perp, b by +sign*push*perp.
              // Wait: dist > 0 means b is on the +perp side of a. To push apart,
              // move a by -sign*push along perp, b by +sign*push.
              adjust[i].dx += -sign * push * px;
              adjust[i].dy += -sign * push * py;
              adjust[j].dx +=  sign * push * px;
              adjust[j].dy +=  sign * push * py;
              collisionCount++;
              break;
            }
          }
        }
      }
    }
    if (collisionCount === 0) break;
    adjust.forEach((d, li) => {
      if (!d.dx && !d.dy) return;
      baseAssigned[li].route = baseAssigned[li].route.map(p => ({ x: p.x + d.dx, y: p.y + d.dy }));
    });
  }
  const assignedLines = baseAssigned;

  // ── Station placement on routes ───────────────────────────────────────────
  // Time-proportional spacing: each station's t is its endDate position
  // within the project's [earliestDate, latestDate] window. Stations
  // landing on the same week pile up; stations months apart visibly drift
  // apart. Done stations naturally end up behind the live train because
  // their endDate already passed. Anchor the train at the effort-weighted
  // progress (`line.progress`) — the two metrics don't have to agree, and
  // when they don't, the visible gap is itself the story.
  const positionedLines = assignedLines.map(line => {
    const { route } = line;

    const byEnd = (a, b) => (+a.endDate || Infinity) - (+b.endDate || Infinity)
      || a.id.localeCompare(b.id, undefined, { numeric: true });
    const allStations = [...line.majorStations, ...line.minorStations].sort(byEnd);

    // Project span: earliest and latest endDate across stations (with
    // sensible fallback when only one or none have dates).
    const dates = allStations.map(s => +s.endDate).filter(Number.isFinite);
    const firstD = dates.length ? Math.min(...dates) : null;
    const lastD = dates.length ? Math.max(...dates) : null;
    const span = (lastD && firstD && lastD > firstD) ? (lastD - firstD) : 0;

    const trainT = clamp(line.progress, 0.02, 0.96);
    // Margins so the first/last station don't sit on the badges at the
    // route ends.
    const T_LO = 0.04, T_HI = 0.96;

    const positioned = allStations.map((station, idx) => {
      let t;
      if (span > 0 && Number.isFinite(+station.endDate)) {
        const frac = (+station.endDate - firstD) / span;
        t = T_LO + frac * (T_HI - T_LO);
      } else {
        // Fallback when there is no usable date span — fall back to even
        // spacing so nothing collapses to a single point.
        const n = allStations.length;
        t = T_LO + ((idx + 1) / (n + 1)) * (T_HI - T_LO);
      }
      const pt = pointAtFraction(route, t);
      return { ...station, t, x: pt.x, y: pt.y };
    });

    // Anti-collision pass for stations whose endDate falls in the same
    // week — without this they'd render exactly on top of each other.
    // Walk in t-order and bump each station forward if it would land
    // closer than MIN_T to its predecessor.
    const MIN_T = 0.035;
    positioned.sort((a, b) => a.t - b.t);
    for (let i = 1; i < positioned.length; i++) {
      if (positioned[i].t - positioned[i - 1].t < MIN_T) {
        const bumped = Math.min(T_HI, positioned[i - 1].t + MIN_T);
        const pt = pointAtFraction(route, bumped);
        positioned[i] = { ...positioned[i], t: bumped, x: pt.x, y: pt.y };
      }
    }

    const majors = positioned.filter(s => s.kind === 'major');
    const minors = positioned.filter(s => s.kind === 'minor');

    // Current station: first not-done station (the one being approached)
    const currentStation = positioned.find(s => !s.allDone && s.prog > 0)
      || positioned.find(s => !s.allDone);
    const currentId = currentStation?.id || null;

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
  const pastProgress = diff?.pastProgressByRootId || {};
  const newSet = new Set(diff?.newRootIds || []);
  const doneInWindow = new Set(diff?.doneInWindowIds || []);
  const changedInWindow = new Set(diff?.changedInWindowIds || doneInWindow);
  // Planning-horizon overlay. When `horizonIds` is set, items/stations whose
  // ids aren't in the set get a muted treatment so the map still tells the
  // full story but the eye locks onto what's planned in the window.
  const horizonIdSet = args.horizonIds instanceof Set ? args.horizonIds
    : Array.isArray(args.horizonIds) ? new Set(args.horizonIds) : null;
  const horizonOn = !!horizonIdSet;
  // Forward-looking projection per root: where would the train sit at the
  // horizon end? Drawn as a blue segment + ghost-train AHEAD of the live one
  // so the map tells the Diff/Ist/Plan story in one glance.
  const futureProgress = args.futureProgressByRootId || {};
  const hasFuture = Object.keys(futureProgress).length > 0;
  const out = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" style="display:block;width:100%;height:auto;max-width:100%" preserveAspectRatio="xMidYMin meet">`);

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
    .rm-abbrev{font:700 10.5px/1 'JetBrains Mono',monospace;fill:var(--tx2,#cbd5e1);paint-order:stroke fill;stroke:var(--bg,#0e1116);stroke-width:3.4;stroke-linejoin:round}
    /* No fill override for active / done — the inline fill attribute
       (project colour) drives readability. The previous .rm-abbrev-active
       white-fill rule cascaded over the inline colour and made the label
       white-on-white over the bg-coloured halo. */
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

    // Build the line-level tooltip so hovering anywhere on the route reveals
    // project id + name + progress, not just when the user finds the train.
    const lTrainHover = labels.train || 'Train';
    const linePct = Math.round((line.progress || 0) * 100);
    const lineCurrentPos = (labels.currentPos || 'Current position: {0}% of route').replace('{0}', linePct);
    const lineTooltip = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid var(--b2,#364456)">`
      + `<span style="display:inline-block;width:14px;height:8px;border-radius:2px;background:${color}"></span>`
      + `<span style="font:700 11px/1 'JetBrains Mono',monospace;color:${color}">${esc(line.root.id)}</span>`
      + `<span style="font:700 10px/1 'JetBrains Mono',monospace;color:var(--tx3,#8898b0);text-transform:uppercase;letter-spacing:.06em;margin-left:auto">${esc(lTrainHover)}</span>`
      + `</div>`
      + `<div style="font:500 10.5px/1.4 Inter,system-ui,sans-serif;color:var(--tx,#e8ecf4);margin-bottom:4px">${esc(line.root.name)}</div>`
      + `<div style="font:500 10px/1.4 Inter,system-ui,sans-serif;color:var(--tx2,#cbd5e1)">${esc(lineCurrentPos)}</div>`
      + (line.atRisk ? `<div style="font:700 10px/1.4 'JetBrains Mono',monospace;color:var(--re,#ef4444);margin-top:2px">⚠ ${esc(labels.atRisk || 'AT RISK')}</div>` : '');

    // Invisible fat hit area so hovering anywhere along the route surfaces
    // the line tooltip — not only when the cursor lands on the train glyph.
    out.push(`<path d="${esc(pathD)}" fill="none" stroke="transparent" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" pointer-events="stroke" data-tip="${esc(lineTooltip)}" data-item-id="${esc(line.root.id)}" style="cursor:pointer"/>`);

    // Full route (faded) — drawn first so progress overlays it
    out.push(`<path d="${esc(pathD)}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.22" pointer-events="none"/>`);

    // Traveled portion (full color)
    if (progressD) {
      out.push(`<path d="${esc(progressD)}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`);
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

    // Start badge (left-anchored from the start point)
    const sbx = startPt.x - badgeW - 8;
    const sby = startPt.y - badgeH / 2;
    out.push(`<rect x="${sbx}" y="${sby}" width="${badgeW}" height="${badgeH}" rx="${badgeRx}" fill="${color}"/>`);
    out.push(`<text x="${sbx + badgeW / 2}" y="${sby + 14}" text-anchor="middle" class="rm-badge">${badgeLabel}</text>`);
    // "NEU" sub-badge for lines that didn't exist at the cutoff
    if (isNewLine) {
      const nby = sby + badgeH + 2;
      out.push(`<rect x="${sbx}" y="${nby}" width="${badgeW}" height="14" rx="3" fill="#f59e0b"/>`);
      out.push(`<text x="${sbx + badgeW / 2}" y="${nby + 10.5}" text-anchor="middle" font="700 9px/1 'JetBrains Mono',monospace" fill="#1a1a1a" font-size="9" font-weight="700">⊕ NEU</text>`);
    }

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
      const stStatus = isDone ? 'done' : station.done > 0 ? 'wip' : 'open';
      const stProg = station.total > 0 ? station.done / station.total : 0;
      const headerIcon = statusIcon(stStatus, color, stProg, 14);
      const rowStyle = 'display:flex;align-items:center;gap:6px;margin:2px 0';
      const itemsHtml = (station.clusterItems || []).map(c => {
        const node = nodeMap[c.id];
        const itStatus = node?.status === 'done' ? 'done' : node?.status === 'wip' ? 'wip' : 'open';
        const itProg = typeof node?.progress === 'number' ? node.progress / 100 : itStatus === 'wip' ? 0.5 : 0;
        const itIcon = statusIcon(itStatus, color, itProg, 11);
        const itStyle = itStatus === 'done' ? 'text-decoration:line-through;opacity:.55'
          : itStatus === 'wip' ? `color:${color}` : 'color:var(--tx2,#cbd5e1)';
        return `<div style="${rowStyle};padding-left:4px;${itStyle}"><span style="display:inline-flex;line-height:0">${itIcon}</span><span style="font:400 10px/1.2 Inter,system-ui,sans-serif">${esc(c.name || c.id)}</span></div>`;
      }).join('');
      const headerHtml = `<div style="${rowStyle};margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid var(--b2,#364456)">`
        + `<span style="display:inline-flex;line-height:0">${headerIcon}</span>`
        + `<span style="font:700 11px/1 'JetBrains Mono',monospace;color:${color}">${esc(station.abbrev)}</span>`
        + `<span style="font:600 11px/1.2 Inter,system-ui,sans-serif;color:var(--tx,#e8ecf4)">${esc(station.name)}</span>`
        + `<span style="font:500 10px/1 'JetBrains Mono',monospace;color:var(--tx3,#8898b0);margin-left:auto">${esc(isDone ? '✓' : station.done + '/' + station.total)}</span>`
        + `</div>`;
      const tooltip = headerHtml + itemsHtml;
      const cx = station.x.toFixed(1), cy = station.y.toFixed(1);

      // Did this station gain any movement in the diff window — either a
      // completion or a progress jump on a still-open task?
      const reachedInWindow = changedInWindow.size > 0
        && (station.clusterItems || []).some(c => changedInWindow.has(c.id));
      // Horizon mute: station has no items inside the planning window. Lets
      // forward-looking presentations point at what's "in the next N months".
      const inHorizon = !horizonOn || (station.clusterItems || []).some(c => horizonIdSet.has(c.id));
      out.push(`<g class="rm-stop" style="cursor:pointer${!inHorizon ? ';opacity:.22' : ''}" pointer-events="all" data-tip="${esc(tooltip)}">`);
      // Invisible larger hit area for tooltip
      out.push(`<circle cx="${cx}" cy="${cy}" r="14" fill="transparent" pointer-events="all"/>`);
      // Amber halo for stations reached in the diff window. Drawn before the
      // station glyph so it sits behind it.
      if (reachedInWindow) {
        out.push(`<circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.95">`);
        out.push(`<animate attributeName="r" values="10;13;10" dur="2.4s" repeatCount="indefinite"/>`);
        out.push(`<animate attributeName="opacity" values="0.95;0.55;0.95" dur="2.4s" repeatCount="indefinite"/>`);
        out.push(`</circle>`);
      }
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
      out.push(`<text x="${(station.x + 8).toFixed(1)}" y="${(station.y - 8).toFixed(1)}" class="${abbrevClass}" fill="${isDone ? color : isCurrent ? color : 'var(--tx3,#94a3b8)'}">${esc(station.abbrev)}</text>`);
    });

    // Minor stations (r=3)
    minorStations.forEach(station => {
      const isDone = station.allDone;
      const isCurrent = station.id === currentId && !isDone;
      const reachedInWindow = changedInWindow.size > 0
        && (station.clusterItems || []).some(c => changedInWindow.has(c.id));
      const inHorizon = !horizonOn || (station.clusterItems || []).some(c => horizonIdSet.has(c.id));
      if (!inHorizon) out.push(`<g opacity="0.22">`);

      if (reachedInWindow) {
        out.push(`<circle cx="${station.x.toFixed(1)}" cy="${station.y.toFixed(1)}" r="7" fill="none" stroke="#f59e0b" stroke-width="1.5" opacity="0.85">`);
        out.push(`<animate attributeName="r" values="6;9;6" dur="2.4s" repeatCount="indefinite"/>`);
        out.push(`<animate attributeName="opacity" values="0.85;0.4;0.85" dur="2.4s" repeatCount="indefinite"/>`);
        out.push(`</circle>`);
      }
      if (isDone) {
        out.push(`<circle cx="${station.x.toFixed(1)}" cy="${station.y.toFixed(1)}" r="3" fill="${color}" opacity="0.8"/>`);
      } else {
        out.push(`<circle cx="${station.x.toFixed(1)}" cy="${station.y.toFixed(1)}" r="3" fill="var(--bg,#111318)" stroke="${color}" stroke-width="1.5" opacity="${isCurrent ? 1 : 0.7}"/>`);
      }

      if (isCurrent) {
        out.push(`<text x="${(station.x + 5).toFixed(1)}" y="${(station.y - 5).toFixed(1)}" class="rm-abbrev rm-abbrev-active" fill="${color}">${esc(station.abbrev)}</text>`);
      }
      if (!inHorizon) out.push(`</g>`);
    });

    out.push(`</g>`);
  });

  // ── Progress overlays — drawn AFTER every base route + station so they
  // can never be covered by a later route's faded backbone. Striped past
  // trail, striped plan trail, animated dots — all on top.
  lines.forEach((line) => {
    const { route, trainT } = line;
    const isNewLine = newSet.has(line.root.id);
    if (isNewLine) {
      const pathD = waypointsToPath(route);
      out.push(`<path d="${esc(pathD)}" fill="none" stroke="url(#rm-past-stripe)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" pointer-events="none"/>`);
      return;
    }
    let pastT = null;
    if (Object.prototype.hasOwnProperty.call(pastProgress, line.root.id)) {
      pastT = Math.max(0, Math.min(pastProgress[line.root.id] || 0, trainT));
    }
    if (pastT != null && trainT - pastT > 0.005) {
      const trailD = partialPath(route, trainT, pastT);
      if (trailD) {
        out.push(`<path d="${esc(trailD)}" fill="none" stroke="url(#rm-past-stripe)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" pointer-events="none"/>`);
        out.push(`<circle r="4" fill="#fff" stroke="#f59e0b" stroke-width="1.5" pointer-events="none">`);
        out.push(`<animateMotion dur="3.2s" repeatCount="indefinite" path="${esc(trailD)}"/>`);
        out.push(`</circle>`);
      }
    }
    if (hasFuture && Object.prototype.hasOwnProperty.call(futureProgress, line.root.id)) {
      const fT = Math.max(0, Math.min(0.985, futureProgress[line.root.id] || 0));
      if (fT - trainT > 0.005) {
        const planD = partialPath(route, fT, trainT);
        if (planD) {
          out.push(`<path d="${esc(planD)}" fill="none" stroke="url(#rm-plan-stripe)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" pointer-events="none"/>`);
          out.push(`<circle r="3.5" fill="#fff" stroke="#3b82f6" stroke-width="1.5" pointer-events="none">`);
          out.push(`<animateMotion dur="4.2s" repeatCount="indefinite" path="${esc(planD)}"/>`);
          out.push(`</circle>`);
        }
      }
    }
  });

  // ── Trains ── drawn last so they appear on top of everything ───────────────
  lines.forEach((line, lineIdx) => {
    const { color, trainT, trainPt, progress } = line;
    if (trainT <= 0 || progress >= 1) return;

    const pct = Math.round(progress * 100);
    const rowStyle = 'display:flex;align-items:center;gap:6px;margin:2px 0';
    const lTrain = labels.train || 'Train';
    const lCurrentPos = (labels.currentPos || 'Current position: {0}% of route').replace('{0}', pct);
    const lAtRisk = labels.atRisk || 'AT RISK';
    const trainTip = `<div style="${rowStyle};margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid var(--b2,#364456)">`
      + `<span style="font:700 14px/1 'JetBrains Mono',monospace;color:${color}">🚆</span>`
      + `<span style="font:700 10px/1 'JetBrains Mono',monospace;color:var(--tx3,#8898b0);text-transform:uppercase;letter-spacing:.08em">${esc(lTrain)}</span>`
      + `<span style="font:700 11px/1 'JetBrains Mono',monospace;color:${color};margin-left:auto">${esc(line.root.id)}</span>`
      + `</div>`
      + `<div style="font:500 10.5px/1.4 Inter,system-ui,sans-serif;color:var(--tx,#e8ecf4);margin-bottom:4px">${esc(line.root.name)}</div>`
      + `<div style="font:500 10px/1.4 Inter,system-ui,sans-serif;color:var(--tx2,#cbd5e1)">${esc(lCurrentPos)}</div>`
      + (line.atRisk ? `<div style="font:700 10px/1.4 'JetBrains Mono',monospace;color:var(--re,#ef4444);margin-top:2px">⚠ ${esc(lAtRisk)}</div>` : '');
    const tx = trainPt.x.toFixed(1), ty = trainPt.y.toFixed(1);
    out.push(`<g id="rm-train-${lineIdx}" style="cursor:pointer" pointer-events="all" data-tip="${esc(trainTip)}">`);
    // Halo / pulse glow
    out.push(`<circle cx="${tx}" cy="${ty}" r="16" fill="${color}" opacity="0.15">`);
    out.push(`<animate attributeName="r" values="13;18;13" dur="2.4s" repeatCount="indefinite"/>`);
    out.push(`<animate attributeName="opacity" values="0.22;0.06;0.22" dur="2.4s" repeatCount="indefinite"/>`);
    out.push(`</circle>`);
    // Outer ring (distinguishes train from circular stations: rounded rectangle = train car)
    out.push(`<rect x="${(+tx - 11).toFixed(1)}" y="${(+ty - 7).toFixed(1)}" width="22" height="14" rx="4" fill="${color}" stroke="var(--bg,#111318)" stroke-width="1.8"/>`);
    // Window slits — two small white rectangles like train windows
    out.push(`<rect x="${(+tx - 7).toFixed(1)}" y="${(+ty - 3.5).toFixed(1)}" width="5" height="3" rx="0.6" fill="#fff" opacity="0.95"/>`);
    out.push(`<rect x="${(+tx + 2).toFixed(1)}" y="${(+ty - 3.5).toFixed(1)}" width="5" height="3" rx="0.6" fill="#fff" opacity="0.95"/>`);
    out.push(`</g>`);
    // Delta pill: shows "+ΔN%" above the train when the diff overlay is on
    // and progress actually moved in the window. Below the train if there's
    // no headroom.
    if (Object.prototype.hasOwnProperty.call(pastProgress, line.root.id) && !newSet.has(line.root.id)) {
      const past = Math.max(0, pastProgress[line.root.id] || 0);
      const delta = Math.round((line.progress - past) * 100);
      if (delta > 0) {
        const pillW = Math.max(34, 12 + String(delta).length * 8);
        const px = +tx - pillW / 2;
        const py = +ty - 28;
        out.push(`<g pointer-events="none">`);
        out.push(`<rect x="${px}" y="${py}" width="${pillW}" height="14" rx="7" fill="#f59e0b" opacity="0.95"/>`);
        out.push(`<text x="${+tx}" y="${py + 10.5}" text-anchor="middle" font="700 10px/1 'JetBrains Mono',monospace" fill="#1a1a1a" font-size="10" font-weight="700">+${delta}%</text>`);
        out.push(`</g>`);
      }
    }
    // Ghost train marker at the past position — only when there's a real gap
    if (Object.prototype.hasOwnProperty.call(pastProgress, line.root.id) && !newSet.has(line.root.id)) {
      const pastT = Math.max(0, Math.min(pastProgress[line.root.id] || 0, trainT));
      if (trainT - pastT > 0.005) {
        const gp = pointAtFraction(line.route, pastT);
        const gx = gp.x.toFixed(1), gy = gp.y.toFixed(1);
        out.push(`<g pointer-events="none" data-tip="${esc(labels.prevPos || 'Previous position')}">`);
        out.push(`<rect x="${(+gx - 9).toFixed(1)}" y="${(+gy - 6).toFixed(1)}" width="18" height="12" rx="3" fill="${color}" opacity="0.32" stroke="${color}" stroke-width="1" stroke-dasharray="2,2"/>`);
        out.push(`</g>`);
      }
    }
    // Planned ghost-train + +ΔN% pill ahead of the live train. Blue colour
    // intentionally mirrors the ▶ Plan filter chip so the Diff/Ist/Plan
    // story reads as a coherent palette.
    if (hasFuture && Object.prototype.hasOwnProperty.call(futureProgress, line.root.id)) {
      const fT = Math.max(0, Math.min(0.985, futureProgress[line.root.id] || 0));
      if (fT - trainT > 0.005) {
        const fp = pointAtFraction(line.route, fT);
        const fx = fp.x.toFixed(1), fy = fp.y.toFixed(1);
        const delta = Math.round((fT - line.progress) * 100);
        out.push(`<g pointer-events="none" data-tip="${esc(labels.plannedPos || 'Planned position')}">`);
        out.push(`<rect x="${(+fx - 9).toFixed(1)}" y="${(+fy - 6).toFixed(1)}" width="18" height="12" rx="3" fill="rgba(59,130,246,.18)" stroke="#3b82f6" stroke-width="1.4" stroke-dasharray="3,2"/>`);
        out.push(`</g>`);
        if (delta > 0) {
          const pillW = Math.max(34, 12 + String(delta).length * 8);
          const px = +fx - pillW / 2;
          const py = +fy - 28;
          out.push(`<g pointer-events="none">`);
          out.push(`<rect x="${px}" y="${py}" width="${pillW}" height="14" rx="7" fill="#3b82f6" opacity="0.95"/>`);
          out.push(`<text x="${+fx}" y="${py + 10.5}" text-anchor="middle" font="700 10px/1 'JetBrains Mono',monospace" fill="#fff" font-size="10" font-weight="700">+${delta}%</text>`);
          out.push(`</g>`);
        }
      }
    }
  });

  out.push(`</svg>`);

  // ── Legend (HTML below SVG) ────────────────────────────────────────────────
  // Custom bin-packing instead of CSS multi-column: we know each block's
  // approximate height up-front, so we run First-Fit-Decreasing across a
  // fixed column count. Yields a tightly packed layout where short blocks
  // slot into the leftover vertical space of every column, not just the
  // last one. Falls back to a single column on narrow screens via media
  // wrapping at the flex layer.
  const ROW_H = 22, EXTRA_H = 14, HEADER_H = 28, BLOCK_MARGIN = 14;
  const estimateBlockHeight = (line) => {
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
  const blockHtmlByIdx = new Map();
  const blockHeights = new Map();
  const linesForLegend = lines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => (line.majorStations.length + line.minorStations.length) > 0);
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

  bins.forEach((bin) => {
    if (!bin.items.length) return;
    out.push(`<div style="flex:1 1 220px;min-width:200px;max-width:340px">`);
    bin.items.forEach((lineIdx) => {
      const line = lines[lineIdx];
      out.push(renderLegendBlock(line));
    });
    out.push(`</div>`);
  });

  out.push(`</div>`);
  return out.join('');

  // Helper: render one project's legend block as an HTML string. Closes over
  // every piece of state the inline rendering needs (labels, sets, nodeMap).
  function renderLegendBlock(line) {
    const block = [];
    const allStations = [...line.majorStations, ...line.minorStations]
      .sort((a, b) => a.t - b.t);
    if (!allStations.length) return '';
    // Line-level diff: two pills in the header — completions (✓) and
    // progress-only movements (▲). Either can be zero; the row stays quiet
    // when both are.
    const lineDoneCount = doneInWindow.size > 0
      ? allStations.reduce((sum, st) => sum + ((st.clusterItems || []).filter(c => doneInWindow.has(c.id)).length), 0)
      : 0;
    const lineProgCount = changedInWindow.size > 0
      ? allStations.reduce((sum, st) => sum + ((st.clusterItems || []).filter(c => changedInWindow.has(c.id) && !doneInWindow.has(c.id)).length), 0)
      : 0;
    block.push(`<div style="margin-bottom:14px">`);
    // Line header
    block.push(`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">`);
    block.push(`<span style="display:inline-block;width:28px;height:12px;border-radius:3px;background:${line.color}"></span>`);
    block.push(`<span style="font:700 11px/1 'JetBrains Mono',monospace;color:${line.color}">${esc(line.root.id)}</span>`);
    block.push(`<span style="font:500 10px/1 'Inter',system-ui,sans-serif;color:var(--tx2,#94a3b8);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(truncate(line.root.name, 22))}</span>`);
    if (lineDoneCount > 0 || lineProgCount > 0) {
      block.push(`<span style="margin-left:auto;display:inline-flex;gap:3px">`);
      if (lineDoneCount > 0) {
        block.push(`<span style="font:700 9px/1 'JetBrains Mono',monospace;background:#10b981;color:#0a0a0a;border-radius:3px;padding:2px 5px" title="${esc(labels.tipDone || 'Done in window')}">✓ ${lineDoneCount}</span>`);
      }
      if (lineProgCount > 0) {
        block.push(`<span style="font:700 9px/1 'JetBrains Mono',monospace;background:#f59e0b;color:#1a1a1a;border-radius:3px;padding:2px 5px" title="${esc(labels.tipProgress || 'Progress in window')}">▲ ${lineProgCount}</span>`);
      }
      block.push(`</span>`);
    }
    block.push(`</div>`);

    // Station rows
    allStations.forEach(station => {
      const stStatus = station.allDone ? 'done' : station.done > 0 ? 'wip' : 'open';
      const stProg = station.total > 0 ? station.done / station.total : 0;
      const stIcon = statusIcon(stStatus, line.color, stProg, 13);
      const doneStyle = station.allDone ? 'text-decoration:line-through;opacity:.5' : '';
      const statusBadge = station.allDone ? '' : ` ${station.done}/${station.total}`;
      // Same split per station: ✓-pill for done-in-window, ▲-pill for
      // progress-only edits. Row background lights up when either is non-zero.
      const stDoneItems = doneInWindow.size > 0
        ? (station.clusterItems || []).filter(c => doneInWindow.has(c.id))
        : [];
      const stProgItems = changedInWindow.size > 0
        ? (station.clusterItems || []).filter(c => changedInWindow.has(c.id) && !doneInWindow.has(c.id))
        : [];
      const stationDeltaPill = (stDoneItems.length || stProgItems.length)
        ? `<span style="margin-left:auto;display:inline-flex;gap:3px">${
            stDoneItems.length ? `<span style="font:700 9px/1 'JetBrains Mono',monospace;background:#10b981;color:#0a0a0a;border-radius:3px;padding:1px 4px">✓ ${stDoneItems.length}</span>` : ''
          }${
            stProgItems.length ? `<span style="font:700 9px/1 'JetBrains Mono',monospace;background:#f59e0b;color:#1a1a1a;border-radius:3px;padding:1px 4px">▲ ${stProgItems.length}</span>` : ''
          }</span>`
        : '';
      const rowBg = (stDoneItems.length || stProgItems.length) ? ';background:rgba(245,158,11,.10)' : '';

      const stInHorizon = !horizonOn || (station.clusterItems || []).some(c => horizonIdSet.has(c.id));
      const horizonDim = !stInHorizon ? ';opacity:.32' : '';
      block.push(`<div class="rm-legend-item" data-item-id="${esc(station.id)}" style="display:flex;align-items:center;gap:6px;margin-top:6px;margin-bottom:2px;cursor:pointer;border-radius:4px;padding:2px 3px;margin-left:-3px;margin-right:-3px${rowBg}${horizonDim}">`);
      block.push(`<span style="flex-shrink:0;display:inline-flex;line-height:0">${stIcon}</span>`);
      block.push(`<span style="font:700 10px/1 'JetBrains Mono',monospace;color:${line.color};min-width:30px;${doneStyle}">${esc(station.abbrev)}</span>`);
      block.push(`<span style="font:500 10px/1.2 'Inter',system-ui,sans-serif;color:var(--tx2,#94a3b8);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;${doneStyle}">${esc(truncate(station.name, 26))}${esc(statusBadge)}</span>`);
      block.push(stationDeltaPill);
      block.push(`</div>`);

      // Cluster details — indented rows below, each with own icon+text centered, clickable
      if (station.clusterSize > 1) {
        const extras = station.clusterItems.filter(c => c.id !== station.id);
        extras.forEach(c => {
          const itemNode = nodeMap[c.id];
          const itemStatus = itemNode?.status === 'done' ? 'done' : itemNode?.status === 'wip' ? 'wip' : 'open';
          const itemProg = typeof itemNode?.progress === 'number' ? itemNode.progress / 100 : itemStatus === 'wip' ? 0.5 : 0;
          const itemIcon = statusIcon(itemStatus, line.color, itemProg, 10);
          const itemStyle = itemStatus === 'done' ? 'text-decoration:line-through;opacity:.55'
            : itemStatus === 'wip' ? `color:${line.color}` : 'color:var(--tx2,#94a3b8)';
          const wentDone = doneInWindow.has(c.id);
          const wentProg = !wentDone && changedInWindow.has(c.id);
          const itemDiffPill = wentDone
            ? `<span style="margin-left:auto;font:700 8px/1 'JetBrains Mono',monospace;background:#10b981;color:#0a0a0a;border-radius:2px;padding:1px 3px">✓</span>`
            : wentProg
              ? `<span style="margin-left:auto;font:700 8px/1 'JetBrains Mono',monospace;background:#f59e0b;color:#1a1a1a;border-radius:2px;padding:1px 3px">▲</span>`
              : '';
          const itemRowBg = (wentDone || wentProg) ? ';background:rgba(245,158,11,.10)' : '';
          const itemHorizonDim = horizonOn && !horizonIdSet.has(c.id) ? ';opacity:.32' : '';
          block.push(`<div class="rm-legend-item" data-item-id="${esc(c.id)}" style="display:flex;align-items:center;gap:5px;padding:1px 3px 1px 36px;margin:0 -3px;border-radius:4px;cursor:pointer;${itemStyle}${itemRowBg}${itemHorizonDim}">`);
          block.push(`<span style="flex-shrink:0;display:inline-flex;line-height:0">${itemIcon}</span>`);
          block.push(`<span style="font:400 9px/1.2 'Inter',system-ui,sans-serif;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(truncate(c.name, 24))}</span>`);
          block.push(itemDiffPill);
          block.push(`</div>`);
        });
      }
    });

    block.push(`</div>`);
    return block.join('');
  }
}
