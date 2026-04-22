import { addD, iso, addWorkDays, localDate, eachDayInclusive, normalizeVacation } from './date.js';
import { buildWeeks } from './holidays.js';
import { phaseProgress } from './phases.js';

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
  if (done > 0 || wip > 0) return { status: 'wip', progress: phaseProgress(phases) };
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
  const clampCompletedDate = (dateLike) => {
    if (!dateLike) return '';
    const date = localDate(dateLike);
    const today = localDate(new Date());
    return iso(date > today ? today : date);
  };
  const weekIndexOfDate = (date) => {
    if (!date) return -1;
    const idx = wks.findIndex(w => date < addD(w.mon, 7));
    return idx >= 0 ? idx : wks.length - 1;
  };
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const lvs = leafNodes(tree);
  // Build short-name map from member IDs (e.g. "SL", "MZ")
  const mShort = {};
  if (members?.length) {
    const bases = members.map(m => { const w = (m.name || '').trim().split(/\s+/).filter(Boolean); return !w.length ? '?' : w.length === 1 ? w[0].slice(0, 2).toUpperCase() : w.map(x => x[0]).join('').toUpperCase(); });
    const cnt = {}; bases.forEach(b => { cnt[b] = (cnt[b] || 0) + 1; });
    const seen = {}; members.forEach((m, i) => { const b = bases[i]; if (cnt[b] === 1) mShort[m.id] = b; else { seen[b] = (seen[b] || 0) + 1; mShort[m.id] = b + seen[b]; } });
  }
  function resD(id) { return resolveToLeafIds(tree, id); }
  // planStartWi = week index where actual scheduling begins (non-pinned tasks start here).
  // Weeks before this exist for rendering only.
  const planStartDate = localDate(planStartStr || ps);
  const planStartWi = Math.max(0, wks.findIndex(w => addD(w.mon, 7) > planStartDate));
  const vis = new Set(), ord = [];
  const sv = [...lvs].sort((a, b) => {
    // Pinned tasks schedule FIRST so their person-capacity (pF) consumption is visible
    // to subsequent auto-assigned work. Otherwise auto tasks fill the same window as
    // a future-pinned task and overlap on the same person.
    const aPinned = a.pinnedStart ? 0 : 1;
    const bPinned = b.pinnedStart ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    // Assigned tasks schedule before unassigned at same priority — ensures person
    // capacity (pF) is consumed by committed work before speculative tasks are placed.
    const aHasPerson = (a.assign?.length > 0) ? 0 : 1;
    const bHasPerson = (b.assign?.length > 0) ? 0 : 1;
    return (a.prio || 4) - (b.prio || 4) || aHasPerson - bHasPerson || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id);
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
  const tEW = {};
  const pPE = {}; // per-person parallel-end high-water mark {wi, nextDate}
  lvs.forEach(r => {
    if (r.status === 'done') {
      const completedAt = clampCompletedDate(r.completedAt || r.completedEnd);
      if (!completedAt) {
        tEW[r.id] = { wi: -1, nextDate: null };
        return;
      }
      const completedDate = localDate(completedAt);
      tEW[r.id] = {
        wi: weekIndexOfDate(completedDate),
        nextDate: addWorkDays(completedDate, 1, wdSet),
      };
      return;
    }
    if (!r.best || r.best === 0) tEW[r.id] = { wi: -1, nextDate: null };
  });
  // Vacation: precompute per-person Set of blocked day ISO strings from date ranges.
  // Accepts both new {from, to} format and legacy {week} format (via normalizeVacation).
  const vs = {}; // vs[personId] = Set<isoDateString>
  (vacations || []).forEach(v => {
    const nv = normalizeVacation(v);
    if (!nv.from || !nv.to) return;
    if (!vs[nv.person]) vs[nv.person] = new Set();
    for (const d of eachDayInclusive(nv.from, nv.to)) vs[nv.person].add(iso(d));
  });
  // Returns true if ANY of the given assignee IDs has the given ISO date blocked by vacation.
  // Works for single-assign (union of 1 set) and multi-assign alike.
  const anyAssigneeOnVacation = (dateIso, assignIds, vacSets) =>
    assignIds.some(id => vacSets[id]?.has(dateIso));

  // Compute window stats for a scheduled task: vacation working days (union across all assignees),
  // holiday working days, and net working days in [startD, endD].
  // assignIds: array of person IDs (may be empty for unassigned fallback).
  const computeWindowStats = (startD, endD, assignIds) => {
    let vacDays = 0, holidaysInWindow = 0, workingDaysInWindow = 0;
    if (!startD || !endD) return { vacDays, holidaysInWindow, workingDaysInWindow };
    const startIso = iso(startD);
    const endIso = iso(endD);
    for (const d of eachDayInclusive(startIso, endIso)) {
      const dIso = iso(d);
      if (!wdSet.has(d.getDay())) continue; // not a configured work day
      if (hm[dIso]) { holidaysInWindow++; continue; } // holiday (not counted as vac or working)
      if (assignIds.length > 0 && assignIds.some(id => vs[id]?.has(dIso))) {
        vacDays++;
      } else {
        workingDaysInWindow++;
      }
    }
    return { vacDays, holidaysInWindow, workingDaysInWindow };
  };

  // Total working days in plan period (for blanket vacation deduction)
  const totalWDs = wks.reduce((s, w) => s + w.wds.length, 0);
  // Per-person: count explicit vacation days (only working days), remaining unplanned vacation
  const vacInfo = {};
  const wdIsoSet = new Set(wks.flatMap(w => w.wds.map(d => iso(d))));
  members.forEach(m => {
    const blockedDays = vs[m.id] || new Set();
    // Count only days that are actual working days in the plan period
    const explicitDays = [...blockedDays].filter(d => wdIsoSet.has(d)).length;
    const totalVac = m.vac || 25;
    const remainingVac = Math.max(0, totalVac - explicitDays);
    // Blanket deduction only for unplanned vacation days
    vacInfo[m.id] = totalWDs > 0 ? 1 - remainingVac / totalWDs : 1;
  });
  const res = [];
  ord.forEach(id => {
    const r = iMap[id];
    if (r?.status === 'done') return;
    if (tEW[id]?.wi === -1) return;
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

    // ── Team-slot path (unassigned → schedule on earliest-free REAL person) ────
    // Unassigned tasks compete for the same person-capacity as assigned tasks.
    // This prevents the scheduler from placing work where no one is actually free.
    if (!asgn.length) {
      if (tM.length > 0) {
        // Find the team member who is free earliest (considering deps, on/offboarding, assigned work)
        let bp = null, bs = Infinity, bDate = null;
        for (const m of tM) {
          const mStart = localDate(m.start || ps);
          const mEnd = m.end ? localDate(m.end) : null;
          const ji = wks.findIndex(w => w.wds.some(d => d >= mStart));
          if (ji < 0) continue; // member starts after all planned weeks
          if (mEnd && mEnd < (earlyDate || planStartDate)) continue; // already offboarded
          const personFree = pF[m.id] || { wi: planStartWi, nextDate: null };
          const parallelEnd = pPE[m.id] || { wi: -1, nextDate: null };
          const fw = Math.max(personFree.wi, parallelEnd.wi >= 0 ? parallelEnd.wi : 0, early, ji >= 0 ? ji : 0);
          let fd = mStart;
          if (earlyDate && earlyDate > fd) fd = earlyDate;
          if (personFree.nextDate && personFree.nextDate > fd) fd = personFree.nextDate;
          if (parallelEnd.nextDate && parallelEnd.nextDate > fd) fd = parallelEnd.nextDate;
          if (mEnd && fd > mEnd) continue; // this member would already be offboarded
          if (fw < bs || (fw === bs && fd && (!bDate || fd < bDate))) { bs = fw; bp = m; bDate = fd; }
        }
        if (bp) {
          // Schedule on this member's real timeline (same logic as assigned path)
          const mStart = localDate(bp.start || ps);
          const personFree = pF[bp.id]?.nextDate;
          const parallelEndDate = pPE[bp.id]?.nextDate;
          let skipBefore = mStart;
          if (earlyDate && earlyDate > skipBefore) skipBefore = earlyDate;
          if (personFree && personFree > skipBefore) skipBefore = personFree;
          if (parallelEndDate && parallelEndDate > skipBefore) skipBefore = parallelEndDate;
          const dailyBaseCap = (bp.cap || 1) * vacInfo[bp.id];
          const endDate = bp.end ? localDate(bp.end) : null;
          let rem = eff, wi = bs, firstWorkDay = null, lastWorkDay = null;
          while (rem > 0 && wi < wks.length) {
            const w = wks[wi];
            if (endDate && w.mon > endDate) break;
            for (const d of w.wds) {
              if (d < skipBefore) continue;
              if (endDate && d > endDate) break;
              if (anyAssigneeOnVacation(iso(d), [bp.id], vs)) continue; // skip vacation day
              if (!firstWorkDay) firstWorkDay = d;
              rem -= dailyBaseCap; lastWorkDay = d;
              if (rem <= 0) break;
            }
            if (rem <= 0) break; wi++;
          }
          const eW = Math.min(wi, wks.length - 1);
          const nd = lastWorkDay ? addWorkDays(lastWorkDay, 1, wdSet) : null;
          tEW[id] = { wi: eW, nextDate: nd };
          // Consume this person's capacity so next unassigned task sees it
          pF[bp.id] = { wi: eW, nextDate: nd };
          const actualStartD = firstWorkDay || wks[bs]?.mon || wks[0].mon;
          const actualEndD = lastWorkDay || addD(wks[eW].mon, 4);
          const ws0 = computeWindowStats(actualStartD, actualEndD, [bp.id]);
          res.push({ id: r.id, name: r.name, team, person: bp.name || bp.id, personId: bp.id, personShort: mShort[bp.id] || bp.id, autoAssigned: true, prio: r.prio, seq: r.seq,
            best: r.best, effort: eff, startWi: bs, endWi: eW,
            startD: actualStartD, endD: actualEndD, calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
            capPct: Math.round((bp.cap || 1) * 100), vacDed: Math.round((1 - vacInfo[bp.id]) * 100), weeks: eW - bs + 1,
            vacDays: ws0.vacDays, holidaysInWindow: ws0.holidaysInWindow, workingDaysInWindow: ws0.workingDaysInWindow,
            deps: (r.deps || []).join(', '), status: r.status, note: r.note || '' });
          return;
        }
      }
      // Fallback: no team members at all — schedule with unit capacity
      let rem = eff, wi = Math.max(early, planStartWi), firstWorkDay = null, lastWorkDay = null;
      const skipBefore = earlyDate || planStartDate;
      while (rem > 0 && wi < wks.length) {
        for (const d of wks[wi].wds) {
          if (d < skipBefore) continue;
          if (!firstWorkDay) firstWorkDay = d;
          rem -= 1; lastWorkDay = d;
          if (rem <= 0) break;
        }
        if (rem <= 0) break; wi++;
      }
      const eW = Math.min(wi, wks.length - 1);
      const nd = lastWorkDay ? addWorkDays(lastWorkDay, 1, wdSet) : null;
      tEW[id] = { wi: eW, nextDate: nd };
      const actualStartD = firstWorkDay || wks[Math.max(early, planStartWi)]?.mon || wks[0].mon;
      const actualEndD = lastWorkDay || addD(wks[eW].mon, 4);
      const ws1 = computeWindowStats(actualStartD, actualEndD, []);
      res.push({ id: r.id, name: r.name, team, person: '(unassigned)', personId: null, personShort: '?', prio: r.prio, seq: r.seq,
        best: r.best, effort: eff, startWi: Math.max(early, planStartWi), endWi: eW,
        startD: actualStartD, endD: actualEndD, calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
        capPct: 100, vacDed: 0, weeks: eW - Math.max(early, planStartWi) + 1,
        vacDays: ws1.vacDays, holidaysInWindow: ws1.holidaysInWindow, workingDaysInWindow: ws1.workingDaysInWindow,
        deps: (r.deps || []).join(', '), status: r.status, note: r.note || '' });
      return;
    }

    // ── Per-person assigned path ───────────────────────────────────────────────
    const cands = members.filter(m => asgn.includes(m.id));
    const isMulti = cands.length > 1; // pair programming / multi-assign
    // For multi-assign: ALL people must be free → use the LATEST free week (max).
    // For single-assign: use the EARLIEST free week (min) among candidates.
    let bp = null, bs = isMulti ? 0 : 9999;
    cands.forEach(m => {
      const mStart = localDate(m.start || ps);
      const ji = wks.findIndex(w => w.wds.some(d => d >= mStart));
      const personFree = pF[m.id] || { wi: planStartWi, nextDate: null };
      const parallelEnd = pPE[m.id] || { wi: -1, nextDate: null };
      const fw = (r.parallel || r.pinnedStart)
        ? Math.max(early, ji >= 0 ? ji : 0)
        : Math.max(personFree.wi, parallelEnd.wi >= 0 ? parallelEnd.wi : 0, early, ji >= 0 ? ji : 0);
      if (isMulti ? fw >= bs : fw < bs) { bs = fw; bp = m; }
    });
    if (!bp || bs >= wks.length) { tEW[id] = { wi: Math.min(early, wks.length - 1), nextDate: null }; return; }
    let pinOverridden = false;
    if (r.pinnedStart && !r.parallel) {
      const pinDate = localDate(r.pinnedStart);
      const pinWi = wks.findIndex(w => w.wds.some(d => d >= pinDate));
      const mStartDate = localDate(bp.start || ps);
      const mStartWi = wks.findIndex(w => w.wds.some(d => d >= mStartDate));
      if (pinWi >= 0 && mStartWi >= 0 && mStartWi > pinWi) pinOverridden = true;
    }
    // skipBefore: latest constraint across ALL assigned people (not just primary).
    // For multi-assign, everyone must be free before the task can start.
    let skipBefore = null;
    for (const m of cands) {
      const ms = localDate(m.start || ps);
      if (!skipBefore || ms > skipBefore) skipBefore = ms;
      if (!(r.parallel || r.pinnedStart)) {
        const pf = pF[m.id]?.nextDate;
        const pe = pPE[m.id]?.nextDate;
        if (pf && pf > skipBefore) skipBefore = pf;
        if (pe && pe > skipBefore) skipBefore = pe;
      }
    }
    if (earlyDate && earlyDate > skipBefore) skipBefore = earlyDate;
    const dailyBaseCap = (bp.cap || 1) * vacInfo[bp.id];
    const endDate = bp.end ? localDate(bp.end) : null;
    let rem = eff, wi = bs, firstWorkDay = null, lastWorkDay = null;
    while (rem > 0 && wi < wks.length) {
      const w = wks[wi];
      if (endDate && w.mon > endDate) break; // person offboarded
      for (const d of w.wds) {
        if (d < skipBefore) continue;
        if (endDate && d > endDate) break; // past offboarding date
        if (anyAssigneeOnVacation(iso(d), isMulti ? asgn : [bp.id], vs)) continue; // skip if any assignee on vacation
        if (!firstWorkDay) firstWorkDay = d;
        rem -= dailyBaseCap; lastWorkDay = d;
        if (rem <= 0) break;
      }
      if (rem <= 0) break; wi++;
    }
    const eW = Math.min(wi, wks.length - 1);
    const nd = lastWorkDay ? addWorkDays(lastWorkDay, 1, wdSet) : null;
    tEW[id] = { wi: eW, nextDate: nd };
    // Block capacity for ALL assigned people (not just the primary),
    // so pair-programming or multi-assign tasks occupy everyone involved.
    const allAssigned = asgn.map(a => members.find(m => m.id === a)).filter(Boolean);
    for (const m of allAssigned) {
      if (!r.parallel) {
        pF[m.id] = { wi: eW, nextDate: nd };
      } else {
        const prev = pPE[m.id];
        if (!prev || eW > prev.wi || (eW === prev.wi && nd && (!prev.nextDate || nd > prev.nextDate))) {
          pPE[m.id] = { wi: eW, nextDate: nd };
        }
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
    // For multi-assign: union of all assignees' vacation sets (any day any assignee is on vacation counts once).
    const ws2 = computeWindowStats(actualStartD, actualEndD, isMulti ? asgn : [bp.id]);
    res.push({ id: r.id, name: r.name, team, person: bp.name || bp.id, personId: bp.id, personShort: mShort[bp.id] || bp.id, assign: r.assign || [], prio: r.prio, seq: r.seq,
      best: r.best, effort: eff, startWi: bs, endWi: eW,
      startD: actualStartD, endD: actualEndD, calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
      capPct: Math.round((bp.cap || 1) * 100), vacDed: Math.round((1 - vacInfo[bp.id]) * 100),
      weeks: eW - bs + 1, parallel: !!r.parallel, pinOverridden,
      vacDays: ws2.vacDays, holidaysInWindow: ws2.holidaysInWindow, workingDaysInWindow: ws2.workingDaysInWindow,
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
  const reasons = {}; // why each item got its confidence level
  const lvs = leafNodes(tree);
  lvs.forEach(r => {
    if (r.confidence) { result[r.id] = r.confidence; reasons[r.id] = 'manual'; return; }
    if (r.status === 'done') { result[r.id] = 'committed'; reasons[r.id] = 'done'; return; }
    const hasAssign = (r.assign || []).length > 0;
    const hasEstimate = r.best > 0;
    const highRisk = (r.factor || 1.5) >= 2.0;
    if (hasAssign && hasEstimate && !highRisk) {
      result[r.id] = 'committed';
      reasons[r.id] = 'auto:person+estimate';
    } else if (hasEstimate && !highRisk) {
      result[r.id] = 'estimated';
      reasons[r.id] = hasAssign ? 'auto:high-risk' : 'auto:no-person';
    } else {
      result[r.id] = 'exploratory';
      reasons[r.id] = !hasEstimate ? 'auto:no-estimate' : 'auto:high-risk';
    }
  });
  const order = ['exploratory', 'estimated', 'committed'];
  tree.forEach(parent => {
    if (isLeafNode(tree, parent.id)) return;
    if (parent.confidence) { result[parent.id] = parent.confidence; reasons[parent.id] = 'manual'; return; }
    const childLeaves = lvs.filter(l => l.id.startsWith(parent.id + '.'));
    if (!childLeaves.length) return;
    const worst = childLeaves.reduce((w, c) => {
      const ci = order.indexOf(result[c.id] || 'exploratory');
      return ci < w ? ci : w;
    }, 2);
    result[parent.id] = order[worst];
    reasons[parent.id] = 'inherited';
  });
  return { confidence: result, reasons };
}

// Derive leaf progress: phases (single source of truth) > explicit field > status-based default
export function leafProgress(r) {
  // Phases are the single source of truth when present
  if (r.phases?.length) return phaseProgress(r.phases);
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
