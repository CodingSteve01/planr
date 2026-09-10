// ─── Single-project roadmap ───────────────────────────────────────────────
// A subway line is a good picture for "eight projects, how far along is each".
// It is a poor picture for ONE project: a single line snaking across a
// 1400×800 canvas answers no question you would actually ask about a project.
//
// So when one project is picked, draw what a roadmap actually is: a calendar.
// One row per work package, positioned and sized by its real dates, with its
// milestones as stops on that row, today as a line through all of them, and
// the deadline (if the root has one) as a second line.
//
// Deliberate overlaps with the subway map:
//   * the percentage comes from `stats[id]._progress` and is formatted with
//     progressPctLabel — the same number and the same rounding as every other
//     surface (see utils/progress.js),
//   * `data-tip` / `data-item-id` attributes match the subway renderer's, so
//     Roadmap.jsx's tooltip and click-to-open work unchanged.
import { localDate, iso } from './date.js';
import { directChildren, descendantLeaves, isLeafNode, leafNodes } from './scheduler.js';
import { summarizeNodeTimeline } from './timeline.js';
import { progressPctLabel } from './progress.js';

const W = 1400;
const LABEL_W = 268;
const RIGHT_W = 104;
const PAD = 24;
const HEADER_H = 78;
const ROW_H = 30;
const ROW_GAP = 5;
const AXIS_H = 26;
const FOOT_H = 22;
const PLOT_X = PAD + LABEL_W;
const PLOT_W = W - PLOT_X - RIGHT_W - PAD;
const DAY = 864e5;

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 9px monospace ≈ 5.4 px per character; a name shorter than this reads as noise.
const LABEL_CHAR_W = 5.4;
const MIN_LABEL_CHARS = 6;

const esc = text => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const truncate = (text, len) => (!text ? '' : text.length > len ? `${text.slice(0, len - 1)}…` : text);
const toDate = value => (value instanceof Date ? value : value ? localDate(value) : null);
const startOfMonth = date => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfNextMonth = date => new Date(date.getFullYear(), date.getMonth() + 1, 1);

function statusOf(node) {
  return node?.status === 'done' ? 'done' : node?.status === 'wip' ? 'wip' : 'open';
}

// Milestones are the leaves of a row: one stop each, at the day the work ends
// (recorded end for finished work, scheduled end for the rest).
function milestonesFor(tree, scheduled, node, scheduledMap) {
  const leaves = isLeafNode(tree, node.id) ? [node] : descendantLeaves(tree, node.id);
  return leaves.map(leaf => {
    const sched = scheduledMap.get(leaf.id);
    const end = toDate(leaf.completedEnd || leaf.completedAt) || toDate(sched?.endD) || toDate(leaf.date) || toDate(leaf.pinnedStart);
    const start = toDate(leaf.completedStart) || toDate(sched?.startD) || end;
    return {
      id: leaf.id,
      name: leaf.name || leaf.id,
      status: statusOf(leaf),
      start, end,
      effort: sched?.effort || 0,
    };
  }).filter(m => m.end).sort((a, b) => a.end - b.end);
}

