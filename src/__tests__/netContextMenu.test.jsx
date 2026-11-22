/** @vitest-environment happy-dom */
// The right-click menu on a network node speaks the UI language and names the
// item the way the rest of the app does, not by its internal id.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { I18nProvider } from '../i18n.jsx';
import { NetContextMenu } from '../components/views/net/NetContextMenu.jsx';

function renderMenu(lang) {
  localStorage.setItem('planr_lang', lang);
  const iMap = { 'P1.2': { id: 'P1.2', name: 'Rechnungen prüfen' } };
  render(
    <I18nProvider>
      <NetContextMenu
        ctxMenu={{ id: 'P1.2', x: 10, y: 10 }}
        iMap={iMap}
        onDeleteNode={() => {}}
        onNodeClick={() => {}}
        portalRoot={document.body}
        setCtxMenu={() => {}}
        setSelId={() => {}}
      />
    </I18nProvider>,
  );
}

describe('the node context menu', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('is English in English and shows the name, not the id', () => {
    renderMenu('en');
    expect(screen.getByText('Edit “Rechnungen prüfen”')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.queryByText(/P1\.2/)).toBeNull();
  });

  it('is German in German', () => {
    renderMenu('de');
    expect(screen.getByText('Bearbeiten: „Rechnungen prüfen“')).toBeTruthy();
    expect(screen.getByText('Löschen')).toBeTruthy();
  });
});
