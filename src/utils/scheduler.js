import { addD, iso, addWorkDays, localDate } from './date.js';
import { buildWeeks } from './holidays.js';

export const pt = t => { if (!t) return ''; const m = t.match(/[A-Z][A-Z0-9]*/g); return m ? m[0] : t; };
// Realistic effort: best × factor (no hidden caps — user's factor is respected)
export const re = (best, factor) => best && best > 0 ? best * (factor || 1.5) : 0;
export const parentId = id => id.split('.').slice(0, -1).join('.');

// Derive task status + progress from its phases array.
// Returns null if no phases exist (caller keeps manual status).
export function derivePhaseStatus(phases) {
  if (!phases?.length) return null;
  const done = phases.filter(p => p.status === 'done').length;
  const wip = phases.filter(p => p.status === 'wip').length;
  if (done === phases.length) return { status: 'done', progress: 100 };
  if (done > 0 || wip > 0) return { status: 'wip', progress: Math.round(done / phases.length * 100) };
  return { status: 'open', progress: 0 };
}

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

// ps = viewStart (rendering start, may be before planStart for pre-started tasks)
// planStartStr = scheduling start (new/unstarted tasks begin here)
export function schedule(tree, members, vacations, ps, pe, hm, workDaysArr, planStartStr) {
  const wks = buildWeeks(ps, pe, hm, workDaysArr);
  const wdSet = workDaysArr ? new Set(workDaysArr) : new Set([1, 2, 3, 4, 5]);
  if (!wks.length) return { results: [], weeks: [] };
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const lvs = leafNodes(tree);
  function resD(id) { return resolveToLeafIds(tree, id); }
  // planStartWi = week index where actual scheduling begins (non-pinned tasks start here).
  // Weeks before this exist for rendering only.
  const planStartDate = localDate(planStartStr || ps);
  const planStartWi = Math.max(0, wks.findIndex(w => addD(w.mon, 7) > planStartDate));
  const vis = new Set(), ord = [];
  const sv = [...lvs].sort((a, b) => {
    const aFuture = a.pinnedStart && new Date(a.pinnedStart) > planStartDate ? 1 : 0;
    const bFuture = b.pinnedStart && new Date(b.pinnedStart) > planStartDate ? 1 : 0;
    if (aFuture !== bFuture) return aFuture - bFuture;
    return (a.prio || 4) - (b.prio || 4) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id);
  });
  // Collect deps including those inherited from ancestors (so a parent dep blocks all its leaves)
  const effectiveDeps = id => {
    const r = iMap[id]; if (!r) return [];
    const ownDeps = r.deps || [];
    const ancestors = []; let aid = parentId(id); while (aid) { ancestors.push(aid); aid = parentId(aid); }
    return [...new Set([...ownDeps, ...ancestors.flatMap(a => iMap[a]?.deps || [])])];
  };
  const visit = id => { if (vis.has(id)) return; vis.add(id); effectiveDeps(id).flatMap(resD).filter(d => d !== id).forEach(visit); ord.push(id); };
  sv.forEach(r => visit(r.id));
  // pF, tEW, and tSlots now track {wi, nextDate} pairs: wi is the week the
  // task ends in, nextDate is the FIRST WORKING DAY the resource/successor is
  // free. This eliminates the week-boundary gap: if task A ends Wednesday, the
  // next task starts Thursday (same week), not next Monday.
  const pF = Object.fromEntries(members.map(m => [m.id, { wi: planStartWi, nextDate: null }]));
  const tSlots = {}; // per-team slot array of {wi, nextDate}
  const tEW = {};
  const pPE = {}; // per-person parallel-end high-water mark {wi, nextDate}
  lvs.filter(r => r.status === 'done' || !r.best || r.best === 0).forEach(r => { tEW[r.id] = { wi: -1, nextDate: null }; });
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
    const st = localDate(m.start || ps); if (st > addD(wmon, 6)) return 0;
    const w = wks.find(x => x.mon.getTime() === wmon.getTime());
    if (!w) return 0;
    return w.wds.filter(d => d >= st).length * (m.cap || 1) * vacInfo[m.id];
  }
  const res = [];
  ord.forEach(id => {
    if (tEW[id]?.wi === -1) return;
    const r = iMap[id];
    if (!r || !isLeafNode(tree, r.id) || !r.best || r.best === 0) { tEW[id] = { wi: -1, nextDate: null }; return; }
    const eff = re(r.best, r.factor);
    const team = pt(r.team);
    const tM = members.filter(m => pt(m.team) === team);
    // Inherit deps from all ancestors so a parent dep blocks every leaf underneath
    const ancestorIds = []; let aid = parentId(r.id); while (aid) { ancestorIds.push(aid); aid = parentId(aid); }
    const inheritedDeps = ancestorIds.flatMap(a => iMap[a]?.deps || []);
    const allDepsRaw = [...new Set([...(r.deps || []), ...inheritedDeps])];
    const allD = allDepsRaw.flatMap(resD).filter(d => d !== r.id);
    // Dep tracking: find the LATEST predecessor finish. Both the week index and the day-
    // accurate nextDate are tracked so the successor can start the very next working day
    // (not the next full week — that was the source of the phantom gaps).
    let depWi = -1, depNextDate = null;
    allD.forEach(d => {
      const fw = tEW[d]; if (!fw || fw.wi < 0) return;
      if (fw.wi > depWi || (fw.wi === depWi && fw.nextDate && (!depNextDate || fw.nextDate > depNextDate))) {
        depWi = fw.wi; depNextDate = fw.nextDate;
      }
    });
    // Non-pinned tasks default to planStartWi. Pinned tasks can start earlier
    // (from week 0 = viewStart) — the planning horizon only constrains auto-scheduled work.
    let early = depWi >= 0 ? depWi : (r.pinnedStart ? 0 : planStartWi);
    let earlyDate = depNextDate;
    // If no dep constrains the date and the task isn't pinned, don't start before planStartDate
    // (fixes off-by-one where tasks started on the Monday before the Tuesday planning horizon).
    if (!earlyDate && depWi < 0 && !r.pinnedStart) earlyDate = planStartDate;
    // Pinned start: user manually pinned this task to a specific date.
    if (r.pinnedStart) {
      const pinDate = localDate(r.pinnedStart);
      const pinWi = wks.findIndex(w => w.wds.some(d => d >= pinDate));
      if (pinWi >= 0 && (pinWi > early || (pinWi === early && pinDate > (earlyDate || new Date(0))))) {
        early = pinWi; earlyDate = pinDate;
      }
    }
    let asgn = (r.assign || []).filter(a => members.find(m => m.id === a));
    if (!asgn.length && tM.length === 1) asgn = [tM[0].id];

    // ── Team-slot path (multi-member, unassigned) ──────────────────────────────
    if (!asgn.length) {
      const tk = team || '__none';
      if (!tSlots[tk]) tSlots[tk] = tM.length > 0 ? new Array(tM.length).fill(null).map(() => ({ wi: planStartWi, nextDate: null })) : [{ wi: planStartWi, nextDate: null }];
      const slots = tSlots[tk];
      const si = slots.reduce((best, s, i) => s.wi < slots[best].wi ? i : best, 0);
      const slotFree = slots[si];
      const slotWi = Math.max(early, slotFree.wi);
      // Compute skipBefore: the latest of dep/pin/slot "next available date"
      let skipBefore = earlyDate;
      if (slotFree.nextDate && (!skipBefore || slotFree.nextDate > skipBefore)) skipBefore = slotFree.nextDate;
      const avgCap = tM.length > 0 ? tM.reduce((s, m) => s + (m.cap || 1), 0) / tM.length : 1;
      const avgVac = tM.length > 0 ? tM.reduce((s, m) => s + vacInfo[m.id], 0) / tM.length : 0.9;
      const dailyAvgCap = avgCap * avgVac;
      let rem = eff, wi = slotWi, firstWorkDay = null, lastWorkDay = null;
      while (rem > 0 && wi < wks.length) {
        for (const d of wks[wi].wds) {
          if (skipBefore && d < skipBefore) continue;
          if (!firstWorkDay) firstWorkDay = d;
          rem -= dailyAvgCap; lastWorkDay = d;
          if (rem <= 0) break;
        }
        if (rem <= 0) break; wi++;
      }
      const eW = Math.min(Math.max(wi, slotWi), wks.length - 1);
      const nd = lastWorkDay ? addWorkDays(lastWorkDay, 1, wdSet) : null;
      tEW[id] = { wi: eW, nextDate: nd };
      slots[si] = { wi: eW, nextDate: nd };
      const actualStartD = firstWorkDay || wks[slotWi]?.mon || wks[0].mon;
      const actualEndD = lastWorkDay || addD(wks[eW].mon, 4);
      allD.forEach(depId => {
        const dEnd = tEW[depId];
        if (!dEnd || dEnd.wi < 0) return;
        if (dEnd.nextDate && actualStartD < dEnd.nextDate) {
          console.warn(`[scheduler] Dep violation: ${r.id} starts ${iso(actualStartD)} but dep ${depId} not free until ${iso(dEnd.nextDate)}`);
        }
      });
      res.push({ id: r.id, name: r.name, team, person: '(unassigned)', personId: null, prio: r.prio, seq: r.seq,
        best: r.best, effort: eff, startWi: slotWi, endWi: eW,
        startD: actualStartD, endD: actualEndD, calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
        capPct: Math.round(avgCap * 100), vacDed: Math.round((1 - avgVac) * 100), weeks: eW - slotWi + 1,
        deps: (r.deps || []).join(', '), status: r.status, note: r.note || '' });
      return;
    }

    // ── Per-person assigned path ───────────────────────────────────────────────
    const cands = members.filter(m => asgn.includes(m.id));
    let bp = null, bs = 9999;
    cands.forEach(m => {
      const mStart = localDate(m.start || ps);
      const ji = wks.findIndex(w => w.wds.some(d => d >= mStart));
      const personFree = pF[m.id] || { wi: planStartWi, nextDate: null };
      const parallelEnd = pPE[m.id] || { wi: -1, nextDate: null };
      // Pinned tasks bypass person-capacity (hard start override) — only constrained by
      // deps and the member's availability start date, just like parallel tasks.
      const fw = (r.parallel || r.pinnedStart)
        ? Math.max(early, ji >= 0 ? ji : 0)
        : Math.max(personFree.wi, parallelEnd.wi >= 0 ? parallelEnd.wi : 0, early, ji >= 0 ? ji : 0);
      if (fw < bs) { bs = fw; bp = m; }
    });
    if (!bp || bs >= wks.length) { tEW[id] = { wi: Math.min(early, wks.length - 1), nextDate: null }; return; }
    let pinOverridden = false;
    if (r.pinnedStart && !r.parallel) {
      const pinDate = localDate(r.pinnedStart);
      const pinWi = wks.findIndex(w => w.wds.some(d => d >= pinDate));
      // Only flag override if the member's onboarding date pushes later (not capacity)
      const mStartDate = localDate(bp.start || ps);
      const mStartWi = wks.findIndex(w => w.wds.some(d => d >= mStartDate));
      if (pinWi >= 0 && mStartWi >= 0 && mStartWi > pinWi) pinOverridden = true;
    }
    // Compute the earliest date this person can actually start working — the latest of
    // dep constraint, person free-date, member availability, and pin.
    const mStart = localDate(bp.start || ps);
    const personFree = (r.parallel || r.pinnedStart) ? null : pF[bp.id]?.nextDate;
    const parallelEndDate = (r.parallel || r.pinnedStart) ? null : pPE[bp.id]?.nextDate;
    let skipBefore = mStart;
    if (earlyDate && earlyDate > skipBefore) skipBefore = earlyDate;
    if (personFree && personFree > skipBefore) skipBefore = personFree;
    if (parallelEndDate && parallelEndDate > skipBefore) skipBefore = parallelEndDate;
    const dailyBaseCap = (bp.cap || 1) * vacInfo[bp.id];
    const endDate = bp.end ? localDate(bp.end) : null;
    let rem = eff, wi = bs, firstWorkDay = null, lastWorkDay = null;
    while (rem > 0 && wi < wks.length) {
      const w = wks[wi];
      if (vs[bp.id]?.[iso(w.mon)]) { wi++; continue; }
      if (endDate && w.mon > endDate) break; // person offboarded
      for (const d of w.wds) {
        if (d < skipBefore) continue;
        if (endDate && d > endDate) break; // past offboarding date
        if (!firstWorkDay) firstWorkDay = d;
        rem -= dailyBaseCap; lastWorkDay = d;
        if (rem <= 0) break;
      }
      if (rem <= 0) break; wi++;
    }
    const eW = Math.min(wi, wks.length - 1);
    const nd = lastWorkDay ? addWorkDays(lastWorkDay, 1, wdSet) : null;
    tEW[id] = { wi: eW, nextDate: nd };
    if (!r.parallel) {
      pF[bp.id] = { wi: eW, nextDate: nd };
    } else {
      // Track parallel high-water mark: next sequential task must wait for all parallel work to finish.
      const prev = pPE[bp.id];
      if (!prev || eW > prev.wi || (eW === prev.wi && nd && (!prev.nextDate || nd > prev.nextDate))) {
        pPE[bp.id] = { wi: eW, nextDate: nd };
      }
    }
    const actualStartD = firstWorkDay || wks[bs].mon;
    const actualEndD = lastWorkDay || addD(wks[eW].mon, 4);
    // Dep violation diagnostic: warn if this task starts before any of its deps finish.
    allD.forEach(depId => {
      const dEnd = tEW[depId];
      if (!dEnd || dEnd.wi < 0) return;
      const depEndD = dEnd.nextDate; // first free day after dep
      if (depEndD && actualStartD < depEndD) {
        console.warn(`[scheduler] Dep violation: ${r.id} starts ${iso(actualStartD)} but dep ${depId} not free until ${iso(depEndD)}`);
      }
    });
    res.push({ id: r.id, name: r.name, team, person: bp.name || bp.id, personId: bp.id, assign: r.assign || [], prio: r.prio, seq: r.seq,
      best: r.best, effort: eff, startWi: bs, endWi: eW,
      startD: actualStartD, endD: actualEndD, calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
      capPct: Math.round((bp.cap || 1) * 100), vacDed: Math.round((1 - vacInfo[bp.id]) * 100),
      weeks: eW - bs + 1, parallel: !!r.parallel, pinOverridden,
      deps: (r.deps || []).join(', '), status: r.status, note: r.note || '' });
  });
  return { results: res, weeks: wks };
}

