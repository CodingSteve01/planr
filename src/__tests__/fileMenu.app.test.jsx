/** @vitest-environment happy-dom */
// "I'm looking for save/load… and that's all hidden in the command palette
// now. You can do that… but not even with icons. Nothing at all."
//
// Phase 3 moved Load / Snapshots / Save as / Export / New into the `/`
// palette and left the topbar with `/` and `⚙ Settings`. It was right that
// the old five-button row was too loud, and wrong that these belong behind a
// keystroke: opening and saving a file is the first thing someone reaches
// for, not an advanced command they go hunting for.
//
// These tests pin the way back in — and that nothing was taken away to get
// it: every entry still exists in the palette too.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'File menu', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

describe('the file operations have a visible home', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); });

  it('is reachable from the topbar without touching the keyboard', async () => {
    renderApp();
    const trigger = await screen.findByTestId('file-menu-trigger');
    expect(trigger.textContent).toContain('File');

    // Closed until asked for — it is a menu, not another row of buttons.
    expect(screen.queryByTestId('file-menu')).toBeNull();
    fireEvent.click(trigger);

    const menu = screen.getByTestId('file-menu');
    expect(menu).toBeTruthy();
    for (const id of ['load', 'saveAs', 'snapshots', 'export', 'new']) {
      expect(screen.getByTestId(`file-menu-${id}`), `${id} missing`).toBeTruthy();
    }
  });

  it('every entry carries an icon, so the menu is scannable', async () => {
    renderApp();
    fireEvent.click(await screen.findByTestId('file-menu-trigger'));

    for (const id of ['load', 'saveAs', 'snapshots', 'export', 'new']) {
      const glyph = screen.getByTestId(`file-menu-${id}`).firstChild.textContent.trim();
      expect(glyph.length, `${id} has no icon`).toBeGreaterThan(0);
    }
  });

  it('names the shortcut where one exists', async () => {
    renderApp();
    fireEvent.click(await screen.findByTestId('file-menu-trigger'));

    // Save is the one with a key; it comes from shortcuts.js rather than a
    // second hardcoded copy, so it cannot drift from the keymap.
    expect(screen.getByTestId('file-menu-saveAs').textContent).toMatch(/⌘S|CtrlS/);
  });

  it('closes on Escape and on an outside click', async () => {
    renderApp();
    const trigger = await screen.findByTestId('file-menu-trigger');

    fireEvent.click(trigger);
    expect(screen.getByTestId('file-menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('file-menu')).toBeNull());

    fireEvent.click(trigger);
    expect(screen.getByTestId('file-menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByTestId('file-menu')).toBeNull());
  });

  it('acting on an entry closes the menu', async () => {
    renderApp();
    fireEvent.click(await screen.findByTestId('file-menu-trigger'));

    fireEvent.click(screen.getByTestId('file-menu-snapshots'));
    await waitFor(() => expect(screen.queryByTestId('file-menu')).toBeNull());
  });

  it('takes nothing away — the palette still carries every one of them', async () => {
    renderApp();
    await screen.findByTestId('file-menu-trigger');

    fireEvent.keyDown(window, { key: '/' });
    const palette = await screen.findByTestId('command-palette');
    const text = palette.textContent;
    for (const label of ['Load', 'Snapshots', 'Save as', 'Export', 'New project']) {
      expect(text, `palette lost "${label}"`).toContain(label);
    }
  });
});

describe('the palette is scannable, not a wall of text', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); });

  it('gives every command an icon', async () => {
    renderApp();
    await screen.findByTestId('file-menu-trigger');
    fireEvent.keyDown(window, { key: '/' });

    const rows = [...(await screen.findByTestId('command-palette')).querySelectorAll('[role="option"]')];
    expect(rows.length, 'no commands rendered').toBeGreaterThan(10);

    const withoutIcon = rows.filter(r => !r.firstChild?.textContent?.trim());
    expect(withoutIcon.map(r => r.textContent)).toEqual([]);
  });
});
