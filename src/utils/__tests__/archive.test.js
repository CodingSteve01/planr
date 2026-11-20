import { describe, expect, test } from 'vitest';
import { scanArchive, stripArchivedRoots, stripArchivedMembers, ageInDays } from '../archive.js';

const NOW = new Date('2026-09-10T12:00:00');

// A root that wrapped up in April — old news by any threshold under ~5 months.
const oldRoot = [
  { id: 'D1', name: 'E-Rechnungspflicht', type: 'deadline', status: 'done', completedAt: '2026-04-14' },
  { id: 'D1.1', name: 'Export anpassen', status: 'done', completedAt: '2026-04-14', completedEnd: '2026-04-14' },
  { id: 'D1.2', name: 'Format 2.5', status: 'done', completedAt: '2026-05-18', completedEnd: '2026-05-18' },
];
// Finished, but only weeks ago — still worth showing.
const freshRoot = [
  { id: 'Pr1', name: 'Umfirmierung', status: 'done', completedAt: '2026-07-09' },
  { id: 'Pr1.1', name: 'Buchhaltungs-Umstellung', status: 'done', completedAt: '2026-07-09', completedEnd: '2026-07-09' },
];
// Live project.
const openRoot = [
  { id: 'F1', name: 'Fundament', status: 'wip' },
  { id: 'F1.1', name: 'Plattform', status: 'done', completedAt: '2025-12-16' },
  { id: 'F1.2', name: 'Design-System', status: 'open' },
];

describe('scanArchive — roots', () => {
  test('archives a root whose newest completion is older than the threshold', () => {
    const { rootIds, roots } = scanArchive({ tree: [...oldRoot, ...openRoot], days: 90, now: NOW });

    expect([...rootIds]).toEqual(['D1']);
    // Age measured from the NEWEST leaf completion (2026-05-18), not the root stamp.
    expect(roots[0]).toMatchObject({ id: 'D1', doneOn: '2026-05-18', leafCount: 2 });
    expect(roots[0].ageDays).toBe(ageInDays('2026-05-18', NOW));
  });

  test('keeps a recently finished root visible', () => {
    const { rootIds } = scanArchive({ tree: [...oldRoot, ...freshRoot], days: 90, now: NOW });

    expect(rootIds.has('Pr1')).toBe(false);
    expect(rootIds.has('D1')).toBe(true);
  });

  test('a lower threshold pulls the recent root in too', () => {
    const { rootIds } = scanArchive({ tree: [...oldRoot, ...freshRoot], days: 30, now: NOW });

    expect([...rootIds].sort()).toEqual(['D1', 'Pr1']);
  });

  test('never archives a root with open work below it', () => {
    const { rootIds } = scanArchive({ tree: openRoot, days: 1, now: NOW });

    expect(rootIds.size).toBe(0);
  });

  test('leaves a done root alone when no completion date was ever recorded', () => {
    // Without a date we cannot tell whether this finished yesterday or in 2019.
    const tree = [
      { id: 'X1', name: 'Undated', status: 'done' },
      { id: 'X1.1', name: 'Child', status: 'done' },
    ];

    expect(scanArchive({ tree, days: 1, now: NOW }).rootIds.size).toBe(0);
  });

  test('falls back to the root stamp when only the root carries a date', () => {
    const tree = [
      { id: 'X1', name: 'Root-dated', status: 'done', completedAt: '2026-01-05' },
      { id: 'X1.1', name: 'Child', status: 'done' },
    ];

    expect(scanArchive({ tree, days: 90, now: NOW }).rootIds.has('X1')).toBe(true);
  });

  test('an empty root (no leaves at all) is not archived', () => {
    const tree = [{ id: 'X1', name: 'Placeholder', status: 'open' }];
    // A childless root IS its own leaf, so status decides — open stays.
    expect(scanArchive({ tree, days: 1, now: NOW }).rootIds.size).toBe(0);
  });
});

describe('scanArchive — members', () => {
  const members = [
    { id: 'MI', name: 'Mia', end: '2026-04-23' },
    { id: 'ML', name: 'Mara' },
    { id: 'TO', name: 'Tom', end: '2026-09-01' },
    { id: 'NB', name: 'Noah', end: '2027-01-01' },
  ];

  test('archives only members offboarded longer ago than the threshold', () => {
    const { memberIds, members: rows } = scanArchive({ members, days: 90, now: NOW });

    expect([...memberIds]).toEqual(['MI']);
    expect(rows[0]).toMatchObject({ id: 'MI', end: '2026-04-23' });
  });

  test('ignores members without an end date and future offboards', () => {
    const { memberIds } = scanArchive({ members, days: 1, now: NOW });

    expect(memberIds.has('ML')).toBe(false);
    expect(memberIds.has('NB')).toBe(false);
    expect(memberIds.has('TO')).toBe(true);
  });
});

describe('strip helpers', () => {
  test('stripArchivedRoots removes the whole subtree', () => {
    const tree = [...oldRoot, ...openRoot];
    const left = stripArchivedRoots(tree, new Set(['D1']));

    expect(left.map(node => node.id)).toEqual(['F1', 'F1.1', 'F1.2']);
  });

  test('strip helpers return the input untouched for an empty set', () => {
    const tree = [...openRoot];
    expect(stripArchivedRoots(tree, new Set())).toBe(tree);
    expect(stripArchivedMembers([{ id: 'A' }], new Set()).length).toBe(1);
  });

  test('stripArchivedMembers drops exactly the archived ids', () => {
    const left = stripArchivedMembers([{ id: 'MI' }, { id: 'ML' }], new Set(['MI']));
    expect(left.map(m => m.id)).toEqual(['ML']);
  });
});
