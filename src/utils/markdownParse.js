// Markdown plan file → project data. The writer is utils/markdown.js
// (`buildMarkdownText`); this is its other half. It lived inside the App
// component until scenarios needed to read a plan without mounting one.
import { GT_MARKS } from '../constants.js';
import { normalizeVacation } from './date.js';
import { parseResourceLine } from './markdown.js';
import { parseHistoryBlock } from './history.js';
import { parsePhaseToken, parseTemplatePhaseLine, phaseTeamIds } from './phases.js';
import { buildMemberShortMap } from './memberShort.js';
import { parseChangesBlock, parseScenariosBlock } from './scenario.js';
import { parseDayLogBlock } from './dayLog.js';

export function parseMdToProject(text) {
  const lines = text.split('\n');
  const tree = [],
    mems = [],
    teamSet = new Set();
  const explicitTeams = []; // teams from "## Teams" table (with color)
  const vacationsArr = [],
    holidaysArr = [];
  const taskTemplates = [];
  const parsedCustomFields = []; // custom field definitions from ## Custom Fields section
  let currentTpl = null; // template being parsed
  let projName = null;
  let planStart = '',
    planEnd = '',
    viewStartMd = '',
    workDays = '';
  const idStack = [];
  const parsedMeetingPlans = []; // meeting plan definitions from ## Meeting Plans
  let currentMeetingPlan = null; // being parsed
  let section = null; // 'plan' | 'teams' | 'resources' | 'vacations' | 'holidays' | 'tree' | 'templates' | 'customfields' | 'meetingplans' | 'history' | null
  let lastItem = null;
  // History fenced-block accumulator: lines between ```planr-history and ```
  let historyBlockLines = null;
  // Roadmap-assignment fenced-block accumulator: lines between
  // ```planr-roadmap and ``` (see `## Roadmap` section).
  let roadmapBlockLines = null;
  // ```planr-queues — one line per person: their own order of work.
  let queueBlockLines = null;
  // ```planr-scenarios — one JSON line per scenario.
  let scenarioBlockLines = null;
  // ```planr-log — one JSON line per day (utils/dayLog.js).
  let logBlockLines = null;
  // ```planr-changes — one JSON line per date (utils/effective.js).
  let changeBlockLines = null;

  lines.forEach(line => {
    // Heading switches section
    const hm = line.match(/^#+\s+(.+)/);
    if (hm) {
      const h = hm[1].trim();
      if (!projName) projName = h;
      const lower = h.toLowerCase();
      if (lower === 'plan') section = 'plan';
      else if (lower === 'teams') section = 'teams';
      else if (lower === 'resources' || /resources?$/i.test(lower)) section = 'resources';
      else if (lower.startsWith('vacation')) section = 'vacations';
      else if (lower === 'holidays') section = 'holidays';
      else if (lower === 'custom fields') section = 'customfields';
      else if (lower === 'work tree') section = 'tree';
      else if (lower === 'meeting plans') {
        section = 'meetingplans';
        currentMeetingPlan = null;
      } else if (lower === 'task templates') {
        section = 'templates';
        currentTpl = null;
      } else if (lower === 'history') {
        section = 'history';
        historyBlockLines = null;
      } else if (lower === 'roadmap') {
        section = 'roadmap';
        roadmapBlockLines = null;
      } else if (lower === 'work order') {
        section = 'queues';
        queueBlockLines = null;
      } else if (lower === 'scenarios') {
        section = 'scenarios';
        scenarioBlockLines = null;
      } else if (lower === 'log') {
        section = 'log';
        logBlockLines = null;
      } else if (lower === 'changes') {
        section = 'changes';
        changeBlockLines = null;
      } else if (section === 'meetingplans' && hm[0].startsWith('###')) {
        currentMeetingPlan = { id: 'mp_' + Date.now() + parsedMeetingPlans.length, name: h, meetings: [] };
        parsedMeetingPlans.push(currentMeetingPlan);
        return;
      } else if (section === 'templates' && hm[0].startsWith('###')) {
        // ### Template Name — start a new template
        currentTpl = { id: 'tpl_' + Date.now() + taskTemplates.length, name: h, phases: [] };
        taskTemplates.push(currentTpl);
        return;
      } else section = null;
      lastItem = null;
      return;
    }

    // History section: capture lines inside the ```planr-history``` fenced block
    if (section === 'history') {
      const fenceOpen = /^\s*```planr-history\s*$/i.test(line);
      const fenceClose = /^\s*```\s*$/.test(line);
      if (fenceOpen) {
        historyBlockLines = [];
        return;
      }
      if (fenceClose && historyBlockLines != null) {
        /* end of block; keep array as-is */ historyBlockLines.push(null);
        return;
      }
      if (historyBlockLines != null && historyBlockLines[historyBlockLines.length - 1] !== null) {
        historyBlockLines.push(line);
      }
      return;
    }
    // Roadmap-assignment section: same fenced-block pattern as history.
    if (section === 'roadmap') {
      const fenceOpen = /^\s*```planr-roadmap\s*$/i.test(line);
      const fenceClose = /^\s*```\s*$/.test(line);
      if (fenceOpen) {
        roadmapBlockLines = [];
        return;
      }
      if (fenceClose && roadmapBlockLines != null) {
        roadmapBlockLines.push(null);
        return;
      }
      if (roadmapBlockLines != null && roadmapBlockLines[roadmapBlockLines.length - 1] !== null) {
        roadmapBlockLines.push(line);
      }
      return;
    }

    // Per-person work order: same fenced-block pattern again.
    if (section === 'queues') {
      const fenceOpen = /^\s*```planr-queues\s*$/i.test(line);
      const fenceClose = /^\s*```\s*$/.test(line);
      if (fenceOpen) {
        queueBlockLines = [];
        return;
      }
      if (fenceClose && queueBlockLines != null) {
        queueBlockLines.push(null);
        return;
      }
      if (queueBlockLines != null && queueBlockLines[queueBlockLines.length - 1] !== null) {
        queueBlockLines.push(line);
      }
      return;
    }

    if (section === 'changes') {
      const fenceOpen = /^\s*```planr-changes\s*$/i.test(line);
      const fenceClose = /^\s*```\s*$/.test(line);
      if (fenceOpen) {
        changeBlockLines = [];
        return;
      }
      if (fenceClose && changeBlockLines != null) {
        changeBlockLines.push(null);
        return;
      }
      if (changeBlockLines != null && changeBlockLines[changeBlockLines.length - 1] !== null) changeBlockLines.push(line);
      return;
    }

    // Scenarios: one JSON line each inside ```planr-scenarios (utils/scenario.js).
    if (section === 'scenarios') {
      const fenceOpen = /^\s*```planr-scenarios\s*$/i.test(line);
      const fenceClose = /^\s*```\s*$/.test(line);
      if (fenceOpen) {
        scenarioBlockLines = [];
        return;
      }
      if (fenceClose && scenarioBlockLines != null) {
        scenarioBlockLines.push(null);
        return;
      }
      if (scenarioBlockLines != null && scenarioBlockLines[scenarioBlockLines.length - 1] !== null) {
        scenarioBlockLines.push(line);
      }
      return;
    }

    if (section === 'log') {
      if (/^\s*```planr-log\s*$/i.test(line)) {
        logBlockLines = [];
        return;
      }
      if (/^\s*```\s*$/.test(line) && logBlockLines != null) {
        logBlockLines.push(null);
        return;
      }
      if (logBlockLines != null && logBlockLines[logBlockLines.length - 1] !== null) logBlockLines.push(line);
      return;
    }

    // Skip table separator rows like "|---|---|"
    if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) return;

    // Plan section: table rows | Field | Value |
    if (section === 'plan') {
      const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
      if (m && !/^Field$/i.test(m[1])) {
        if (/^start/i.test(m[1])) planStart = m[2].trim();
        else if (/^end/i.test(m[1])) planEnd = m[2].trim();
        else if (/^view\s*start/i.test(m[1])) viewStartMd = m[2].trim();
        else if (/^work\s*days/i.test(m[1])) workDays = m[2].trim();
        // Old `Queue By Default` flag silently ignored — link-driven scheduler is the only mode now.
      }
      return;
    }

    // Teams section: | Name | Color | [Meeting Plans] |
    if (section === 'teams') {
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
    if (section === 'meetingplans' && currentMeetingPlan) {
      const bm = line.match(/^\s*[-*]\s+(.+?)\s+(\d+(?:\.\d+)?)h\s*\/\s*(d|w|2w|mo)\s*$/i);
      if (bm) {
        const fk = bm[3].toLowerCase();
        const freq = fk === 'd' ? 'daily' : fk === '2w' ? 'biweekly' : fk === 'mo' ? 'monthly' : 'weekly';
        currentMeetingPlan.meetings.push({
          id: 'mt_' + Date.now() + currentMeetingPlan.meetings.length,
          name: bm[1].trim(),
          hours: parseFloat(bm[2]),
          frequency: freq,
        });
      }
      return;
    }

    // Resources section: bulleted list
    if (section === 'resources') {
      // Format: - **Full Name** `SHORT` — Team, Role (cap%), 40h/w, 25d/y, ab YYYY-MM-DD
      const parsedMember = parseResourceLine(line);
      if (parsedMember) {
        const { teams: teamNames, short: shortName, ...fields } = parsedMember;
        teamNames.forEach(n => teamSet.add(n));
        const m = { id: 'm' + Date.now() + mems.length, ...fields };
        if (teamNames.length > 1) m.teams = teamNames;
        if (shortName) m._parsedShort = shortName;
        mems.push(m);
        lastItem = m;
      }
      // Sub-bullet for plan references: *Plans: Name 1, Name 2*
      const pm = line.match(/^\s*\*Plans:\s*(.+?)\*\s*$/);
      if (pm && lastItem && mems[mems.length - 1] === lastItem) {
        lastItem._parsedPlanNames = pm[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        return;
      }
      // Sub-bullet for meetings: *Meetings: Name 1.25h/d, Retro 0.5h/2w, Allhands 1h/mo*
      const mt = line.match(/^\s*\*Meetings:\s*(.+?)\*\s*$/);
      if (mt && lastItem && mems[mems.length - 1] === lastItem) {
        const items = mt[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        lastItem.meetings = items.map((raw, i) => {
          // "Standup 0.25h/d" | "Standup 1.25h/w" | "Retro 0.5h/2w" | "Allhands 1h/mo"
          const hm = raw.match(/^(.+?)\s+(\d+(?:\.\d+)?)h\s*\/\s*(d|w|2w|mo)\s*$/i);
          if (!hm) return { id: 'mt_' + i, name: raw, hours: 0, frequency: 'weekly' };
          const fk = hm[3].toLowerCase();
          const freq = fk === 'd' ? 'daily' : fk === '2w' ? 'biweekly' : fk === 'mo' ? 'monthly' : 'weekly';
          return { id: 'mt_' + i, name: hm[1].trim(), hours: parseFloat(hm[2]), frequency: freq };
        });
        lastItem.capMode = 'derived';
        if (lastItem.weeklyHours == null) lastItem.weeklyHours = 40;
      }
      // Sub-bullet for capacity changes: *Capacity plan: 2026-09-01→50%, 2027-01-01→100%30h/w*
      // Also accepts the pre-rename tag (*Cap-Plan:*) so files saved by an
      // older build keep loading unchanged.
      const cp = line.match(/^\s*\*(?:Capacity plan|Cap-Plan):\s*(.+?)\*\s*$/);
      if (cp && lastItem && mems[mems.length - 1] === lastItem) {
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
        if (out.length) lastItem.capChanges = out.sort((a, b) => a.from.localeCompare(b.from));
        return;
      }
      // Sub-bullet for scheduled meeting overrides:
      // *Meeting plan: 2026-06-01→[plans:dev+lead, Standup 0.5h/d]; 2027-01-01→[...]*
      // Also accepts the pre-rename tag (*Meeting-Plan:*) — see Cap-Plan above.
      const mp = line.match(/^\s*\*(?:Meeting plan|Meeting-Plan):\s*(.+?)\*\s*$/);
      if (mp && lastItem && mems[mems.length - 1] === lastItem) {
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
        if (out.length) lastItem.meetingChanges = out.sort((a, b) => a.from.localeCompare(b.from));
        return;
      }
      return;
    }

    // Vacations section: accepts both formats
    // Old (3-col): | Person | Week (Mon) | Note |
    // New (4-col): | Person | From | To | Note |
    if (section === 'vacations') {
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
    if (section === 'holidays') {
      const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
      if (m && !/^Date$/i.test(m[1])) {
        holidaysArr.push({ date: m[1].trim(), name: m[2].trim(), auto: /auto/i.test(m[3]) });
      }
      return;
    }

    // Custom Fields section: table | ID | Name | Type | Template/Options |
    if (section === 'customfields') {
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
    if (section === 'templates') {
      if (currentTpl) {
        const pm = line.match(/^\s*\d+\.\s+(.+)/);
        if (pm) {
          currentTpl.phases.push(parseTemplatePhaseLine(pm[1]));
        }
      }
      return;
    }

    // Tree section (or default if no Work Tree heading was seen): bullet items
    const bullet = line.match(/^(\s*)[-*]\s+(.*)/);
    if (!bullet) {
      if (lastItem) {
        const trimmed = line.trim();
        if (!trimmed) return;
        // Accepts the pre-rename German tag (*Benötigt:*) too, so a file
        // saved before this rename still loads its dependencies.
        const depM = trimmed.match(/^\*(?:Requires|Benötigt):\s*(.+?)\*$/);
        if (depM) {
          const items = depM[1]
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
          // All deps are hard now. Old `~id` markers (soft) still parse,
          // they collapse into the same `deps` bucket on next save.
          const hard = [];
          const labels = {};
          for (const raw of items) {
            const body = raw.startsWith('~') ? raw.slice(1).trim() : raw;
            const lm = body.match(/^([A-Za-z0-9.]+)\s*\((.+)\)$/);
            const id = lm ? lm[1] : body;
            if (lm) labels[id] = lm[2];
            hard.push(id);
          }
          lastItem.deps = [...new Set(hard)];
          if (Object.keys(labels).length) lastItem._depLabels = labels;
          return;
        }
        // Parse phases line: *Phases: ✅RE, 🟡Development(Frontend), ○Test(QA)*
        // `Phasen?` also matches the pre-rename tags (*Phase:*/*Phasen:*).
        const phaseM = trimmed.match(/^\*(?:Phases?|Phasen):\s*(.+?)\*$/);
        if (phaseM) {
          const phaseItems = phaseM[1].split(',').map(s => s.trim());
          lastItem.phases = phaseItems.map(pi => parsePhaseToken(pi));
          return;
        }
        // Parse handoff plan: *Handoff: → Max, Anna (Frontend); → Chris*
        const handM = trimmed.match(/^\*Handoff:\s*(.+?)\*$/);
        if (handM) {
          const stages = handM[1]
            .split(';')
            .map(s => s.trim())
            .filter(Boolean);
          lastItem.handoffPlan = stages.map(raw0 => {
            const raw = raw0.replace(/^→\s*/, '').trim();
            // "Names (Team)" split
            const tm2 = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
            const namesPart = (tm2 ? tm2[1] : raw).trim();
            const teamPart = tm2 ? tm2[2].trim() : '';
            const shorts = namesPart
              ? namesPart
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean)
              : [];
            return { _parsedShorts: shorts, _parsedTeam: teamPart };
          });
          return;
        }
        if (trimmed.startsWith('*') && trimmed.endsWith('*')) {
          lastItem.note = (lastItem.note ? lastItem.note + ' ' : '') + trimmed.slice(1, -1);
          return;
        }
        if (!lastItem.id.includes('.')) {
          lastItem.description = (lastItem.description || '') + (lastItem.description ? ' ' : '') + trimmed;
        } else {
          lastItem.note = (lastItem.note ? lastItem.note + ' ' : '') + trimmed;
        }
      }
      return;
    }
    const indent = bullet[1].length;
    let raw = bullet[2].trim();
    const done = raw.startsWith('✅');
    const wip = raw.includes('🟡');
    raw = raw
      .replace(/^✅\s*/, '')
      .replace(/🟡\s*/g, '')
      .trim();
    let id = '';
    const idM = raw.match(/^\*\*([A-Za-z0-9.]+)\*\*\s*/);
    if (idM) {
      id = idM[1];
      raw = raw.slice(idM[0].length);
    }
    // Strip order matters: writer appends these in a fixed sequence
    //   [team][assign][tagStr][decideBy][pinned][parallel]
    // so we peel them off back-to-front. Earlier versions tried to grab
    // the tag block first with an `$` anchor and missed it whenever a
    // decideBy/pinned marker trailed — which silently dropped `assign`
    // because the later assign-regex is also `$`-anchored.
    // Legacy files used a trailing `≡` marker. New exports use
    // `{parallel:true}` so the flag survives tag parsing cleanly.
    let parallel = false;
    let dropped = false;
    if (raw.includes('≡')) {
      parallel = true;
      raw = raw.replace(/≡/g, '').trim();
    }
    let pinnedStart = '';
    const pinM = raw.match(/📌(\d{4}-\d{2}-\d{2})/);
    if (pinM) {
      pinnedStart = pinM[1];
      raw = raw.replace(pinM[0], '').trim();
    }
    let decideBy = '';
    const decideByM = raw.match(/!decide:(\d{4}-\d{2}-\d{2})/);
    if (decideByM) {
      decideBy = decideByM[1];
      raw = raw.replace(decideByM[0], '').trim();
    }
    // Metadata tag block: {prio:N, seq:N, severity, conf:X, cv.fieldId:value}
    let prio = 2,
      seq = 0,
      severity = 'high',
      confidence = '',
      completedAt = '',
      completedStart = '',
      completedEnd = '',
      plannedStart = '',
      plannedEnd = '',
      deadlineRelevant = true,
      due = '',
      teamLock = false,
      fixedDurationDays = 0,
      displayOrder = null;
    const customValues = {};
    const tagM = raw.match(/\s*\{([^}]+)\}\s*$/);
    if (tagM) {
      const tags = tagM[1].split(',').map(t => t.trim());
      tags.forEach(t => {
        const pm = t.match(/^prio:(\d+)$/i);
        if (pm) {
          prio = +pm[1];
          return;
        }
        const sm = t.match(/^seq:(\d+)$/i);
        if (sm) {
          seq = +sm[1];
          return;
        }
        const cm = t.match(/^conf:(committed|estimated|exploratory)$/i);
        if (cm) {
          confidence = cm[1].toLowerCase();
          return;
        }
        const dm = t.match(/^done:(\d{4}-\d{2}-\d{2})$/i);
        if (dm) {
          completedAt = dm[1];
          return;
        }
        const dsm = t.match(/^done-start:(\d{4}-\d{2}-\d{2})$/i);
        if (dsm) {
          completedStart = dsm[1];
          return;
        }
        const dem = t.match(/^done-end:(\d{4}-\d{2}-\d{2})$/i);
        if (dem) {
          completedEnd = dem[1];
          return;
        }
        const psm = t.match(/^plan-start:(\d{4}-\d{2}-\d{2})$/i);
        if (psm) {
          plannedStart = psm[1];
          return;
        }
        const pem = t.match(/^plan-end:(\d{4}-\d{2}-\d{2})$/i);
        if (pem) {
          plannedEnd = pem[1];
          return;
        }
        const drm = t.match(/^deadline:(false|no|off)$/i);
        if (drm) {
          deadlineRelevant = false;
          return;
        }
        const dum = t.match(/^due:(\d{4}-\d{2}-\d{2})$/i);
        if (dum) {
          due = dum[1];
          return;
        }
        const tlm = t.match(/^team-lock:(true|yes|on)$/i);
        if (tlm) {
          teamLock = true;
          return;
        }
        const plm = t.match(/^parallel:(true|yes|on)$/i);
        if (plm) {
          parallel = true;
          return;
        }
        const dpm = t.match(/^dropped:(true|yes|on)$/i);
        if (dpm) {
          dropped = true;
          return;
        }
        const fdm = t.match(/^fixed:(\d+(?:\.\d+)?)$/i);
        if (fdm) {
          fixedDurationDays = Math.max(1, Math.ceil(+fdm[1]));
          return;
        }
        const om = t.match(/^ord:(\d+)$/i);
        if (om) {
          displayOrder = +om[1];
          return;
        }
        const cvm = t.match(/^cv\.([^:]+):(.*)$/i);
        if (cvm) {
          customValues[cvm[1]] = cvm[2].trim();
          return;
        }
        if (/^(critical|high|medium)$/i.test(t)) {
          severity = t.toLowerCase();
        }
      });
      raw = raw.slice(0, raw.indexOf(tagM[0])).trim();
    }
    // Assigned: [Name1, Name2] — now genuinely at the end after tags stripped
    let assign = [];
    const assignM = raw.match(/\s*\[(.+?)\]\s*$/);
    if (assignM) {
      assign = assignM[1].split(',').map(s => s.trim());
      raw = raw.slice(0, raw.lastIndexOf(assignM[0])).trim();
    }
    // Team: — TeamName (now at the end since assignment + decideBy are removed)
    let team = '';
    const teamM = raw.match(/\s*—\s+([^—]+?)\s*$/);
    if (teamM) {
      team = teamM[1].trim();
      raw = raw.slice(0, raw.lastIndexOf(teamM[0]));
      if (team) teamSet.add(team);
    }
    // Estimate: (SZ NTd) or (SZ NTd ×F)
    let best = 0,
      factor = 1.5;
    const estM = raw.match(/\((\w+\s+)?([\d.]+)T(?:\s*×([\d.]+))?\)/);
    if (estM) {
      best = parseFloat(estM[2]);
      if (estM[3]) factor = parseFloat(estM[3]);
      raw = raw.replace(estM[0], '').trim();
    }
    // Progress
    let progress = null;
    const prgM = raw.match(/(\d+)%/);
    if (prgM) {
      progress = parseInt(prgM[1]);
      raw = raw.replace(prgM[0], '').trim();
    }
    // Root type marker. GT_MARKS lists every form a saved plan may carry,
    // newest first. Whichever one is found is removed from the name —
    // leaving one behind is how a project ended up actually named after the
    // marker for its own type.
    // (decideBy's marker has already been removed, so no false positive.)
    let type = '';
    for (const [tp, marks] of [
      ['deadline', GT_MARKS.deadline],
      ['painpoint', GT_MARKS.painpoint],
      ['goal', GT_MARKS.goal],
    ]) {
      const hit = marks.find(mk => raw.includes(mk));
      if (!hit) continue;
      type = tp;
      marks.forEach(mk => {
        raw = raw.split(mk).join(' ');
      });
      raw = raw.replace(/\s{2,}/g, ' ').trim();
      break;
    }
    // Date
    let date = '';
    const dateM = raw.match(/\((\d{4}-\d{2}-\d{2})\)/);
    if (dateM) {
      date = dateM[1];
      raw = raw.replace(dateM[0], '').trim();
    }
    const name = raw.replace(/\*\*/g, '').trim();
    if (!id) {
      while (idStack.length && idStack[idStack.length - 1].indent >= indent) idStack.pop();
      const parentId = idStack.length ? idStack[idStack.length - 1].id : '';
      const siblings = tree.filter(r => {
        const pid = r.id.split('.').slice(0, -1).join('.');
        return pid === parentId;
      });
      id = parentId ? `${parentId}.${siblings.length + 1}` : `P${tree.filter(r => !r.id.includes('.')).length + 1}`;
    }
    idStack.push({ id, indent });
    const item = { id, name, status: done ? 'done' : wip ? 'wip' : 'open', team, best, factor, prio, deps: [], note: '', assign };
    if (seq) item.seq = seq;
    if (progress != null) item.progress = progress;
    if (type) {
      item.type = type;
      item.severity = severity;
    }
    if (date) item.date = date;
    if (decideBy) item.decideBy = decideBy;
    if (pinnedStart) item.pinnedStart = pinnedStart;
    if (confidence) item.confidence = confidence;
    if (completedAt) item.completedAt = completedAt;
    if (completedStart) item.completedStart = completedStart;
    if (completedEnd) item.completedEnd = completedEnd;
    if (plannedStart) item.plannedStart = plannedStart;
    if (plannedEnd) item.plannedEnd = plannedEnd;
    if (deadlineRelevant === false) item.deadlineRelevant = false;
    if (due) item.due = due;
    if (teamLock) item.teamLock = true;
    if (parallel) item.parallel = true;
    if (dropped) item.dropped = true;
    if (fixedDurationDays > 0) item.fixedDurationDays = fixedDurationDays;
    if (displayOrder != null) item.displayOrder = displayOrder;
    if (Object.keys(customValues).length) item.customValues = customValues;
    tree.push(item);
    lastItem = item;
  });

  // Self-healing: clean team values that may carry noise from older corrupt exports
  // (e.g. "Backend [SL] !decide:2026-09-30" → "Backend"). Same defensive cleanup for items.
  const sanitizeTeam = t => {
    if (!t) return t;
    let v = t;
    v = v.replace(/!decide:\d{4}-\d{2}-\d{2}/g, '');
    v = v.replace(/📌\d{4}-\d{2}-\d{2}/g, '');
    v = v.replace(/\[[^\]]*\]/g, ''); // strip any [assignees] residue
    v = v.replace(/\{[^}]*\}/g, ''); // strip any {tags} residue
    v = v.trim();
    return v;
  };
  tree.forEach(r => {
    if (r.team) {
      const cleaned = sanitizeTeam(r.team);
      if (cleaned !== r.team) {
        // If the original team string contained a decideBy/pinned, recover them
        const decM = r.team.match(/!decide:(\d{4}-\d{2}-\d{2})/);
        if (decM && !r.decideBy) r.decideBy = decM[1];
        const pinM2 = r.team.match(/📌(\d{4}-\d{2}-\d{2})/);
        if (pinM2 && !r.pinnedStart) r.pinnedStart = pinM2[1];
        r.team = cleaned;
      }
    }
  });
  // Re-collect team names after sanitization (so cleaned names are added to the team set)
  teamSet.clear();
  tree.forEach(r => {
    if (r.team) teamSet.add(r.team);
    if (r.phases) r.phases.forEach(p => phaseTeamIds(p).forEach(teamId => teamSet.add(teamId)));
  });
  mems.forEach(m => {
    if (m.team) {
      m.team = sanitizeTeam(m.team);
      teamSet.add(m.team);
    }
    if (m.teams) {
      m.teams = m.teams.map(sanitizeTeam).filter(Boolean);
      m.teams.forEach(t => teamSet.add(t));
    }
  });
  taskTemplates.forEach(tpl => tpl.phases.forEach(p => phaseTeamIds(p).forEach(teamId => teamSet.add(teamId))));

  // Build teams: prefer explicit team table, fall back to inferred
  const usedTeamNames = [...teamSet];
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  const teamsArr = usedTeamNames.map((name, i) => {
    const exp = explicitTeams.find(t => t.name === name);
    return { id: `T${i + 1}`, name, color: exp?.color || palette[i % palette.length] };
  });
  const teamLookup = Object.fromEntries(teamsArr.map(t => [t.name, t.id]));
  tree.forEach(r => {
    if (r.team) r.team = teamLookup[r.team] || r.team;
    if (r.phases) {
      r.phases.forEach(p => {
        const teamsForPhase = phaseTeamIds(p).map(teamId => teamLookup[teamId] || teamId);
        p.teams = teamsForPhase;
        p.team = teamsForPhase[0] || '';
      });
    }
  });
  mems.forEach(m => {
    if (m.team) m.team = teamLookup[m.team] || m.team;
    if (m.teams) m.teams = m.teams.map(t => teamLookup[t] || t);
  });
  taskTemplates.forEach(tpl =>
    tpl.phases.forEach(p => {
      const teamsForPhase = phaseTeamIds(p).map(teamId => teamLookup[teamId] || teamId);
      p.teams = teamsForPhase;
      p.team = teamsForPhase[0] || '';
    }),
  );
  // Resolve assignee references — try short name from MD first, then full name match,
  // finally computed initials match (for back-compat with files written by older builds)
  const computedShorts = buildMemberShortMap(mems);
  const resolveMember = token => {
    // 1. Match by short name parsed from MD (`SL`)
    const byParsedShort = mems.find(m => m._parsedShort === token);
    if (byParsedShort) return byParsedShort.id;
    // 2. Match by full name (back-compat with old MDs)
    const byName = mems.find(m => m.name === token);
    if (byName) return byName.id;
    // 3. Match by computed initials (back-compat without explicit short)
    const byComputed = mems.find(m => computedShorts[m.id] === token);
    if (byComputed) return byComputed.id;
    return token; // unresolved — keep as-is
  };
  tree.forEach(r => {
    if (r.assign?.length) r.assign = r.assign.map(resolveMember);
    if (r.phases?.length) {
      r.phases.forEach(phase => {
        if (phase.assign?.length) phase.assign = phase.assign.map(resolveMember);
      });
    }
    // Resolve handoff plan stages: short-codes → member IDs, team name → team ID.
    if (Array.isArray(r.handoffPlan)) {
      r.handoffPlan = r.handoffPlan.map(stage => {
        const shorts = stage._parsedShorts || [];
        const teamName = stage._parsedTeam || '';
        const out = {};
        if (shorts.length) out.assign = shorts.map(resolveMember);
        if (teamName) out.team = teamLookup[teamName] || teamName;
        return out;
      });
    }
  });
  vacationsArr.forEach(v => {
    v.person = resolveMember(v.person);
  });
  // Normalize to {person, from, to, note} — converts legacy week format on load
  const normalizedVacations = vacationsArr.map(normalizeVacation);
  // Resolve meeting-plan name refs → ids on teams + members.
  const planByName = Object.fromEntries(parsedMeetingPlans.map(p => [p.name, p.id]));
  teamsArr.forEach(tm => {
    const parsed = explicitTeams.find(et => et.name === tm.name)?._parsedPlans;
    if (parsed?.length) tm.meetingPlanIds = parsed.map(n => planByName[n] || n).filter(Boolean);
  });
  mems.forEach(m => {
    if (m._parsedPlanNames) {
      m.meetingPlanIds = m._parsedPlanNames.map(n => planByName[n] || n).filter(Boolean);
      delete m._parsedPlanNames;
    }
    if (Array.isArray(m.meetingChanges)) {
      m.meetingChanges = m.meetingChanges.map(change => {
        if (!change?._parsedPlanNames) return change;
        const next = {
          ...change,
          meetingPlanIds: change._parsedPlanNames.map(n => planByName[n] || n).filter(Boolean),
        };
        delete next._parsedPlanNames;
        return next;
      });
    }
  });
  // Who a short name in the work-order block means, taken while the parsed
  // short names are still on the members.
  // First one wins on a duplicate, as it does for assignees (`resolveMember`
  // uses `find`), so a queue and the tasks it orders land on the same person.
  const memberIdByShort = new Map();
  mems.forEach(m => {
    const short = m._parsedShort || computedShorts[m.id];
    if (short && !memberIdByShort.has(short)) memberIdByShort.set(short, m.id);
  });
  // Strip transient _parsedShort field from members
  mems.forEach(m => {
    delete m._parsedShort;
  });

  const metaObj = { name: projName || 'Imported Project', version: '2' };
  if (planStart) metaObj.planStart = planStart;
  if (planEnd) metaObj.planEnd = planEnd;
  if (viewStartMd) metaObj.viewStart = viewStartMd;
  if (workDays)
    metaObj.workDays = workDays
      .split(',')
      .map(Number)
      .filter(n => n >= 0 && n <= 6);
  // History events — parsed out of the ```planr-history``` fenced block
  let historyEvents = [];
  if (historyBlockLines && historyBlockLines.length) {
    const blockText = historyBlockLines.filter(l => l !== null).join('\n');
    historyEvents = parseHistoryBlock(blockText);
  }
  // Roadmap assignment — lines like "P1 route=2 color=0" inside the
  // ```planr-roadmap fenced block.
  let roadmapAssignment = null;
  if (roadmapBlockLines && roadmapBlockLines.length) {
    const lines = roadmapBlockLines.filter(l => l !== null);
    const out = {};
    lines.forEach(line => {
      const m = line.match(/^([\w.]+)\s+route=(\d+)\s+color=(\d+)/);
      if (m) out[m[1]] = { routeIdx: +m[2], colorIdx: +m[3] };
    });
    if (Object.keys(out).length) roadmapAssignment = out;
  }
  // Per-person work order inside ```planr-queues. v2 names the owner as the
  // file names everybody — "@SL | B.1 A.1", "#Backend | C.2 C.1" — and it is
  // resolved here against the ids this load has just handed out. A line
  // without " | " is v1, "M1 B.1 A.1": the id as it was in memory. In both
  // forms an owner this plan does not have is dropped — a queue for nobody
  // orders nothing. For v1 that is every person's line: their ids are new
  // with this load. A v1 TEAM line does not say which team it means either:
  // team ids are handed out in the order teams first appear in the tree, so
  // `team:T1` is whichever team that is today. What does say it is the queue
  // itself — an order of one team's work. So the line goes to the team that
  // more than half of the tasks it names sit with, and is dropped when no
  // team has that majority.
  let personQueues = null;
  if (queueBlockLines && queueBlockLines.length) {
    const out = {};
    const queueOwners = new Set([...mems.map(m => m.id), ...teamsArr.map(tm => `team:${tm.id}`)]);
    const treeById = new Map(tree.map(n => [n.id, n]));
    queueBlockLines
      .filter(l => l !== null)
      .forEach(line => {
        const cut = line.indexOf(' | ');
        if (cut >= 0) {
          const owner = line.slice(0, cut).trim();
          const ids = line
            .slice(cut + 3)
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          if (ids.length < 2) return;
          const key = owner.startsWith('@')
            ? memberIdByShort.get(owner.slice(1))
            : owner.startsWith('#')
              ? teamLookup[owner.slice(1)]
                ? `team:${teamLookup[owner.slice(1)]}`
                : null
              : null;
          if (key) out[key] = ids;
          return;
        }
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3 || parts[0] === 'v1' || parts[0] === 'v2') return;
        const owner = parts[0],
          ids = parts.slice(1);
        if (owner.startsWith('team:')) {
          const count = new Map();
          let known = 0;
          ids.forEach(id => {
            const n = treeById.get(id);
            if (!n) return;
            known++;
            if (n.team) count.set(n.team, (count.get(n.team) || 0) + 1);
          });
          const [teamId, votes] = [...count.entries()].sort((a, b) => b[1] - a[1])[0] || [];
          if (teamId && votes * 2 > known && queueOwners.has(`team:${teamId}`)) out[`team:${teamId}`] = ids;
          return;
        }
        if (queueOwners.has(owner)) out[owner] = ids;
      });
    if (Object.keys(out).length) personQueues = out;
  }
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
  if (changeBlockLines && changeBlockLines.length) {
    const changes = parseChangesBlock(changeBlockLines.filter(l => l !== null).join('\n'), project);
    if (changes.length) project.changes = changes;
  }
  // Scenarios refer to people and teams by name in the file; they are resolved
  // last, against the ids this very load has just handed out.
  if (scenarioBlockLines && scenarioBlockLines.length) {
    const scenarios = parseScenariosBlock(scenarioBlockLines.filter(l => l !== null).join('\n'), project);
    if (scenarios.length) project.scenarios = scenarios;
  }
  if (logBlockLines && logBlockLines.length) {
    const dayLog = parseDayLogBlock(logBlockLines.filter(l => l !== null).join('\n'), project);
    if (dayLog.length) project.dayLog = dayLog;
  }
  return project;
}
