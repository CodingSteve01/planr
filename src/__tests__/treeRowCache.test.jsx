/** @vitest-environment happy-dom */
// The tree's rows are cached: a row whose inputs did not change returns the
// element it had. The list of inputs has to name everything a row shows, or a
// row quietly stops updating. These are the inputs that list had missed.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { TreeView } from '../components/views/TreeView.jsx';

const tree = [
  { id: 'P1', name: 'Project', status: 'wip', deps: [], assign: [] },
  { id: 'P1.1', name: 'Alpha Task', status: 'open', best: 3, factor: 1, team: 'T1', assign: ['m1'], deps: [] },
];
const teams = [{ id: 'T1', name: 'Frontend', color: '#3b82f6' }];
// One object each, the same on every render: a row is only rebuilt when an
// input changes, so nothing here may change by accident.
const members = [{ id: 'm1', name: 'Anna Noor', team: 'T1', cap: 1 }];
const stable = {
  tree,
  teams,
  members,
  scheduled: [],
  stats: {},
  cpSet: new Set(),
  cpLabels: {},
  selected: null,
  multiSel: new Set(),
  onSelect: () => {},
  onUpdate: () => {},
  search: '',
};
const props = extra => ({ ...stable, ...extra });
const ui = extra => (
  <I18nProvider>
    <ThemeProvider>
      <TreeView {...props(extra)} />
    </ThemeProvider>
  </I18nProvider>
);
const rowText = () => [...document.querySelectorAll('tbody tr')].map(tr => tr.textContent).join('\n');

describe('a cached tree row follows what it shows', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
  });

  it('the id column, when ids are switched off and on', () => {
    const view = render(ui({ showIds: true }));
    expect(rowText()).toContain('P1.1');
    view.rerender(ui({ showIds: false }));
    expect(document.querySelectorAll('tbody tr td').length).toBeGreaterThan(0);
    const without = rowText();
    view.rerender(ui({ showIds: true }));
    expect(rowText()).not.toBe(without);
    expect(rowText()).toContain('P1.1');
  });

  it('the initials, when a person is renamed', () => {
    const view = render(ui({}));
    expect(rowText()).toContain('AN');
    view.rerender(ui({ members: [{ id: 'm1', name: 'Ben Ortiz', team: 'T1', cap: 1 }] }));
    expect(rowText()).toContain('BO');
    expect(rowText()).not.toContain('AN');
  });

  it("the scenario's mark, when the set of changed rows changes", () => {
    const view = render(ui({ changedIds: null }));
    expect(document.querySelector('.scn-row')).toBeNull();
    view.rerender(ui({ changedIds: new Set(['P1.1']) }));
    expect(document.querySelector('.scn-row')).toBeTruthy();
    view.rerender(ui({ changedIds: null }));
    expect(document.querySelector('.scn-row')).toBeNull();
  });

  it("the review window's badge, when the state it compares with changes", () => {
    // The task is open now. Against a past that does not know it, it is new;
    // against a past where it was already open, nothing changed.
    const view = render(ui({ diff: { pastLeafState: new Map() } }));
    expect(rowText()).toContain('NEW');
    view.rerender(ui({ diff: { pastLeafState: new Map([['P1.1', { status: 'open', progress: 0 }]]) } }));
    expect(rowText()).not.toContain('NEW');
  });
});