// ── Planning confidence ───────────────────────────────────────────────────────
// Categorises every item into one of three confidence levels that drive
// visual differentiation in the Gantt and the Planning Review panel.
//   committed   — person assigned, estimate exists, risk factor reasonable
//   estimated   — team/estimate exists but no person or high risk
//   exploratory — scope unclear: no estimate or very high risk factor
export function computeConfidence(tree, members) {
  const result = {};
  const lvs = leafNodes(tree); // compute once, reuse below
  lvs.forEach(r => {
    // Manual override wins
    if (r.confidence) { result[r.id] = r.confidence; return; }
    if (r.status === 'done') { result[r.id] = 'committed'; return; }
    const hasAssign = (r.assign || []).length > 0;
    const hasEstimate = r.best > 0;
    const highRisk = (r.factor || 1.5) >= 2.0;
    if (hasAssign && hasEstimate && !highRisk) {
      result[r.id] = 'committed';
    } else if (hasEstimate && !highRisk) {
      result[r.id] = 'estimated';
    } else {
      result[r.id] = 'exploratory';
    }
  });
  // Parents inherit the WORST confidence of their leaf descendants
  const order = ['exploratory', 'estimated', 'committed'];
  tree.forEach(parent => {
    if (isLeafNode(tree, parent.id)) return;
    if (parent.confidence) { result[parent.id] = parent.confidence; return; }
    const childLeaves = lvs.filter(l => l.id.startsWith(parent.id + '.'));
    if (!childLeaves.length) return;
    const worst = childLeaves.reduce((w, c) => {
      const ci = order.indexOf(result[c.id] || 'exploratory');
      return ci < w ? ci : w;
    }, 2);
    result[parent.id] = order[worst];
  });
  return result;
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
