// The groups of the plan review's warnings tab, shared by the tab badge and the
// list so both count the same rows. A task beyond the plan horizon is listed
// once, in its own group: it is also `dueOverdue` when it has a due date, but
// repeating it under the due dates would count it twice.
export function warningGroups(scheduled, conflicts = [], noCapacity = [], now = new Date()) {
  const isBeyond = s => s.beyondHorizon && s.status !== 'done';
  const dueViolations = scheduled.filter(s => !isBeyond(s) && (s.dueOverdue || (s.due && new Date(s.due) < now && s.status !== 'done')));
  const truncated = scheduled.filter(s => s.truncatedByOffboard);
  const beyond = scheduled.filter(isBeyond);
  const count = dueViolations.length + truncated.length + beyond.length + conflicts.length + noCapacity.length;
  return { dueViolations, truncated, beyond, count };
}
