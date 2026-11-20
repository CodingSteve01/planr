// The comparison PDF: what it must say, read off the document definition.
import { describe, test, expect } from 'vitest';
import { buildScenarioReportDoc } from '../scenarioReport.js';
import { PRINT } from '../printPalette.js';

const model = (over = {}) => ({
  lang: 'en',
  planName: 'Acme',
  scenarioName: 'Without Ben',
  footerName: 'Acme · scenario “Without Ben”',
  kind: 'Scenario',
  title: 'Scenario comparison',
  subtitle: 'Acme against the scenario “Without Ben” · as of 20/11/26',
  story: [{ name: 'Frontend', text: '4 → 3 people (−26 % capacity). 37 of 38 open tasks move.' }],
  conflict: '',
  kpis: [
    {
      label: 'Dates',
      sub: 'projects with a target date',
      figures: [
        { n: '1', label: 'newly late', tone: 'risk' },
        { n: '0', label: 'back in time' },
      ],
    },
    { label: 'Changes', sub: 'tasks moved: 37', figures: [{ n: '1' }] },
  ],
  sections: [
    {
      id: 'changes',
      title: 'What the scenario assumes',
      headers: ['', 'Kind', 'What', 'Change'],
      widths: [10, 95, 230, '*'],
      rows: [['−', 'People', 'Ben Ortiz', 'removed']],
    },
    {
      id: 'projects',
      title: 'Projects',
      headers: ['Project', 'Shift', ''],
      widths: ['*', 60, 80],
      rows: [
        ['P6  Mobile app', { text: '+40 wk', bold: true, tone: 'risk' }, { text: 'newly late', tone: 'risk', bold: true }],
        ['P8  Billing', { text: '±0', bold: true }, 'end holds'],
      ],
    },
    { id: 'teams', title: 'Teams', empty: 'No team differs.', headers: ['Team'], widths: ['*'], rows: [] },
    { id: 'items', title: 'Tasks', headers: ['Task'], widths: ['*'], rows: [['P6.1  Auth']], note: 'and 12 more, with smaller shifts' },
  ],
  foot: 'A scenario is a what-if.',
  ...over,
});

// Every string in the nested definition, in order.
function texts(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach(n => texts(n, out));
    return out;
  }
  if (typeof node === 'object') {
    for (const key of ['text', 'stack', 'columns', 'content']) if (key in node) texts(node[key], out);
    if (node.table?.body) texts(node.table.body, out);
  }
  return out;
}
const find = (node, pred, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach(n => find(n, pred, out));
    return out;
  }
  if (pred(node)) out.push(node);
  for (const key of ['text', 'stack', 'columns', 'content']) if (node[key] && typeof node[key] === 'object') find(node[key], pred, out);
  if (node.table?.body) find(node.table.body, pred, out);
  return out;
};

describe('the scenario comparison PDF', () => {
  test('says on the page and on every footer that this is a scenario, and which', () => {
    const dd = buildScenarioReportDoc(model());
    const all = texts(dd.content).join(' | ');
    expect(all).toContain('SCENARIO');
    expect(all).toContain('Scenario comparison');
    expect(all).toContain('Without Ben');
    const footer = texts(dd.footer(2, 4)).join(' ');
    expect(footer).toContain('Acme · scenario “Without Ben”');
    expect(footer).toContain('2 / 4');
    expect(dd.info.title).toBe('Acme — Scenario comparison: Without Ben');
    // In the scenario's own colour, which no other export uses.
    expect(find(dd.content, n => n.color === PRINT.scenario).length).toBeGreaterThan(0);
  });

  test('carries the sentence per team, the figures and every row it was given', () => {
    const all = texts(buildScenarioReportDoc(model()).content).join(' | ');
    for (const piece of [
      'Frontend: ',
      '4 → 3 people (−26 % capacity)',
      'newly late',
      'DATES',
      'Ben Ortiz',
      'removed',
      'P6  Mobile app',
      '+40 wk',
      'P8  Billing',
      'end holds',
      'P6.1  Auth',
      'and 12 more',
      'A scenario is a what-if.',
    ]) {
      expect(all, `missing: ${piece}`).toContain(piece);
    }
  });

  test('a section title counts its rows; an empty section says so instead of drawing an empty table', () => {
    const dd = buildScenarioReportDoc(model());
    const all = texts(dd.content).join(' | ');
    expect(all).toContain('Projects  ·  2');
    expect(all).toContain('No team differs.');
    expect(all).not.toContain('Teams  ·  0');
  });

  test('red and green only where the model says so', () => {
    const dd = buildScenarioReportDoc(model());
    const risky = find(dd.content, n => n.color === PRINT.risk).flatMap(n => texts(n));
    expect(risky).toEqual(expect.arrayContaining(['1', '+40 wk', 'newly late']));
    expect(risky).not.toContain('±0');
    expect(find(dd.content, n => n.color === PRINT.done)).toEqual([]);
  });

  test('a note about changes that no longer apply is on the page when there is one', () => {
    expect(texts(buildScenarioReportDoc(model()).content).join(' ')).not.toContain('left out');
    const dd = buildScenarioReportDoc(model({ conflict: '2 changes were left out.' }));
    expect(texts(dd.content).join(' ')).toContain('2 changes were left out.');
  });

  test("German footer wording follows the model's language", () => {
    const footer = texts(buildScenarioReportDoc(model({ lang: 'de' })).footer(1, 1)).join(' ');
    expect(footer).toContain('erstellt mit');
  });
});
