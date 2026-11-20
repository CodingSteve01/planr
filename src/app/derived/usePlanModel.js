import { useCallback, useMemo } from 'react';
import { iso } from '../../utils/date.js';
import { sortTree } from '../../utils/treeEdit.js';
import { buildHMap } from '../../utils/holidays.js';
import { inferGanttViewStart } from '../../utils/viewWindow.js';
import { compileMembers } from '../../utils/effective.js';
import { capacityLookup } from '../../utils/capacityLens.js';
import { schedule, treeStats, enrichParentSchedules, leafNodes, computeConfidence } from '../../utils/scheduler.js';
import { projectWaits } from '../../utils/projectWaits.js';
import { rootCpm, goalCpm, criticalPathLabelMap } from '../../utils/cpm.js';
import { trimmedToHorizon } from '../planRepairs.js';

// What the document says once it has been read, scheduled and counted: the
// sorted tree, the calendar around it, the people as the scheduler sees them,
// the schedule, and the figures drawn from it. Nothing here writes to the
// document. Takes one object, returns one object.
export function usePlanModel(args) {
  const { data, members, vacations, meta, past } = args;
  // One order, everywhere.
  //
  // Reported after a long afternoon rearranging the tree: the work order
  // queues showed something else entirely. They did — `displayOrder` is a
  // number written onto the rows, and nothing ever reordered the ARRAY, so
  // every surface that simply walked `data.tree` was reading the order the
  // rows happened to be stored in. That was the tree's order once, before the
  // first reorder; after an afternoon of them the two had nothing to do with
  // each other (measured on the plan reported: 171 of 181 positions differed).
  // Only the tree view and the Gantt sorted; the queues, the resource views,
  // the report and every PDF did not, and each of them was presenting itself
  // as the plan's order.
  //
  // So the array carries the order. Sorting once here rather than in nine
  // places is also the only version that stays true — a new view cannot
  // forget to do it. The tree view still sorts its own rows, which is now a
  // no-op, and the scheduler still ranks by the same comparator.
  const tree = useMemo(() => sortTree(data?.tree || []), [data?.tree]);
  const goals = useMemo(() => tree.filter(r => !r.id.includes('.') && r.type), [tree]);
  const calendar = usePlanCalendar({ data, tree, meta });
  const crew = useCrew({ data, members });
  const sched = useSchedule({ data, tree, vacations, meta, past, ...calendar, enrichedMembers: crew.enrichedMembers });
  const facts = usePlanFacts({ tree, members, scheduled: sched.scheduled });
  return { tree, goals, ...calendar, ...crew, ...sched, ...facts };
}

const GANTT_WINDOW_PADDING_DAYS = 14;

// The holiday map and the window the plan is drawn and scheduled in.
function usePlanCalendar({ data, tree, meta }) {
  const hm = useMemo(() => buildHMap(data?.holidays || []), [data?.holidays]);
  const planStart = meta.planStart || iso(new Date());
  // viewStart = rendering start. Can be earlier than planStart for pre-started tasks.
  // planStart = scheduling start. New/unstarted tasks begin here.
  const viewStart = useMemo(() => inferGanttViewStart(tree, planStart, meta.viewStart, 14), [tree, planStart, meta.viewStart]);
  // Headroom horizon for the scheduler — +10 years so even long migrations
  // fit. After scheduling we trim the resulting `weeks` array back to the
  // latest scheduled endD + padding so the Gantt / Roadmap don't render
  // empty decades. Plans with an explicit `End` in the Plan table honour
  // that exactly.
  const SCHEDULER_HEADROOM_END = iso(new Date(new Date().getFullYear() + 10, 11, 31));
  const planEnd = meta.planEnd || SCHEDULER_HEADROOM_END;
  const workDays = meta.workDays || [1, 2, 3, 4, 5]; // Mon–Fri default
  return { hm, planStart, viewStart, planEnd, workDays };
}