export function computeProjectRoadmap({ tree = [], scheduled = [], stats = {}, rootId, now = new Date() }) {
  const root = (tree || []).find(node => node.id === rootId);
  if (!root) return null;

  const scheduledMap = new Map((scheduled || []).map(item => [item.id, item]));
  const today = toDate(now) || new Date();

  // Rows: the root's direct children. A childless root is its own single row,
  // so a one-task project still renders something meaningful.
  const children = directChildren(tree, root.id);
  const rowNodes = children.length ? children : [root];

  const rows = rowNodes.map(node => {
    const timeline = summarizeNodeTimeline(tree, scheduled, node);
    const window = timeline?.actual || timeline?.period || timeline?.planned || null;
    const milestones = milestonesFor(tree, scheduled, node, scheduledMap);
    const fromMilestones = milestones.length
      ? { start: milestones[0].start || milestones[0].end, end: milestones[milestones.length - 1].end }
      : null;
    const start = window?.start || fromMilestones?.start || null;
    const end = window?.end || fromMilestones?.end || null;
    const leafCount = timeline?.leafCount ?? 1;
    const doneCount = timeline?.doneLeafCount ?? (statusOf(node) === 'done' ? 1 : 0);
    return {
      id: node.id,
      name: node.name || node.id,
      status: statusOf(node),
      allDone: leafCount > 0 && doneCount === leafCount,
      progress: Number(stats?.[node.id]?._progress) || 0,
      leafCount,
      doneCount,
      start, end,
      milestones,
    };
  });

  // Axis span: every date on the board, plus today so the marker is never off
  // the canvas, snapped out to whole months.
  const dates = [];
  rows.forEach(row => { if (row.start) dates.push(+row.start); if (row.end) dates.push(+row.end); });
  rows.forEach(row => row.milestones.forEach(m => { if (m.end) dates.push(+m.end); }));
  const deadline = toDate(root.date);
  if (deadline) dates.push(+deadline);
  dates.push(+today);
  if (!dates.length) return null;

  const axisStart = startOfMonth(new Date(Math.min(...dates)));
  const axisEnd = startOfNextMonth(new Date(Math.max(...dates)));
  const spanMs = Math.max(DAY, axisEnd - axisStart);

  const months = [];
  for (let cursor = new Date(axisStart); cursor < axisEnd; cursor = startOfNextMonth(cursor)) {
    months.push(new Date(cursor));
  }
  // Above ~20 months, monthly ticks turn into a grey smear — label quarters.
  const tickEvery = months.length > 20 ? 3 : 1;

  const allLeaves = isLeafNode(tree, root.id) ? [root] : descendantLeaves(tree, root.id);
  return {
    root,
    progress: Number(stats?.[root.id]?._progress) || 0,
    leafCount: allLeaves.length,
    doneCount: allLeaves.filter(leaf => leaf.status === 'done').length,
    rows,
    months,
    tickEvery,
    axisStart,
    axisEnd,
    spanMs,
    today,
    deadline,
    height: HEADER_H + AXIS_H + rows.length * (ROW_H + ROW_GAP) + FOOT_H,
  };
}

