// Derive a member's scheduling capacity (0..1 of FTE) from a transparent
// hours/week budget minus recurring meetings. Legacy members keep the raw
// `cap` number; anyone with `capMode: 'derived'` + `weeklyHours`/`meetings`
// gets an auditable computed value.
//
// FTE baseline is fixed at 40 h/week so cap% matches the convention "100 % =
// one full-time person". A 30h part-time member with 4h of meetings ends up
// at 26/40 = 65 % — matches what a project manager would eyeball.

export const FTE_HOURS = 40;

// Weekly-equivalent multipliers. Daily meetings assume a 5-day work week; the
// scheduler already excludes weekends from capacity, so 5× is correct.
const FREQ_MULT = { daily: 5, weekly: 1, biweekly: 0.5, monthly: 12 / 52 };

export function meetingWeeklyHours(meeting) {
  if (!meeting || !meeting.hours) return 0;
  const mult = FREQ_MULT[meeting.frequency || 'weekly'] ?? 1;
  return Math.max(0, meeting.hours * mult);
}

export function sumMeetingHours(meetings) {
  if (!Array.isArray(meetings)) return 0;
  return meetings.reduce((s, m) => s + meetingWeeklyHours(m), 0);
}

export function deriveCap(member) {
  if (!member) return 1;
  if (member.capMode !== 'derived') return member.cap ?? 1;
  const wh = typeof member.weeklyHours === 'number' && member.weeklyHours >= 0 ? member.weeklyHours : FTE_HOURS;
  const meetingHours = sumMeetingHours(member.meetings);
  const avail = Math.max(0, wh - meetingHours);
  return avail / FTE_HOURS;
}

// Human-readable breakdown for tooltips / insights.
// Returns lines like:
//   ["40 h/week", "- 1.25 h  Standup (5×15min)", "= 38.75 h → 97%"]
export function capBreakdown(member) {
  if (!member || member.capMode !== 'derived') {
    const pct = Math.round((member?.cap ?? 1) * 100);
    return [{ kind: 'manual', text: `Manual: ${pct} %` }];
  }
  const wh = typeof member.weeklyHours === 'number' ? member.weeklyHours : FTE_HOURS;
  const lines = [{ kind: 'base', text: `${wh} h / Woche` }];
  for (const m of (member.meetings || [])) {
    const weeklyH = meetingWeeklyHours(m);
    if (weeklyH <= 0) continue;
    const freqLabel = m.frequency && m.frequency !== 'weekly' ? ` (${m.frequency})` : '';
    lines.push({ kind: 'meeting', text: `− ${weeklyH.toFixed(2)} h  ${m.name || 'Meeting'}${freqLabel}` });
  }
  const avail = Math.max(0, wh - sumMeetingHours(member.meetings));
  const pct = Math.round(avail / FTE_HOURS * 100);
  lines.push({ kind: 'result', text: `= ${avail.toFixed(2)} h  →  ${pct} % FTE` });
  return lines;
}