// The people as the scheduler sees them, and how much of each there is on a day.
function useCrew({ data, members }) {
  // Enrich members with effective meetings (team-inherited plans + member
  // plans + individual) so the scheduler's deriveCap() sees the same capacity
  // picture as Gantt/Resource load.
  //
  // And over time: everything that changes on a date (utils/effective.js) is
  // flattened per person here, with each meeting plan resolved, because the
  // scheduler has no catalogue to look a plan up in.
  const enrichedMembers = useMemo(
    () => compileMembers({ members, teams: data?.teams || [], meetingPlans: data?.meetingPlans || [], changes: data?.changes || [] }),
    [members, data?.meetingPlans, data?.teams, data?.changes],
  );
  // The one answer to "how much of this person is there on that day", for
  // everything that draws availability (utils/capacityLens.js).
  const capacityAt = useMemo(() => capacityLookup(enrichedMembers), [enrichedMembers]);
  return { enrichedMembers, capacityAt };
}

// The schedule, the what-if reschedule and the per-project waits.
function useSchedule(args) {
  const { data, tree, enrichedMembers, vacations, viewStart, planEnd, hm, workDays, planStart, meta, past } = args;
  // A person's own order of work, when they have one. The plan's order is the
  // tree's; this is the single override, and it only permutes the slots that
  // person's work already holds (utils/personQueue.js).
  const personQueues = data?.personQueues || null;
  const { results: scheduled, weeks } = useMemo(() => {
    if (!data) return { results: [], weeks: [] };
    const out = schedule(tree, enrichedMembers, vacations, viewStart, planEnd, hm, workDays, planStart, {
      personQueues,
      ...(past ? { now: past.day } : {}),
    });
    if (meta.planEnd) return out; // explicit user choice — leave alone
    return trimmedToHorizon(out, GANTT_WINDOW_PADDING_DAYS);
  }, [data, tree, enrichedMembers, vacations, viewStart, planStart, planEnd, hm, workDays, meta.planEnd, personQueues, past?.day]);
  // The same schedule for a different tree: what-if runs for "what is this
  // project waiting on?" (utils/projectWaits.js). Answers are cached until
  // the plan changes and computed only when a view asks for a project.
  const reschedule = useCallback(
    nextTree =>
      schedule(nextTree, enrichedMembers, vacations, viewStart, planEnd, hm, workDays, planStart, {
        personQueues,
        ...(past ? { now: past.day } : {}),
      }).results,
    [enrichedMembers, vacations, viewStart, planEnd, hm, workDays, planStart, personQueues, past?.day],
  );
  const projectWaitsOf = useMemo(() => {
    const cache = new Map();
    return rootId => {
      if (!rootId) return null;
      if (!cache.has(rootId)) cache.set(rootId, projectWaits({ tree, scheduled, rootId, reschedule, members: enrichedMembers }));
      return cache.get(rootId);
    };
  }, [tree, scheduled, reschedule, enrichedMembers]);
  return { personQueues, scheduled, weeks, reschedule, projectWaitsOf };
}

// Figures drawn from the tree and its schedule: stats, the critical path,
// how confident the plan is.
function usePlanFacts({ tree, members, scheduled }) {
  const stats = useMemo(() => {
    const s = treeStats(tree);
    enrichParentSchedules(s, tree, scheduled);
    return s;
  }, [tree, scheduled]);
  const cpData = useMemo(() => rootCpm(tree), [tree]);
  const cpSet = cpData.critical;
  const cpLabels = useMemo(() => criticalPathLabelMap(cpData.rootPaths), [cpData.rootPaths]);
  const goalPaths = useMemo(() => goalCpm(tree), [tree]);
  const leaves = useMemo(() => leafNodes(tree), [tree]);
  // Dropped work leaves every count, which would make it invisible; say how
  // much of it there is, so the denominator is explicable.
  const droppedCount = useMemo(() => tree.filter(r => r.dropped).length, [tree]);
  const { confidence, reasons: confReasons } = useMemo(() => computeConfidence(tree, members), [tree, members]);
  return { stats, cpData, cpSet, cpLabels, goalPaths, leaves, droppedCount, confidence, confReasons };
}
