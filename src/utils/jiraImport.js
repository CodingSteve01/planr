// Jira → a plan, on the first day.
//
// The export has existed since early on and the reconcile half since the Run
// mode rebuild, so a plan could be pushed to Jira and kept honest against it.
// What was missing was the direction everybody actually starts in: the tickets
// are already in Jira, and typing two hundred of them into a tree by hand is
// not a beginning anybody makes.
//
// No backend and no credentials: Jira's own "Export → CSV (all fields)", or a
// copied search result, is pasted in. The parsing is `parseJiraTable` from
// jiraSync.js — the same forgiving one reconciliation uses, so a paste that
// works for one works for the other, and the Jira key lands in the custom
// field that reconciliation looks for. Import on Monday, reconcile on Friday.
import { mapJiraStatus, normalizeKey } from './jiraSync.js';

// Jira's priority names → the plan's 1..4. Anything unrecognised is 3, the
// middle: guessing "critical" from a word we do not know would put work at the
// front of the schedule on no evidence.
const PRIO_WORDS = [
  [1, ['highest', 'blocker', 'critical', 'kritisch', 'sehr hoch', 'höchste', 'hoechste']],
  [2, ['high', 'hoch', 'major']],
  [4, ['lowest', 'low', 'niedrig', 'trivial', 'minor', 'gering']],
];

export function mapJiraPriority(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 3;
  for (const [prio, words] of PRIO_WORDS) {
    if (words.some(word => text.includes(word))) return prio;
  }
  return 3;
}

// Jira writes an estimate as seconds (CSV), as "3d 4h" (the UI), or as a bare
// story-point number. Days out, because that is the plan's unit — and 0 when
// there is nothing to read, which the plan already understands as "unestimated"
// rather than "takes no time".
const HOURS_PER_DAY = 8;

export function mapJiraEstimate(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 0;
  // "3d 4h 30m" / "2w"
  const parts = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*([wdhm])/g)];
  if (parts.length) {
    const days = parts.reduce((sum, [, num, unit]) => {
      const n = parseFloat(num.replace(',', '.'));
      if (unit === 'w') return sum + n * 5;
      if (unit === 'd') return sum + n;
      if (unit === 'h') return sum + n / HOURS_PER_DAY;
      return sum + n / (HOURS_PER_DAY * 60);
    }, 0);
    return Math.round(days * 10) / 10;
  }
  const num = parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return 0;
  // A plain number is seconds in Jira's CSV (28800 = one day) and story points
  // anywhere a human typed it. Nothing distinguishes them but scale, so the
  // split is where a story-point count stops being plausible.
  if (num >= 3600) return Math.round(num / 3600 / HOURS_PER_DAY * 10) / 10;
  return Math.round(num * 10) / 10;
}

// Which rows are epics. Type first; failing that, a row somebody else names as
// their parent is a parent whatever its type column says.
const EPIC_WORDS = ['epic', 'epos', 'initiative', 'theme'];
const SUBTASK_WORDS = ['sub-task', 'subtask', 'sub task', 'unteraufgabe', 'teilaufgabe'];

export function isEpicType(type) {
  const text = String(type ?? '').trim().toLowerCase();
  return EPIC_WORDS.some(word => text.includes(word));
}
export function isSubtaskType(type) {
  const text = String(type ?? '').trim().toLowerCase();
  return SUBTASK_WORDS.some(word => text.includes(word));
}

// Match a Jira assignee to somebody already on the plan. Jira writes display
// names ("Anna Beck"), account ids, or an email; a plan writes whatever the
// user typed. Compare on the normalised name and on the local part of an
// email, and take no guess beyond that — a wrong assignee is worse than none,
// because the scheduler will act on it.
const norm = text => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function matchMember(assignee, members = []) {
  const wanted = norm(assignee);
  if (!wanted) return null;
  const local = norm(String(assignee).split('@')[0]);
  for (const member of members) {
    const name = norm(member?.name);
    if (name && (name === wanted || name === local)) return member.id;
    if (member?.id && norm(member.id) === wanted) return member.id;
  }
  return null;
}

// Order the rows into a forest, then number them the way the plan numbers its
// own tree: roots P1, P2, …, children P1.1, P1.1.1.
//
// `parent` may point at a key that is not in the paste (someone exported one
// sprint out of a bigger board). Those rows are roots here rather than lost —
// the alternative is silently dropping work the user can see in the preview.
function buildForest(rows) {
  const byKey = new Map(rows.map(row => [row.key, row]));
  const childrenOf = new Map();
  const roots = [];

  const parentKeyOf = row => {
    const parent = normalizeKey(row.parent);
    if (!parent || parent === row.key || !byKey.has(parent)) return null;
    // A cycle would hang the walk below. Follow the chain up and refuse the
    // link if it comes back around.
    const seen = new Set([row.key]);
    let cursor = parent;
    while (cursor) {
      if (seen.has(cursor)) return null;
      seen.add(cursor);
      const next = normalizeKey(byKey.get(cursor)?.parent);
      cursor = next && byKey.has(next) ? next : null;
    }
    return parent;
  };

  rows.forEach(row => {
    const parent = parentKeyOf(row);
    if (!parent) { roots.push(row); return; }
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(row);
  });

  return { roots, childrenOf };
}

