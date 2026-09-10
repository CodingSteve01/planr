import { describe, expect, test } from 'vitest';
import {
  parseJiraTable, mapJiraStatus, detectJiraFieldId, linkHealth, reconcile, statusPatches,
} from '../jiraSync.js';

const tree = [
  { id: 'D1', name: 'E-Rechnungspflicht', status: 'wip' },
  { id: 'D1.1', name: 'DMS für NAV-Zugferd anpassen', status: 'wip', customValues: { jira: 'NA-385' } },
  { id: 'D1.2', name: 'Zugferd 2.5', status: 'open', customValues: { jira: 'NA-266' } },
  { id: 'D1.3', name: 'Masken UI', status: 'open' },
  { id: 'D1.4', name: 'Doppelt verlinkt', status: 'open', customValues: { jira: 'na-266' } },
  { id: 'D1.5', name: 'Altlast', status: 'done' },
];

describe('mapJiraStatus', () => {
  test('maps the common English and German workflow names', () => {
    expect(mapJiraStatus('Done')).toBe('done');
    expect(mapJiraStatus('Erledigt')).toBe('done');
    expect(mapJiraStatus('Abgeschlossen')).toBe('done');
    expect(mapJiraStatus('In Progress')).toBe('wip');
    expect(mapJiraStatus('In Bearbeitung')).toBe('wip');
    expect(mapJiraStatus('In Review')).toBe('wip');
    expect(mapJiraStatus('To Do')).toBe('open');
    expect(mapJiraStatus('Backlog')).toBe('open');
  });

  test('an unknown status falls back to open, never to done', () => {
    expect(mapJiraStatus('Wartet auf Kunde')).toBe('open');
    expect(mapJiraStatus('')).toBe(null);
  });
});

describe('detectJiraFieldId', () => {
  test('prefers a declared custom field', () => {
    expect(detectJiraFieldId([{ id: 'cf_1', name: 'Jira ID' }], tree)).toBe('cf_1');
  });

  test('falls back to the key the tree actually uses', () => {
    expect(detectJiraFieldId([{ id: 'cf_1', name: 'Risiko' }], tree)).toBe('jira');
  });

  test('returns empty when nothing looks like a ticket field', () => {
    expect(detectJiraFieldId([], [{ id: 'P1', customValues: { colour: 'red' } }])).toBe('');
  });
});

describe('parseJiraTable', () => {
  test('parses a Jira CSV export with quoted fields', () => {
    const csv = [
      'Summary,Issue key,Status,Assignee',
      '"DMS anpassen, inkl. Zugferd",NA-385,Done,Steffen Lüling',
      'Zugferd 2.5,NA-266,In Progress,Marco Zurwonne',
    ].join('\n');

    const { rows, skipped, error } = parseJiraTable(csv);

    expect(error).toBe(null);
    expect(skipped).toBe(0);
    expect(rows[0]).toMatchObject({
      key: 'NA-385', summary: 'DMS anpassen, inkl. Zugferd', status: 'Done', mapped: 'done',
      assignee: 'Steffen Lüling',
    });
    expect(rows[1].mapped).toBe('wip');
  });

  test('parses semicolon CSV and German headers', () => {
    const csv = 'Vorgangsschlüssel;Zusammenfassung;Status;Bearbeiter\nNA-38;Zugferd Integration;Erledigt;MZ';

    const { rows } = parseJiraTable(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'NA-38', summary: 'Zugferd Integration', mapped: 'done', assignee: 'MZ' });
  });

  test('parses a clipboard TSV paste', () => {
    const tsv = 'Issue key\tSummary\tStatus\nNA-361\tFinale Mandantenerstellung\tDone';

    expect(parseJiraTable(tsv).rows[0]).toMatchObject({ key: 'NA-361', mapped: 'done' });
  });

  test('handles a headerless key+status paste', () => {
    const { rows, error } = parseJiraTable('NA-385\tDone\nNA-266\tIn Progress');

    expect(error).toBe(null);
    expect(rows.map(r => [r.key, r.mapped])).toEqual([['NA-385', 'done'], ['NA-266', 'wip']]);
  });

  test('skips junk lines and duplicate keys instead of failing', () => {
    const csv = 'Issue key,Status\nNA-385,Done\n,Done\nnonsense,Done\nNA-385,To Do';

    const { rows, skipped } = parseJiraTable(csv);

    expect(rows).toHaveLength(1);
    expect(skipped).toBe(3);
  });

  test('reports empty and unusable input', () => {
    expect(parseJiraTable('').error).toBe('empty');
    expect(parseJiraTable('Name,Owner\nAnna,Bob').error).toBe('noKeyColumn');
  });

  test('does not mistake "Status Category" for the status column', () => {
    const csv = 'Issue key,Status Category,Status\nNA-1,Done,In Progress';

    expect(parseJiraTable(csv).rows[0]).toMatchObject({ status: 'In Progress', mapped: 'wip' });
  });
});

