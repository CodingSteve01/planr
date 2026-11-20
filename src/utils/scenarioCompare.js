// Plan against scenario: what moves, for whom, by how much.
//
// The list of changes (utils/scenario.js, `describeChanges`) says what was
// done to the scenario. This says what that does — which is the question a
// scenario is opened for. Both sides go through the same scheduler on the same
// day, so a difference here is a difference the changes made and nothing else.
import { iso } from './date.js';
import { buildHMap } from './holidays.js';
import { inferGanttViewStart } from './viewWindow.js';
import { deriveCap, isOnboard } from './capacity.js';
import { compileMembers, resourcesAsOf } from './effective.js';
import { memberTeams } from './memberTeams.js';
import { isDropped, leafNodes, schedule } from './scheduler.js';
import { sortTree } from './treeEdit.js';
import { deadlineStatus, summarizeNodeTimeline } from './timeline.js';

// The schedule of a plan as App.jsx derives it, for a plan that is not the one
// on screen. Kept in step with the `scheduled` memo there by
// scenarioCompare.test.js: an untouched scenario must compare as "no change".
export function schedulePlanData(data, now = new Date()) {
  if (!data || !Array.isArray(data.tree)) return [];
  const meta = data.meta || {};
  // The array carries the plan's order (see `tree` in App.jsx).
  const tree = sortTree(data.tree);
  // The same people the screen's schedule gets: the dated changes flattened
  // per person, every meeting plan resolved (utils/effective.js).
  const enriched = compileMembers(data);
  const planStart = meta.planStart || iso(now);
  const planEnd = meta.planEnd || iso(new Date(now.getFullYear() + 10, 11, 31));
  const viewStart = inferGanttViewStart(tree, planStart, meta.viewStart, 14);
  const hm = buildHMap(data.holidays || []);
  const workDays = meta.workDays || [1, 2, 3, 4, 5];
  return (
    schedule(tree, enriched, data.vacations || [], viewStart, planEnd, hm, workDays, planStart, { personQueues: data.personQueues || null })
      .results || []
  );
}

const DAY = 864e5;
const dayOf = d => (d ? Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY) : null);
// Calendar days from `a` to `b`; positive = later. `null` when either is open.
export function shiftDays(a, b) {
  if (!a || !b) return null;
  return dayOf(b) - dayOf(a);
}
const asDate = v => (v ? (v instanceof Date ? v : new Date(v)) : null);

// Start, end and people per tree item. A task handed over between people is
// several scheduled rows; here it is one item again.
function windowsByItem(scheduled) {
  const out = new Map();
  for (const s of scheduled || []) {
    const id = s.treeId || s.id;
    const start = asDate(s.startD),
      end = asDate(s.endD);
    if (!start || !end) continue;
    const cur = out.get(id);
    if (!cur) {
      out.set(id, { start, end, people: s.personId ? [s.personId] : [], effort: s.effort || 0 });
      continue;
    }
    if (start < cur.start) cur.start = start;
    if (end > cur.end) cur.end = end;
    if (s.personId && !cur.people.includes(s.personId)) cur.people.push(s.personId);
    cur.effort += s.effort || 0;
  }
  return out;
}

function personLoad(scheduled) {
  const out = new Map();
  for (const s of scheduled || []) {
    if (!s.personId) continue;
    const end = asDate(s.endD);
    const cur = out.get(s.personId) || { tasks: 0, effort: 0, until: null };
    cur.tasks += 1;
    cur.effort += s.effort || 0;
    if (end && (!cur.until || end > cur.until)) cur.until = end;
    out.set(s.personId, cur);
  }
  return out;
}

const round1 = n => Math.round(n * 10) / 10;

// One side of the team table: who is in each team today and with how much
// capacity, how much open work sits with it, and when the last of that work
// ends. A person in two teams counts in both — their one capacity is not
// split between them (docs/scheduler.md), so the figure is "available to this
// team", not a share.
function teamSide(data, windows, now) {
  // Capacity as of the day of the comparison, not as of the plan's first day.
  const asOf = resourcesAsOf(data, now);
  const ctx = { plans: asOf.meetingPlans, teams: asOf.teams };
  const out = new Map();
  const at = id => {
    if (!out.has(id)) out.set(id, { people: 0, cap: 0, tasks: 0, effort: 0, until: null });
    return out.get(id);
  };
  for (const m of asOf.members) {
    if (!isOnboard(m, now)) continue;
    const cap = deriveCap(m, ctx);
    for (const teamId of memberTeams(m)) {
      const t = at(teamId);
      t.people += 1;
      t.cap += cap;
    }
  }
  const byId = new Map((data.tree || []).map(n => [n.id, n]));
  for (const [id, w] of windows) {
    const team = byId.get(id)?.team;
    if (!team) continue;
    const t = at(team);
    t.tasks += 1;
    t.effort += w.effort || 0;
    if (!t.until || w.end > t.until) t.until = w.end;
  }
  return out;
}

