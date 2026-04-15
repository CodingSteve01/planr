import { addD, iso } from './date.js';
import { buildWeeks } from './holidays.js';

export const pt = t => { if (!t) return ''; const m = t.match(/[A-Z][A-Z0-9]*/g); return m ? m[0] : t; };
// Realistic effort: best × factor (no hidden caps — user's factor is respected)
export const re = (best, factor) => best && best > 0 ? best * (factor || 1.5) : 0;
export const parentId = id => id.split('.').slice(0, -1).join('.');

export function directChildren(tree, id) {
  return tree.filter(r => parentId(r.id) === id);
}

export function hasChildren(tree, id) {
  return tree.some(r => parentId(r.id) === id);
}

export function isLeafNode(tree, nodeOrId) {
  const id = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId?.id;
  return !!id && !hasChildren(tree, id);
}

export function leafNodes(tree) {
  return tree.filter(r => isLeafNode(tree, r.id));
}

export function resolveToLeafIds(tree, id) {
  const item = typeof id === 'string' ? tree.find(r => r.id === id) : id;
  if (!item) return [];
  if (isLeafNode(tree, item.id)) return [item.id];
  return leafNodes(tree).filter(l => l.id.startsWith(item.id + '.')).map(l => l.id);
}

export function schedule(tree, members, vacations, ps, pe, hm) {
  const wks = buildWeeks(ps, pe, hm);
  if (!wks.length) return { results: [], weeks: [] };
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const lvs = leafNodes(tree);
  function resD(id) { return resolveToLeafIds(tree, id); }
  const vis = new Set(), ord = [];
  const sv = [...lvs].sort((a, b) => (a.prio || 4) - (b.prio || 4) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id));
  // Collect deps including those inherited from ancestors (so a parent dep blocks all its leaves)
  const effectiveDeps = id => {
    const r = iMap[id]; if (!r) return [];
    const ownDeps = r.deps || [];
    const ancestors = []; let aid = parentId(id); while (aid) { ancestors.push(aid); aid = parentId(aid); }
    return [...new Set([...ownDeps, ...ancestors.flatMap(a => iMap[a]?.deps || [])])];
  };
  const visit = id => { if (vis.has(id)) return; vis.add(id); effectiveDeps(id).flatMap(resD).filter(d => d !== id).forEach(visit); ord.push(id); };
  sv.forEach(r => visit(r.id));
  const pF = Object.fromEntries(members.map(m => [m.id, 0]));
  const tSlots = {}; // per-team slot array for unassigned task sequencing
  const tEW = {};
  lvs.filter(r => r.status === 'done' || !r.best || r.best === 0).forEach(r => { tEW[r.id] = -1; });
  // Vacation: explicit weeks per person
  const vs = {}; (vacations || []).forEach(v => { if (!vs[v.person]) vs[v.person] = {}; vs[v.person][v.week] = true; });
  // Total working days in plan period (for blanket vacation deduction)
  const totalWDs = wks.reduce((s, w) => s + w.wds.length, 0);
  // Per-person: count of explicit vacation weeks, remaining unplanned vacation
  const vacInfo = {};
  members.forEach(m => {
    const explicitWeeks = Object.keys(vs[m.id] || {}).length;
    const explicitDays = explicitWeeks * 5;
    const totalVac = m.vac || 25;
    const remainingVac = Math.max(0, totalVac - explicitDays);
    // Blanket deduction only for unplanned vacation days
    vacInfo[m.id] = totalWDs > 0 ? 1 - remainingVac / totalWDs : 1;
  });
  function pC(m, wmon) {
    if (vs[m.id]?.[iso(wmon)]) return 0; // explicit vacation week
    const st = new Date(m.start || ps); if (st > addD(wmon, 6)) return 0;
    const w = wks.find(x => x.mon.getTime() === wmon.getTime());
    if (!w) return 0;
    return w.wds.filter(d => d >= st).length * (m.cap || 1) * vacInfo[m.id];
  }
  const res = [];
  ord.forEach(id => {
    if (tEW[id] != null && tEW[id] === -1) return;
    const r = iMap[id];
    if (!r || !isLeafNode(tree, r.id) || !r.best || r.best === 0) { tEW[id] = -1; return; }
    const eff = re(r.best, r.factor);
    const team = pt(r.team);
    const tM = members.filter(m => pt(m.team) === team);
    // Inherit deps from all ancestors so a parent dep blocks every leaf underneath
    const ancestorIds = []; let aid = parentId(r.id); while (aid) { ancestorIds.push(aid); aid = parentId(aid); }
    const inheritedDeps = ancestorIds.flatMap(a => iMap[a]?.deps || []);
    const allDepsRaw = [...new Set([...(r.deps || []), ...inheritedDeps])];
    const allD = allDepsRaw.flatMap(resD).filter(d => d !== r.id);
    let dE = -1; allD.forEach(d => { const fw = tEW[d]; if (fw != null && fw > dE) dE = fw; });
    const early = dE >= 0 ? dE + 2 : 0;
    const asgn = (r.assign || []).filter(a => members.find(m => m.id === a));
    // ONLY explicitly assigned people — never auto-assign from team pool
    if (!asgn.length) {
      // No assignee: schedule using team slot array to prevent over-parallelism
      // Each team gets one slot per member; unassigned tasks queue across slots
      const tk = team || '__none';
      if (!tSlots[tk]) tSlots[tk] = tM.length > 0 ? new Array(tM.length).fill(0) : [0];
      const slots = tSlots[tk];
      // Find the earliest available slot
      const si = slots.reduce((best, fw, i) => fw < slots[best] ? i : best, 0);
      const slotEarly = Math.max(early, slots[si]);
      const avgCap = tM.length > 0
        ? tM.reduce((s, m) => s + (m.cap || 1), 0) / tM.length
        : 1;
      const avgVac = tM.length > 0
        ? tM.reduce((s, m) => s + vacInfo[m.id], 0) / tM.length
        : 0.9;
      let rem = eff, wi = slotEarly;
      while (rem > 0 && wi < wks.length) {
        const w = wks[wi];
        rem -= w.wds.length * avgCap * avgVac;
        wi++;
      }
      const eW = Math.min(Math.max(wi - 1, slotEarly), wks.length - 1);
      tEW[id] = eW;
      slots[si] = eW + 1; // occupy the slot until this task finishes
      const startWi = slotEarly < wks.length ? slotEarly : 0;
      const calDays = Math.round((addD(wks[eW].mon, 4) - wks[startWi].mon) / 864e5);
      res.push({ id: r.id, name: r.name, team, person: '(unassigned)', personId: null, prio: r.prio, seq: r.seq,
        best: r.best, effort: eff, startWi: slotEarly, endWi: eW,
        startD: wks[startWi].mon, endD: addD(wks[eW].mon, 4), calDays,
        capPct: Math.round(avgCap * 100), vacDed: Math.round((1 - avgVac) * 100), weeks: eW - slotEarly + 1,
        deps: (r.deps || []).join(', '), status: r.status, note: r.note || '' });
      return;
    }
    // Explicitly assigned: find earliest available
    const cands = members.filter(m => asgn.includes(m.id));
    let bp = null, bs = 9999;
    cands.forEach(m => { const ji = wks.findIndex(w => w.mon >= new Date(m.start || ps)); const fw = Math.max(pF[m.id] || 0, early, ji >= 0 ? ji : 0); if (fw < bs) { bs = fw; bp = m; } });
    if (!bp || bs >= wks.length) { tEW[id] = Math.min(early, wks.length - 1); return; }
    let rem = eff, wi = bs;
    while (rem > 0 && wi < wks.length) { rem -= Math.max(pC(bp, wks[wi].mon), 0.01); wi++; }
    const eW = Math.min(wi - 1, wks.length - 1);
    tEW[id] = eW; pF[bp.id] = eW + 1;
    const calDays = Math.round((addD(wks[eW].mon, 4) - wks[bs].mon) / 864e5);
    const capPct = Math.round((bp.cap || 1) * 100);
    const vacDed = Math.round((1 - vacInfo[bp.id]) * 100);
    res.push({ id: r.id, name: r.name, team, person: bp.name || bp.id, personId: bp.id, prio: r.prio, seq: r.seq,
      best: r.best, effort: eff, startWi: bs, endWi: eW,
      startD: wks[bs].mon, endD: addD(wks[eW].mon, 4), calDays,
      capPct, vacDed, weeks: eW - bs + 1,
      deps: (r.deps || []).join(', '), status: r.status, note: r.note || '' });
  });
  return { results: res, weeks: wks };
}

