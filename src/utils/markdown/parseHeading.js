// Phase: a heading line switches the section the following lines belong to.
// Always consumes the line.
export function parseHeading(state, hm) {
  const { parsedMeetingPlans, taskTemplates } = state;
  const h = hm[1].trim();
  if (!state.projName) state.projName = h;
  const lower = h.toLowerCase();
  if (lower === 'plan') state.section = 'plan';
  else if (lower === 'teams') state.section = 'teams';
  else if (lower === 'resources' || /resources?$/i.test(lower)) state.section = 'resources';
  else if (lower.startsWith('vacation')) state.section = 'vacations';
  else if (lower === 'holidays') state.section = 'holidays';
  else if (lower === 'custom fields') state.section = 'customfields';
  else if (lower === 'work tree') state.section = 'tree';
  else if (lower === 'meeting plans') {
    state.section = 'meetingplans';
    state.currentMeetingPlan = null;
  } else if (lower === 'task templates') {
    state.section = 'templates';
    state.currentTpl = null;
  } else if (lower === 'history') {
    state.section = 'history';
    state.historyBlockLines = null;
  } else if (lower === 'roadmap') {
    state.section = 'roadmap';
    state.roadmapBlockLines = null;
  } else if (lower === 'work order') {
    state.section = 'queues';
    state.queueBlockLines = null;
  } else if (lower === 'scenarios') {
    state.section = 'scenarios';
    state.scenarioBlockLines = null;
  } else if (lower === 'log') {
    state.section = 'log';
    state.logBlockLines = null;
  } else if (lower === 'changes') {
    state.section = 'changes';
    state.changeBlockLines = null;
  } else if (state.section === 'meetingplans' && hm[0].startsWith('###')) {
    state.currentMeetingPlan = { id: 'mp_' + Date.now() + parsedMeetingPlans.length, name: h, meetings: [] };
    parsedMeetingPlans.push(state.currentMeetingPlan);
    return;
  } else if (state.section === 'templates' && hm[0].startsWith('###')) {
    // ### Template Name — start a new template
    state.currentTpl = { id: 'tpl_' + Date.now() + taskTemplates.length, name: h, phases: [] };
    taskTemplates.push(state.currentTpl);
    return;
  } else state.section = null;
  state.lastItem = null;
  return;
}
