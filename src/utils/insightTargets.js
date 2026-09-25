// Where each clickable Insights section sends the user: the editor tab that
// holds the field, and the field to focus there. NodeModal and QuickEdit both
// read this one table, so a field that moves between tabs cannot leave one
// editor jumping to the old place — which is exactly how "People" ended up
// opening Status while the assignee picker sat on Details.
export const INSIGHT_TARGETS = {
  details: { tab: 'overview', focus: 'name' },
  customFields: { tab: 'overview', focus: 'customFields' },
  people: { tab: 'overview', focus: 'assign' },
  status: { tab: 'workflow', focus: 'status' },
  phases: { tab: 'workflow', focus: 'phases' },
  effort: { tab: 'effort', focus: 'bestDays' },
  timing: { tab: 'timing', focus: 'pinnedStart' },
  dependencies: { tab: 'timing', focus: 'deps' },
};

// Resolves a section against the tabs the editor currently shows. A tab that
// is hidden for this item (Effort on a package) falls back to Overview, so a
// click never leaves the user on the read-only Insights tab.
export function insightTarget(sectionId, tabs) {
  const target = INSIGHT_TARGETS[sectionId];
  if (!target) return { tab: 'overview', focus: null };
  const shown = tabs.some(entry => entry.id === target.tab);
  return { tab: shown ? target.tab : 'overview', focus: shown ? target.focus : null };
}
