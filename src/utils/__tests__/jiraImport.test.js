// Starting from the board you already have.
//
// The export and the reconcile half both existed; the direction everybody
// actually starts in did not. These hold the two things that make a paste
// worth trusting: the hierarchy survives it, and nothing is silently dropped
// or silently guessed.
import { describe, it, expect } from 'vitest';
import { parseJiraTable } from '../jiraSync.js';
import {
  buildTreeFromJira, mapJiraPriority, mapJiraEstimate,
  matchMember, membersForAssignees, isEpicType, isSubtaskType,
} from '../jiraImport.js';

const CSV = [
  'Issue key,Summary,Issue Type,Status,Assignee,Parent,Priority,Original Estimate',
  'NA-1,Billing rebuild,Epic,In Progress,,,High,',
  'NA-2,Invoice list screen,Story,Done,Anna Beck,NA-1,Medium,28800',
  'NA-3,Invoice detail screen,Story,To Do,bob.jones@example.com,NA-1,Highest,3d',
  'NA-4,Wire up the API,Sub-task,To Do,Anna Beck,NA-3,Low,4h',
  'NA-9,Unrelated bug,Bug,To Do,,,Lowest,',
].join('\n');

const MEMBERS = [
  { id: 'AB', name: 'Anna Beck' },
  { id: 'CD', name: 'Carl Dorn' },
];

const parse = text => parseJiraTable(text).rows;

describe('reading a Jira export', () => {
  it('picks up the columns the import needs on top of the ones reconcile uses', () => {
    const rows = parse(CSV);
    expect(rows).toHaveLength(5);
    const detail = rows.find(r => r.key === 'NA-3');
    expect(detail.type).toBe('Story');
    expect(detail.parent).toBe('NA-1');
    expect(detail.priority).toBe('Highest');
    expect(detail.estimate).toBe('3d');
  });

  it('reads the hierarchy from Epic Link when the export has no Parent column', () => {
    const rows = parse([
      'Issue key,Summary,Epic Link',
      'NA-2,Invoice list,NA-1',
    ].join('\n'));
    expect(rows[0].parent).toBe('NA-1');
  });
});

describe('a priority', () => {
  it.each([['Highest', 1], ['Blocker', 1], ['High', 2], ['Medium', 3], ['Low', 4], ['Lowest', 4]])
    ('maps %s to %i', (word, prio) => expect(mapJiraPriority(word)).toBe(prio));

  it('lands in the middle when the word means nothing here', () => {
    // Guessing "critical" out of an unknown word would put work at the front
    // of the schedule on no evidence.
    expect(mapJiraPriority('Dringlichkeitsstufe Rot')).toBe(3);
    expect(mapJiraPriority('')).toBe(3);
  });
});

describe('an estimate', () => {
  it('reads Jira seconds as days', () => expect(mapJiraEstimate('28800')).toBe(1));
  it('reads the "3d 4h" form', () => expect(mapJiraEstimate('3d 4h')).toBe(3.5));
  it('reads a week as five days', () => expect(mapJiraEstimate('2w')).toBe(10));
  it('takes a small bare number as story points, not seconds', () => expect(mapJiraEstimate('5')).toBe(5));
  it('is 0 when there is nothing to read', () => {
    // Which the plan already understands as "unestimated", not "takes no time".
    expect(mapJiraEstimate('')).toBe(0);
    expect(mapJiraEstimate('n/a')).toBe(0);
  });
});

describe('an assignee', () => {
  it('matches a display name', () => expect(matchMember('Anna Beck', MEMBERS)).toBe('AB'));
  it('matches the local part of an email', () => expect(matchMember('anna.beck@x.de', MEMBERS)).toBe('AB'));
  it('matches an id', () => expect(matchMember('CD', MEMBERS)).toBe('CD'));
  it('refuses to guess', () => {
    // A wrong assignee is worse than none: the scheduler acts on it.
    expect(matchMember('Anna', MEMBERS)).toBeNull();
    expect(matchMember('', MEMBERS)).toBeNull();
  });
});

