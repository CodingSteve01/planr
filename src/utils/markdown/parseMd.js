import { createParseState } from './parseState.js';
import { parseHeading } from './parseHeading.js';
import {
  collectHistoryLine,
  collectRoadmapLine,
  collectQueuesLine,
  collectChangesLine,
  collectScenariosLine,
  collectLogLine,
} from './parseFencedBlocks.js';
import {
  parsePlanLine,
  parseTeamsLine,
  parseMeetingPlanLine,
  parseVacationsLine,
  parseHolidaysLine,
  parseCustomFieldsLine,
  parseTemplatesLine,
} from './parseSections.js';
import { parseResourcesLine } from './parseResources.js';
import { parseTreeLine } from './parseTree.js';
import { resolveTeams } from './resolveTeams.js';
import { resolveReferences } from './resolveReferences.js';
import { buildMeta, readHistoryEvents, readRoadmapAssignment } from './closingBlocks.js';
import { readPersonQueues } from './readPersonQueues.js';
import { assembleProject } from './assembleProject.js';

// The entry of the parser. Phase 1 walks the file line by line and hands each
// line to the phase of its section; they share `state` and fill it. Phase 2 are
// the closing fix-ups, in a fixed order — each one reads what the one before it
// left in `state` or returned.
export function parseMdToProject(text) {
  const lines = text.split('\n');
  const state = createParseState();

  lines.forEach(line => {
    // Heading switches section
    const hm = line.match(/^#+\s+(.+)/);
    if (hm) {
      parseHeading(state, hm);
      return;
    }

    // History section: capture lines inside the ```planr-history``` fenced block
    if (state.section === 'history') {
      collectHistoryLine(state, line);
      return;
    }
    // Roadmap-assignment section: same fenced-block pattern as history.
    if (state.section === 'roadmap') {
      collectRoadmapLine(state, line);
      return;
    }

    // Per-person work order: same fenced-block pattern again.
    if (state.section === 'queues') {
      collectQueuesLine(state, line);
      return;
    }

    if (state.section === 'changes') {
      collectChangesLine(state, line);
      return;
    }

    // Scenarios: one JSON line each inside ```planr-scenarios (utils/scenario.js).
    if (state.section === 'scenarios') {
      collectScenariosLine(state, line);
      return;
    }

    if (state.section === 'log') {
      collectLogLine(state, line);
      return;
    }

    // Skip table separator rows like "|---|---|"
    if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) return;

    // Plan section: table rows | Field | Value |
    if (state.section === 'plan') {
      parsePlanLine(state, line);
      return;
    }

    // Teams section: | Name | Color | [Meeting Plans] |
    if (state.section === 'teams') {
      parseTeamsLine(state, line);
      return;
    }

    // Meeting Plans section: bullet list of "- Name Xh/freq" under the
    // current `### PlanName` heading.
    if (state.section === 'meetingplans' && state.currentMeetingPlan) {
      parseMeetingPlanLine(state, line);
      return;
    }

    // Resources section: bulleted list
    if (state.section === 'resources') {
      parseResourcesLine(state, line);
      return;
    }

    // Vacations section: accepts both formats
    if (state.section === 'vacations') {
      parseVacationsLine(state, line);
      return;
    }

    // Holidays section: table | Date | Name | Source |
    if (state.section === 'holidays') {
      parseHolidaysLine(state, line);
      return;
    }

    // Custom Fields section: table | ID | Name | Type | Template/Options |
    if (state.section === 'customfields') {
      parseCustomFieldsLine(state, line);
      return;
    }

    // Task Templates section: numbered phase lines "1. PhaseName — TeamName"
    if (state.section === 'templates') {
      parseTemplatesLine(state, line);
      return;
    }

    // Tree section (or default if no Work Tree heading was seen): bullet items
    parseTreeLine(state, line);
  });

  const { teamsArr, teamLookup } = resolveTeams(state);
  const { normalizedVacations, memberIdByShort } = resolveReferences(state, teamsArr, teamLookup);
  const metaObj = buildMeta(state);
  const historyEvents = readHistoryEvents(state);
  const roadmapAssignment = readRoadmapAssignment(state);
  const personQueues = readPersonQueues(state, teamsArr, teamLookup, memberIdByShort);
  return assembleProject(state, { metaObj, teamsArr, normalizedVacations, historyEvents, roadmapAssignment, personQueues });
}