export function renderProjectRoadmapSvg({ tree, scheduled, stats, rootId, color = '#3b82f6', now = new Date(), labels = {} }) {
  const model = computeProjectRoadmap({ tree, scheduled, stats, rootId, now });
  if (!model) return '';

  const monthNames = (labels.months || '').split(',').length === 12
    ? labels.months.split(',')
    : MONTHS_EN;
  const H = model.height;
  const x = date => PLOT_X + clamp((+toDate(date) - +model.axisStart) / model.spanMs, 0, 1) * PLOT_W;
  const dateLabel = date => iso(toDate(date));
  const out = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="display:block;width:100%;height:auto;max-width:100%" preserveAspectRatio="xMidYMin meet">`);
  out.push(`<style>
    .pr-lbl{font:600 12px/1.2 'Inter',system-ui,sans-serif}
    .pr-id{font:700 10px/1.2 'JetBrains Mono',ui-monospace,monospace}
    .pr-meta{font:500 10px/1.2 'JetBrains Mono',ui-monospace,monospace}
    .pr-axis{font:600 9px/1.2 'JetBrains Mono',ui-monospace,monospace}
    .pr-title{font:700 16px/1.2 'Inter',system-ui,sans-serif}
    .pr-sub{font:500 11px/1.2 'Inter',system-ui,sans-serif}
  </style>`);

  // ── Header ──
  const pct = progressPctLabel(model.progress);
  out.push(`<g data-item-id="${esc(model.root.id)}" style="cursor:pointer">`);
  out.push(`<rect x="${PAD}" y="${PAD - 10}" width="${W - PAD * 2}" height="34" rx="6" fill="${esc(color)}" opacity="0.10"/>`);
  out.push(`<rect x="${PAD}" y="${PAD - 10}" width="5" height="34" rx="2.5" fill="${esc(color)}"/>`);
  out.push(`<text class="pr-title" x="${PAD + 16}" y="${PAD + 12}" fill="var(--tx,#e8ecf4)">${esc(truncate(`${model.root.id} · ${model.root.name || ''}`, 68))}</text>`);
  out.push('</g>');
  const headSub = [
    `${pct}%`,
    `${model.doneCount}/${model.leafCount} ${esc(labels.tasks || 'tasks')}`,
    model.deadline ? `${esc(labels.deadline || 'Deadline')} ${dateLabel(model.deadline)}` : '',
  ].filter(Boolean).join('  ·  ');
  out.push(`<text class="pr-sub" x="${W - PAD}" y="${PAD + 12}" text-anchor="end" fill="var(--tx3,#8b95a7)">${headSub}</text>`);

  // ── Month axis ──
  const axisY = HEADER_H;
  const gridTop = axisY + AXIS_H - 6;
  const gridBottom = H - FOOT_H;
  model.months.forEach((month, idx) => {
    const mx = x(month);
    const isTick = idx % model.tickEvery === 0;
    const isJan = month.getMonth() === 0;
    out.push(`<line x1="${mx.toFixed(1)}" y1="${gridTop}" x2="${mx.toFixed(1)}" y2="${gridBottom}" stroke="var(--b,#2a3140)" stroke-width="${isJan ? 1.4 : 1}" opacity="${isJan ? 0.9 : 0.45}"/>`);
    if (!isTick) return;
    const label = model.tickEvery > 1
      ? `Q${Math.floor(month.getMonth() / 3) + 1} '${String(month.getFullYear()).slice(2)}`
      : `${monthNames[month.getMonth()]}${isJan ? ` '${String(month.getFullYear()).slice(2)}` : ''}`;
    out.push(`<text class="pr-axis" x="${(mx + 4).toFixed(1)}" y="${axisY + 8}" fill="var(--tx3,#8b95a7)">${esc(label)}</text>`);
  });
  out.push(`<line x1="${PLOT_X}" y1="${gridTop}" x2="${PLOT_X + PLOT_W}" y2="${gridTop}" stroke="var(--b2,#364456)" stroke-width="1"/>`);

  // ── Rows ──
  model.rows.forEach((row, idx) => {
    const top = axisY + AXIS_H + idx * (ROW_H + ROW_GAP);
    const mid = top + ROW_H / 2;
    if (idx % 2 === 1) {
      out.push(`<rect x="${PAD}" y="${top - 2}" width="${W - PAD * 2}" height="${ROW_H + 4}" fill="var(--tx,#e8ecf4)" opacity="0.03"/>`);
    }

    // Label column — id + name, click opens the item.
    out.push(`<g data-item-id="${esc(row.id)}" style="cursor:pointer" data-tip="${esc(rowTooltip(row, labels, dateLabel))}">`);
    out.push(`<text class="pr-id" x="${PAD + 4}" y="${mid + 4}" fill="var(--tx3,#8b95a7)">${esc(row.id)}</text>`);
    out.push(`<text class="pr-lbl" x="${PAD + 4 + Math.min(74, 18 + row.id.length * 7)}" y="${mid + 4}" fill="var(--tx,#e8ecf4)" opacity="${row.allDone ? 0.55 : 1}">${esc(truncate(row.name, 30))}</text>`);
    out.push('</g>');

    if (row.start && row.end) {
      const bx = x(row.start);
      const bw = Math.max(6, x(row.end) - bx);
      const barY = mid - 7;
      // Track = the full window, fill = effort-weighted progress inside it.
      out.push(`<g data-item-id="${esc(row.id)}" style="cursor:pointer" data-tip="${esc(rowTooltip(row, labels, dateLabel))}">`);
      out.push(`<rect x="${bx.toFixed(1)}" y="${barY}" width="${bw.toFixed(1)}" height="14" rx="7" fill="${esc(color)}" opacity="0.16"/>`);
      if (row.progress > 0) {
        out.push(`<rect x="${bx.toFixed(1)}" y="${barY}" width="${(bw * clamp(row.progress / 100, 0, 1)).toFixed(1)}" height="14" rx="7" fill="${esc(color)}" opacity="${row.allDone ? 0.95 : 0.7}"/>`);
      }
      out.push(`<rect x="${bx.toFixed(1)}" y="${barY}" width="${bw.toFixed(1)}" height="14" rx="7" fill="none" stroke="${esc(color)}" stroke-width="1" opacity="0.6"/>`);
      out.push('</g>');
    } else {
      out.push(`<text class="pr-meta" x="${PLOT_X + 4}" y="${mid + 3}" fill="var(--tx3,#8b95a7)" opacity="0.7">${esc(labels.noDates || 'no dates yet')}</text>`);
    }

    // Milestone stops. A name is only drawn when there is actually room for it
    // before the next stop — counting stops is not enough, five of them inside
    // one month collide just as badly as twenty.
    let lastLabelRight = -Infinity;
    row.milestones.forEach((stop, stopIdx) => {
      const sx = x(stop.end);
      const nextX = stopIdx + 1 < row.milestones.length ? x(row.milestones[stopIdx + 1].end) : PLOT_X + PLOT_W;
      const room = Math.min(nextX - sx, sx - lastLabelRight);
      const labelChars = Math.floor(room / LABEL_CHAR_W) - 1;
      const canLabel = labelChars >= MIN_LABEL_CHARS;
      const fill = stop.status === 'done' ? color : 'var(--bg2,#191d25)';
      const stroke = stop.status === 'open' ? 'var(--tx3,#8b95a7)' : color;
      out.push(`<g data-item-id="${esc(stop.id)}" style="cursor:pointer" pointer-events="all" data-tip="${esc(stopTooltip(stop, labels, dateLabel))}">`);
      out.push(`<circle cx="${sx.toFixed(1)}" cy="${mid}" r="4.5" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="1.6"/>`);
      if (stop.status === 'done') {
        out.push(`<path d="M${(sx - 2).toFixed(1)} ${mid} l1.6 1.7 l2.6 -3.2" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`);
      }
      if (canLabel) {
        const label = truncate(stop.name, Math.min(22, labelChars));
        out.push(`<text class="pr-axis" x="${(sx + 7).toFixed(1)}" y="${mid - 8}" fill="var(--tx2,#cbd5e1)" opacity="0.8">${esc(label)}</text>`);
        lastLabelRight = sx + 7 + label.length * LABEL_CHAR_W;
      }
      out.push('</g>');
    });

    // Right column: count + percentage, the shared figure.
    out.push(`<text class="pr-meta" x="${W - PAD - 4}" y="${mid + 3}" text-anchor="end" fill="${row.allDone ? esc(color) : 'var(--tx2,#cbd5e1)'}">${row.doneCount}/${row.leafCount}  ${progressPctLabel(row.progress)}%</text>`);
  });

  // ── Today, and the deadline if there is one ──
  const todayX = x(model.today);
  out.push(`<line x1="${todayX.toFixed(1)}" y1="${gridTop - 8}" x2="${todayX.toFixed(1)}" y2="${gridBottom}" stroke="#22c55e" stroke-width="1.6" stroke-dasharray="4 3"/>`);
  // Above the month row, not on its baseline — the two collided ("Sepday").
  out.push(`<text class="pr-axis" x="${todayX.toFixed(1)}" y="${axisY - 4}" text-anchor="middle" fill="#22c55e">${esc(labels.today || 'today')}</text>`);
  if (model.deadline) {
    const dx = x(model.deadline);
    out.push(`<line x1="${dx.toFixed(1)}" y1="${gridTop - 8}" x2="${dx.toFixed(1)}" y2="${gridBottom}" stroke="#f43f5e" stroke-width="1.6" stroke-dasharray="2 3"/>`);
    out.push(`<text class="pr-axis" x="${dx.toFixed(1)}" y="${gridBottom + 13}" text-anchor="middle" fill="#f43f5e">${esc(dateLabel(model.deadline))}</text>`);
  }

  out.push('</svg>');
  return out.join('');
}