describe('building the tree', () => {
  const built = () => buildTreeFromJira({ rows: parse(CSV), members: MEMBERS });

  it('keeps the hierarchy the board had', () => {
    const { tree } = built();
    const byKey = Object.fromEntries(tree.map(n => [n.customValues.jira, n.id]));
    expect(byKey['NA-1']).toBe('P1');
    expect(byKey['NA-2']).toBe('P1.1');
    expect(byKey['NA-3']).toBe('P1.2');
    expect(byKey['NA-4']).toBe('P1.2.1');
    // A ticket with no parent is its own project, not a lost row.
    expect(byKey['NA-9']).toBe('P2');
  });

  it('imports every row it was given', () => {
    const { tree, imported } = built();
    expect(imported).toBe(5);
    expect(tree).toHaveLength(5);
  });

  it('puts the ticket key where reconciliation looks for it', () => {
    // Import on Monday, reconcile on Friday — jiraSync.linkHealth reads this
    // exact field.
    const { tree } = built();
    expect(tree.every(n => n.customValues?.jira)).toBe(true);
  });

  it('carries status, priority, estimate and assignee across', () => {
    const { tree } = built();
    const list = tree.find(n => n.customValues.jira === 'NA-2');
    expect(list.status).toBe('done');
    expect(list.progress).toBe(100);
    expect(list.prio).toBe(3);
    expect(list.best).toBe(1);
    expect(list.assign).toEqual(['AB']);
  });

  it('leaves an unmatched assignee unassigned, and says who', () => {
    const { tree, unmatchedAssignees } = built();
    const detail = tree.find(n => n.customValues.jira === 'NA-3');
    expect(detail.assign).toEqual([]);
    expect(unmatchedAssignees).toEqual(['bob.jones@example.com']);
  });

  it('does not let a parent carry its own estimate', () => {
    // A parent's effort is the sum of its children (data-model.md), so an epic
    // that had hours on it in Jira would be counted twice.
    const { tree } = buildTreeFromJira({
      rows: parse([
        'Issue key,Summary,Parent,Original Estimate',
        'NA-1,Epic,,5d',
        'NA-2,Child,NA-1,2d',
      ].join('\n')),
    });
    expect(tree.find(n => n.id === 'P1').best).toBe(0);
    expect(tree.find(n => n.id === 'P1.1').best).toBe(2);
  });

  it('wraps everything under one project when asked', () => {
    const { tree, rootCount } = buildTreeFromJira({ rows: parse(CSV), groupUnder: 'Abrechnung' });
    expect(rootCount).toBe(1);
    expect(tree[0]).toMatchObject({ id: 'P1', name: 'Abrechnung' });
    expect(tree.find(n => n.customValues?.jira === 'NA-1').id).toBe('P1.1');
    expect(tree.find(n => n.customValues?.jira === 'NA-9').id).toBe('P1.2');
  });

  it('gives back nothing at all for an empty paste, not an empty project', () => {
    // Otherwise the dialog offers "import 1 item" for a blank textarea.
    expect(buildTreeFromJira({ rows: [], groupUnder: 'Something' }))
      .toMatchObject({ tree: [], imported: 0, rootCount: 0 });
  });

  it('numbers from the first free root, so it can be added to a plan that has one', () => {
    const { tree } = buildTreeFromJira({ rows: parse(CSV), startAt: 4 });
    expect(tree[0].id).toBe('P4');
  });

  it('survives a parent that points at a ticket outside the paste', () => {
    // One sprint exported out of a bigger board. The row is a root here rather
    // than lost — the user can see it in the preview either way.
    const { tree } = buildTreeFromJira({
      rows: parse(['Issue key,Summary,Parent', 'NA-2,Orphan,NA-999'].join('\n')),
    });
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('P1');
  });

  it('survives a cycle instead of hanging on it', () => {
    const { tree, imported } = buildTreeFromJira({
      rows: parse([
        'Issue key,Summary,Parent',
        'NA-1,A,NA-2',
        'NA-2,B,NA-1',
      ].join('\n')),
    });
    expect(imported).toBe(2);
    expect(tree.map(n => n.id).sort()).toEqual(['P1', 'P2']);
  });
});

describe('people the paste names', () => {
  it('proposes one member per unmatched assignee, with unique initials', () => {
    const proposed = membersForAssignees(['Bob Jones', 'Bea Jansen'], [{ id: 'AB', name: 'Anna Beck' }]);
    expect(proposed.map(m => m.id)).toEqual(['BJ', 'BJ2']);
    expect(proposed[0].name).toBe('Bob Jones');
  });

  it('does not collide with somebody already on the plan', () => {
    const proposed = membersForAssignees(['Anna Beck'], [{ id: 'AB', name: 'Anna Beck' }]);
    expect(proposed[0].id).toBe('AB2');
  });
});

describe('issue types', () => {
  it('recognises an epic and a sub-task', () => {
    expect(isEpicType('Epic')).toBe(true);
    expect(isEpicType('Story')).toBe(false);
    expect(isSubtaskType('Sub-task')).toBe(true);
    expect(isSubtaskType('Unteraufgabe')).toBe(true);
  });
});
