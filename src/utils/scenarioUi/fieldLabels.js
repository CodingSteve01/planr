const FIELD_LABELS = {
  name: 'scn.f.name',
  assign: 'scn.f.assign',
  team: 'scn.f.team',
  best: 'scn.f.best',
  factor: 'scn.f.factor',
  prio: 'scn.f.prio',
  status: 'scn.f.status',
  progress: 'scn.f.progress',
  deps: 'scn.f.deps',
  softDeps: 'scn.f.softDeps',
  pinnedStart: 'scn.f.pinnedStart',
  decideBy: 'scn.f.decideBy',
  date: 'scn.f.date',
  dropped: 'scn.f.dropped',
  displayOrder: 'scn.f.order',
  note: 'scn.f.note',
  description: 'scn.f.description',
  phases: 'scn.f.phases',
  cap: 'scn.f.cap',
  start: 'scn.f.start',
  end: 'scn.f.end',
  vac: 'scn.f.vac',
  teams: 'scn.f.teams',
  role: 'scn.f.role',
  weeklyHours: 'scn.f.weeklyHours',
  capMode: 'scn.f.capMode',
  meetings: 'scn.f.meetings',
  capChanges: 'scn.f.capChanges',
  meetingChanges: 'scn.f.meetingChanges',
  meetingPlanIds: 'scn.f.meetingPlans',
  teamLock: 'scn.f.teamLock',
  confidence: 'scn.f.confidence',
  handoffPlan: 'scn.f.handoff',
  color: 'scn.f.color',
  order: 'scn.f.order',
  planStart: 'scn.f.planStart',
  planEnd: 'scn.f.planEnd',
  workDays: 'scn.f.workDays',
  severity: 'scn.f.severity',
  type: 'scn.f.type',
  customValues: 'scn.f.custom',
  fixedDays: 'scn.f.fixedDays',
  due: 'scn.f.due',
};
// Fields whose value is a structure: saying THAT it changed is the honest
// amount of detail for one line.
const OPAQUE = new Set([
  'phases',
  'meetings',
  'capChanges',
  'meetingChanges',
  'meetingPlanIds',
  'handoffPlan',
  'customValues',
  'note',
  'description',
  'order',
  'displayOrder',
  'workDays',
]);
const DATE_FIELDS = new Set(['pinnedStart', 'decideBy', 'date', 'start', 'end', 'planStart', 'planEnd', 'due']);
const PRIO_KEYS = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'low' };
function changeTitle(c, t, text, fmt) {
  if (c.kind === 'item') return { id: c.id, title: c.name || c.id };
  if (c.kind === 'person' || c.kind === 'team') return { title: c.name || c.id };
  if (c.kind === 'absence')
    return { title: `${text.person(c.person)} · ${fmt.date(c.from)} – ${fmt.date(c.to)}${c.note ? ` · ${c.note}` : ''}` };
  if (c.kind === 'holiday') return { title: `${fmt.date(c.date)}${c.name ? ` · ${c.name}` : ''}` };
  if (c.kind === 'order') return { title: text.owner(c.id) };
  const setKey = `scn.set.${c.name}`;
  return { title: FIELD_LABELS[c.name] ? t(FIELD_LABELS[c.name]) : t(setKey) === setKey ? t('scn.set.other') : t(setKey) };
}
export { FIELD_LABELS, OPAQUE, DATE_FIELDS, PRIO_KEYS, changeTitle };
