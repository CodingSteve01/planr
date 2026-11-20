/** @vitest-environment happy-dom */
// The side panel and the item dialog are two doors to the same item. Tabs in
// another order, or a field under another label, is how a first click lands
// in the wrong place.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { NodeModal } from '../components/modals/NodeModal.jsx';
import { QuickEdit } from '../components/views/QuickEdit.jsx';

const tree = [
  { id: 'P1', name: 'Project', status: 'wip', deps: [], assign: [] },
  { id: 'P1.1', name: 'Selected task', status: 'wip', progress: 40, best: 3, factor: 1.3, team: 'T1', assign: ['m1'], deps: [] },
];
const common = {
  tree,
  members: [{ id: 'm1', name: 'Noah Berg', team: 'T1', cap: 1 }],
  teams: [{ id: 'T1', name: 'Backend', color: '#2563eb' }],
  taskTemplates: [],
  sizes: [],
  customFields: [],
  scheduled: [],
  cpSet: new Set(),
  stats: {},
  confidence: {},
  confReasons: {},
};
const wrap = ui =>
  render(
    <I18nProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </I18nProvider>,
  );
const tabLabels = () => [...document.querySelectorAll('[role="tab"]')].map(x => x.textContent);

function Panel({ node = tree[1], start = 'insights', ...props }) {
  const [tab, setTab] = useState(start);
  return <QuickEdit node={node} {...common} onUpdate={() => {}} tab={tab} onTabChange={setTab} {...props} />;
}

describe('the side panel matches the item dialog', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
  });

  it('shows the same tabs in the same order, for a task and for a package', () => {
    for (const node of [tree[1], tree[0]]) {
      cleanup();
      wrap(<NodeModal node={node} {...common} onClose={() => {}} onUpdate={() => {}} />);
      const dialog = tabLabels();
      cleanup();
      wrap(<Panel node={node} />);
      expect(tabLabels(), node.id).toEqual(dialog);
    }
  });

  it('keeps the assignee and the priority on Details, above the notes', () => {
    wrap(<Panel start="overview" />);
    const labels = [...document.querySelectorAll('.field > label')].map(l => l.textContent.trim());
    const at = name => labels.findIndex(l => l.startsWith(name));
    expect(at('Team')).toBeGreaterThan(-1);
    expect(at('Priority')).toBeGreaterThan(at('Team'));
    expect(at('Notes')).toBeGreaterThan(at('Priority'));
  });

  it('has the history and dropping on Status, dropping last', () => {
    const onUpdate = vi.fn();
    wrap(
      <Panel
        start="workflow"
        onUpdate={onUpdate}
        onHistoryChange={() => {}}
        historyEvents={[{ ts: '2026-05-01T10:00:00.000Z', id: 'P1.1', kind: 'added', status: 'wip', progress: 40 }]}
      />,
    );
    const history = screen.getByTestId('item-history');
    const drop = screen.getByTestId('qe-drop-toggle');
    expect(history.textContent).toContain('Created (In Progress)');
    expect(history.compareDocumentPosition(drop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(drop);
    expect(onUpdate.mock.calls.at(-1)[0].dropped).toBe(true);
  });
});
