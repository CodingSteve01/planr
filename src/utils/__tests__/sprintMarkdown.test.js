import { describe, test, expect, vi, beforeEach } from 'vitest';
import { schedule } from '../scheduler.js';
import { iso } from '../date.js';

const downloads = [];
vi.mock('../export/fileHelpers.js', () => ({
  download: (blob, name) => downloads.push({ blob, name }),
  slug: s => String(s || 'plan').toLowerCase(),
}));
const { exportSprintMarkdown } = await import('../export/textExports.js');

const teams = [{ id: 'T1', name: 'Frontend', color: '#3b82f6' }];
const members = [
  { id: 'M1', name: 'Anna Noor', team: 'T1', cap: 1, vac: 25, start: '2020-01-01' },
  { id: 'M2', name: 'Ben Ortiz', team: 'T1', cap: 1, vac: 25, start: '2020-01-01' },
];
const task = (id, name, best, assign, extra = {}) => ({
  id,
  name,
  team: 'T1',
  best,
  factor: 1,
  status: 'open',
  assign: [assign],
  ...extra,
});
const tree = [
  { id: 'P1', name: 'Kundenbereich', team: '', best: 0 },
  task('P1.1', 'Login maske', 3, 'M1'),
  task('P1.2', 'Passwort | Reset', 2, 'M1'),
  task('P1.3', 'Profil seite', 2, 'M2'),
  task('P1.4', 'Verworfene Idee', 2, 'M1', { dropped: true }),
  task('P1.5', 'Schon fertig', 1, 'M2', { status: 'done', progress: 100 }),
];

function run() {
  const planStart = iso(new Date());
  const opts = { now: planStart, anchorToToday: false, discountProgress: false, autoCascade: true };
  const { results } = schedule(tree, members, [], planStart, '2027-12-31', {}, [1, 2, 3, 4, 5], planStart, opts);
  return exportSprintMarkdown({ scheduled: results, tree, teams, meta: { name: 'Kundenbereich' }, horizonDays: 90 });
}

const lastMarkdown = () => downloads[downloads.length - 1].blob.text();

describe('exportSprintMarkdown()', () => {
  beforeEach(() => {
    downloads.length = 0;
  });

  test('one section per person, sorted by name, each with its own tasks', async () => {
    run();
    const md = await lastMarkdown();
    const sections = md.split('\n').filter(l => l.startsWith('## '));
    expect(sections).toEqual(['## Anna Noor', '## Ben Ortiz']);
    const [, anna, ben] = md.split(/^## /m);
    expect(anna).toContain('Login maske');
    expect(anna).toContain('Passwort');
    expect(anna).not.toContain('Profil seite');
    expect(ben).toContain('Profil seite');
    expect(ben).not.toContain('Login maske');
  });

  test("items follow the person's queue order", async () => {
    run();
    const md = await lastMarkdown();
    expect(md.indexOf('Login maske')).toBeLessThan(md.indexOf('Passwort'));
    const dates = [...md.split(/^## /m)[1].matchAll(/^\| (\d{4}-\d{2}-\d{2}) \|/gm)].map(m => m[1]);
    expect(dates).toHaveLength(2);
    expect([...dates].sort()).toEqual(dates);
  });

  test('dropped and finished items are absent', async () => {
    run();
    const md = await lastMarkdown();
    expect(md).not.toContain('Verworfene Idee');
    expect(md).not.toContain('Schon fertig');
    expect(md).toContain('3 tasks, 2 lanes');
  });

  test('a pipe in a name does not break the table row', async () => {
    run();
    const md = await lastMarkdown();
    expect(md).toContain('Passwort \\| Reset');
  });

  test('the file is named after the plan and the horizon', () => {
    run();
    expect(downloads[0].name).toBe('kundenbereich-sprint-90d.md');
  });
});
