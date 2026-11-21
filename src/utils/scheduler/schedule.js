import { addD, iso, addWorkDays, localDate, eachDayInclusive, normalizeVacation } from '../date.js';
import { buildWeeks } from '../holidays.js';
import { deriveCap, memberAtDate } from '../capacity.js';
import { treeOrderRank } from '../displayOrder.js';
import { applyPersonQueues } from '../personQueue.js';
import { memberTeams } from '../memberTeams.js';
import { pt, re, fixedDurationDays, parentId, inTeamPt } from './taskBasics.js';
import { isLeafNode, leafNodes, resolveToLeafIds } from './treeIndex.js';
import { scheduleTeamSlot } from './scheduleTeamSlot.js';
import { scheduleAssigned } from './scheduleAssigned.js';
import { expandSegments } from './scheduleExpand.js';

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
  const clampCompletedDate = dateLike => {
    if (!dateLike) return '';
    const date = localDate(dateLike);
    const today = localDate(new Date());
    return iso(date > today ? today : date);
  };
  const weekIndexOfDate = date => {
    if (!date) return -1;
    const idx = wks.findIndex(w => date < addD(w.mon, 7));
    return idx >= 0 ? idx : wks.length - 1;
  };
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const lvs = leafNodes(tree);
  // Build short-name map from member IDs (e.g. "SL", "MZ")
  const mShort = {};
  if (members?.length) {
    const bases = members.map(m => {
      const w = (m.name || '').trim().split(/\s+/).filter(Boolean);
      return !w.length
        ? '?'
        : w.length === 1
          ? w[0].slice(0, 2).toUpperCase()
          : w
              .map(x => x[0])
              .join('')
              .toUpperCase();
    });
    const cnt = {};
    bases.forEach(b => {
      cnt[b] = (cnt[b] || 0) + 1;
    });
    const seen = {};
    members.forEach((m, i) => {
      const b = bases[i];
      if (cnt[b] === 1) mShort[m.id] = b;
      else {
        seen[b] = (seen[b] || 0) + 1;
        mShort[m.id] = b + seen[b];
      }
    });
  }
  function resD(id) {
    return resolveToLeafIds(tree, id);
  }
  // planStartWi = week index where actual scheduling begins (non-pinned tasks start here).
  // Weeks before this exist for rendering only.
  const planStartDate = localDate(planStartStr || ps);
  // Effective floor for non-pinned work. When auto-advance is on and today
  // has moved past the configured planStart, shift the floor forward so
  // unstarted tasks pile up at "today" instead of in the past.
  const effectiveFloor = _anchorToToday && _now > planStartDate ? _now : planStartDate;
  const planEndDate = localDate(pe);
  const planStartWi = Math.max(
    0,
    wks.findIndex(w => addD(w.mon, 7) > effectiveFloor),
  );
  const vis = new Set(),
    ord = [];
  // ── Order of work ────────────────────────────────────────────────────────
  // The sequence in the tree IS the sequence of the work. What you drag to
  // the top with ⌥↑ starts first; what you push down waits.
  //
  // This used to sort by priority → assigned-first → due date → `seq` → id,
  // with a comment saying `displayOrder` was deliberately left out because it
  // is sibling-local. That was true of the raw field and is why the timeline
  // kept disagreeing with the tree: you arranged the plan, and the scheduler
  // re-sorted it by importance and id behind your back. `treeOrderRank` walks
  // the tree instead and hands back a rank that compares across projects, so
  // the arrangement survives.
  //
  // Priority and due date still mean what they say — they just no longer move
  // work around on their own. A deadline that will not hold is a warning
  // (utils/timeline.js, `deadlineStatus`), not a silent reordering, and a
  // warning is something you can act on.
  //
  // Pinned tasks stay first, and that is mechanics rather than intent: their
  // capacity has to be on the books before auto-assigned work is placed, or
  // both land in the same window on the same person.
  const rank = treeOrderRank(tree);
  const inPlanOrder = [...lvs].sort((a, b) => {
    const aPinned = a.pinnedStart ? 0 : 1;
    const bPinned = b.pinnedStart ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    const aRank = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    return aRank - bRank || a.id.localeCompare(b.id);
  });
  // …and then the one override. Depth-first makes a project a block, which is
  // right until two projects run at once and one person is on both: there is
  // no move in the tree that says "this one task from B, first", because the
  // two are not siblings. A person's queue permutes only the slots their own
  // work already holds in the order above — see utils/personQueue.js for why
  // that scope is the whole point.
  const sv = applyPersonQueues(inPlanOrder, options.personQueues);
  // Collect deps including those inherited from ancestors (so a parent dep blocks all its leaves)
  const effectiveDeps = id => {
    const r = iMap[id];
    if (!r) return [];
    // Hard deps (`r.deps`) and soft deps (`r.softDeps`, planner-set ordering)
    // are mechanically identical — both block start until the predecessor
    // ends. Difference is intent + visual style only. Union here so the
    // schedule walks the combined topological order.
    const ownDeps = [...(r.deps || []), ...(r.softDeps || [])];
    const ancestors = [];
    let aid = parentId(id);
    while (aid) {
      ancestors.push(aid);
      aid = parentId(aid);
    }
    return [...new Set([...ownDeps, ...ancestors.flatMap(a => iMap[a]?.deps || [])])];
  };
  // A finished task waits for nothing any more, so its links say nothing about
  // the order of the work still to do. Walking them anyway put its
  // predecessors at the finished task's place in the tree: one stale
  // "Requires" on done work moved a project the tree put last to the front.
  const visit = id => {
    if (vis.has(id)) return;
    vis.add(id);
    if (iMap[id]?.status !== 'done')
      effectiveDeps(id)
        .flatMap(resD)
        .filter(d => d !== id)
        .forEach(visit);
    ord.push(id);
  };
  sv.forEach(r => visit(r.id));
  // pF, tEW, and tSlots now track {wi, nextDate} pairs: wi is the week the
  // task ends in, nextDate is the FIRST WORKING DAY the resource/successor is
  // free. This eliminates the week-boundary gap: if task A ends Wednesday, the
  // next task starts Thursday (same week), not next Monday.
  const pF = Object.fromEntries(members.map(m => [m.id, { wi: planStartWi, nextDate: null }]));
  const tEW = {};
  const pPE = {}; // per-person parallel-end high-water mark {wi, nextDate}
  // There used to be a `committedRem` here: each person's explicitly
  // assigned but not-yet-scheduled effort, used as a virtual "busy until"
  // floor when auto-assigning unassigned work. It dates from when due dates
  // reordered the schedule. With the tree as the one order, everything it
  // counted is work that comes LATER in that order, so it reserved a person
  // for their own lower-priority tasks while those still queued behind — the
  // time went to neither. On a real plan it kept a full-time developer
  // idle for six months and moved P8 48 days past its deadline. Removed; the
  // person's real cursor (pF) is the only "busy" there is.
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
  const anyAssigneePinnedBusy = (dateIso, assignIds) => assignIds.some(id => pinnedBusy.has(`${id}|${dateIso}`));
  // Returns true if ANY of the given assignee IDs has the given ISO date blocked by vacation.
  // Works for single-assign (union of 1 set) and multi-assign alike.
  const anyAssigneeOnVacation = (dateIso, assignIds, vacSets) => assignIds.some(id => vacSets[id]?.has(dateIso));

  // Compute window stats for a scheduled task: vacation working days (union across all assignees),
  // holiday working days, and net working days in [startD, endD].
  // assignIds: array of person IDs (may be empty for unassigned fallback).
  const computeWindowStats = (startD, endD, assignIds) => {
    let vacDays = 0,
      holidaysInWindow = 0,
      workingDaysInWindow = 0;
    if (!startD || !endD) return { vacDays, holidaysInWindow, workingDaysInWindow };
    const startIso = iso(startD);
    const endIso = iso(endD);
    for (const d of eachDayInclusive(startIso, endIso)) {
      const dIso = iso(d);
      if (!wdSet.has(d.getDay())) continue; // not a configured work day
      if (hm[dIso]) {
        holidaysInWindow++;
        continue;
      } // holiday (not counted as vac or working)
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
  const maxDate = (...dates) => dates.filter(Boolean).reduce((max, date) => (!max || date > max ? date : max), null);
  const minDate = (...dates) => dates.filter(Boolean).reduce((min, date) => (!min || date < min ? date : min), null);
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
  // `poolTeam` labels each segment with the team the work was booked under:
  // a multi-team member picking up a Frontend handoff counts as Frontend, not
  // as whatever their primary team happens to be.
  const cascadeHandoff = ({
    rem,
    lastOffboard,
    usedIds,
    tM: teamMembers,
    isPinned,
    isParallel = false,
    earliestStart = null,
    poolTeam = '',
  }) => {
    const segments = [];
    let lastWD = null,
      finalWi = -1;
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
          if (mStart > nextStart) return false; // not yet onboarded
          if (mEnd && mEnd < nextStart) return false; // offboarded strictly before handoff day (end-date is inclusive)
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
      let segRem = rem,
        segFirst = null,
        segLast = null;
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
          segRem -= cap2;
          segLast = d;
          if (segRem <= 0) break;
        }
        if (segRem <= 0) break;
        wi2++;
      }
      const consumed = rem - Math.max(0, segRem);
      if (consumed <= 0) {
        usedIds.add(nextBp.id);
        continue;
      } // this member unavailable for any work; skip
      const segOffboarded = segRem > 0 && !!end2;
      segments.push({
        personId: nextBp.id,
        personName: nextBp.name || nextBp.id,
        startD: segFirst || nextStart,
        endD: segLast || end2 || nextStart,
        effort: consumed,
        offboarded: segOffboarded,
        handoff: true,
        crossTeam: !!nextBp._crossTeam,
        team: (poolTeam && memberTeams(nextBp).find(t => pt(t) === pt(poolTeam))) || nextBp.team,
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
  const paraGroups = new Map(); // leaderId → [memberIds in ord order]
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
      const ancestorIds = [];
      let aid = parentId(r.id);
      while (aid) {
        ancestorIds.push(aid);
        aid = parentId(aid);
      }
      const depSrc = [
        ...new Set([
          ...(r.deps || []),
          ...(r.softDeps || []),
          ...ancestorIds.flatMap(a => [...(iMap[a]?.deps || []), ...(iMap[a]?.softDeps || [])]),
        ]),
      ];
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
        if (_discountProgress && m.status === 'wip' && typeof m.progress === 'number' && m.progress > 0 && m.progress < 100) {
          mEff = mEff * (1 - m.progress / 100);
        }
        totalEff += mEff;
        paraLeaderOf.set(mid, leader);
      }
      paraEffByLeader.set(leader, totalEff);
    }
  }

  // Open work per project and team, counted down as the loop places it. A
  // member's first team is the one they work in by preference: they take a
  // task of another team only once their own has nothing left in that
  // project. Counted per project because a backlog that runs into 2028
  // would otherwise keep them out of the other team for good.
  const openKey = (id, team) => `${id.split('.')[0]}|${pt(team || '')}`;
  const openWork = new Map();
  for (const id of ord) {
    const r = iMap[id];
    if (!r || r.status === 'done' || !isLeafNode(tree, r.id) || (!r.best && !fixedDurationDays(r))) continue;
    const key = openKey(id, r.team);
    openWork.set(key, (openWork.get(key) || 0) + 1);
  }
  const firstTeamOf = m => pt(memberTeams(m)[0] || '');

  // The day a member would finish `eff` if they started on `from`, walking
  // their real days the way the booking loops in scheduleTeamSlot.js and scheduleAssigned.js do. Comparing
  // candidates by their start alone handed long work to whoever had a free
  // slot, however small their week. Null when their capacity is zero or they
  // leave before it is done.
  const projectedFinish = (m, fromWi, from, eff) => {
    const snap = memberAtDate(m, wks[fromWi]?.mon || from);
    const daily = deriveCap(snap) * (vacInfo[m.id] ?? 1);
    if (daily <= 0) return null;
    const end = m.end ? localDate(m.end) : null;
    let rem = eff;
    for (let wi = fromWi; wi < wks.length; wi++) {
      for (const d of wks[wi].wds) {
        if (d < from) continue;
        if (end && d > end) return null;
        const dIso = iso(d);
        if (vs[m.id]?.has(dIso) || pinnedBusy.has(`${m.id}|${dIso}`)) continue;
        rem -= daily;
        if (rem <= 0) return d;
      }
    }
    return null;
  };

  const res = [];
  const S = {
    _autoCascade,
    _now,
    anyAssigneeOnVacation,
    anyAssigneePinnedBusy,
    calcLatestStart,
    cascadeHandoff,
    computeWindowStats,
    firstTeamOf,
    fixedWorkWindow,
    mShort,
    members,
    openWork,
    pF,
    pPE,
    planStartDate,
    planStartWi,
    projectedFinish,
    ps,
    res,
    reservePinnedDays,
    tEW,
    vacInfo,
    vs,
    wdSet,
    wks,
  };
  ord.forEach(id => {
    const r = iMap[id];
    if (r?.status === 'done') return;
    if (r) {
      const ownKey = openKey(id, r.team);
      if (openWork.has(ownKey)) openWork.set(ownKey, Math.max(0, openWork.get(ownKey) - 1));
    }
    if (tEW[id]?.wi === -1) return;
    const fixedDaysTotal = fixedDurationDays(r);
    const hasFixedDuration = fixedDaysTotal > 0;
    if (!r || !isLeafNode(tree, r.id) || ((!r.best || r.best === 0) && !hasFixedDuration)) {
      tEW[id] = { wi: -1, nextDate: null };
      return;
    }
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
    if (
      !hasFixedDuration &&
      _discountProgress &&
      eff > 0 &&
      r.status === 'wip' &&
      !paraEffByLeader.has(id) &&
      typeof r.progress === 'number' &&
      r.progress > 0 &&
      r.progress < 100
    ) {
      consumedEff = eff * (r.progress / 100);
      eff = eff - consumedEff;
    }
    const team = pt(r.team);
    const tM = members.filter(m => inTeamPt(m, team));
    // Inherit deps from all ancestors so a parent dep blocks every leaf underneath
    const ancestorIds = [];
    let aid = parentId(r.id);
    while (aid) {
      ancestorIds.push(aid);
      aid = parentId(aid);
    }
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
    // Auto-scheduler with explicit opt-in for parallelism:
    //   • pinnedStart      → manual date wins, queue bypassed
    //   • noDeps + parallel:true → user said "this can overlap" — bypass queue
    //   • everything else  → queue on the person's pF cursor; dependencies +
    //     resource availability sequence the work automatically.
    // Hard sequence between specific tasks comes from `deps` / `softDeps`.
    const bypassPersonQueue = !!r.pinnedStart || (noDeps && r.parallel === true);
    // Dep tracking: find the LATEST predecessor finish. Both the week index and the day-
    // accurate nextDate are tracked so the successor can start the very next working day
    // (not the next full week — that was the source of the phantom gaps).
    let depWi = -1,
      depNextDate = null,
      depBlockerId = null;
    allD.forEach(d => {
      const fw = tEW[d];
      if (!fw || fw.wi < 0) return;
      if (fw.wi > depWi || (fw.wi === depWi && fw.nextDate && (!depNextDate || fw.nextDate > depNextDate))) {
        depWi = fw.wi;
        depNextDate = fw.nextDate;
        depBlockerId = d;
      }
    });
    // Non-pinned tasks default to planStartWi. Pinned tasks can start earlier
    // (from week 0 = viewStart) — the planning horizon only constrains auto-scheduled work.
    let early = depWi >= 0 ? depWi : r.pinnedStart ? 0 : planStartWi;
    let earlyDate = depNextDate;
    // If no dep constrains the date and the task isn't pinned, don't start before planStartDate
    // (fixes off-by-one where tasks started on the Monday before the Tuesday planning horizon).
    if (!earlyDate && depWi < 0 && !r.pinnedStart) earlyDate = effectiveFloor;
    // Pinned start: user manually pinned this task to a specific date.
    if (r.pinnedStart) {
      const pinDate = localDate(r.pinnedStart);
      const pinWi = wks.findIndex(w => w.wds.some(d => d >= pinDate));
      if (pinWi >= 0 && (pinWi > early || (pinWi === early && pinDate > (earlyDate || new Date(0))))) {
        early = pinWi;
        earlyDate = pinDate;
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

    const T = {
      allD,
      asgn,
      bypassPersonQueue,
      consumedEff,
      depBlockerId,
      depNextDate,
      depWi,
      early,
      earlyDate,
      eff,
      fixedDaysTotal,
      hasFixedDuration,
      id,
      noDeps,
      r,
      team,
      tM,
    };
    // ── Team-slot path (unassigned → schedule on earliest-free REAL person) ────
    // Unassigned tasks compete for the same person-capacity as assigned tasks.
    // This prevents the scheduler from placing work where no one is actually free.
    if (!asgn.length) {
      scheduleTeamSlot(S, T);
      return;
    }
    scheduleAssigned(S, T);
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
  const expanded = expandSegments({ _autoCascade, mShort, members, res, wks });
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
