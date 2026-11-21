import { addD, iso, addWorkDays, localDate } from '../date.js';
import { deriveCap, memberAtDate } from '../capacity.js';
import { inTeamPt } from './taskBasics.js';
import { lastRealSegment } from './scheduleExpand.js';

export function scheduleAssigned(S, T) {
  const {
    _autoCascade,
    _now,
    anyAssigneeOnVacation,
    anyAssigneePinnedBusy,
    calcLatestStart,
    cascadeHandoff,
    computeWindowStats,
    fixedWorkWindow,
    mShort,
    members,
    pF,
    pPE,
    planStartWi,
    ps,
    res,
    reservePinnedDays,
    tEW,
    vacInfo,
    vs,
    wdSet,
    wks,
  } = S;
  const {
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
    r,
    team,
    tM,
  } = T;
  // ── Per-person assigned path ───────────────────────────────────────────────
  const cands = members.filter(m => asgn.includes(m.id));
  const isMulti = cands.length > 1; // pair programming / multi-assign
  // Capture per-person prior free state BEFORE selection so blockedBy can
  // tell whether the dep (vs person's own queue) was the limiting factor.
  const priorPF = {};
  cands.forEach(m => {
    priorPF[m.id] = pF[m.id]?.nextDate || null;
  });
  // For multi-assign: ALL people must be free → use the LATEST free week (max).
  // For single-assign: use the EARLIEST free week (min) among candidates.
  let bp = null,
    bs = isMulti ? 0 : 9999;
  cands.forEach(m => {
    const mStart = localDate(m.start || ps);
    const ji = wks.findIndex(w => w.wds.some(d => d >= mStart));
    const personFree = pF[m.id] || { wi: planStartWi, nextDate: null };
    const parallelEnd = pPE[m.id] || { wi: -1, nextDate: null };
    const fw = bypassPersonQueue
      ? Math.max(early, ji >= 0 ? ji : 0)
      : Math.max(personFree.wi, parallelEnd.wi >= 0 ? parallelEnd.wi : 0, early, ji >= 0 ? ji : 0);
    if (isMulti ? fw >= bs : fw < bs) {
      bs = fw;
      bp = m;
    }
  });
  if (!bp || bs >= wks.length) {
    tEW[id] = { wi: Math.min(early, wks.length - 1), nextDate: null };
    return;
  }
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
    : bp.end
      ? localDate(bp.end)
      : null;
  let rem = eff,
    wi = bs,
    firstWorkDay = null,
    lastWorkDay = null;
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
        rem -= dailyBaseCap;
        lastWorkDay = d;
        workedDays.push(dIso);
        if (rem <= 0) break;
      }
      if (rem <= 0) break;
      wi++;
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
    // See note on `_autoCascade` / `r.noCascade` in scheduleTeamSlot.js.
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
      else if (stage?.team) pool = members.filter(mm => inTeamPt(mm, stage.team));
      if (!pool.length) break;
      const chunk = cascadeHandoff({
        rem: planState.remaining,
        lastOffboard: planState.lastOffboard,
        usedIds,
        tM: pool,
        isPinned: !!r.pinnedStart,
        isParallel: false,
        earliestStart: earlyDate,
        poolTeam: stage?.team || team,
      });
      if (!chunk.segments.length) break;
      chunk.segments.forEach(seg => {
        seg.planned = true;
      });
      planSegs.push(...chunk.segments);
      planState = {
        remaining: chunk.remaining,
        lastOffboard: chunk.lastOffboard || planState.lastOffboard,
        lastWD: chunk.lastWD || planState.lastWD,
        finalWi: chunk.finalWi >= 0 ? chunk.finalWi : planState.finalWi,
      };
    }
    // 2) Co-assignees (multi-assign rescue)
    let state = planState;
    if (isMulti && state.remaining > 0) {
      const coAssignees = cands.filter(m => !usedIds.has(m.id));
      if (coAssignees.length) {
        const coChunk = cascadeHandoff({
          rem: state.remaining,
          lastOffboard: state.lastOffboard || endDate,
          usedIds,
          tM: coAssignees,
          isPinned: !!r.pinnedStart,
          isParallel: false,
          earliestStart: earlyDate,
          poolTeam: team,
        });
        state = {
          remaining: coChunk.remaining,
          lastOffboard: coChunk.lastOffboard || state.lastOffboard,
          lastWD: coChunk.lastWD || state.lastWD,
          finalWi: coChunk.finalWi >= 0 ? coChunk.finalWi : state.finalWi,
        };
        planSegs.push(...coChunk.segments);
      }
    }
    if (state.remaining <= 0) return { segments: planSegs, remaining: 0, lastWD: state.lastWD, finalWi: state.finalWi, lastOffboard: null };
    // 3) Same team auto-cascade
    const primaryChunk = cascadeHandoff({
      rem: state.remaining,
      lastOffboard: state.lastOffboard || endDate,
      usedIds,
      tM,
      isPinned: !!r.pinnedStart,
      isParallel: false,
      earliestStart: earlyDate,
      poolTeam: team,
    });
    state = {
      remaining: primaryChunk.remaining,
      lastOffboard: primaryChunk.lastOffboard || state.lastOffboard,
      lastWD: primaryChunk.lastWD || state.lastWD,
      finalWi: primaryChunk.finalWi >= 0 ? primaryChunk.finalWi : state.finalWi,
    };
    const combined = [...planSegs, ...primaryChunk.segments];
    if (state.remaining <= 0) return { segments: combined, remaining: 0, lastWD: state.lastWD, finalWi: state.finalWi, lastOffboard: null };
    // 4) Cross-team fallback
    const others = members.filter(mm => !inTeamPt(mm, team) && !usedIds.has(mm.id)).map(mm => Object.assign({}, mm, { _crossTeam: true }));
    if (!others.length)
      return {
        segments: combined,
        remaining: state.remaining,
        lastWD: state.lastWD,
        finalWi: state.finalWi,
        lastOffboard: state.lastOffboard,
      };
    const secondary = cascadeHandoff({
      rem: state.remaining,
      lastOffboard: state.lastOffboard || endDate,
      usedIds,
      tM: others,
      isPinned: !!r.pinnedStart,
      isParallel: false,
      earliestStart: earlyDate,
    });
    return {
      segments: [...combined, ...secondary.segments],
      remaining: secondary.remaining,
      lastWD: secondary.lastWD || state.lastWD,
      finalWi: secondary.finalWi >= 0 ? secondary.finalWi : state.finalWi,
      lastOffboard: secondary.remaining > 0 ? secondary.lastOffboard || state.lastOffboard : null,
    };
  };
  const cascade = runAssignedCascade();
  const segments = [primarySegment, ...cascade.segments];
  // Ghost + truncated only fire when an actual offboard caused the
  // shortfall AND autoCascade is on. See the comment in scheduleTeamSlot.js.
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
  const leaver = lastRealSegment(segments);
  const truncated =
    cascade.remaining > 0 && endDate
      ? {
          remainingEffort: cascade.remaining,
          personId: leaver?.personId,
          personName: leaver?.personName,
          offboardDate: iso(cascade.lastOffboard || endDate),
        }
      : null;
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
  }
  if (r.pinnedStart) reservePinnedDays(asgn, workedDays);
  const firstCascadeSegExplicit = cascade.segments[0];
  let actualStartD = firstWorkDay || firstCascadeSegExplicit?.startD || wks[bs].mon;
  const actualEndD = lastWorkDay || addD(wks[eW].mon, 4);
  // Same WIP-progress backward shift as in scheduleTeamSlot.js (see the comment there).
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
  const ws2 = computeWindowStats(actualStartD, actualEndD, hasFixedDuration ? [] : isMulti ? asgn : [bp.id]);
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
  // Same gating as the team-fallback path in scheduleTeamSlot.js: only surface blockedBy when the
  // dep was the binding floor (bs === depWi). Prevents stale/done deps from
  // appearing as the blocker when the real reason this row sits in the future
  // is the assignee's prior queue.
  const depBlockedAsg = !!(depBlockerId && depNextDate && bs === depWi);
  res.push({
    id: r.id,
    name: r.name,
    team,
    person: bp.name || bp.id,
    personId: bp.id,
    personShort: mShort[bp.id] || bp.id,
    // Emit the resolved `asgn` list (which already includes teamLock fan-
    // out + explicit assign) so consumers like Queues can mirror the
    // task into every involved person's lane, not only the picked one.
    assign: [...asgn],
    prio: r.prio,
    seq: r.seq,
    best: r.best,
    effort: eff,
    fixedDurationDays: hasFixedDuration ? fixedDaysTotal : undefined,
    startWi: bs,
    endWi: eW,
    startD: actualStartD,
    endD: actualEndD,
    calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
    capPct: hasFixedDuration ? 100 : Math.round(deriveCap(bp) * 100),
    vacDed: hasFixedDuration ? 0 : Math.round((1 - vacInfo[bp.id]) * 100),
    weeks: eW - bs + 1,
    parallel: false,
    pinOverridden,
    due: r.due || '',
    dueOverdue,
    latestStart,
    dueInfeasible,
    blockedBy: depBlockedAsg ? { id: depBlockerId, endD: depNextDate } : null,
    personPrevFree: personPrevFreeAsg,
    vacDays: ws2.vacDays,
    holidaysInWindow: ws2.holidaysInWindow,
    workingDaysInWindow: ws2.workingDaysInWindow,
    deps: (r.deps || []).join(', '),
    status: r.status,
    note: r.note || '',
    segments,
    truncatedByOffboard: truncated,
  });
}