/**
 * Turn parsed Jira rows into a plan tree.
 *
 * @param rows      from `parseJiraTable(text).rows`
 * @param members   the plan's people, for matching assignees
 * @param jiraFieldId  custom field that holds the ticket key ('jira' by default)
 * @param groupUnder   optional name for a single wrapping root. Without it,
 *                     every epic (or parentless ticket) becomes its own
 *                     top-level project, which is right when the paste IS the
 *                     board and wrong when it is one project out of several.
 * @param startAt      first free root number, so an import can be added to a
 *                     plan that already has projects rather than only seed one
 */
export function buildTreeFromJira({ rows = [], members = [], jiraFieldId = 'jira', groupUnder = '', startAt = 1 } = {}) {
  // No rows, no tree — not even the wrapping project. Otherwise an empty
  // paste produces a plan containing one empty project, and the dialog's
  // "import 1 item" button happily offers it.
  if (!rows.length) return { tree: [], imported: 0, rootCount: 0, unmatchedAssignees: [] };
  const { roots, childrenOf } = buildForest(rows);
  const tree = [];
  const unmatchedAssignees = new Set();
  let imported = 0;

  const emit = (row, id) => {
    imported++;
    const status = row.mapped || mapJiraStatus(row.status) || 'open';
    const memberId = matchMember(row.assignee, members);
    if (row.assignee && !memberId) unmatchedAssignees.add(row.assignee);
    const best = mapJiraEstimate(row.estimate);
    const node = {
      id,
      name: row.summary || row.key,
      status,
      progress: status === 'done' ? 100 : 0,
      prio: mapJiraPriority(row.priority),
      best,
      factor: 1.5,
      assign: memberId ? [memberId] : [],
      deps: [],
      customValues: { [jiraFieldId]: row.key },
    };
    tree.push(node);
    return node;
  };

  const walk = (row, id) => {
    emit(row, id);
    const kids = childrenOf.get(row.key) || [];
    kids.forEach((kid, i) => walk(kid, `${id}.${i + 1}`));
  };

  if (groupUnder) {
    const rootId = `P${startAt}`;
    tree.push({
      id: rootId, name: groupUnder, status: 'open', progress: 0,
      prio: 2, best: 0, factor: 1.5, assign: [], deps: [],
    });
    roots.forEach((row, i) => walk(row, `${rootId}.${i + 1}`));
  } else {
    roots.forEach((row, i) => walk(row, `P${startAt + i}`));
  }

  // A parent's estimate comes from its children (docs/data-model.md, progress
  // cascade), so an epic that carried its own hours in Jira would double-count.
  const hasChildren = new Set(tree.filter(n => n.id.includes('.')).map(n => n.id.slice(0, n.id.lastIndexOf('.'))));
  tree.forEach(node => { if (hasChildren.has(node.id)) node.best = 0; });

  return {
    tree,
    imported,
    rootCount: groupUnder ? 1 : roots.length,
    unmatchedAssignees: [...unmatchedAssignees],
  };
}

// New members for the assignees nobody on the plan matched. Offered rather
// than applied: importing a board can name a dozen people who are not on this
// team, and a resource list quietly filled with them makes the capacity
// numbers wrong in a way nobody would think to look for.
export function membersForAssignees(names = [], existing = []) {
  const taken = new Set(existing.map(member => String(member?.id || '').toLowerCase()));
  return names.map(name => {
    const base = String(name).trim().split('@')[0];
    const initials = base.split(/[\s.]+/).filter(Boolean).map(part => part[0].toUpperCase()).join('').slice(0, 3) || 'X';
    let id = initials;
    let n = 2;
    while (taken.has(id.toLowerCase())) { id = `${initials}${n++}`; }
    taken.add(id.toLowerCase());
    return { id, name: base, team: '', cap: 1, vac: 25 };
  });
}

// The shell a first-start import needs around its tree.
//
// Coming in through the onboarding screen there is no plan yet, so the import
// has to produce one. It is the same shell the new-project wizard builds — the
// standard template's risks, sizes and task templates, NRW holidays across the
// plan years, two teams to start from — with the tree coming from the paste
// instead of from an empty form. Everything here is editable afterwards under
// Settings; the point is that the user lands in a working plan rather than in
// a second form.
export function buildImportedProject({ nodes = [], members = [], name = '', t, today = new Date() } = {}) {
  const planStart = today.toISOString().slice(0, 10);
  const planEnd = new Date(today.getFullYear() + 2, 11, 31).toISOString().slice(0, 10);
  return {
    meta: {
      name: name || (t ? t('ji.title') : 'Jira'),
      planStart,
      planEnd,
      holidays: 'NRW',
      version: '2',
    },
    teams: [
      { id: 'T1', name: 'Frontend', color: '#3b82f6' },
      { id: 'T2', name: 'Backend', color: '#f43f5e' },
    ],
    members,
    vacations: [],
    tree: nodes,
    holidays: [],
    planYears: [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1, today.getFullYear() + 2],
  };
}
