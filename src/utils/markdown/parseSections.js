import { parseTemplatePhaseLine } from '../phases.js';

// Phase: the sections made of one table row or one list line each — plan meta,
// teams, meeting plans, vacations, holidays, custom fields, task templates.
// Every function consumes the line.

// Plan section: table rows | Field | Value |
export function parsePlanLine(state, line) {
  const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
  if (m && !/^Field$/i.test(m[1])) {
    if (/^start/i.test(m[1])) state.planStart = m[2].trim();
    else if (/^end/i.test(m[1])) state.planEnd = m[2].trim();
    else if (/^view\s*start/i.test(m[1])) state.viewStartMd = m[2].trim();
    else if (/^work\s*days/i.test(m[1])) state.workDays = m[2].trim();
    // Old `Queue By Default` flag silently ignored — link-driven scheduler is the only mode now.
  }
  return;
}

// Teams section: | Name | Color | [Meeting Plans] |
export function parseTeamsLine(state, line) {
  const { explicitTeams, teamSet } = state;
  // 3-col form with Meeting Plans column
  const m3 = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*`?(#?[0-9a-fA-F]+)`?\s*\|\s*([^|]*?)\s*\|\s*$/);
  if (m3 && !/^Name$/i.test(m3[1])) {
    const name = m3[1].trim();
    const color = m3[2].startsWith('#') ? m3[2] : '#' + m3[2];
    const planNames = m3[3].trim()
      ? m3[3]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    explicitTeams.push({ name, color, _parsedPlans: planNames });
    teamSet.add(name);
    return;
  }
  // Legacy 2-col
  const m2 = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*`?(#?[0-9a-fA-F]+)`?\s*\|\s*$/);
  if (m2 && !/^Name$/i.test(m2[1])) {
    const name = m2[1].trim();
    const color = m2[2].startsWith('#') ? m2[2] : '#' + m2[2];
    explicitTeams.push({ name, color });
    teamSet.add(name);
  }
  return;
}

// Meeting Plans section: bullet list of "- Name Xh/freq" under the
// current `### PlanName` heading.
export function parseMeetingPlanLine(state, line) {
  const bm = line.match(/^\s*[-*]\s+(.+?)\s+(\d+(?:\.\d+)?)h\s*\/\s*(d|w|2w|mo)\s*$/i);
  if (bm) {
    const fk = bm[3].toLowerCase();
    const freq = fk === 'd' ? 'daily' : fk === '2w' ? 'biweekly' : fk === 'mo' ? 'monthly' : 'weekly';
    state.currentMeetingPlan.meetings.push({
      id: 'mt_' + Date.now() + state.currentMeetingPlan.meetings.length,
      name: bm[1].trim(),
      hours: parseFloat(bm[2]),
      frequency: freq,
    });
  }
  return;
}

// Vacations section: accepts both formats
// Old (3-col): | Person | Week (Mon) | Note |
// New (4-col): | Person | From | To | Note |
export function parseVacationsLine(state, line) {
  const { vacationsArr } = state;
  // Try 4-col first (new format)
  const m4 = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
  if (m4 && !/^Person$/i.test(m4[1]) && !/^---|^\s*$/.test(m4[1])) {
    vacationsArr.push({ person: m4[1].trim(), from: m4[2].trim(), to: m4[3].trim(), note: m4[4].trim() });
    return;
  }
  // Fall back to 3-col (old week format)
  const m3 = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
  if (m3 && !/^Person$/i.test(m3[1]) && !/^---|^\s*$/.test(m3[1])) {
    vacationsArr.push({ person: m3[1].trim(), week: m3[2].trim(), note: m3[3].trim() });
  }
  return;
}

// Holidays section: table | Date | Name | Source |
export function parseHolidaysLine(state, line) {
  const { holidaysArr } = state;
  const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
  if (m && !/^Date$/i.test(m[1])) {
    holidaysArr.push({ date: m[1].trim(), name: m[2].trim(), auto: /auto/i.test(m[3]) });
  }
  return;
}

// Custom Fields section: table | ID | Name | Type | Template/Options |
export function parseCustomFieldsLine(state, line) {
  const { parsedCustomFields } = state;
  const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
  if (m && !/^ID$/i.test(m[1])) {
    const cfId = m[1].trim(),
      cfName = m[2].trim(),
      cfType = m[3].trim(),
      cfExtra = m[4].trim();
    const cf = { id: cfId, name: cfName, type: cfType };
    if (cfType === 'uri') cf.uriTemplate = cfExtra;
    else if (cfType === 'select')
      cf.options = cfExtra
        ? cfExtra
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [];
    parsedCustomFields.push(cf);
  }
  return;
}

// Task Templates section: numbered phase lines "1. PhaseName — TeamName"
export function parseTemplatesLine(state, line) {
  if (state.currentTpl) {
    const pm = line.match(/^\s*\d+\.\s+(.+)/);
    if (pm) {
      state.currentTpl.phases.push(parseTemplatePhaseLine(pm[1]));
    }
  }
  return;
}
