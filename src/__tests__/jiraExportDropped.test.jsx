/** @vitest-environment happy-dom */
// Dropped work must not be pushed into Jira.
//
// Everything else in the app treats a dropped item as gone: it leaves both
// sides of every fraction, the schedule, the report and the PDFs. The Jira CSV
// was the one export still offering it as a ticket to create — which would put
// abandoned work back on a board, where it outlives the decision to drop it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { JiraExportModal } from '../components/modals/JiraExportModal.jsx';
import { exportJiraCSV } from '../utils/exports.js';

const TREE = [
  { id: 'A', name: 'Projekt Alpha', status: 'wip', team: 'T1' },
  { id: 'A.1', name: 'Alpha eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
  { id: 'A.2', name: 'Alpha zwei verworfen', status: 'open', team: 'T1', best: 40, factor: 1, dropped: true },
];
const MEMBERS = [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0 }];
const TEAMS = [{ id: 'T1', name: 'Team Eins', color: '#3b82f6' }];
const META = { name: 'Jira', planStart: '2026-01-05' };

describe('the Jira CSV leaves dropped work behind', () => {
  let csv;
  beforeEach(() => {
    csv = '';
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    vi.spyOn(Blob.prototype, 'text').mockImplementation(function () { return Promise.resolve(''); });
    // The download helper is DOM-bound; capture the Blob's text instead.
    vi.spyOn(document, 'createElement').mockImplementation(function (tag) {
      const el = Object.getPrototypeOf(document).createElement.call(document, tag);
      if (tag === 'a') el.click = () => {};
      return el;
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('does not offer it as a ticket to create', async () => {
    const blobs = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class extends RealBlob {
      constructor(parts, opts) { super(parts, opts); blobs.push(String(parts?.[0] ?? '')); }
    });
    exportJiraCSV({ tree: TREE, scheduled: [], members: MEMBERS, teams: TEAMS, meta: META });
    csv = blobs.join('\n');
    expect(csv).toContain('Alpha eins');
    expect(csv).not.toContain('Alpha zwei verworfen');
  });

  it('and does not even list it in the preview', () => {
    render(
      <I18nProvider><ThemeProvider>
        <JiraExportModal tree={TREE} scheduled={[]} members={MEMBERS} teams={TEAMS} meta={META} onClose={() => {}} />
      </ThemeProvider></I18nProvider>,
    );
    expect(screen.queryByText('Alpha eins')).toBeTruthy();
    expect(screen.queryByText('Alpha zwei verworfen')).toBeNull();
  });
});

// The two remaining exports that draw the tree itself rather than the numbers.
// A dropped item legitimately appears in both — the Tree view shows it too, so
// you can take it back — but it must be marked as dropped, not drawn as work
// still ahead of the team.
describe('the structural exports say when something was dropped', () => {
  const capture = fn => {
    const blobs = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class extends RealBlob {
      constructor(parts, opts) { super(parts, opts); blobs.push(String(parts?.[0] ?? '') + String(parts?.[1] ?? '')); }
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      const el = realCreate(tag);
      if (tag === 'a') el.click = () => {};
      return el;
    });
    fn();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    return blobs.join('\n');
  };

  it('Mermaid gives it its own class instead of drawing it as open work', async () => {
    const { exportMermaid } = await import('../utils/exports.js');
    const out = capture(() => exportMermaid({ tree: TREE, meta: META }));
    expect(out).toContain('classDef dropped');
    expect(out).toContain('class A_2 dropped');
    expect(out).not.toContain('class A_1 dropped');
  });

  it('the plain CSV carries the flag, so a round trip cannot revive it', async () => {
    const { exportCSV } = await import('../utils/exports.js');
    const out = capture(() => exportCSV({ tree: TREE, meta: META }));
    const [hdr, ...rows] = out.replace(/^﻿/, '').trim().split('\n');
    const col = hdr.split(';').indexOf('Dropped');
    expect(col).toBeGreaterThan(-1);
    const rowOf = id => rows.find(r => r.split(';')[0] === id).split(';');
    expect(rowOf('A.2')[col]).toBe('yes');
    expect(rowOf('A.1')[col]).toBe('');
  });
});
