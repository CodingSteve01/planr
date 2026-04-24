// Shared helpers for rendering an assignee chain across every view that shows
// a short-code (Gantt rows, Tree labels, Network nodes, tooltips, insights).
// A single-assignee task renders as the short code; a handoff cascade renders
// as "AB→CD→EF", with "⚠" appended when the chain ends in an unscheduled
// remainder. `/` separates co-assignees inside a single segment.

export function segmentShorts(seg, shortMap) {
  if (seg.unscheduled) return '⚠';
  const ids = Array.isArray(seg.assign) && seg.assign.length ? seg.assign : (seg.personId ? [seg.personId] : []);
  if (!ids.length) return seg.personName ? (seg.personName.split(' ')[0] || '?') : '?';
  return ids.map(id => shortMap[id] || (id || '').slice(0, 2).toUpperCase()).join('/');
}

// Full chain for a scheduled item. `primaryShorts` is the caller's way of
// rendering co-assignees on the primary segment (so pair-programming keeps
// its "AB+CD" style); if omitted we fall back to segmentShorts.
export function chainShorts(s, shortMap, primaryShorts) {
  const segs = s?.segments;
  if (!segs || segs.length <= 1) {
    return primaryShorts || segmentShorts({ personId: s?.personId, personName: s?.person, assign: s?.assign }, shortMap);
  }
  const parts = segs.map((seg, i) => i === 0 && primaryShorts ? primaryShorts : segmentShorts(seg, shortMap));
  return parts.join('→');
}

// Boolean: does this scheduled item have a multi-link chain worth annotating?
export function hasChain(s) {
  return !!(s?.segments && s.segments.length > 1);
}

// Build a long-form hover tooltip: "Marlin Baumgart → Konstantin Kroner (Handoff) → ⚠ unassigned".
export function chainTooltip(s, memberName) {
  if (!hasChain(s)) return null;
  return s.segments.map(seg => {
    if (seg.unscheduled) return '⚠ unassigned (' + seg.effort.toFixed(1) + ' PT)';
    const name = seg.personName || (memberName && seg.personId ? memberName(seg.personId) : seg.personId || '?');
    const extras = [];
    if (seg.crossTeam) extras.push('cross-team');
    if (seg.handoff && !seg.crossTeam) extras.push('handoff');
    return extras.length ? name + ' (' + extras.join(', ') + ')' : name;
  }).join(' → ');
}