describe('linkHealth', () => {
  test('separates linked, unlinked and duplicate keys', () => {
    const health = linkHealth(tree, 'jira');

    expect(health.linked.map(r => r.id)).toEqual(['D1.1', 'D1.2', 'D1.4']);
    // Keys are compared case-insensitively — "na-266" is the same ticket.
    expect(health.duplicates).toEqual([{ key: 'NA-266', ids: ['D1.2', 'D1.4'] }]);
    // D1 is a parent (epic-level), so it is not counted as missing a ticket.
    expect(health.unlinked.map(r => r.id)).toEqual(['D1.3', 'D1.5']);
    expect(health.unlinkedOpen.map(r => r.id)).toEqual(['D1.3']);
  });
});

describe('reconcile', () => {
  const { rows } = parseJiraTable([
    'Issue key,Summary,Status',
    'NA-385,DMS für NAV-Zugferd anpassen,Done',
    'NA-266,Zugferd 2.5 – Format,In Progress',
    'NA-999,Ganz neues Ticket,To Do',
  ].join('\n'));

  test('flags status drift with the target Planr status', () => {
    const result = reconcile({ tree, rows, jiraFieldId: 'jira' });

    expect(result.matched).toBe(3);
    expect(result.statusDiff).toEqual([
      { id: 'D1.1', name: 'DMS für NAV-Zugferd anpassen', key: 'NA-385', planrStatus: 'wip', jiraStatus: 'Done', target: 'done' },
      { id: 'D1.2', name: 'Zugferd 2.5', key: 'NA-266', planrStatus: 'open', jiraStatus: 'In Progress', target: 'wip' },
      { id: 'D1.4', name: 'Doppelt verlinkt', key: 'NA-266', planrStatus: 'open', jiraStatus: 'In Progress', target: 'wip' },
    ]);
  });

  test('flags renamed tickets but ignores whitespace-only differences', () => {
    const result = reconcile({ tree, rows, jiraFieldId: 'jira' });

    expect(result.summaryDrift.map(r => r.id)).toEqual(['D1.2', 'D1.4']);

    const same = parseJiraTable('Issue key,Summary,Status\nNA-385,"DMS   für NAV-Zugferd  anpassen",Done').rows;
    expect(reconcile({ tree, rows: same, jiraFieldId: 'jira' }).summaryDrift).toEqual([]);
  });

  test('lists tickets missing from the plan and plan items missing from Jira', () => {
    const result = reconcile({ tree, rows, jiraFieldId: 'jira' });

    expect(result.missingInPlanr.map(r => r.key)).toEqual(['NA-999']);
    expect(result.missingInJira).toEqual([]);

    const partial = parseJiraTable('Issue key,Status\nNA-385,Done').rows;
    expect(reconcile({ tree, rows: partial, jiraFieldId: 'jira' }).missingInJira.map(r => r.id))
      .toEqual(['D1.2', 'D1.4']);
  });

  test('marks a Jira row that names a known Planr id', () => {
    const withId = parseJiraTable('Issue key,Status,Planr ID\nNA-777,Done,D1.3').rows;

    expect(reconcile({ tree, rows: withId, jiraFieldId: 'jira' }).missingInPlanr[0])
      .toMatchObject({ key: 'NA-777', knownPlanrId: 'D1.3' });
  });
});

describe('statusPatches', () => {
  const diffs = [
    { id: 'D1.1', target: 'done' },
    { id: 'D1.2', target: 'wip' },
    { id: 'D1.3', target: 'open' },
  ];

  test('moves progress with the status', () => {
    const patches = statusPatches(diffs, null, [
      ...tree,
      { id: 'D1.2', name: 'Zugferd 2.5', status: 'open', progress: 0 },
    ]);

    expect(patches.find(p => p.id === 'D1.1')).toMatchObject({ status: 'done', progress: 100 });
    expect(patches.find(p => p.id === 'D1.2')).toMatchObject({ status: 'wip', progress: 50 });
    expect(patches.find(p => p.id === 'D1.3')).toMatchObject({ status: 'open', progress: 0 });
  });

  test('keeps recorded partial progress when moving to wip', () => {
    const patches = statusPatches([{ id: 'X', target: 'wip' }], null, [{ id: 'X', status: 'open', progress: 30 }]);

    expect(patches[0].progress).toBe(30);
  });

  test('applies only the accepted ids', () => {
    const patches = statusPatches(diffs, new Set(['D1.1']), tree);

    expect(patches.map(p => p.id)).toEqual(['D1.1']);
  });

  test('skips ids that no longer exist in the tree', () => {
    expect(statusPatches([{ id: 'ghost', target: 'done' }], null, tree)).toEqual([]);
  });
});