export function compareScenario({ base, work, baseScheduled, workScheduled, now = new Date() }) {
  const empty = {
    projects: [],
    teams: [],
    items: [],
    people: [],
    totals: { later: 0, earlier: 0, newlyLate: 0, rescued: 0, maxLater: 0, maxEarlier: 0, endShift: null, baseEnd: null, workEnd: null },
  };
  if (!base?.tree || !work?.tree) return empty;
  const baseTree = base.tree,
    workTree = work.tree;
  const baseById = new Map(baseTree.map(n => [n.id, n]));
  const workById = new Map(workTree.map(n => [n.id, n]));

  // Projects: every root either side knows.
  const rootIds = [];
  for (const n of [...workTree, ...baseTree]) if (!n.id.includes('.') && !rootIds.includes(n.id)) rootIds.push(n.id);
  const projects = rootIds.map(id => {
    const b = baseById.get(id),
      w = workById.get(id);
    const bEnd = b ? summarizeNodeTimeline(baseTree, baseScheduled, b)?.period?.end || null : null;
    const wEnd = w ? summarizeNodeTimeline(workTree, workScheduled, w)?.period?.end || null : null;
    const bState = b ? deadlineStatus(baseTree, baseScheduled, b) : null;
    const wState = w ? deadlineStatus(workTree, workScheduled, w) : null;
    const date = (w || b)?.date || '';
    return {
      id,
      name: (w || b)?.name || id,
      type: (w || b)?.type || '',
      presence: !b ? 'added' : !w ? 'removed' : 'both',
      date,
      baseEnd: bEnd,
      workEnd: wEnd,
      shift: shiftDays(bEnd, wEnd),
      baseState: bState?.state || null,
      workState: wState?.state || null,
      // Only a root with a date can be late; without one there is no promise.
      baseLate: !!(date && bState?.isLate),
      workLate: !!(date && wState?.isLate),
    };
  });

  // Items: leaves whose window or person differs.
  const bWin = windowsByItem(baseScheduled),
    wWin = windowsByItem(workScheduled);
  const leafIds = new Set([...leafNodes(baseTree).map(n => n.id), ...leafNodes(workTree).map(n => n.id)]);
  const items = [];
  for (const id of leafIds) {
    const b = baseById.get(id),
      w = workById.get(id);
    const bw = bWin.get(id) || null,
      ww = wWin.get(id) || null;
    if (!bw && !ww) continue;
    const startShift = shiftDays(bw?.start, ww?.start);
    const endShift = shiftDays(bw?.end, ww?.end);
    const samePeople = !!bw && !!ww && bw.people.length === ww.people.length && bw.people.every(p => ww.people.includes(p));
    if (bw && ww && !startShift && !endShift && samePeople) continue;
    items.push({
      id,
      name: (w || b)?.name || id,
      presence: !bw
        ? w && !b
          ? 'added'
          : 'scheduled'
        : !ww
          ? b && !w
            ? 'removed'
            : w && isDropped(w)
              ? 'dropped'
              : 'unscheduled'
          : 'both',
      baseStart: bw?.start || null,
      baseEnd: bw?.end || null,
      workStart: ww?.start || null,
      workEnd: ww?.end || null,
      startShift,
      endShift,
      basePeople: bw?.people || [],
      workPeople: ww?.people || [],
      peopleChanged: !!bw && !!ww && !samePeople,
    });
  }
  items.sort((a, b) => Math.abs(b.endShift || 0) - Math.abs(a.endShift || 0) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  // People: how much open work each carries, and until when.
  const bLoad = personLoad(baseScheduled),
    wLoad = personLoad(workScheduled);
  const memberIds = [];
  for (const m of [...(work.members || []), ...(base.members || [])]) if (!memberIds.includes(m.id)) memberIds.push(m.id);
  const nameOf = id => (work.members || []).find(m => m.id === id)?.name || (base.members || []).find(m => m.id === id)?.name || id;
  const people = memberIds
    .map(id => {
      const b = bLoad.get(id) || { tasks: 0, effort: 0, until: null };
      const w = wLoad.get(id) || { tasks: 0, effort: 0, until: null };
      return {
        id,
        name: nameOf(id),
        presence: !(base.members || []).some(m => m.id === id)
          ? 'added'
          : !(work.members || []).some(m => m.id === id)
            ? 'removed'
            : 'both',
        baseTasks: b.tasks,
        workTasks: w.tasks,
        baseEffort: round1(b.effort),
        workEffort: round1(w.effort),
        effortShift: round1(w.effort - b.effort),
        baseUntil: b.until,
        workUntil: w.until,
        untilShift: shiftDays(b.until, w.until),
      };
    })
    .filter(p => p.baseTasks || p.workTasks || p.presence !== 'both');

  // Teams: the level at which a change to one person becomes a statement
  // about the work. "Ben is out" is one line in the list of changes; what it
  // means is that Frontend has two people instead of three and everything
  // that sits with Frontend finishes later — whoever it was assigned to.
  const bTeam = teamSide(base, bWin, now),
    wTeam = teamSide(work, wWin, now);
  const teamIds = [];
  for (const tm of [...(work.teams || []), ...(base.teams || [])]) if (!teamIds.includes(tm.id)) teamIds.push(tm.id);
  // One team per item for the counts, and it is the plan's: "37 of 38 Frontend
  // tasks move" is a statement about the work Frontend has in the plan. A task
  // the scenario hands to another team still counts where it came from; one
  // the scenario adds counts where it was put.
  const teamOfItem = id => (baseById.get(id) || workById.get(id))?.team || '';
  const counts = new Map();
  const blank = () => ({ total: 0, moved: 0, gone: 0, added: 0, maxLater: 0, maxEarlier: 0, roots: new Set() });
  const countAt = id => {
    if (!counts.has(id)) counts.set(id, blank());
    return counts.get(id);
  };
  // The same count per project. A project's END is set by whatever finishes
  // last in it, so a project can have twenty tasks slip by months and end on
  // the same day, because another team was always going to finish later.
  // Judged by its end alone that project is "not affected", which is exactly
  // the short-sightedness a comparison must not have.
  const perRoot = new Map();
  const rootAt = id => {
    if (!perRoot.has(id)) perRoot.set(id, blank());
    return perRoot.get(id);
  };
  const itemById = new Map(items.map(i => [i.id, i]));
  const tally = (c, it, root) => {
    c.total += 1;
    if (!it) return;
    // Moved means moved in time. A task that only changes hands, on the same
    // days, has not moved; one that is no longer scheduled is gone, not late.
    if (it.presence === 'both') {
      if (!it.startShift && !it.endShift) return;
      c.moved += 1;
      c.roots.add(root);
      // Later and earlier kept apart: one task a week early must not hide
      // another that is five days late.
      const shift = it.endShift || it.startShift;
      if (shift > c.maxLater) c.maxLater = shift;
      if (shift < c.maxEarlier) c.maxEarlier = shift;
    } else if (it.presence === 'added' || it.presence === 'scheduled') c.added += 1;
    else c.gone += 1;
  };
  for (const id of new Set([...bWin.keys(), ...wWin.keys()])) {
    const it = itemById.get(id),
      root = id.split('.')[0];
    tally(rootAt(root), it, root);
    const team = teamOfItem(id);
    if (team) tally(countAt(team), it, root);
  }
  for (const p of projects) {
    const c = perRoot.get(p.id) || blank();
    Object.assign(p, {
      total: c.total,
      moved: c.moved,
      gone: c.gone,
      added: c.added,
      maxItemLater: c.maxLater,
      maxItemEarlier: c.maxEarlier,
    });
  }
  const none = { people: 0, cap: 0, tasks: 0, effort: 0, until: null };
  const noCount = blank();
  const teams = teamIds
    .map(id => {
      const b = bTeam.get(id) || none,
        w = wTeam.get(id) || none;
      const c = counts.get(id) || noCount;
      return {
        id,
        name: (work.teams || []).find(tm => tm.id === id)?.name || (base.teams || []).find(tm => tm.id === id)?.name || id,
        presence: !(base.teams || []).some(tm => tm.id === id)
          ? 'added'
          : !(work.teams || []).some(tm => tm.id === id)
            ? 'removed'
            : 'both',
        basePeople: b.people,
        workPeople: w.people,
        baseCap: round1(b.cap * 100) / 100,
        workCap: round1(w.cap * 100) / 100,
        // Change in capacity as a share of what the team had; null when it had
        // none — then `capNew` says whether it has some now.
        capShiftPct: b.cap > 0 ? Math.round(((w.cap - b.cap) / b.cap) * 100) : null,
        capNew: !(b.cap > 0) && w.cap > 0,
        baseTasks: b.tasks,
        workTasks: w.tasks,
        baseEffort: round1(b.effort),
        workEffort: round1(w.effort),
        baseUntil: b.until,
        workUntil: w.until,
        untilShift: shiftDays(b.until, w.until),
        total: c.total,
        moved: c.moved,
        gone: c.gone,
        added: c.added,
        // In how many projects this team's work moves.
        movedProjects: c.roots.size,
      };
    })
    .filter(tm => tm.basePeople || tm.workPeople || tm.baseTasks || tm.workTasks);

  const moved = projects.filter(p => p.shift);
  const affected = projects.filter(projectDiffers);
  const maxDate = list => list.reduce((m, d) => (d && (!m || d > m) ? d : m), null);
  const baseEnd = maxDate(projects.map(p => p.baseEnd));
  const workEnd = maxDate(projects.map(p => p.workEnd));
  const totals = {
    later: moved.filter(p => p.shift > 0).length,
    earlier: moved.filter(p => p.shift < 0).length,
    newlyLate: projects.filter(p => p.workLate && !p.baseLate).length,
    rescued: projects.filter(p => p.baseLate && !p.workLate && p.presence === 'both').length,
    maxLater: Math.max(0, ...moved.map(p => p.shift)),
    maxEarlier: Math.min(0, ...moved.map(p => p.shift)),
    baseEnd,
    workEnd,
    endShift: shiftDays(baseEnd, workEnd),
    itemsMoved: items.length,
    // Projects in which anything is different, whether or not their end moves.
    affected: affected.length,
    affectedSameEnd: affected.filter(p => !p.shift && p.presence === 'both').length,
  };
  return { projects, teams, items, people, totals };
}

export const projectDiffers = p =>
  !!p.shift || p.presence !== 'both' || p.baseLate !== p.workLate || p.moved > 0 || p.gone > 0 || p.added > 0;
export const teamDiffers = tm =>
  tm.basePeople !== tm.workPeople ||
  tm.baseCap !== tm.workCap ||
  !!tm.untilShift ||
  tm.moved > 0 ||
  tm.gone > 0 ||
  tm.added > 0 ||
  tm.presence !== 'both';

// What the changes mean, as facts per team for a sentence each: the step from
// "one person is out" to "this team has less, so all of its work moves".
// Teams whose capacity changed come first, then by how far their work moves.
// `end` is 'later' | 'earlier' | 'same' | null — null when one side has no
// end to compare (all of the team's work gone, or none before), which is not
// the same as "the same day" and must not be said as if it were.
export function teamStory(teams, limit = 3) {
  const weight = tm => Math.abs(tm.capShiftPct || 0) + (tm.capNew ? 100 : 0);
  return (teams || [])
    .filter(tm => tm.basePeople !== tm.workPeople || tm.capShiftPct || tm.capNew || tm.moved > 0 || tm.gone > 0 || tm.added > 0)
    .sort((a, b) => weight(b) - weight(a) || Math.abs(b.untilShift || 0) - Math.abs(a.untilShift || 0) || b.moved - a.moved)
    .slice(0, limit)
    .map(tm => ({
      id: tm.id,
      name: tm.name,
      people: tm.basePeople !== tm.workPeople ? [tm.basePeople, tm.workPeople] : null,
      capPct: tm.capShiftPct || null,
      capNew: !!tm.capNew,
      moved: tm.moved,
      total: tm.total,
      gone: tm.gone,
      added: tm.added,
      movedProjects: tm.movedProjects,
      end: tm.untilShift == null ? null : tm.untilShift > 0 ? 'later' : tm.untilShift < 0 ? 'earlier' : tm.moved > 0 ? 'same' : null,
      shift: tm.untilShift,
    }));
}

// Per-item baseline windows for the views that draw the plan behind the
// scenario (the Gantt's ghost bars): only items that actually moved.
export function baselineWindows(comparison) {
  const out = new Map();
  for (const it of comparison?.items || []) {
    if (it.baseStart && it.baseEnd && (it.startShift || it.endShift || it.presence !== 'both')) {
      out.set(it.id, { start: it.baseStart, end: it.baseEnd, shift: it.endShift });
    }
  }
  return out;
}
