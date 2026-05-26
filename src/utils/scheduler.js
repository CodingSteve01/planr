import { addD, iso, addWorkDays, localDate, eachDayInclusive, normalizeVacation } from './date.js';
import { buildWeeks } from './holidays.js';
import { phaseProgress } from './phases.js';
import { deriveCap, memberAtDate } from './capacity.js';

export const pt = t => { if (!t) return ''; const m = t.match(/[A-Z][A-Z0-9]*/g); return m ? m[0] : t; };
// Realistic effort: best × factor (no hidden caps — user's factor is respected)
export const re = (best, factor) => best && best > 0 ? best * (factor || 1.5) : 0;
export const fixedDurationDays = task => {
  const n = Number(task?.fixedDurationDays);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.ceil(n)) : 0;
};
export const scheduleEffort = task => fixedDurationDays(task) || re(task?.best || 0, task?.factor || 1.5);
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

// True when removing the last dep/softDep should flip the leaf into `parallel:true`.
// Whenever a leaf becomes link-free we honour the user's intent ("nothing blocks
// this any more, let it overlap with whatever the resource is doing") so the
// schedule doesn't silently keep it stuck in the queue. Done leaves stay
// untouched — their dates are historical, not planned.
export function shouldAutoParallelizeOnDepFree(node, isLeaf) {
  if (!node || !isLeaf) return false;
  if (node.status === 'done') return false;
  if (node.parallel === true) return false;
  const deps = (node.deps || []).length;
  const soft = (node.softDeps || []).length;
  return deps === 0 && soft === 0;
}

export function resolveToLeafIds(tree, id) {
  const item = typeof id === 'string' ? tree.find(r => r.id === id) : id;
  if (!item) return [];
  if (isLeafNode(tree, item.id)) return [item.id];
  return leafNodes(tree).filter(l => l.id.startsWith(item.id + '.')).map(l => l.id);
}

