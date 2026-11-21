import { deriveCap } from '../capacity.js';

export function expandSegments({ _autoCascade, mShort, members, res, wks }) {
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
    if (!Array.isArray(s.segments) || s.segments.length <= 1) {
      expanded.push(s);
      continue;
    }
    const primarySeg = s.segments[0];
    const primaryEnd = primarySeg.endD || s.endD;
    const primaryCalDays =
      primarySeg.startD && primaryEnd ? Math.max(1, Math.round((primaryEnd - primarySeg.startD) / 864e5) + 1) : s.calDays;
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
      const calDays = seg.startD && seg.endD ? Math.max(1, Math.round((seg.endD - seg.startD) / 864e5) + 1) : 0;
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
        personShort: seg.personId ? mShort[seg.personId] || seg.personId : '?',
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
  return expanded;
}