function rowTooltip(row, labels, dateLabel) {
  const period = row.start && row.end ? `${dateLabel(row.start)} → ${dateLabel(row.end)}` : (labels.noDates || 'no dates yet');
  return `<div><b>${esc(row.id)} ${esc(row.name)}</b><br/>${esc(period)}<br/>`
    + `${progressPctLabel(row.progress)}% · ${row.doneCount}/${row.leafCount} ${esc(labels.tasks || 'tasks')}</div>`;
}

function stopTooltip(stop, labels, dateLabel) {
  const state = stop.status === 'done' ? (labels.stateDone || 'done')
    : stop.status === 'wip' ? (labels.stateWip || 'in progress')
    : (labels.stateOpen || 'open');
  const window = stop.start && stop.end && +stop.start !== +stop.end
    ? `${dateLabel(stop.start)} → ${dateLabel(stop.end)}`
    : dateLabel(stop.end);
  return `<div><b>${esc(stop.id)} ${esc(stop.name)}</b><br/>${esc(window)}<br/>${esc(state)}`
    + `${stop.effort ? ` · ${Math.round(stop.effort)} PT` : ''}</div>`;
}

// Exported for tests: the roadmap must show every leaf of the project exactly
// once, so nothing can silently drop off the board.
export function projectRoadmapLeafIds(tree, rootId) {
  const root = (tree || []).find(node => node.id === rootId);
  if (!root) return [];
  const leaves = isLeafNode(tree, root.id) ? [root] : descendantLeaves(tree, root.id);
  return leaves.map(leaf => leaf.id);
}

export const _internals = { W, LABEL_W, PLOT_X, PLOT_W, leafNodes };
