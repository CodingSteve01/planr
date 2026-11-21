import { parseResourceLine } from '../markdown.js';

// Phase: the `## Resources` section — a person's bullet and the italic
// sub-bullets under it, which attach to the last person read. Consumes the line.
export function parseResourcesLine(state, line) {
  const { teamSet, mems } = state;
  // Format: - **Full Name** `SHORT` — Team, Role (cap%), 40h/w, 25d/y, ab YYYY-MM-DD
  const parsedMember = parseResourceLine(line);
  if (parsedMember) {
    const { teams: teamNames, short: shortName, ...fields } = parsedMember;
    teamNames.forEach(n => teamSet.add(n));
    const m = { id: 'm' + Date.now() + mems.length, ...fields };
    if (teamNames.length > 1) m.teams = teamNames;
    if (shortName) m._parsedShort = shortName;
    mems.push(m);
    state.lastItem = m;
  }
  // Sub-bullet for plan references: *Plans: Name 1, Name 2*
  const pm = line.match(/^\s*\*Plans:\s*(.+?)\*\s*$/);
  if (pm && state.lastItem && mems[mems.length - 1] === state.lastItem) {
    state.lastItem._parsedPlanNames = pm[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    return;
  }
  // Sub-bullet for meetings: *Meetings: Name 1.25h/d, Retro 0.5h/2w, Allhands 1h/mo*
  const mt = line.match(/^\s*\*Meetings:\s*(.+?)\*\s*$/);
  if (mt && state.lastItem && mems[mems.length - 1] === state.lastItem) {
    const items = mt[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    state.lastItem.meetings = items.map((raw, i) => {
      // "Standup 0.25h/d" | "Standup 1.25h/w" | "Retro 0.5h/2w" | "Allhands 1h/mo"
      const hm = raw.match(/^(.+?)\s+(\d+(?:\.\d+)?)h\s*\/\s*(d|w|2w|mo)\s*$/i);
      if (!hm) return { id: 'mt_' + i, name: raw, hours: 0, frequency: 'weekly' };
      const fk = hm[3].toLowerCase();
      const freq = fk === 'd' ? 'daily' : fk === '2w' ? 'biweekly' : fk === 'mo' ? 'monthly' : 'weekly';
      return { id: 'mt_' + i, name: hm[1].trim(), hours: parseFloat(hm[2]), frequency: freq };
    });
    state.lastItem.capMode = 'derived';
    if (state.lastItem.weeklyHours == null) state.lastItem.weeklyHours = 40;
  }
  // Sub-bullet for capacity changes: *Capacity plan: 2026-09-01→50%, 2027-01-01→100%30h/w*
  // Also accepts the pre-rename tag (*Cap-Plan:*) so files saved by an
  // older build keep loading unchanged.
  const cp = line.match(/^\s*\*(?:Capacity plan|Cap-Plan):\s*(.+?)\*\s*$/);
  if (cp && state.lastItem && mems[mems.length - 1] === state.lastItem) {
    const out = [];
    for (const raw of cp[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)) {
      const dm = raw.match(/^(\d{4}-\d{2}-\d{2})\s*→\s*(.*)$/);
      if (!dm) continue;
      const entry = { from: dm[1] };
      const body = dm[2];
      const capM = body.match(/(\d+(?:\.\d+)?)\s*%/);
      if (capM) entry.cap = parseFloat(capM[1]) / 100;
      const hM = body.match(/(\d+(?:\.\d+)?)\s*h\s*\/\s*w/i);
      if (hM) entry.weeklyHours = parseFloat(hM[1]);
      if (entry.cap !== undefined || entry.weeklyHours !== undefined) out.push(entry);
    }
    if (out.length) state.lastItem.capChanges = out.sort((a, b) => a.from.localeCompare(b.from));
    return;
  }
  // Sub-bullet for scheduled meeting overrides:
  // *Meeting plan: 2026-06-01→[plans:dev+lead, Standup 0.5h/d]; 2027-01-01→[...]*
  // Also accepts the pre-rename tag (*Meeting-Plan:*) — see Cap-Plan above.
  const mp = line.match(/^\s*\*(?:Meeting plan|Meeting-Plan):\s*(.+?)\*\s*$/);
  if (mp && state.lastItem && mems[mems.length - 1] === state.lastItem) {
    const out = [];
    for (const seg of mp[1]
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)) {
      const dm = seg.match(/^(\d{4}-\d{2}-\d{2})\s*→\s*\[(.+)\]\s*$/);
      if (!dm) continue;
      const entry = { from: dm[1], meetings: [] };
      dm[2]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach((raw, i) => {
          const planM = raw.match(/^plans:\s*(.+)$/i);
          if (planM) {
            entry._parsedPlanNames = planM[1]
              .split('+')
              .map(s => s.trim())
              .filter(Boolean);
            return;
          }
          const hm = raw.match(/^(.+?)\s+(\d+(?:\.\d+)?)h\s*\/\s*(d|w|2w|mo)\s*$/i);
          if (!hm) {
            entry.meetings.push({ id: 'mc_' + i, name: raw, hours: 0, frequency: 'weekly' });
            return;
          }
          const fk = hm[3].toLowerCase();
          const freq = fk === 'd' ? 'daily' : fk === '2w' ? 'biweekly' : fk === 'mo' ? 'monthly' : 'weekly';
          entry.meetings.push({ id: 'mc_' + i, name: hm[1].trim(), hours: parseFloat(hm[2]), frequency: freq });
        });
      out.push(entry);
    }
    if (out.length) state.lastItem.meetingChanges = out.sort((a, b) => a.from.localeCompare(b.from));
    return;
  }
  return;
}
