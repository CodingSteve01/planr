import { addD, iso, addWorkDays, localDate } from '../date.js';
import { deriveCap, memberAtDate } from '../capacity.js';
import { inTeamPt } from './taskBasics.js';
import { offboardsInGrid, taskWindow } from './taskWindow.js';
import { lastRealSegment } from './scheduleExpand.js';

export function scheduleTeamSlot(S, T) {
  const {
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
  } = S;
  const {
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
  } = T;
  if (tM.length > 0) {
    // Find the team member who FINISHES earliest (considering deps,
    // on/offboarding, assigned work, their capacity). Who starts first
    // only breaks a tie.
    let bp = null,
      bs = Infinity,
      bDate = null,
      bestPF = null,
      bestFinish = null;
    const notGone = m2 => !(m2.end && localDate(m2.end) < (earlyDate || planStartDate));
    const firstTeamHere = tM.some(m2 => firstTeamOf(m2) === team && notGone(m2));
    for (const m of tM) {
      // Someone whose first team is another one helps out here only when
      // their own has nothing left in this project.
      const first = firstTeamOf(m);
      if (first !== team && firstTeamHere && (openWork.get(`${id.split('.')[0]}|${first}`) || 0) > 0) continue;
      const mStart = localDate(m.start || ps);
      const mEnd = m.end ? localDate(m.end) : null;
      const ji = wks.findIndex(w => w.wds.some(d => d >= mStart));
      if (ji < 0) continue; // member starts after all planned weeks
      if (mEnd && mEnd < (earlyDate || planStartDate)) continue; // already offboarded
      const personFree = pF[m.id] || { wi: planStartWi, nextDate: null };
      const parallelEnd = pPE[m.id] || { wi: -1, nextDate: null };
      const fw = bypassPersonQueue
        ? Math.max(early, ji >= 0 ? ji : 0)
        : Math.max(personFree.wi, parallelEnd.wi >= 0 ? parallelEnd.wi : 0, early, ji >= 0 ? ji : 0);
      let fd = mStart;
      if (earlyDate && earlyDate > fd) fd = earlyDate;
      if (!bypassPersonQueue && personFree.nextDate && personFree.nextDate > fd) fd = personFree.nextDate;
      if (!bypassPersonQueue && parallelEnd.nextDate && parallelEnd.nextDate > fd) fd = parallelEnd.nextDate;
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
      const finish = hasFixedDuration ? fd : projectedFinish(m, fw, fd, eff);
      const byFinish = !bp
        ? null
        : finish && !bestFinish
          ? true
          : !finish && bestFinish
            ? false
            : finish && bestFinish && +finish !== +bestFinish
              ? finish < bestFinish
              : null;
      const better = !bp
        ? true
        : byFinish !== null
          ? byFinish
          : fw < bs
            ? true
            : fw === bs && fd && bDate && fd < bDate
              ? true
              : fw === bs && fd && bDate && +fd === +bDate && bestPF && (preferBusier ? candPF > bestPF : candPF < bestPF)
                ? true
                : false;
      if (better) {
        bs = fw;
        bp = m;
        bDate = fd;
        bestPF = candPF;
        bestFinish = finish;
      }
    }
    if (bp) {
      // Snapshot bp at the task's start week so time-shifted cap /
      // meetings apply transparently below.
      bp = memberAtDate(bp, wks[bs]?.mon || new Date());
      // Schedule on this member's real timeline (same logic as the assigned path in scheduleAssigned.js)
      const mStart = localDate(bp.start || ps);
      const personFree = pF[bp.id]?.nextDate;
      const parallelEndDate = pPE[bp.id]?.nextDate;
      let skipBefore = mStart;
      if (earlyDate && earlyDate > skipBefore) skipBefore = earlyDate;
      if (!bypassPersonQueue && personFree && personFree > skipBefore) skipBefore = personFree;
      if (!bypassPersonQueue && parallelEndDate && parallelEndDate > skipBefore) skipBefore = parallelEndDate;
      const dailyBaseCap = deriveCap(bp) * vacInfo[bp.id];
      const endDate = bp.end ? localDate(bp.end) : null;
      const offboardCut = offboardsInGrid(wks, endDate);
      let rem = eff,
        wi = bs,
        firstWorkDay = null,
        lastWorkDay = null,
        gridShort = false;
      const workedDays = [];
      if (hasFixedDuration) {
        const fixed = fixedWorkWindow(skipBefore, fixedDaysTotal);
        firstWorkDay = fixed.startD;
        lastWorkDay = fixed.endD;
        wi = fixed.endWi;
        rem = 0;
        gridShort = !!fixed.short;
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
            rem -= dailyBaseCap;
            lastWorkDay = d;
            workedDays.push(dIso);
            if (rem <= 0) break;
          }
          if (rem <= 0) break;
          wi++;
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
          else if (stage?.team) pool = members.filter(m2 => inTeamPt(m2, stage.team));
          if (!pool.length) break;
          const chunk = cascadeHandoff({
            rem: planState.remaining,
            lastOffboard: planState.lastOffboard,
            usedIds,
            tM: pool,
            isPinned: !!r.pinnedStart,
            isParallel: false,
            poolTeam: stage?.team || team,
            earliestStart: earlyDate,
          });
          if (!chunk.segments.length) break; // plan entry unusable, fall through to auto
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
        // Auto-cascade same team first (semantic preference).
        const primary = cascadeHandoff({
          rem: planState.remaining,
          lastOffboard: planState.lastOffboard,
          usedIds,
          tM,
          isPinned: !!r.pinnedStart,
          isParallel: false,
          poolTeam: team,
          earliestStart: earlyDate,
        });
        const combined = {
          segments: [...planSegs, ...primary.segments],
          remaining: primary.remaining,
          lastWD: primary.lastWD || planState.lastWD,
          finalWi: primary.finalWi >= 0 ? primary.finalWi : planState.finalWi,
          lastOffboard: primary.remaining > 0 ? primary.lastOffboard || planState.lastOffboard : null,
        };
        if (combined.remaining <= 0) return combined;
        const others = members
          .filter(m2 => !inTeamPt(m2, team) && !usedIds.has(m2.id))
          .map(m2 => Object.assign({}, m2, { _crossTeam: true }));
        if (!others.length) return combined;
        const secondary = cascadeHandoff({
          rem: combined.remaining,
          lastOffboard: combined.lastOffboard || endDate,
          usedIds,
          tM: others,
          isPinned: !!r.pinnedStart,
          isParallel: false,
          earliestStart: earlyDate,
        });
        return {
          segments: [...combined.segments, ...secondary.segments],
          remaining: secondary.remaining,
          lastWD: secondary.lastWD || combined.lastWD,
          finalWi: secondary.finalWi >= 0 ? secondary.finalWi : combined.finalWi,
          lastOffboard: secondary.remaining > 0 ? secondary.lastOffboard || combined.lastOffboard : null,
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
      if (_autoCascade && cascade.remaining > 0 && offboardCut) {
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
        cascade.remaining > 0 && offboardCut
          ? {
              remainingEffort: cascade.remaining,
              personId: leaver?.personId,
              personName: leaver?.personName,
              offboardDate: iso(cascade.lastOffboard || endDate),
            }
          : null;
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
      // WIP-progress: the bar's visible start moves backward by the days
      // already consumed at this person's daily capacity (the done portion
      // sits in the past where it happened). Applied in taskWindow.js, which
      // also keeps startD <= endD.
      const consumedDays =
        !hasFixedDuration && consumedEff > 0 && dailyBaseCap > 0 ? Math.max(1, Math.round(consumedEff / dailyBaseCap)) : 0;
      const win = taskWindow({
        firstWorkDay,
        lastWorkDay,
        startFallback: firstCascadeSeg?.startD || wks[bs]?.mon || wks[0].mon,
        wks,
        eW,
        consumedDays,
        depNextDate,
        wdSet,
        effort: eff,
        truncated,
        // No offboard cut inside the grid: the grid, not a person, ended the work.
        ranOut: gridShort || (rem > 0 && !offboardCut),
      });
      const { startD: actualStartD, endD: actualEndD } = win;
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
        res.push({
          id: r.id,
          name: r.name,
          team,
          person: bp.name || bp.id,
          personId: bp.id,
          personShort: mShort[bp.id] || bp.id,
          autoAssigned: true,
          prio: r.prio,
          seq: r.seq,
          best: r.best,
          effort: eff,
          fixedDurationDays: hasFixedDuration ? fixedDaysTotal : undefined,
          startWi: win.startWi,
          endWi: win.endWi,
          startD: actualStartD,
          endD: actualEndD,
          calDays: win.calDays,
          capPct: hasFixedDuration ? 100 : Math.round(deriveCap(bp) * 100),
          vacDed: hasFixedDuration ? 0 : Math.round((1 - vacInfo[bp.id]) * 100),
          weeks: win.weeks,
          beyondHorizon: win.beyondHorizon,
          vacDays: ws0.vacDays,
          holidaysInWindow: ws0.holidaysInWindow,
          workingDaysInWindow: ws0.workingDaysInWindow,
          deps: (r.deps || []).join(', '),
          status: r.status,
          note: r.note || '',
          segments,
          truncatedByOffboard: truncated,
          pinOverridden: pinOverridden0,
          due: r.due || '',
          // A task that fits nowhere before the horizon cannot meet its due date.
          dueOverdue: !!(r.due && ((actualEndD && actualEndD > localDate(r.due)) || win.beyondHorizon)),
          latestStart,
          dueInfeasible,
          blockedBy: depBlocked ? { id: depBlockerId, endD: depNextDate } : null,
          personPrevFree: teamSlotPrevFree,
        });
      }
      return;
    }
  }
  // Fallback: no team members at all — schedule with unit capacity
  let rem = eff,
    wi = Math.max(early, planStartWi),
    firstWorkDay = null,
    lastWorkDay = null;
  const skipBefore = earlyDate || planStartDate;
  while (rem > 0 && wi < wks.length) {
    for (const d of wks[wi].wds) {
      if (d < skipBefore) continue;
      if (!firstWorkDay) firstWorkDay = d;
      rem -= 1;
      lastWorkDay = d;
      if (rem <= 0) break;
    }
    if (rem <= 0) break;
    wi++;
  }
  const eW = Math.min(wi, wks.length - 1);
  const nd = lastWorkDay ? addWorkDays(lastWorkDay, 1, wdSet) : null;
  tEW[id] = { wi: eW, nextDate: nd };
  const actualStartD = firstWorkDay || wks[Math.max(early, planStartWi)]?.mon || wks[0].mon;
  const actualEndD = lastWorkDay || addD(wks[eW].mon, 4);
  const ws1 = computeWindowStats(actualStartD, actualEndD, []);
  res.push({
    id: r.id,
    name: r.name,
    team,
    person: '(unassigned)',
    personId: null,
    personShort: '?',
    prio: r.prio,
    seq: r.seq,
    best: r.best,
    effort: eff,
    fixedDurationDays: hasFixedDuration ? fixedDaysTotal : undefined,
    startWi: Math.max(early, planStartWi),
    endWi: eW,
    startD: actualStartD,
    endD: actualEndD,
    calDays: Math.round((actualEndD - actualStartD) / 864e5) + 1,
    capPct: 100,
    vacDed: 0,
    weeks: eW - Math.max(early, planStartWi) + 1,
    vacDays: ws1.vacDays,
    holidaysInWindow: ws1.holidaysInWindow,
    workingDaysInWindow: ws1.workingDaysInWindow,
    deps: (r.deps || []).join(', '),
    status: r.status,
    note: r.note || '',
  });
  return;
}
