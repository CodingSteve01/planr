// Exports describe the PLAN, never the screen.
//
// The views render filtered copies of the tree — hide-done, root/team/person
// filters, the archive filter, single-line roadmap mode. Every one of those is
// a display concern. An export that picked up one of them would quietly ship a
// PDF that is missing projects or reports a percentage over a subset, and the
// reader has no way to tell. That has bitten this project before.
//
// So exports do not get to choose: `buildExportCtx` derives the plan-shaped
// fields from `data` itself, and `projectScopedCtx` re-derives them defensively
// at the entry of every export function. Handing an export a filtered tree is
// therefore not "discouraged" — it does not work.
//
// What is NOT auto-repairable: `scheduled`, `stats`, `cpSet`, `goalPaths`.
// Re-deriving those needs the scheduler, holidays and work days. They are
// computed from the full tree in App.jsx and covered by
// src/__tests__/exportScope.test.jsx instead.

const asArray = value => (Array.isArray(value) ? value : []);

// Fields that describe the plan and can always be taken from the store.
function planFields(data) {
  return {
    tree: asArray(data?.tree),
    members: asArray(data?.members),
    teams: asArray(data?.teams),
    vacations: asArray(data?.vacations),
    meta: data?.meta || {},
    roadmapAssignment: data?.roadmapAssignment || null,
  };
}

// The single builder. Callers pass the derived values that need the scheduler
// (scheduled, weeks, stats, …) plus `data`; everything plan-shaped is read off
// `data`, so a filtered tree cannot get in even by accident.
export function buildExportCtx(source = {}) {
  const data = source.data || {};
  return { ...source, data, ...planFields(data) };
}

// Does this ctx describe the whole plan? Used by the guard below and asserted
// directly in tests.
export function isProjectScoped(ctx) {
  const planTree = ctx?.data?.tree;
  if (!Array.isArray(planTree)) return true; // nothing authoritative to compare against
  return Array.isArray(ctx?.tree) && ctx.tree.length === planTree.length;
}

// Called at the top of every export entry point. Repairs rather than throws:
// the user asked for a document, and the correct document is the one covering
// the whole plan. A repair is a bug in the caller, so it is logged loudly.
export function projectScopedCtx(ctx, label = 'export') {
  if (!ctx?.data?.tree) return ctx;
  if (isProjectScoped(ctx)) return ctx;
  // eslint-disable-next-line no-console
  console.warn(
    `[planr] ${label} was handed a filtered tree (${ctx.tree?.length ?? 0} of `
    + `${ctx.data.tree.length} items). Exports always cover the whole plan — using the full tree.`,
  );
  return { ...ctx, ...planFields(ctx.data) };
}
