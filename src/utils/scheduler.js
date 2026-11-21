// The scheduling core, split by what each part does (all under utils/scheduler/):
//   taskBasics.js        effort maths, team labels, parent ids, phase status
//   treeIndex.js         the cached tree index and the leaf/child lookups on it
//   schedule.js          schedule(): setup, ordering, the per-task loop
//   scheduleTeamSlot.js  the unassigned-task path of that loop
//   scheduleAssigned.js  the assigned-task path of that loop
//   scheduleExpand.js    splits handoff segments into their own rows
//   treeSummary.js       confidence, leaf progress, treeStats, next child id
// This file only keeps the import path every caller already uses.
export { pt, re, fixedDurationDays, scheduleEffort, parentId, derivePhaseStatus } from './scheduler/taskBasics.js';
export {
  isDropped,
  treeIndex,
  directChildren,
  hasChildren,
  isLeafNode,
  leafNodes,
  descendantLeaves,
  resolveToLeafIds,
  isDepsReady,
} from './scheduler/treeIndex.js';
export { schedule } from './scheduler/schedule.js';
export {
  computeConfidence,
  leafProgress,
  treeStats,
  enrichParentSchedules,
  deriveParentStatuses,
  nextChildId,
} from './scheduler/treeSummary.js';
