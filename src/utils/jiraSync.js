// Jira reconciliation — the other half of the Jira export.
//
// Exporting to Jira is a one-way street: once the tickets live in Jira, the
// plan and the board drift apart. Someone closes NA-385 in Jira, the Planr
// item stays "wip"; a colleague opens three tickets that never made it into
// the plan. Finding that drift by eye across ~180 items is the part that
// actually costs an hour a week.
//
// This module does it with no backend: paste any Jira issue table (the
// "Export → CSV" download, or just a copied search result) and it matches on
// the Jira key stored in a Planr custom field, then reports the four kinds of
// drift that matter — status, summary, tickets missing from the plan, plan
// items missing a ticket.
//
// Parsing is deliberately forgiving. Jira's CSV, Confluence's clipboard TSV
// and a hand-pasted table all arrive here; refusing input because a delimiter
// guess failed would defeat the purpose.

// Jira workflow names are free-form per project, so match on substrings and
// cover the German localisation too. Anything unrecognised counts as open —
// the conservative direction, since it never silently marks work finished.
const DONE_WORDS = ['done', 'erledigt', 'closed', 'geschlossen', 'resolved', 'gelöst', 'geloest',
  'fertig', 'abgeschlossen', 'complete', 'deployed', 'released', 'live', 'abgenommen'];
const WIP_WORDS = ['progress', 'arbeit', 'bearbeitung', 'review', 'test', 'doing', 'umsetzung',
  'implementation', 'implementierung', 'entwicklung', 'qa'];

const KEY_ALIASES = ['issue key', 'issuekey', 'key', 'schlüssel', 'schluessel', 'vorgangsschlüssel',
  'vorgangsschluessel', 'ticket', 'issue id', 'issue-id'];
const SUMMARY_ALIASES = ['summary', 'zusammenfassung', 'titel', 'title', 'betreff'];
const STATUS_ALIASES = ['status', 'workflow status', 'issue status'];
const ASSIGNEE_ALIASES = ['assignee', 'bearbeiter', 'zugewiesen an', 'zugewiesen'];
const PLANR_ALIASES = ['planr id', 'planrid', 'planr-id'];

const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;

export function normalizeKey(value) {
  return String(value ?? '').trim().toUpperCase();
}

// Jira status text → Planr status. Exported so the UI can label its own
// preview rows with the same verdict the apply step will use.
export function mapJiraStatus(status) {
  const text = String(status ?? '').trim().toLowerCase();
  if (!text) return null;
  if (DONE_WORDS.some(word => text.includes(word))) return 'done';
  if (WIP_WORDS.some(word => text.includes(word))) return 'wip';
  return 'open';
}

// Which custom field holds the ticket key. Prefers an explicit field
// definition; falls back to whatever key the tree actually uses, so plans
// written before the field was named still reconcile.
export function detectJiraFieldId(customFields = [], tree = []) {
  const named = (customFields || []).find(field =>
    /jira|issue[_\s-]?key|ticket|vorgang/i.test(`${field?.id || ''} ${field?.name || ''}`));
  if (named?.id) return named.id;
  const used = new Set();
  (tree || []).forEach(node => Object.keys(node?.customValues || {}).forEach(key => used.add(key)));
  return [...used].find(key => /jira|issue[_\s-]?key|ticket/i.test(key)) || '';
}

// ── Table parsing ─────────────────────────────────────────────────────────
// Split one delimited line, honouring "quoted, fields" and "" escapes.
function splitLine(line, delimiter) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { out.push(cell.trim()); cell = ''; continue; }
    cell += char;
  }
  out.push(cell.trim());
  return out;
}

// Pick the delimiter by counting candidates outside quotes on the header line.
function guessDelimiter(headerLine) {
  const counts = ['\t', ';', ',', '|'].map(delimiter => {
    let count = 0, quoted = false;
    for (const char of headerLine) {
      if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) count++;
    }
    return { delimiter, count };
  });
  const best = counts.sort((a, b) => b.count - a.count)[0];
  return best.count > 0 ? best.delimiter : ',';
}

function matchColumn(headers, aliases) {
  // Exact alias first, then a contains-match so "Issue key (parent)" and
  // Jira's duplicated "Status Category" columns don't win over "Status".
  const exact = headers.findIndex(header => aliases.includes(header));
  if (exact >= 0) return exact;
  return headers.findIndex(header => aliases.some(alias => header.includes(alias)));
}