// Derive leaf progress: explicit field > status-based default
export function leafProgress(r) {
  if (r.progress != null && r.progress >= 0) return r.progress;
  if (r.status === 'done') return 100;
  if (r.status === 'wip') return 50;
  return 0;
}

export function treeStats(tree) {
  const m = Object.fromEntries(tree.map(r => [r.id, { ...r }]));
  [...tree].reverse().forEach(r => {
    if (isLeafNode(tree, r.id)) {
      m[r.id]._b = r.best || 0;
      m[r.id]._r = re(r.best || 0, r.factor || 1.5);
      m[r.id]._w = (r.best || 0) * (r.factor || 1.5);
      m[r.id]._progress = leafProgress(r);
    } else {
      const ch = directChildren(tree, r.id);
      m[r.id]._b = ch.reduce((s, c) => s + (m[c.id]?._b || 0), 0);
      m[r.id]._r = ch.reduce((s, c) => s + (m[c.id]?._r || 0), 0);
      m[r.id]._w = ch.reduce((s, c) => s + (m[c.id]?._w || 0), 0);
      // Weighted progress: by realistic effort (fall back to equal weight)
      const leaves = leafNodes(tree).filter(c => c.id.startsWith(r.id + '.'));
      if (leaves.length) {
        const totalEff = leaves.reduce((s, l) => s + (m[l.id]?._r || 1), 0);
        const weightedProg = leaves.reduce((s, l) => s + (m[l.id]?._progress || 0) * (m[l.id]?._r || 1), 0);
        m[r.id]._progress = Math.round(weightedProg / Math.max(totalEff, 1));
        const done = leaves.filter(l => l.status === 'done').length;
        const wip = leaves.filter(l => l.status === 'wip').length;
        m[r.id]._autoStatus = done === leaves.length ? 'done' : (done > 0 || wip > 0 || m[r.id]._progress > 0) ? 'wip' : 'open';
      }
    }
  });
  return m;
}

