import { parseChangesBlock, parseScenariosBlock } from '../scenario.js';
import { parseDayLogBlock } from '../dayLog.js';

// Closing fix-up 7: put the project together, then read the blocks that are
// resolved against it (changes, scenarios, log), in that order.
export function assembleProject(state, parts) {
  const { tree, mems, holidaysArr, taskTemplates, parsedCustomFields, parsedMeetingPlans } = state;
  const { metaObj, teamsArr, normalizedVacations, historyEvents, roadmapAssignment, personQueues } = parts;
  const project = {
    meta: metaObj,
    teams: teamsArr,
    members: mems,
    tree,
    vacations: normalizedVacations,
    holidays: holidaysArr,
    ...(taskTemplates.length ? { taskTemplates } : {}),
    ...(parsedCustomFields.length ? { customFields: parsedCustomFields } : {}),
    ...(parsedMeetingPlans.length ? { meetingPlans: parsedMeetingPlans } : {}),
    ...(historyEvents.length ? { historyEvents } : {}),
    ...(roadmapAssignment ? { roadmapAssignment } : {}),
    ...(personQueues ? { personQueues } : {}),
  };
  // Dated changes, resolved like the scenarios below — and before them, so a
  // scenario is measured against the plan as it really is.
  if (state.changeBlockLines && state.changeBlockLines.length) {
    const changes = parseChangesBlock(state.changeBlockLines.filter(l => l !== null).join('\n'), project);
    if (changes.length) project.changes = changes;
  }
  // Scenarios refer to people and teams by name in the file; they are resolved
  // last, against the ids this very load has just handed out.
  if (state.scenarioBlockLines && state.scenarioBlockLines.length) {
    const scenarios = parseScenariosBlock(state.scenarioBlockLines.filter(l => l !== null).join('\n'), project);
    if (scenarios.length) project.scenarios = scenarios;
  }
  if (state.logBlockLines && state.logBlockLines.length) {
    const dayLog = parseDayLogBlock(state.logBlockLines.filter(l => l !== null).join('\n'), project);
    if (dayLog.length) project.dayLog = dayLog;
  }
  return project;
}
