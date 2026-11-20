/** @vitest-environment happy-dom */
// The history log records what changed since the document was loaded — and a
// document that was only opened has not changed.
//
// The baseline every save is diffed against used to be taken when the FILE
// NAME arrived, which is before the file has been read. In a host that starts
// without a document that baseline was an empty tree, so the first save after
// every open recorded every item as "added" again. A real plan carried 11,731
// events of which 563 were changes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const PLAN = `# Baseline

## Plan

| Field | Value |
|---|---|
| Start | 2026-01-05 |

## Resources
- **Anna Noor** \`AN\` — Dev, Engineer

## Work Tree

- **P1** Project
  - **P1.1** Alpha Task (S 5T ×1) — Dev [AN]
  - **P1.2** Beta Task (S 5T ×1) — Dev [AN]
`;

// A file the host hands over: readable at once, and it keeps what is written.
function hostFile(initial) {
  const state = { text: initial, writes: [] };
  const handle = {
    name: 'baseline.planr.md',
    kind: 'file',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFile: async () => ({ name: 'baseline.planr.md', lastModified: Date.now(), text: async () => state.text }),
    createWritable: async () => ({ write: async content => { state.text = String(content); state.writes.push(state.text); }, close: async () => {} }),
  };
  return { handle, state };
}

const historyOf = text => {
  const at = text.indexOf('```planr-history');
  if (at < 0) return [];
  const body = text.slice(at).split('\n').slice(1);
  const end = body.findIndex(l => l.startsWith('```'));
  return body.slice(0, end < 0 ? body.length : end).filter(l => l && l !== 'v1' && !l.startsWith('#') && !l.startsWith('<!--'));
};

describe('the history baseline', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); localStorage.setItem('planr_tab', 'tree'); localStorage.setItem('planr_tree_ids', 'true'); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('a plan that was opened and then edited records the edit, not the whole plan', async () => {
    const { handle, state } = hostFile(PLAN);
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    const row = (await screen.findByText('Beta Task', {}, { timeout: 10000 })).closest('tr');
    fireEvent.click(row);
    fireEvent.click(screen.getByTestId('tv-delete-selected'));
    await waitFor(() => expect(screen.queryByText('Beta Task')).toBeNull());
    // Autosave writes a few seconds after the last change.
    await waitFor(() => expect(state.writes.length).toBeGreaterThan(0), { timeout: 15000, interval: 200 });
    const lines = historyOf(state.text);
    expect(lines.filter(l => l.includes('kind=added'))).toEqual([]);
    expect(lines.filter(l => l.includes('kind=removed')).map(l => l.split(' ')[1])).toEqual(['P1.2']);
  }, 30000);
});
