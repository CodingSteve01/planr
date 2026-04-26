/** @vitest-environment happy-dom */
// Smoke test: App must render without throwing on each branch of the
// initial-data state machine (bootstrapping → no-data splash → loaded
// project). Catches Rules-of-Hooks regressions and missing-import errors
// that vitest's pure-logic tests can't see.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function renderApp() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>,
  );
}

describe('App smoke', () => {
  beforeEach(() => {
    cleanup();
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it('mounts on a fresh state without crashing', () => {
    expect(() => renderApp()).not.toThrow();
  });

  it('mounts when a project is already in localStorage', async () => {
    const project = {
      tree: [{ id: 'P1', name: 'Test', team: 'T1', best: 5, factor: 1.5, status: 'open' }],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [],
      meetingPlans: [],
      meta: { name: 'Smoke', planStart: '2026-01-01', planEnd: '2027-01-01' },
    };
    try { localStorage.setItem('planr_v2', JSON.stringify(project)); } catch { /* ignore */ }
    expect(() => renderApp()).not.toThrow();
  });
});