// Parse a pasted Jira table. Returns rows plus what went wrong, never throws.
//
// Headerless input still works when the first column looks like a Jira key —
// people paste "NA-385  In Progress" straight out of a search result.
export function parseJiraTable(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], columns: {}, skipped: 0, error: 'empty' };

  const delimiter = guessDelimiter(lines[0]);
  const first = splitLine(lines[0], delimiter);
  const headers = first.map(header => header.toLowerCase().replace(/\s+/g, ' ').trim());

  let columns = {
    key: matchColumn(headers, KEY_ALIASES),
    summary: matchColumn(headers, SUMMARY_ALIASES),
    status: matchColumn(headers, STATUS_ALIASES),
    assignee: matchColumn(headers, ASSIGNEE_ALIASES),
    planrId: matchColumn(headers, PLANR_ALIASES),
  };
  let body = lines.slice(1);

  if (columns.key < 0) {
    // No usable header — treat every line as data and locate the key column
    // by shape on the first row.
    const keyIdx = first.findIndex(cell => JIRA_KEY_RE.test(normalizeKey(cell)));
    if (keyIdx < 0) return { rows: [], columns: {}, skipped: lines.length, error: 'noKeyColumn' };
    columns = { key: keyIdx, summary: -1, status: -1, assignee: -1, planrId: -1 };
    // A bare two-column paste is almost always key + status.
    if (first.length === 2) columns.status = keyIdx === 0 ? 1 : 0;
    else if (first.length > 2) { columns.summary = keyIdx + 1; columns.status = keyIdx + 2; }
    body = lines;
  }

  const rows = [];
  let skipped = 0;
  const seen = new Set();
  body.forEach(line => {
    const cells = splitLine(line, delimiter);
    const key = normalizeKey(cells[columns.key]);
    if (!key || !JIRA_KEY_RE.test(key)) { skipped++; return; }
    if (seen.has(key)) { skipped++; return; }
    seen.add(key);
    const status = columns.status >= 0 ? (cells[columns.status] || '').trim() : '';
    rows.push({
      key,
      summary: columns.summary >= 0 ? (cells[columns.summary] || '').trim() : '',
      status,
      mapped: mapJiraStatus(status),
      assignee: columns.assignee >= 0 ? (cells[columns.assignee] || '').trim() : '',
      planrId: columns.planrId >= 0 ? (cells[columns.planrId] || '').trim() : '',
    });
  });

  return { rows, columns, skipped, error: rows.length ? null : 'noRows' };
}

// ── Reconciliation ────────────────────────────────────────────────────────
const norm = text => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const isLeaf = (tree, id) => !tree.some(node => node.id.startsWith(id + '.'));

// Everything the plan itself can tell us without a Jira paste: which items
// carry a key, which key is on two items, which open work has no ticket.
export function linkHealth(tree = [], jiraFieldId = '') {
  const linked = [];
  const unlinked = [];
  const byKey = new Map();

  (tree || []).forEach(node => {
    const raw = jiraFieldId ? node?.customValues?.[jiraFieldId] : null;
    const key = normalizeKey(raw);
    if (key) {
      const row = { id: node.id, name: node.name || node.id, key, status: node.status || 'open' };
      linked.push(row);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(row);
      return;
    }
    // Only leaves are real work packages; parents map to epics and are
    // legitimately unlinked.
    if (isLeaf(tree, node.id)) {
      unlinked.push({ id: node.id, name: node.name || node.id, status: node.status || 'open' });
    }
  });

  const duplicates = [...byKey.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, ids: rows.map(row => row.id) }));

  // Open work without a ticket is the actionable half; done work without one
  // is just history nobody will look up again.
  const unlinkedOpen = unlinked.filter(row => row.status !== 'done');

  return { linked, unlinked, unlinkedOpen, duplicates, byKey };
}

// Compare plan against a parsed Jira table.
export function reconcile({ tree = [], rows = [], jiraFieldId = '' } = {}) {
  const health = linkHealth(tree, jiraFieldId);
  const jiraByKey = new Map(rows.map(row => [row.key, row]));
  const planIds = new Set((tree || []).map(node => node.id));

  const statusDiff = [];
  const summaryDrift = [];
  const missingInJira = [];
  let matched = 0;

  health.linked.forEach(row => {
    const jira = jiraByKey.get(row.key);
    if (!jira) { missingInJira.push(row); return; }
    matched++;
    if (jira.mapped && jira.mapped !== row.status) {
      statusDiff.push({
        id: row.id, name: row.name, key: row.key,
        planrStatus: row.status, jiraStatus: jira.status, target: jira.mapped,
      });
    }
    if (jira.summary && norm(jira.summary) !== norm(row.name)) {
      summaryDrift.push({ id: row.id, name: row.name, key: row.key, jiraSummary: jira.summary });
    }
  });

  // Tickets nobody planned. A row that names a Planr ID we already have is
  // linked-but-for-the-custom-field, so report it separately from a genuinely
  // unknown ticket.
  const linkedKeys = new Set(health.linked.map(row => row.key));
  const missingInPlanr = rows
    .filter(row => !linkedKeys.has(row.key))
    .map(row => ({ ...row, knownPlanrId: row.planrId && planIds.has(row.planrId) ? row.planrId : '' }));

  return {
    matched,
    statusDiff,
    summaryDrift,
    missingInJira,
    missingInPlanr,
    unlinkedOpen: health.unlinkedOpen,
    unlinked: health.unlinked,
    duplicates: health.duplicates,
    linkedCount: health.linked.length,
  };
}

// Turn accepted status differences into tree patches. Progress moves with the
// status so the effort-weighted percentage stays consistent: done → 100,
// open → 0, wip → keep whatever partial progress was recorded (never 0/100,
// which would read as not-started / finished).
export function statusPatches(diffs = [], acceptedIds = null, tree = []) {
  const byId = new Map((tree || []).map(node => [node.id, node]));
  return diffs
    .filter(diff => !acceptedIds || acceptedIds.has(diff.id))
    .map(diff => {
      const node = byId.get(diff.id);
      if (!node) return null;
      const next = { ...node, status: diff.target };
      if (diff.target === 'done') next.progress = 100;
      else if (diff.target === 'open') next.progress = 0;
      else {
        const current = Number(node.progress) || 0;
        next.progress = current > 0 && current < 100 ? current : 50;
      }
      return next;
    })
    .filter(Boolean);
}
