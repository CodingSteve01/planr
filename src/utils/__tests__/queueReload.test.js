// The per-person work order has to survive the file it is saved in.
//
// A Markdown plan has no ids for people or teams: they are written by name and
// handed a fresh id on every load. The queue block used to write the id it had
// in memory, so after the next load a person's order pointed at nobody and was
// dropped on the save after that — silently, one reload after it was set.
import { describe, test, expect } from 'vitest';
import { buildMarkdownText } from '../markdown.js';
import { parseMdToProject } from '../markdownParse.js';

const plan = () => ({
  meta: { name: 'X', planStart: '2026-01-05', version: '2' },
  // "Ops" first, so that team ids (T1, T2 by order of appearance) could shift.
  teams: [{ id: 'T1', name: 'Ops Team', color: '#8b5cf6' }, { id: 'T2', name: 'Ops', color: '#f0d342' }],
  members: [
    { id: 'm-old-1', name: 'Anna Noor', team: 'T1', cap: 1, vac: 25 },
    { id: 'm-old-2', name: 'Bo Lund', team: 'T2', cap: 1, vac: 25 },
  ],
  tree: [
    { id: 'P1', name: 'Project', status: 'open' },
    { id: 'P1.1', name: 'One', status: 'open', team: 'T1', best: 2, factor: 1.5, assign: ['m-old-1'], deps: [] },
    { id: 'P1.2', name: 'Two', status: 'open', team: 'T1', best: 2, factor: 1.5, assign: ['m-old-1'], deps: [] },
    { id: 'P1.3', name: 'Three', status: 'open', team: 'T2', best: 2, factor: 1.5, assign: [], deps: [] },
    { id: 'P1.4', name: 'Four', status: 'open', team: 'T2', best: 2, factor: 1.5, assign: [], deps: [] },
  ],
  vacations: [], holidays: [],
  personQueues: { 'm-old-1': ['P1.2', 'P1.1'], 'team:T2': ['P1.4', 'P1.3'] },
});
const write = d => buildMarkdownText({ tree: d.tree, members: d.members, teams: d.teams, vacations: d.vacations, meta: d.meta, data: d });

describe('the work order through a Markdown file', () => {
  test('a person keeps their order across a reload that renumbers everybody', () => {
    const loaded = parseMdToProject(write(plan()));
    const anna = loaded.members.find(m => m.name === 'Anna Noor');
    expect(anna.id).not.toBe('m-old-1');
    expect(loaded.personQueues[anna.id]).toEqual(['P1.2', 'P1.1']);
  });

  test('a team keeps its order, by name rather than by position', () => {
    const loaded = parseMdToProject(write(plan()));
    const team = loaded.teams.find(t => t.name === 'Ops');
    expect(loaded.personQueues[`team:${team.id}`]).toEqual(['P1.4', 'P1.3']);
    // Every key belongs to somebody who exists.
    const owners = new Set([...loaded.members.map(m => m.id), ...loaded.teams.map(t => `team:${t.id}`)]);
    expect(Object.keys(loaded.personQueues).every(k => owners.has(k))).toBe(true);
  });

  test('no id of a person or team is written into the block', () => {
    const md = write(plan());
    const block = md.slice(md.indexOf('```planr-queues'));
    expect(block).not.toContain('m-old-1');
    expect(block).not.toContain('team:T2');
  });

  test('it is stable: writing the reloaded plan gives the same block', () => {
    const md = write(plan());
    const again = write(parseMdToProject(md));
    const block = text => text.slice(text.indexOf('```planr-queues'), text.indexOf('```', text.indexOf('```planr-queues') + 3) + 3);
    expect(block(again)).toBe(block(md));
  });

  test('a file written by an older version: a team line follows its tasks, lines for nobody go', () => {
    const md = write(plan()).replace(/```planr-queues[\s\S]*?```/, '```planr-queues\nv1\nteam:T1 P1.1 P1.2\nm17311112223330 P1.3 P1.4\n```');
    const loaded = parseMdToProject(md);
    expect(loaded.personQueues).toEqual({ 'team:T1': ['P1.1', 'P1.2'] });
    // The number in a v1 team line may belong to another team by now. The
    // tasks say whose order it is: P1.3 and P1.4 sit with the second team.
    const moved = write(plan()).replace(/```planr-queues[\s\S]*?```/, '```planr-queues\nv1\nteam:T1 P1.3 P1.4 P1.1\n```');
    const reread = parseMdToProject(moved);
    const owner = reread.tree.find(n => n.id === 'P1.3').team;
    expect(owner).not.toBe('T1');
    expect(reread.personQueues).toEqual({ [`team:${owner}`]: ['P1.3', 'P1.4', 'P1.1'] });
    // No majority, no owner: half and half is nobody's order.
    const split = write(plan()).replace(/```planr-queues[\s\S]*?```/, '```planr-queues\nv1\nteam:T1 P1.3 P1.1\n```');
    expect(parseMdToProject(split).personQueues).toBeUndefined();
    // And the next save writes what is left in the new form, with no dead line.
    const block = write(loaded).split('```planr-queues')[1];
    expect(block).toMatch(/^\nv2\n#[^\n]+ \| P1\.1 P1\.2\n```/);
  });

  test('a queue whose owner the plan does not have is not written', () => {
    const md = write({ ...plan(), personQueues: { 'm-nobody': ['P1.2', 'P1.1'] } });
    expect(md).not.toContain('planr-queues');
    expect(md).not.toContain('Work order');
    // One known owner beside it: the block is there, without the dead line.
    const mixed = write({ ...plan(), personQueues: { 'm-nobody': ['P1.2', 'P1.1'], 'm-old-1': ['P1.2', 'P1.1'] } });
    expect(mixed.split('```planr-queues')[1]).toMatch(/^\nv2\n@AN \| P1\.2 P1\.1\n```/);
  });

  test('a duplicated short name resolves like an assignee does: the first one', () => {
    const md = write(plan()).replace('`BL`', '`AN`');
    const loaded = parseMdToProject(md);
    const anna = loaded.members.find(m => m.name === 'Anna Noor');
    expect(loaded.personQueues[anna.id]).toEqual(['P1.2', 'P1.1']);
  });
});