// Enrich stats with scheduled date ranges for parent items (L1, L2)
export function enrichParentSchedules(stats, tree, results) {
  tree.filter(r => !isLeafNode(tree, r.id)).forEach(parent => {
    const ch = results.filter(s => s.id.startsWith(parent.id + '.') && s.startD && s.endD);
    if (!ch.length) return;
    if (stats[parent.id]) {
      stats[parent.id]._startD = new Date(Math.min(...ch.map(s => new Date(s.startD))));
      stats[parent.id]._endD = new Date(Math.max(...ch.map(s => new Date(s.endD))));
      stats[parent.id]._taskCount = ch.length;
    }
  });
}

// Compute auto-status for parent items (call after treeStats)
export function deriveParentStatuses(tree, stats) {
  return tree.map(r => {
    if (isLeafNode(tree, r.id)) return r;
    const s = stats[r.id];
    if (s?._autoStatus && s._autoStatus !== r.status) return { ...r, status: s._autoStatus };
    return r;
  });
}

export function nextChildId(tree, parentId) {
  if (!parentId) {
    const nums = tree.filter(r => r.lvl === 1).map(r => parseInt(r.id.replace(/^P/, '')) || 0);
    return `P${(nums.length ? Math.max(...nums) : 0) + 1}`;
  }
  const depth = parentId.split('.').length;
  const siblings = tree.filter(r => r.id.startsWith(parentId + '.') && r.id.split('.').length === depth + 1);
  const nums = siblings.map(r => parseInt(r.id.split('.').pop()) || 0);
  return `${parentId}.${(nums.length ? Math.max(...nums) : 0) + 1}`;
}
