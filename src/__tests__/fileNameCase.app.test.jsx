/** @vitest-environment happy-dom */
// A Markdown plan is a Markdown plan whatever the case of its extension:
// `Plan.MD` used to be handed to JSON.parse and failed to open.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { isMarkdownName } from '../utils/fileKind.js';

const PLAN = `# Upper

## Plan

| Field | Value |
|---|---|
| Start | 2026-01-05 |

## Resources
- **Anna Noor** \`AN\` — Dev, Engineer

## Work Tree

- **P1** Project
  - **P1.1** Alpha Task (S 5T ×1) — Dev [AN]
`;

function handleNamed(name) {
  return {
    name,
    kind: 'file',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFile: async () => ({ name, lastModified: 1000, text: async () => PLAN }),
    createWritable: async () => ({ write: async () => {}, close: async () => {} }),
  };
}

describe('isMarkdownName', () => {
  it('ignores the case of the extension and only looks at the end', () => {
    expect(isMarkdownName('plan.md')).toBe(true);
    expect(isMarkdownName('Plan.MD')).toBe(true);
    expect(isMarkdownName('team.planr.md')).toBe(true);
    expect(isMarkdownName('plan.json')).toBe(false);
    expect(isMarkdownName('notes.md.json')).toBe(false);
    expect(isMarkdownName(undefined)).toBe(false);
  });
});

describe('opening a plan whose extension is upper case', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('parses Plan.MD as Markdown', async () => {
    render(
      <I18nProvider>
        <ThemeProvider>
          <App mount={handleNamed('Plan.MD')} onFileChange={() => {}} />
        </ThemeProvider>
      </I18nProvider>,
    );
    expect(await screen.findByText('Alpha Task', {}, { timeout: 10000 })).toBeTruthy();
  }, 20000);
});