// ps = viewStart (rendering start, may be before planStart for pre-started tasks)
// planStartStr = scheduling start (new/unstarted tasks begin here)
// options:
//   now:               Date used as "today". Defaults to current Date. Tests pass
//                      a synthetic `now` matching their planStart so they stay
//                      independent of the wall clock.
//   anchorToToday:     When true (default), non-pinned tasks may not start before
//                      max(planStart, today). Stops the schedule from drifting
//                      into the past as days roll on. Pinned tasks keep their
//                      explicit start date regardless.
//   discountProgress:  When true (default), wip leaves with a numeric progress
//                      get their effort scaled by `(1 - progress/100)` so the
//                      already-done portion isn't replanned again.
//   autoCascade:       When true, the scheduler hands truncated work off to
//                      next-free team mates / cross-team automatically and
//                      emits synthetic `#N` cascade rows. Default false: a
//                      task that runs past its assignee's offboard date is
//                      simply flagged via `truncatedByOffboard` so the user
//                      can split it manually (TaskInsights → ↳ Split).
export function schedule(tree, members, vacations, ps, pe, hm, workDaysArr, planStartStr, options = {}) {
  const _now = options.now ? localDate(options.now) : localDate(new Date());
  const _anchorToToday = options.anchorToToday !== false;
  const _discountProgress = options.discountProgress !== false;
  const _autoCascade = options.autoCascade === true;
  // queueByDefault=true reverts the no-deps-leaf default to the legacy
  // resource-queue behaviour: same person processes its no-dep tasks
  // sequentially in seq order. Lets pre-link-era plans reproduce their
  // original schedule output unchanged. `parallel:true` on a leaf still
  // bypasses the queue regardless.
  const _queueByDefault = options.queueByDefault === true;
  const wks = buildWeeks(ps, pe, hm, workDaysArr);
  const wdSet = workDaysArr ? new Set(workDaysArr) : new Set([1, 2, 3, 4, 5]);
  if (!wks.length) return { results: [], weeks: [] };
  // Backward-routing helper. Given a due date and the effort that still needs
  // to land, returns the latest working day at which the task could start
  // and still hit the due. Capacity is a rough proxy — the scheduler doesn't
  // simulate the entire reverse pass (vacations, capacity holes, etc.); the
  // result is therefore a soft "must start by ~X" hint, not a guarantee.
  function calcLatestStart(dueLike, effRem, dailyCap) {
    if (!dueLike || !(effRem > 0) || !(dailyCap > 0)) return null;
    const dueD = dueLike instanceof Date ? dueLike : localDate(dueLike);
    const wdNeeded = Math.max(1, Math.ceil(effRem / dailyCap));
    return addWorkDays(dueD, -wdNeeded, wdSet);
  }
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
  // Effective floor for non-pinned work. When auto-advance is on and today
  // has moved past the configured planStart, shift the floor forward so
  // unstarted tasks pile up at "today" instead of in the past.
  const effectiveFloor = (_anchorToToday && _now > planStartDate) ? _now : planStartDate;
  const planEndDate = localDate(pe);
  const planStartWi = Math.max(0, wks.findIndex(w => addD(w.mon, 7) > effectiveFloor));
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
    // Effective priority: tasks with a near-term due date (≤ 90d from now)
    // are promoted toward critical so they jump in front of priority-driven
    // backlog work. The closer the due, the stronger the bump:
    //   ≤ 14d → effectivePrio = 1 (critical)
    //   ≤ 30d → max(prio - 2, 1)
    //   ≤ 90d → max(prio - 1, 1)
    // Without this, low-prio dated work stays buried behind high-prio
    // undated work and silently slips past its due date.
    const dueBump = (r) => {
      if (!r.due) return r.prio || 4;
      const daysToDue = Math.round((localDate(r.due) - _now) / 86400000);
      const base = r.prio || 4;
      if (daysToDue <= 14) return 1;
      if (daysToDue <= 30) return Math.max(1, base - 2);
      if (daysToDue <= 90) return Math.max(1, base - 1);
      return base;
    };
    const aPrio = dueBump(a);
    const bPrio = dueBump(b);
    // Within the same effective priority + same assignment-state, earlier
    // due dates schedule first. Tasks without due sort after dated ones.
    const aDue = a.due ? a.due : '9999-99-99';
    const bDue = b.due ? b.due : '9999-99-99';
    return aPrio - bPrio || aHasPerson - bHasPerson || aDue.localeCompare(bDue) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id);
  });
  // Collect deps including those inherited from ancestors (so a parent dep blocks all its leaves)
  const effectiveDeps = id => {
    const r = iMap[id]; if (!r) return [];
    // Hard deps (`r.deps`) and soft deps (`r.softDeps`, planner-set ordering)
    // are mechanically identical — both block start until the predecessor
    // ends. Difference is intent + visual style only. Union here so the
    // schedule walks the combined topological order.
    const ownDeps = [...(r.deps || []), ...(r.softDeps || [])];
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
  // Per-person remaining committed effort (sum of effort of their assigned
  // leaves not yet scheduled). Auto-assignment uses this as a virtual fd
  // floor so a busy assignee does NOT look "free" just because their tasks
  // happen to schedule later in ord. Without it, an unassigned due-bumped
  // task lands on a slow/loaded body whose pF is still at planStartWi.
  // Decremented as each assigned task actually runs.
  const committedRem = Object.fromEntries(members.map(m => [m.id, 0]));
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
    const fixedDays = fixedDurationDays(r);
    if ((!r.best || r.best === 0) && !fixedDays) tEW[r.id] = { wi: -1, nextDate: null };
    // Sum remaining committed effort per assignee for not-yet-done leaves.
    if (r.status !== 'done' && (r.best > 0 || fixedDays > 0)) {
      const assigns = (r.assign || []).filter(a => committedRem[a] != null);
      if (assigns.length) {
        let eff = fixedDays || re(r.best, r.factor);
        if (!fixedDays && _discountProgress && r.status === 'wip' && typeof r.progress === 'number'
            && r.progress > 0 && r.progress < 100) {
          eff *= (1 - r.progress / 100);
        }
        for (const aId of assigns) {
          if (fixedDays) {
            const member = members.find(m => m.id === aId);
            committedRem[aId] += eff * Math.max(deriveCap(member || {}), 0.01);
          } else {
            committedRem[aId] += eff;
          }
        }
      }
    }
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
  // Pinned tasks reserve future person-days but should not force the entire
  // queue behind them. Later tasks may still use free time before the pin.
  const pinnedBusy = new Set();
  const reservePinnedDays = (personIds, workedDays) => {
    if (!personIds?.length || !workedDays?.length) return;
    personIds.forEach(id => workedDays.forEach(dayIso => pinnedBusy.add(`${id}|${dayIso}`)));
  };
  const anyAssigneePinnedBusy = (dateIso, assignIds) =>
    assignIds.some(id => pinnedBusy.has(`${id}|${dateIso}`));
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

  const countWorkDays = (from, to) => {
    if (!from || !to || to < from) return 0;
    let count = 0;
    for (const day of eachDayInclusive(iso(from), iso(to))) {
      const dayIso = iso(day);
      if (!wdSet.has(day.getDay())) continue;
      if (hm?.[dayIso]) continue;
      count++;
    }
    return count;
  };
  const fixedWorkWindow = (notBefore, days) => {
    const needed = Math.max(1, Math.ceil(days));
    const startFloor = notBefore || planStartDate;
    const workedDays = [];
    let firstWorkDay = null;
    let lastWorkDay = null;
    let endWi = Math.max(0, weekIndexOfDate(startFloor));
    for (let wi = 0; wi < wks.length; wi++) {
      for (const d of wks[wi].wds) {
        if (d < startFloor) continue;
        if (!firstWorkDay) firstWorkDay = d;
        lastWorkDay = d;
        endWi = wi;
        workedDays.push(iso(d));
        if (workedDays.length >= needed) {
          return {
            startD: firstWorkDay,
            endD: lastWorkDay,
            endWi,
            workedDays,
          };
        }
      }
    }
    const fallback = firstWorkDay || startFloor || wks[0].mon;
    return {
      startD: fallback,
      endD: lastWorkDay || fallback,
      endWi: Math.max(0, weekIndexOfDate(lastWorkDay || fallback)),
      workedDays,
    };
  };
  const maxDate = (...dates) => dates.filter(Boolean).reduce((max, date) => !max || date > max ? date : max, null);
  const minDate = (...dates) => dates.filter(Boolean).reduce((min, date) => !min || date < min ? date : min, null);
  // Per-person: explicit vacation inside the active plan period + prorated annual allowance
  const vacInfo = {};
  members.forEach(m => {
    const memberStart = m.start ? localDate(m.start) : planStartDate;
    const memberEnd = m.end ? localDate(m.end) : planEndDate;
    const activeStart = maxDate(planStartDate, memberStart);
    const activeEnd = minDate(planEndDate, memberEnd);
    const activeWorkDays = countWorkDays(activeStart, activeEnd);
    if (!activeStart || !activeEnd || activeEnd < activeStart || activeWorkDays <= 0) {
      vacInfo[m.id] = 1;
      return;
    }

    const blockedDays = vs[m.id] || new Set();
    const explicitDays = [...blockedDays].filter(dayIso => {
      const day = localDate(dayIso);
      return day >= activeStart && day <= activeEnd && wdSet.has(day.getDay()) && !hm?.[dayIso];
    }).length;

    let entitledVacation = 0;
    for (let year = activeStart.getFullYear(); year <= activeEnd.getFullYear(); year++) {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);
      const overlapStart = maxDate(activeStart, yearStart);
      const overlapEnd = minDate(activeEnd, yearEnd);
      if (!overlapStart || !overlapEnd || overlapEnd < overlapStart) continue;
      const fullYearWorkDays = countWorkDays(yearStart, yearEnd);
      const overlapWorkDays = countWorkDays(overlapStart, overlapEnd);
      if (fullYearWorkDays <= 0 || overlapWorkDays <= 0) continue;
      entitledVacation += (m.vac || 25) * (overlapWorkDays / fullYearWorkDays);
    }

    const remainingVac = Math.max(0, entitledVacation - explicitDays);
    vacInfo[m.id] = Math.max(0, 1 - remainingVac / activeWorkDays);
  });
  // ── Offboard-cascade helper ──────────────────────────────────────────────
  // Chains segments across multiple team members when the primary assignee
  // (and subsequent stand-ins) offboard mid-task. Each segment records its
  // own person/start/end/effort so consumers can render, filter and report
  // on the remainder separately. A task may be interrupted multiple times;
  // the cascade stops when either (a) the remainder is fully consumed, or
  // (b) no eligible team member remains.
  //
  // Returns the chained segments + the leftover effort flag. Callers insert
  // the first segment themselves (for the primary run) and pass state in.
  const cascadeHandoff = ({ rem, lastOffboard, usedIds, tM: teamMembers, isPinned, isParallel = false, earliestStart = null }) => {
    const segments = [];
    let lastWD = null, finalWi = -1;
    while (rem > 0 && lastOffboard) {
      // Handoff starts the day after the previous person's offboard — unless
      // an external constraint (dep predecessor's end) pushes it later.
      // Without this, a primary that offboarded BEFORE a dep became free
      // would send the cascade into pre-dep dates, producing silent dep
      // violations (console warn at schedule time).
      let nextStart = addD(lastOffboard, 1);
      if (earliestStart && earliestStart > nextStart) nextStart = earliestStart;
      const nextBp = teamMembers
        .filter(m2 => !usedIds.has(m2.id))
        .filter(m2 => {
          const mStart = localDate(m2.start || ps);
          const mEnd = m2.end ? localDate(m2.end) : null;
          if (mStart > nextStart) return false;         // not yet onboarded
          if (mEnd && mEnd < nextStart) return false;   // offboarded strictly before handoff day (end-date is inclusive)
          return true;
        })
        .sort((a, b) => {
          const af = pF[a.id]?.nextDate || nextStart;
          const bf = pF[b.id]?.nextDate || nextStart;
          return af - bf;
        })[0];
      if (!nextBp) break;

      const cap2 = deriveCap(nextBp) * (vacInfo[nextBp.id] ?? 1);
      const pf2 = pF[nextBp.id]?.nextDate;
      const skipBefore2 = pf2 && pf2 > nextStart ? pf2 : nextStart;
      const end2 = nextBp.end ? localDate(nextBp.end) : null;
      let wi2 = wks.findIndex(w => w.wds.some(d => d >= skipBefore2));
      if (wi2 < 0) break;
      let segRem = rem, segFirst = null, segLast = null;
      while (segRem > 0 && wi2 < wks.length) {
        const w = wks[wi2];
        if (end2 && w.mon > end2) break;
        for (const d of w.wds) {
          if (d < skipBefore2) continue;
          if (end2 && d > end2) break;
          const dIso = iso(d);
          if (anyAssigneeOnVacation(dIso, [nextBp.id], vs)) continue;
          // Cascade segments respect other pinned reservations unless the
          // parent task is parallel (then overlapping is intentional).
          if (!isParallel && anyAssigneePinnedBusy(dIso, [nextBp.id])) continue;
          if (!segFirst) segFirst = d;
          segRem -= cap2; segLast = d;
          if (segRem <= 0) break;
        }
        if (segRem <= 0) break; wi2++;
      }
      const consumed = rem - Math.max(0, segRem);
      if (consumed <= 0) { usedIds.add(nextBp.id); continue; }  // this member unavailable for any work; skip
      const segOffboarded = segRem > 0 && !!end2;
      segments.push({
        personId: nextBp.id,
        personName: nextBp.name || nextBp.id,
        startD: segFirst || nextStart,
        endD: segLast || (end2 || nextStart),
        effort: consumed,
        offboarded: segOffboarded,
        handoff: true,
        crossTeam: !!nextBp._crossTeam,
        team: nextBp.team,
      });
      if (!isPinned && segLast) {
        pF[nextBp.id] = { wi: Math.min(wi2, wks.length - 1), nextDate: addWorkDays(segLast, 1, wdSet) };
      }
      usedIds.add(nextBp.id);
      rem = Math.max(0, segRem);
      lastOffboard = segOffboarded ? end2 : null;
      if (segLast) lastWD = segLast;
      finalWi = Math.min(wi2, wks.length - 1);
    }
    return { segments, remaining: rem, lastWD, finalWi, lastOffboard };
  };

  // ── Fan-out auto-parallel pre-pass ─────────────────────────────────────────
  // When N leaves share the same effective predecessor set AND the same single
  // assignee, they're "obvious siblings" — a fan-out from one upstream task.
  // The user expects them to run concurrently with shared capacity (each
  // consumes 1/N of the assignee's daily throughput) so all N share the same
  // start and the calendar span stretches to N × effort.
  //
  // Implementation: pick a "leader" per group (= first member encountered in
  // topological order). Skip followers during the main scheduling loop and
  // schedule the leader with the SUM of all members' effort. After the loop,
  // replicate the leader's scheduled span onto each follower in `res` + `tEW`
  // so successors of any follower wait on the batch-end time.
  const paraLeaderOf = new Map(); // memberId → leaderId
  const paraGroups = new Map();   // leaderId → [memberIds in ord order]
  const paraEffByLeader = new Map(); // leaderId → totalEff sum across group
  {
    const buckets = new Map();
    for (const id of ord) {
      const r = iMap[id];
      if (!r || r.status === 'done' || !isLeafNode(tree, r.id) || (!r.best && !fixedDurationDays(r))) continue;
      if (fixedDurationDays(r)) continue;
      const assigns = [...(r.assign || [])].sort();
      // Only single-assign fan-out for now; multi-assign / team-slots stay
      // on the regular path so team-lock and handoff cascades aren't broken.
      if (assigns.length !== 1) continue;
      const ancestorIds = []; let aid = parentId(r.id); while (aid) { ancestorIds.push(aid); aid = parentId(aid); }
      const depSrc = [...new Set([
        ...(r.deps || []),
        ...(r.softDeps || []),
        ...ancestorIds.flatMap(a => [...(iMap[a]?.deps || []), ...(iMap[a]?.softDeps || [])]),
      ])];
      const depLeaves = [...new Set(depSrc.flatMap(d => resolveToLeafIds(tree, d)).filter(d => d !== r.id))].sort();
      // Tasks with NO real predecessor are intentionally not batched here.
      // They are placed by the normal resource queue unless the task is
      // explicitly marked parallel; batching them would hide the user's chosen
      // order and make root starters look like one synthetic task.
      if (depLeaves.length === 0) continue;
      const pin = r.pinnedStart || '';
      const key = `${assigns[0]}|${pin}|${depLeaves.join(',')}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r.id);
    }
    for (const ids of buckets.values()) {
      if (ids.length < 2) continue;
      const leader = ids[0];
      paraGroups.set(leader, ids);
      let totalEff = 0;
      for (const mid of ids) {
        const m = iMap[mid];
        let mEff = re(m.best, m.factor);
        if (_discountProgress && m.status === 'wip'
            && typeof m.progress === 'number' && m.progress > 0 && m.progress < 100) {
          mEff = mEff * (1 - m.progress / 100);
        }
        totalEff += mEff;
        paraLeaderOf.set(mid, leader);
      }
      paraEffByLeader.set(leader, totalEff);
    }
  }

  const res = [];
  ord.forEach(id => {
    const r = iMap[id];
    if (r?.status === 'done') return;
    if (tEW[id]?.wi === -1) return;
    const fixedDaysTotal = fixedDurationDays(r);
    const hasFixedDuration = fixedDaysTotal > 0;
    if (!r || !isLeafNode(tree, r.id) || ((!r.best || r.best === 0) && !hasFixedDuration)) { tEW[id] = { wi: -1, nextDate: null }; return; }
    // Fan-out follower: skip — its schedule is replicated from the leader's
    // batch run after the main loop completes.
    const fanoutLeader = paraLeaderOf.get(id);
    if (fanoutLeader && fanoutLeader !== id) return;
    let eff = hasFixedDuration ? fixedDaysTotal : re(r.best, r.factor);
    // Fan-out leader: inflate effort to the batch total so the per-person
    // counter reserves the whole batch span on the assignee's queue.
    if (fanoutLeader === id && paraEffByLeader.has(id)) {
      eff = paraEffByLeader.get(id);
    }
    // WIP tasks: subtract the already-done portion so the scheduler only
    // places the remaining effort. Without this a 90%-done 10d task still
    // takes 10d on the Gantt and slides every successor by 9d of phantom
    // work. Gated on opt-in flag so tests can keep deterministic effort.
    // We also remember the consumed effort so the bar's `startD` can be
    // shifted backward later — the visual then spans both portions and
    // the existing left-side progress overlay (see GanttView) lands on
    // real calendar days in the past.
    let consumedEff = 0;
    // For fan-out leaders the eff was already discounted member-by-member
    // in the pre-pass (paraEffByLeader holds the post-discount total), so
    // skip the per-row discount here to avoid double-subtracting progress.
    if (!hasFixedDuration && _discountProgress && eff > 0 && r.status === 'wip' && !paraEffByLeader.has(id)
        && typeof r.progress === 'number' && r.progress > 0 && r.progress < 100) {
      consumedEff = eff * (r.progress / 100);
      eff = eff - consumedEff;
    }
    const team = pt(r.team);
    const tM = members.filter(m => pt(m.team) === team);
    // Inherit deps from all ancestors so a parent dep blocks every leaf underneath
    const ancestorIds = []; let aid = parentId(r.id); while (aid) { ancestorIds.push(aid); aid = parentId(aid); }
    const inheritedDeps = ancestorIds.flatMap(a => [...(iMap[a]?.deps || []), ...(iMap[a]?.softDeps || [])]);
    const allDepsRaw = [...new Set([...(r.deps || []), ...(r.softDeps || []), ...inheritedDeps])];
    const allD = allDepsRaw.flatMap(resD).filter(d => d !== r.id);
    const noDeps = allD.length === 0;
    // Link-driven Gantt semantic: a leaf without any `deps` / `softDeps`
    // bypasses the assignee's `pF` cursor so it starts from today (or its
    // earliest legal floor) instead of waiting behind unrelated work. Links
    // are the only mechanism that enforces sequencing — removing the last
    // link is the user's explicit signal that this task should run in
    // parallel with whatever the resource is already doing. Opt-out with
    // `parallel:false` if a queued behaviour is required. Pinned tasks
    // bypass the queue too so manual dates remain visible as conflicts
    // instead of being silently moved.
    const bypassPersonQueue = !!r.pinnedStart || (noDeps && (_queueByDefault ? r.parallel === true : r.parallel !== false));
    // Dep tracking: find the LATEST predecessor finish. Both the week index and the day-
    // accurate nextDate are tracked so the successor can start the very next working day
    // (not the next full week — that was the source of the phantom gaps).
    let depWi = -1, depNextDate = null, depBlockerId = null;
    allD.forEach(d => {
      const fw = tEW[d]; if (!fw || fw.wi < 0) return;
      if (fw.wi > depWi || (fw.wi === depWi && fw.nextDate && (!depNextDate || fw.nextDate > depNextDate))) {
        depWi = fw.wi; depNextDate = fw.nextDate; depBlockerId = d;
      }
    });
    // Non-pinned tasks default to planStartWi. Pinned tasks can start earlier
    // (from week 0 = viewStart) — the planning horizon only constrains auto-scheduled work.
    let early = depWi >= 0 ? depWi : (r.pinnedStart ? 0 : planStartWi);
    let earlyDate = depNextDate;
    // If no dep constrains the date and the task isn't pinned, don't start before planStartDate
    // (fixes off-by-one where tasks started on the Monday before the Tuesday planning horizon).
    if (!earlyDate && depWi < 0 && !r.pinnedStart) earlyDate = effectiveFloor;
    // Pinned start: user manually pinned this task to a specific date.
    if (r.pinnedStart) {
      const pinDate = localDate(r.pinnedStart);
      const pinWi = wks.findIndex(w => w.wds.some(d => d >= pinDate));
      if (pinWi >= 0 && (pinWi > early || (pinWi === early && pinDate > (earlyDate || new Date(0))))) {
        early = pinWi; earlyDate = pinDate;
      }
    }
    let asgn = (r.assign || []).filter(a => members.find(m => m.id === a));
    // teamLock: declarative "this task blocks the entire team" — at run
    // time we resolve to all current members of the task's team and treat
    // it as multi-assign. Avoids the manual-assign-everyone workaround
    // and stays correct when team membership changes (onboard / offboard).
    if (r.teamLock && tM.length > 0) {
      asgn = tM.map(m => m.id);
    }
    if (!asgn.length && tM.length === 1) asgn = [tM[0].id];

    // ── Team-slot path (unassigned → schedule on earliest-free REAL person) ────
    // Unassigned tasks compete for the same person-capacity as assigned tasks.
    // This prevents the scheduler from placing work where no one is actually free.
    if (!asgn.length) {
      if (tM.length > 0) {
        // Find the team member who is free earliest (considering deps, on/offboarding, assigned work)
        let bp = null, bs = Infinity, bDate = null, bestPF = null;
        for (const m of tM) {
          const mStart = localDate(m.start || ps);
          const mEnd = m.end ? localDate(m.end) : null;
          const ji = wks.findIndex(w => w.wds.some(d => d >= mStart));
          if (ji < 0) continue; // member starts after all planned weeks
          if (mEnd && mEnd < (earlyDate || planStartDate)) continue; // already offboarded
          const personFree = pF[m.id] || { wi: planStartWi, nextDate: null };
          const parallelEnd = pPE[m.id] || { wi: -1, nextDate: null };
          let fw = bypassPersonQueue
            ? Math.max(early, ji >= 0 ? ji : 0)
            : Math.max(personFree.wi, parallelEnd.wi >= 0 ? parallelEnd.wi : 0, early, ji >= 0 ? ji : 0);
          let fd = mStart;
          if (earlyDate && earlyDate > fd) fd = earlyDate;
          if (!bypassPersonQueue && personFree.nextDate && personFree.nextDate > fd) fd = personFree.nextDate;
          if (!bypassPersonQueue && parallelEnd.nextDate && parallelEnd.nextDate > fd) fd = parallelEnd.nextDate;
          // Virtual fd floor from committed-but-not-yet-scheduled assigned work.
          // Without this, an unassigned task picks a body whose explicit-assign
          // queue hasn't run yet but is heavy — landing speculative work on a
          // de facto loaded person and starving the actually-free body.
          const cap = deriveCap(m) * (vacInfo[m.id] || 1);
          if (cap > 0 && committedRem[m.id] > 0) {
            const projDays = Math.ceil(committedRem[m.id] / cap);
            const projDate = addWorkDays(effectiveFloor, projDays, wdSet);
            if (projDate > fd) fd = projDate;
            // Map projDate to a week index. If it lands past the horizon end,
            // findIndex returns -1 — clamp to wks.length so the candidate
            // doesn't appear "earlier" than someone whose committed work fits
            // inside the horizon. Without this clamp, an over-committed
            // member's fw stayed at planStartWi and it stole every unassigned
            // task on fw (week index) tiebreak.
            let projWi = wks.findIndex(w => w.wds.some(d => d >= projDate));
            if (projWi < 0) projWi = wks.length;
            if (projWi > fw) fw = projWi;
          }
          if (mEnd && fd > mEnd) continue; // this member would already be offboarded
          // Tiebreak when fw + fd are equal: prefer the BUSIER candidate
          // (highest personFree.nextDate). For a dep-blocked task all
          // candidates' fd equals the dep-end. Picking a barely-loaded body
          // wastes its earlier free slot — pick the body that was already
          // busy until close to the dep so the freer body stays available
          // for later no-dep work (forward-pass can't otherwise gap-fill).
          const candPF = personFree.nextDate || mStart;
          // Tiebreak direction depends on whether the task has deps:
          //   - dep-blocked → pick BUSIER (highest candPF) so the dep-end
          //     lands on someone whose pre-dep slot was already consumed,
          //     leaving freer bodies for later no-dep work.
          //   - no-dep      → pick FREER (lowest candPF) for load balance;
          //     no-deps should fill the earliest genuinely-free body.
          const preferBusier = !noDeps;
          const better = !bp
            ? true
            : (fw < bs)
              ? true
              : (fw === bs && fd && bDate && fd < bDate)
                ? true
                : (fw === bs && fd && bDate && +fd === +bDate && bestPF
                    && (preferBusier ? candPF > bestPF : candPF < bestPF))
                  ? true
                  : false;
          if (better) { bs = fw; bp = m; bDate = fd; bestPF = candPF; }
        }
        if (bp) {
          // Snapshot bp at the task's start week so time-shifted cap /
          // meetings apply transparently below.
          bp = memberAtDate(bp, wks[bs]?.mon || new Date());
          // Schedule on this member's real timeline (same logic as assigned path)
          const mStart = localDate(bp.start || ps);
          const personFree = pF[bp.id]?.nextDate;
          const parallelEndDate = pPE[bp.id]?.nextDate;
          let skipBefore = mStart;
          if (earlyDate && earlyDate > skipBefore) skipBefore = earlyDate;
          if (!bypassPersonQueue && personFree && personFree > skipBefore) skipBefore = personFree;
          if (!bypassPersonQueue && parallelEndDate && parallelEndDate > skipBefore) skipBefore = parallelEndDate;
          const dailyBaseCap = deriveCap(bp) * vacInfo[bp.id];
          const endDate = bp.end ? localDate(bp.end) : null;
          let rem = eff, wi = bs, firstWorkDay = null, lastWorkDay = null;
          const workedDays = [];
          if (hasFixedDuration) {
            const fixed = fixedWorkWindow(skipBefore, fixedDaysTotal);
            firstWorkDay = fixed.startD;
            lastWorkDay = fixed.endD;
            wi = fixed.endWi;
            rem = 0;
            workedDays.push(...fixed.workedDays);
          } else {
            while (rem > 0 && wi < wks.length) {
              const w = wks[wi];
              if (endDate && w.mon > endDate) break;
              for (const d of w.wds) {
                if (d < skipBefore) continue;
                if (endDate && d > endDate) break;
                const dIso = iso(d);
                if (anyAssigneeOnVacation(dIso, [bp.id], vs)) continue; // skip vacation day
                // Non-parallel tasks respect days reserved by OTHER pinned
                // (non-parallel) tasks. Parallel tasks deliberately skip this
                // check — that's the whole point of `r.parallel`. Own task's
                // reservation happens after the loop, so no self-collision.
                if (anyAssigneePinnedBusy(dIso, [bp.id])) continue;
                if (!firstWorkDay) firstWorkDay = d;
                rem -= dailyBaseCap; lastWorkDay = d; workedDays.push(dIso);
                if (rem <= 0) break;
              }
              if (rem <= 0) break; wi++;
            }
          }
          // Initial segment (primary assignee).
          const primarySegment = {
            personId: bp.id,
            personName: bp.name || bp.id,
            startD: firstWorkDay || wks[bs]?.mon || wks[0].mon,
            endD: lastWorkDay || (endDate && rem > 0 ? endDate : addD(wks[Math.min(wi, wks.length - 1)].mon, 4)),
            effort: eff - Math.max(0, rem),
            offboarded: rem > 0 && !!endDate,
            handoff: false,
          };
          // Cascade handoff across offboarding members. First pass: stay within
          // the same team (semantic preference). Second pass: fall back to any
          // team in the project — tagged crossTeam for visibility.
          const runCascade = () => {
            // Cascade is opt-in (options.autoCascade) and per-task overridable
            // (r.noCascade). Default off — rather than silently re-shuffling
            // work to the next free body, surface a `truncatedByOffboard`
            // warning and let the user split the task manually.
            if (!_autoCascade) return { segments: [], remaining: rem, lastWD: null, finalWi: -1, lastOffboard: null };
            if (r.noCascade) return { segments: [], remaining: rem, lastWD: null, finalWi: -1, lastOffboard: null };
            if (!(rem > 0 && endDate)) return { segments: [], remaining: rem, lastWD: null, finalWi: -1, lastOffboard: null };
            const usedIds = new Set([bp.id]);
            // Honor r.handoffPlan first: each plan entry pins a specific team/
            // assign for its stage. Fall through to auto-cascade for anything
            // beyond the plan.
            const planSegs = [];
            let planState = { remaining: rem, lastOffboard: endDate, lastWD: null, finalWi: -1 };
            const plan = Array.isArray(r.handoffPlan) ? r.handoffPlan : [];
            for (const stage of plan) {
              if (planState.remaining <= 0 || !planState.lastOffboard) break;
              const stageAssign = Array.isArray(stage?.assign) ? stage.assign : [];
              let pool = members;
              if (stageAssign.length) pool = members.filter(m2 => stageAssign.includes(m2.id));
              else if (stage?.team) pool = members.filter(m2 => pt(m2.team) === pt(stage.team));
              if (!pool.length) break;
              const chunk = cascadeHandoff({
                rem: planState.remaining,
                lastOffboard: planState.lastOffboard,
                usedIds,
                tM: pool,
                isPinned: !!r.pinnedStart, isParallel: false,
              earliestStart: earlyDate,
            });
              if (!chunk.segments.length) break; // plan entry unusable, fall through to auto
              chunk.segments.forEach(seg => { seg.planned = true; });
              planSegs.push(...chunk.segments);
              planState = {
                remaining: chunk.remaining,
                lastOffboard: chunk.lastOffboard || planState.lastOffboard,
                lastWD: chunk.lastWD || planState.lastWD,
                finalWi: chunk.finalWi >= 0 ? chunk.finalWi : planState.finalWi,
              };
            }
            // Auto-cascade same team first (semantic preference).
            const primary = cascadeHandoff({
              rem: planState.remaining,
              lastOffboard: planState.lastOffboard,
              usedIds,
              tM,
              isPinned: !!r.pinnedStart, isParallel: false,
              earliestStart: earlyDate,
            });
            let combined = {
              segments: [...planSegs, ...primary.segments],
              remaining: primary.remaining,
              lastWD: primary.lastWD || planState.lastWD,
              finalWi: primary.finalWi >= 0 ? primary.finalWi : planState.finalWi,
              lastOffboard: primary.remaining > 0 ? (primary.lastOffboard || planState.lastOffboard) : null,
            };
            if (combined.remaining <= 0) return combined;
            const others = members
              .filter(m2 => pt(m2.team) !== team && !usedIds.has(m2.id))
              .map(m2 => Object.assign({}, m2, { _crossTeam: true }));
            if (!others.length) return combined;
            const secondary = cascadeHandoff({
              rem: combined.remaining,
              lastOffboard: combined.lastOffboard || endDate,
              usedIds,
              tM: others,
              isPinned: !!r.pinnedStart, isParallel: false,
              earliestStart: earlyDate,
            });
            return {
              segments: [...combined.segments, ...secondary.segments],
              remaining: secondary.remaining,
              lastWD: secondary.lastWD || combined.lastWD,
              finalWi: secondary.finalWi >= 0 ? secondary.finalWi : combined.finalWi,
              lastOffboard: secondary.remaining > 0 ? (secondary.lastOffboard || combined.lastOffboard) : null,
            };
          };
          const cascade = runCascade();
          const segments = [primarySegment, ...cascade.segments];
          // Unscheduled remainder: nobody in team can absorb. Project the
          // needed calendar span at unit capacity so the Gantt bar extends
          // visually past offboarding and the downstream project-end calc
          // reflects the real workload. Rendered as a hatched "(unassigned)"
          // segment — not pinned to any real person's queue.
          // Guard: only emit ghost + truncation when an offboarding actually
          // triggered the shortfall AND autoCascade is on. Without endDate,
          // rem>0 means the primary simply ran out of horizon. With
          // autoCascade off we just flag `truncatedByOffboard` and let the
          // user split the task explicitly — no synthetic Gantt row.
          if (_autoCascade && cascade.remaining > 0 && endDate) {
            const lastRealDay = cascade.lastWD || lastWorkDay || (endDate && rem > 0 ? endDate : null);
            const ghostStart = lastRealDay ? addWorkDays(lastRealDay, 1, wdSet) : wks[0].mon;
            const daysNeeded = Math.max(1, Math.ceil(cascade.remaining));
            const ghostEnd = addWorkDays(ghostStart, Math.max(0, daysNeeded - 1), wdSet);
            segments.push({
              personId: null,
              personName: '(unassigned)',
              startD: ghostStart,
              endD: ghostEnd,
              effort: cascade.remaining,
              offboarded: false,
              handoff: true,
              unscheduled: true,
            });
            lastWorkDay = ghostEnd;
            wi = wks.findIndex(w => w.wds.some(d => d >= ghostEnd));
            if (wi < 0) wi = wks.length - 1;
          } else {
            if (cascade.lastWD) lastWorkDay = cascade.lastWD;
            if (cascade.finalWi >= 0) wi = cascade.finalWi;
          }
          const truncated = (cascade.remaining > 0 && endDate) ? {
            remainingEffort: cascade.remaining,
            personId: segments[segments.length - 2]?.personId,
            personName: segments[segments.length - 2]?.personName,
            offboardDate: iso(cascade.lastOffboard || endDate),
          } : null;
          const eW = Math.min(wi, wks.length - 1);
          const nd = lastWorkDay ? addWorkDays(lastWorkDay, 1, wdSet) : null;
          // Capture the person's previous free date BEFORE pF is overwritten
          // so blockedBy/idle-gap calculation later in this block can tell
          // whether the dep (vs the person's own queue) was the limiting
          // factor.
          const teamSlotPrevFree = pF[bp.id]?.nextDate || null;
          tEW[id] = { wi: eW, nextDate: nd };
          if (!r.pinnedStart) {
            // Non-pinned work consumes the queue directly. Pinned work blocks via
            // pinnedBusy instead so earlier gaps remain usable.
            pF[bp.id] = { wi: eW, nextDate: nd };
          } else {
            reservePinnedDays([bp.id], workedDays);
          }
          // If the primary did zero work (already offboarded before the task
          // was ready), take the first cascade segment's start so the task's
          // reported window reflects when it ACTUALLY ran.
          const firstCascadeSeg = cascade.segments[0];
          let actualStartD = firstWorkDay || firstCascadeSeg?.startD || wks[bs]?.mon || wks[0].mon;
          const actualEndD = lastWorkDay || addD(wks[eW].mon, 4);
          // WIP-progress: extend the bar's visible start backward by the days
          // already consumed at this person's daily capacity. Done portion sits
          // in the past where it actually happened; remaining portion stays on
          // the freshly placed dates from today onward.
          if (!hasFixedDuration && consumedEff > 0 && dailyBaseCap > 0) {
            const consumedDays = Math.max(1, Math.round(consumedEff / dailyBaseCap));
            actualStartD = addWorkDays(actualStartD, -consumedDays, wdSet);
          }
          if (depNextDate && actualStartD < depNextDate) actualStartD = depNextDate;
          const ws0 = computeWindowStats(actualStartD, actualEndD, hasFixedDuration ? [] : [bp.id]);
          let pinOverridden0 = false;
          if (r.pinnedStart && actualStartD) {
            const pinD = localDate(r.pinnedStart);
            if (actualStartD > pinD) pinOverridden0 = true;
          }
          {
            const latestStart = r.due ? calcLatestStart(r.due, eff, hasFixedDuration ? 1 : deriveCap(bp) * (vacInfo[bp.id] || 1)) : null;
            const dueInfeasible = !!(latestStart && latestStart < _now);
            // blockedBy: surface the latest dep so UI can show "this row sits
            // in 2027 because it was waiting for X (finished 2026-12-30)".
            // We always include when a dep exists with a future end — UI
            // decides whether to render based on the actual visible gap. The
            // strict "dep pushed past chosen person's prior free" check
            // hid blockedBy in the common case where the picked person was
            // busy until exactly the dep end (busier-tiebreak path).
            // Surface blockedBy only when the dep was actually the binding floor —
            // i.e. the chosen start week equals depWi. If bs > depWi, the team-slot
            // queue (or member start) was the real limiter and the dep is stale
            // (typically a long-finished or done predecessor).
            const depBlocked = !!(depBlockerId && depNextDate && bs === depWi);
            res.push({ id: r.id, name: r.name, team, person: bp.name || bp.id, personId: bp.id, personShort: mShort[bp.id] || bp.id, autoAssigned: true, prio: r.prio, seq: r.seq,
              best: r.best, effort: eff, fixedDurationDays: hasFixedDuration ? fixedDaysTotal : undefined, startWi: bs, endWi: eW,
              startD: actualStartD, endD: actualEndD, calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
              capPct: hasFixedDuration ? 100 : Math.round(deriveCap(bp) * 100), vacDed: hasFixedDuration ? 0 : Math.round((1 - vacInfo[bp.id]) * 100), weeks: eW - bs + 1,
              vacDays: ws0.vacDays, holidaysInWindow: ws0.holidaysInWindow, workingDaysInWindow: ws0.workingDaysInWindow,
              deps: (r.deps || []).join(', '), status: r.status, note: r.note || '',
              segments, truncatedByOffboard: truncated, pinOverridden: pinOverridden0,
              due: r.due || '', dueOverdue: !!(r.due && actualEndD && actualEndD > localDate(r.due)),
              latestStart, dueInfeasible,
              blockedBy: depBlocked ? { id: depBlockerId, endD: depNextDate } : null,
              personPrevFree: teamSlotPrevFree });
          }
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
        best: r.best, effort: eff, fixedDurationDays: hasFixedDuration ? fixedDaysTotal : undefined, startWi: Math.max(early, planStartWi), endWi: eW,
        startD: actualStartD, endD: actualEndD, calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
        capPct: 100, vacDed: 0, weeks: eW - Math.max(early, planStartWi) + 1,
        vacDays: ws1.vacDays, holidaysInWindow: ws1.holidaysInWindow, workingDaysInWindow: ws1.workingDaysInWindow,
        deps: (r.deps || []).join(', '), status: r.status, note: r.note || '' });
      return;
    }

    // ── Per-person assigned path ───────────────────────────────────────────────
    const cands = members.filter(m => asgn.includes(m.id));
    const isMulti = cands.length > 1; // pair programming / multi-assign
    // Capture per-person prior free state BEFORE selection so blockedBy can
    // tell whether the dep (vs person's own queue) was the limiting factor.
    const priorPF = {};
    cands.forEach(m => { priorPF[m.id] = pF[m.id]?.nextDate || null; });
    // For multi-assign: ALL people must be free → use the LATEST free week (max).
    // For single-assign: use the EARLIEST free week (min) among candidates.
    let bp = null, bs = isMulti ? 0 : 9999;
    cands.forEach(m => {
      const mStart = localDate(m.start || ps);
      const ji = wks.findIndex(w => w.wds.some(d => d >= mStart));
      const personFree = pF[m.id] || { wi: planStartWi, nextDate: null };
      const parallelEnd = pPE[m.id] || { wi: -1, nextDate: null };
      const fw = bypassPersonQueue
        ? Math.max(early, ji >= 0 ? ji : 0)
        : Math.max(personFree.wi, parallelEnd.wi >= 0 ? parallelEnd.wi : 0, early, ji >= 0 ? ji : 0);
      if (isMulti ? fw >= bs : fw < bs) { bs = fw; bp = m; }
    });
    if (!bp || bs >= wks.length) { tEW[id] = { wi: Math.min(early, wks.length - 1), nextDate: null }; return; }
    // Snapshot the chosen member at the task's start week so any
    // capChanges/meetingChanges before that date take effect. Subsequent
    // `deriveCap(bp)` calls see the time-shifted profile transparently.
    bp = memberAtDate(bp, wks[bs]?.mon || new Date());
    // pinOverridden is finalised AFTER scheduling using the actual start —
    // catches every reason the pin couldn't be honoured (member-start, dep,
    // person busy, vacation, etc.) instead of just member-start.
    // skipBefore: latest constraint across ALL assigned people (not just primary).
    // For multi-assign, everyone must be free before the task can start.
    let skipBefore = null;
    for (const m of cands) {
      const ms = localDate(m.start || ps);
      if (!skipBefore || ms > skipBefore) skipBefore = ms;
      if (!bypassPersonQueue) {
        const pf = pF[m.id]?.nextDate;
        const pe = pPE[m.id]?.nextDate;
        if (pf && pf > skipBefore) skipBefore = pf;
        if (pe && pe > skipBefore) skipBefore = pe;
      }
    }
    if (earlyDate && earlyDate > skipBefore) skipBefore = earlyDate;
    const dailyBaseCap = deriveCap(bp) * vacInfo[bp.id];
    // For multi-assign (pair programming), the task blocks when ANY assignee
    // offboards, so the effective endDate is the MIN of all assignees' end
    // dates. Using only bp.end would let a co-assignee silently offboard
    // mid-task, attributing their gap to the primary.
    const endDate = isMulti
      ? cands.reduce((min, m) => {
          if (!m.end) return min;
          const d = localDate(m.end);
          return min && min < d ? min : d;
        }, null)
      : (bp.end ? localDate(bp.end) : null);
    let rem = eff, wi = bs, firstWorkDay = null, lastWorkDay = null;
    const workedDays = [];
    if (hasFixedDuration) {
      const fixed = fixedWorkWindow(skipBefore, fixedDaysTotal);
      firstWorkDay = fixed.startD;
      lastWorkDay = fixed.endD;
      wi = fixed.endWi;
      rem = 0;
      workedDays.push(...fixed.workedDays);
    } else {
      while (rem > 0 && wi < wks.length) {
        const w = wks[wi];
        if (endDate && w.mon > endDate) break; // person offboarded
        for (const d of w.wds) {
          if (d < skipBefore) continue;
          if (endDate && d > endDate) break; // past offboarding date
          const dIso = iso(d);
          const activeAssignees = isMulti ? asgn : [bp.id];
          if (anyAssigneeOnVacation(dIso, activeAssignees, vs)) continue; // skip if any assignee on vacation
          // Non-parallel tasks respect days reserved by OTHER pinned tasks.
          // Parallel tasks skip this — that's the explicit point of r.parallel.
          if (anyAssigneePinnedBusy(dIso, activeAssignees)) continue;
          if (!firstWorkDay) firstWorkDay = d;
          rem -= dailyBaseCap; lastWorkDay = d; workedDays.push(dIso);
          if (rem <= 0) break;
        }
        if (rem <= 0) break; wi++;
      }
    }
    // Primary segment for explicit-assign path.
    const primarySegment = {
      personId: bp.id,
      personName: bp.name || bp.id,
      startD: firstWorkDay || wks[bs].mon,
      endD: lastWorkDay || (endDate && rem > 0 ? endDate : addD(wks[Math.min(wi, wks.length - 1)].mon, 4)),
      effort: eff - Math.max(0, rem),
      offboarded: rem > 0 && !!endDate,
      handoff: false,
    };
    // Cascade handoff for offboard-truncated assigned tasks. For multi-
    // assign (pair-programming) we try the OTHER named assignees first so
    // the task continues with a collaborator instead of falling through to
    // auto-cascade. Remainder still cascades to team + cross-team afterwards.
    const runAssignedCascade = () => {
      // See note on `_autoCascade` / `r.noCascade` in the team-slot path.
      if (!_autoCascade) return { segments: [], remaining: rem, lastWD: null, finalWi: -1, lastOffboard: null };
      if (r.noCascade) return { segments: [], remaining: rem, lastWD: null, finalWi: -1, lastOffboard: null };
      if (!(rem > 0 && endDate)) return { segments: [], remaining: rem, lastWD: null, finalWi: -1, lastOffboard: null };
      const usedIds = new Set([bp.id]);
      // 1) r.handoffPlan overrides (explicit user choices)
      const planSegs = [];
      let planState = { remaining: rem, lastOffboard: endDate, lastWD: null, finalWi: -1 };
      const plan = Array.isArray(r.handoffPlan) ? r.handoffPlan : [];
      for (const stage of plan) {
        if (planState.remaining <= 0 || !planState.lastOffboard) break;
        const stageAssign = Array.isArray(stage?.assign) ? stage.assign : [];
        let pool = members;
        if (stageAssign.length) pool = members.filter(mm => stageAssign.includes(mm.id));
        else if (stage?.team) pool = members.filter(mm => pt(mm.team) === pt(stage.team));
        if (!pool.length) break;
        const chunk = cascadeHandoff({ rem: planState.remaining, lastOffboard: planState.lastOffboard, usedIds, tM: pool, isPinned: !!r.pinnedStart, isParallel: false, earliestStart: earlyDate });
        if (!chunk.segments.length) break;
        chunk.segments.forEach(seg => { seg.planned = true; });
        planSegs.push(...chunk.segments);
        planState = { remaining: chunk.remaining, lastOffboard: chunk.lastOffboard || planState.lastOffboard, lastWD: chunk.lastWD || planState.lastWD, finalWi: chunk.finalWi >= 0 ? chunk.finalWi : planState.finalWi };
      }
      // 2) Co-assignees (multi-assign rescue)
      let state = planState;
      if (isMulti && state.remaining > 0) {
        const coAssignees = cands.filter(m => !usedIds.has(m.id));
        if (coAssignees.length) {
          const coChunk = cascadeHandoff({ rem: state.remaining, lastOffboard: state.lastOffboard || endDate, usedIds, tM: coAssignees, isPinned: !!r.pinnedStart, isParallel: false, earliestStart: earlyDate });
          state = { remaining: coChunk.remaining, lastOffboard: coChunk.lastOffboard || state.lastOffboard, lastWD: coChunk.lastWD || state.lastWD, finalWi: coChunk.finalWi >= 0 ? coChunk.finalWi : state.finalWi };
          planSegs.push(...coChunk.segments);
        }
      }
      if (state.remaining <= 0) return { segments: planSegs, remaining: 0, lastWD: state.lastWD, finalWi: state.finalWi, lastOffboard: null };
      // 3) Same team auto-cascade
      const primaryChunk = cascadeHandoff({ rem: state.remaining, lastOffboard: state.lastOffboard || endDate, usedIds, tM, isPinned: !!r.pinnedStart, isParallel: false, earliestStart: earlyDate });
      state = { remaining: primaryChunk.remaining, lastOffboard: primaryChunk.lastOffboard || state.lastOffboard, lastWD: primaryChunk.lastWD || state.lastWD, finalWi: primaryChunk.finalWi >= 0 ? primaryChunk.finalWi : state.finalWi };
      const combined = [...planSegs, ...primaryChunk.segments];
      if (state.remaining <= 0) return { segments: combined, remaining: 0, lastWD: state.lastWD, finalWi: state.finalWi, lastOffboard: null };
      // 4) Cross-team fallback
      const others = members.filter(mm => pt(mm.team) !== team && !usedIds.has(mm.id)).map(mm => Object.assign({}, mm, { _crossTeam: true }));
      if (!others.length) return { segments: combined, remaining: state.remaining, lastWD: state.lastWD, finalWi: state.finalWi, lastOffboard: state.lastOffboard };
      const secondary = cascadeHandoff({ rem: state.remaining, lastOffboard: state.lastOffboard || endDate, usedIds, tM: others, isPinned: !!r.pinnedStart, isParallel: false, earliestStart: earlyDate });
      return {
        segments: [...combined, ...secondary.segments],
        remaining: secondary.remaining,
        lastWD: secondary.lastWD || state.lastWD,
        finalWi: secondary.finalWi >= 0 ? secondary.finalWi : state.finalWi,
        lastOffboard: secondary.remaining > 0 ? (secondary.lastOffboard || state.lastOffboard) : null,
      };
    };
    const cascade = runAssignedCascade();
    const segments = [primarySegment, ...cascade.segments];
    // Ghost + truncated only fire when an actual offboard caused the
    // shortfall AND autoCascade is on. See team-slot path comment.
    if (_autoCascade && cascade.remaining > 0 && endDate) {
      const lastRealDay = cascade.lastWD || lastWorkDay || (endDate && rem > 0 ? endDate : null);
      const ghostStart = lastRealDay ? addWorkDays(lastRealDay, 1, wdSet) : wks[0].mon;
      const daysNeeded = Math.max(1, Math.ceil(cascade.remaining));
      const ghostEnd = addWorkDays(ghostStart, Math.max(0, daysNeeded - 1), wdSet);
      segments.push({
        personId: null,
        personName: '(unassigned)',
        startD: ghostStart,
        endD: ghostEnd,
        effort: cascade.remaining,
        offboarded: false,
        handoff: true,
        unscheduled: true,
      });
      lastWorkDay = ghostEnd;
      wi = wks.findIndex(w => w.wds.some(d => d >= ghostEnd));
      if (wi < 0) wi = wks.length - 1;
    } else {
      if (cascade.lastWD) lastWorkDay = cascade.lastWD;
      if (cascade.finalWi >= 0) wi = cascade.finalWi;
    }
    const truncated = (cascade.remaining > 0 && endDate) ? {
      remainingEffort: cascade.remaining,
      personId: segments[segments.length - 2]?.personId,
      personName: segments[segments.length - 2]?.personName,
      offboardDate: iso(cascade.lastOffboard || endDate),
    } : null;
    const eW = Math.min(wi, wks.length - 1);
    const nd = lastWorkDay ? addWorkDays(lastWorkDay, 1, wdSet) : null;
    tEW[id] = { wi: eW, nextDate: nd };
    // Block capacity for ALL assigned people (not just the primary),
    // so pair-programming or multi-assign tasks occupy everyone involved.
    const allAssigned = asgn.map(a => members.find(m => m.id === a)).filter(Boolean);
    for (const m of allAssigned) {
      if (!r.pinnedStart) {
        pF[m.id] = { wi: eW, nextDate: nd };
      }
      if (committedRem[m.id] != null) {
        const committedDrop = hasFixedDuration ? eff * Math.max(deriveCap(m), 0.01) : eff;
        committedRem[m.id] = Math.max(0, committedRem[m.id] - committedDrop);
      }
    }
    if (r.pinnedStart) reservePinnedDays(asgn, workedDays);
    const firstCascadeSegExplicit = cascade.segments[0];
    let actualStartD = firstWorkDay || firstCascadeSegExplicit?.startD || wks[bs].mon;
    const actualEndD = lastWorkDay || addD(wks[eW].mon, 4);
    // Same WIP-progress backward shift as the team-slot path (see comment there).
    if (!hasFixedDuration && consumedEff > 0 && dailyBaseCap > 0) {
      const consumedDays = Math.max(1, Math.round(consumedEff / dailyBaseCap));
      actualStartD = addWorkDays(actualStartD, -consumedDays, wdSet);
    }
    if (depNextDate && actualStartD < depNextDate) actualStartD = depNextDate;
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
    const ws2 = computeWindowStats(actualStartD, actualEndD, hasFixedDuration ? [] : (isMulti ? asgn : [bp.id]));
    // Final pinOverridden: any pin couldn't land because actual start ended
    // up later than the pinned date. Reasons collapsed into one flag:
    // dep-block, person busy, member start, vacation overlap.
    let pinOverridden = false;
    if (r.pinnedStart && actualStartD) {
      const pinD = localDate(r.pinnedStart);
      if (actualStartD > pinD) pinOverridden = true;
    }
    // Per-task soft ultimatum: flag if scheduled end blows past r.due.
    let dueOverdue = false;
    if (r.due && actualEndD) {
      const dueD = localDate(r.due);
      if (actualEndD > dueD) dueOverdue = true;
    }
    const latestStart = r.due ? calcLatestStart(r.due, eff, hasFixedDuration ? 1 : deriveCap(bp) * (vacInfo[bp.id] || 1)) : null;
    const dueInfeasible = !!(latestStart && latestStart < _now);
    const personPrevFreeAsg = priorPF[bp.id];
    // Same gating as the team-fallback path: only surface blockedBy when the
    // dep was the binding floor (bs === depWi). Prevents stale/done deps from
    // appearing as the blocker when the real reason this row sits in the future
    // is the assignee's prior queue.
    const depBlockedAsg = !!(depBlockerId && depNextDate && bs === depWi);
    res.push({ id: r.id, name: r.name, team, person: bp.name || bp.id, personId: bp.id, personShort: mShort[bp.id] || bp.id,
      // Emit the resolved `asgn` list (which already includes teamLock fan-
      // out + explicit assign) so consumers like Queues can mirror the
      // task into every involved person's lane, not only the picked one.
      assign: [...asgn], prio: r.prio, seq: r.seq,
      best: r.best, effort: eff, fixedDurationDays: hasFixedDuration ? fixedDaysTotal : undefined, startWi: bs, endWi: eW,
      startD: actualStartD, endD: actualEndD, calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
      capPct: hasFixedDuration ? 100 : Math.round(deriveCap(bp) * 100), vacDed: hasFixedDuration ? 0 : Math.round((1 - vacInfo[bp.id]) * 100),
      weeks: eW - bs + 1, parallel: false, pinOverridden,
      due: r.due || '', dueOverdue, latestStart, dueInfeasible,
      blockedBy: depBlockedAsg ? { id: depBlockerId, endD: depNextDate } : null,
      personPrevFree: personPrevFreeAsg,
      vacDays: ws2.vacDays, holidaysInWindow: ws2.holidaysInWindow, workingDaysInWindow: ws2.workingDaysInWindow,
      deps: (r.deps || []).join(', '), status: r.status, note: r.note || '',
      segments, truncatedByOffboard: truncated });
  });

  // ── Replicate fan-out leader schedule onto followers ─────────────────────
  // The leader was scheduled with the SUM of all group efforts. Each follower
  // shares the same calendar span (start..end) so all N tasks visually run
  // concurrently. tEW is mirrored so downstream successors of any follower
  // see the batch-end position as their predecessor's finish.
  for (const [leaderId, memberIds] of paraGroups) {
    const leaderRes = res.find(s => s.id === leaderId);
    if (!leaderRes) continue;
    const leaderEW = tEW[leaderId];
    for (const mid of memberIds) {
      if (mid === leaderId) continue;
      const m = iMap[mid];
      if (!m) continue;
      tEW[mid] = leaderEW;
      res.push({
        ...leaderRes,
        id: mid,
        treeId: mid,
        name: m.name,
        best: m.best,
        factor: m.factor,
        prio: m.prio,
        seq: m.seq,
        deps: (m.deps || []).join(', '),
        status: m.status,
        note: m.note || '',
        _autoParallel: true,
      });
    }
  }
  // Post-process: split handoff segments into independent scheduled entries.
  // Each secondary segment becomes its own row so downstream consumers
  // (person filter, Gantt rows, TODO lists, ResView workload) naturally see
  // the offcut as work done by its actual assignee. Primary stays intact for
  // tree-lookup compatibility, but its effort and end date are clamped to
  // its own segment so sums across `res` no longer double-count.
  const expanded = [];
  for (const s of res) {
    // Hard guard: when autoCascade is off, no `#N` shadow rows ever leak —
    // even if some upstream path produced multi-segment data (legacy plan,
    // pre-existing state, etc.). The primary row carries everything; the
    // user splits via TaskInsights ↳ Split when needed.
    if (!_autoCascade) {
      if (Array.isArray(s.segments) && s.segments.length > 1) {
        const ps = s.segments[0];
        const pe = ps.endD || s.endD;
        expanded.push({
          ...s,
          effort: ps.effort != null ? ps.effort : s.effort,
          endD: pe,
          calDays: ps.startD && pe ? Math.max(1, Math.round((pe - ps.startD) / 864e5) + 1) : s.calDays,
          // Drop multi-segment metadata so consumers don't render chains.
          segments: [ps],
          hasHandoffSegments: false,
        });
      } else {
        expanded.push(s);
      }
      continue;
    }
    if (!Array.isArray(s.segments) || s.segments.length <= 1) { expanded.push(s); continue; }
    const primarySeg = s.segments[0];
    const primaryEnd = primarySeg.endD || s.endD;
    const primaryCalDays = primarySeg.startD && primaryEnd
      ? Math.max(1, Math.round((primaryEnd - primarySeg.startD) / 864e5) + 1)
      : s.calDays;
    expanded.push({
      ...s,
      effort: primarySeg.effort != null ? primarySeg.effort : s.effort,
      endD: primaryEnd,
      calDays: primaryCalDays,
      hasHandoffSegments: true,
    });
    s.segments.slice(1).forEach((seg, idx) => {
      const segIdx = idx + 1;
      const memberObj = seg.personId ? members.find(mm => mm.id === seg.personId) : null;
      const calDays = seg.startD && seg.endD
        ? Math.max(1, Math.round((seg.endD - seg.startD) / 864e5) + 1)
        : 0;
      // Locate week indices for the segment's range so the Gantt can position
      // the bar as a normal row (without this, startWi = -1 and the bar would
      // be skipped or placed at week 0).
      const wiForDate = d => {
        if (!d) return -1;
        let idx = wks.findIndex(w => w.mon > d);
        if (idx === -1) idx = wks.length; // date after last week
        return Math.max(0, idx - 1);
      };
      const startWi = wiForDate(seg.startD);
      const endWi = wiForDate(seg.endD);
      expanded.push({
        id: `${s.id}#${segIdx + 1}`,
        treeId: s.id,
        segmentIdx: segIdx,
        isHandoff: true,
        handoffReason: seg.unscheduled ? 'unscheduled' : seg.crossTeam ? 'cross-team' : 'offboard',
        name: s.name,
        team: seg.team || s.team,
        person: seg.personName,
        personId: seg.personId,
        personShort: seg.personId ? (mShort[seg.personId] || seg.personId) : '?',
        assign: seg.personId ? [seg.personId] : [],
        autoAssigned: !seg.planned && !!seg.personId,
        plannedHandoff: !!seg.planned,
        crossTeam: !!seg.crossTeam,
        unscheduled: !!seg.unscheduled,
        prio: s.prio,
        seq: s.seq,
        best: s.best,
        factor: s.factor,
        effort: seg.effort || 0,
        startWi,
        endWi,
        startD: seg.startD,
        endD: seg.endD,
        calDays,
        capPct: memberObj ? Math.round(deriveCap(memberObj) * 100) : 100,
        vacDed: 0,
        weeks: Math.max(1, endWi - startWi + 1),
        vacDays: 0,
        holidaysInWindow: 0,
        workingDaysInWindow: calDays,
        deps: '',
        status: s.status,
        note: s.note || '',
        parallel: false,
        pinOverridden: false,
      });
    });
  }
  // Sanity check: no duplicate ids in scheduled output. A duplicate would
  // make the Gantt render two rows with the same label and break per-id
  // lookups elsewhere (e.g. pdf detail-plan group, person filter).
  const idCount = {};
  for (const s of expanded) idCount[s.id] = (idCount[s.id] || 0) + 1;
  const dups = Object.entries(idCount).filter(([, n]) => n > 1);
  if (dups.length) {
    console.warn('[scheduler] duplicate scheduled ids:', dups.map(([id, n]) => `${id}×${n}`).join(', '));
  }
  return { results: expanded, weeks: wks };
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
    const hasFixed = fixedDurationDays(r) > 0;
    const hasEstimate = r.best > 0 || hasFixed;
    const highRisk = !hasFixed && (r.factor || 1.5) >= 2.0;
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
  if (!r) return 0;
  if (r.status === 'done') return 100;
  // Phases are the single source of truth when present, but a non-done task
  // must never become "reached" just because phase or manual progress hit 100.
  const raw = r.phases?.length
    ? phaseProgress(r.phases)
    : (r.progress != null && r.progress >= 0)
      ? r.progress
      : r.status === 'wip' ? 50 : 0;
  return Math.max(0, Math.min(99, raw));
}

export function treeStats(tree) {
  const m = Object.fromEntries(tree.map(r => [r.id, { ...r }]));
  [...tree].reverse().forEach(r => {
    if (isLeafNode(tree, r.id)) {
      const fixedDays = fixedDurationDays(r);
      const effort = scheduleEffort(r);
      m[r.id]._b = r.best || fixedDays || 0;
      m[r.id]._r = effort;
      m[r.id]._w = effort;
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
        const done = leaves.filter(l => l.status === 'done').length;
        const rawProgress = Math.round(weightedProg / Math.max(totalEff, 1));
        m[r.id]._progress = done === leaves.length ? rawProgress : Math.min(99, rawProgress);
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
