import { GT_MARKS } from '../../constants.js';
import { parsePhaseToken } from '../phases.js';

// Phase: the item tree (also the default when no `## Work Tree` heading was
// seen). A bullet is a task; the lines under it (requires, phases, handoff,
// notes) attach to the last item read. Consumes the line.
export function parseTreeLine(state, line) {
  const { tree, teamSet, idStack } = state;
  const bullet = line.match(/^(\s*)[-*]\s+(.*)/);
  if (!bullet) {
    if (state.lastItem) {
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
        state.lastItem.deps = [...new Set(hard)];
        if (Object.keys(labels).length) state.lastItem._depLabels = labels;
        return;
      }
      // Parse phases line: *Phases: ✅RE, 🟡Development(Frontend), ○Test(QA)*
      // `Phasen?` also matches the pre-rename tags (*Phase:*/*Phasen:*).
      const phaseM = trimmed.match(/^\*(?:Phases?|Phasen):\s*(.+?)\*$/);
      if (phaseM) {
        const phaseItems = phaseM[1].split(',').map(s => s.trim());
        state.lastItem.phases = phaseItems.map(pi => parsePhaseToken(pi));
        return;
      }
      // Parse handoff plan: *Handoff: → Max, Anna (Frontend); → Chris*
      const handM = trimmed.match(/^\*Handoff:\s*(.+?)\*$/);
      if (handM) {
        const stages = handM[1]
          .split(';')
          .map(s => s.trim())
          .filter(Boolean);
        state.lastItem.handoffPlan = stages.map(raw0 => {
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
        state.lastItem.note = (state.lastItem.note ? state.lastItem.note + ' ' : '') + trimmed.slice(1, -1);
        return;
      }
      if (!state.lastItem.id.includes('.')) {
        state.lastItem.description = (state.lastItem.description || '') + (state.lastItem.description ? ' ' : '') + trimmed;
      } else {
        state.lastItem.note = (state.lastItem.note ? state.lastItem.note + ' ' : '') + trimmed;
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
  // The writer marks it with a clock; files from before that used `!`.
  const decideByM = raw.match(/[⏰!]decide:(\d{4}-\d{2}-\d{2})/);
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
  state.lastItem = item;
}
