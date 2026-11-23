/** @vitest-environment happy-dom */
// Start-up must never stay on the boot screen: when reading the mounted file
// (or the stored handle) never settles, the app gives up after a limit.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, act, fireEvent } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { FILE_READ_TIMEOUT_MS } from '../utils/withTimeout.js';
import { SK } from '../constants.js';

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

const never = () => new Promise(() => {});

function handle({ getFile, name = 'plan.md' }) {
  return {
    name,
    kind: 'file',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFile,
    createWritable: vi.fn(async () => ({ write: async () => {}, close: async () => {} })),
  };
}

const okFile = async () => ({ name: 'plan.md', lastModified: 1000, text: async () => PLAN });

// Hosted: the host (the Obsidian plugin) hands the document over.
function mountApp(mount) {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <App mount={mount} onFileChange={() => {}} />
      </ThemeProvider>
    </I18nProvider>,
  );
}

// A handle store that answers with `stored`, the way IndexedDB does: the
// result arrives after the caller has set its handlers.
function fakeHandleStore(stored) {
  const answer = (req, result) => {
    queueMicrotask(() => {
      req.result = result;
      req.onsuccess?.();
    });
    return req;
  };
  const db = {
    transaction: () => {
      const tx = {
        objectStore: () => ({
          get: () => answer({}, stored),
          put: () => answer({}, undefined),
          delete: () => answer({}, undefined),
        }),
      };
      return tx;
    },
    close: () => {},
  };
  return { open: () => answer({}, db) };
}

// In the browser: the handle comes from the store, the app is not hosted.
function mountBrowser(stored) {
  vi.stubGlobal('indexedDB', fakeHandleStore(stored));
  return render(
    <I18nProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>,
  );
}

async function pass(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('boot restore with a hanging read', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows the restore screen with the file name when getFile never settles, not the cached copy', async () => {
    // A cached local copy exists; it must not be shown as if it were the file.
    localStorage.setItem(SK, JSON.stringify({ tree: [{ id: 'C1', name: 'Cached Thing', children: [] }] }));
    const h = handle({ getFile: never });
    mountBrowser(h);
    await pass(100);
    expect(screen.getByText('Restoring project context...')).toBeTruthy();
    await pass(FILE_READ_TIMEOUT_MS);
    expect(screen.queryByText('Restoring project context...')).toBeNull();
    expect(screen.getByText('plan.md')).toBeTruthy();
    expect(screen.getByText('Reactivate file access')).toBeTruthy();
    expect(screen.queryByText('Cached Thing')).toBeNull();
    expect(h.createWritable).not.toHaveBeenCalled();
    expect(console.warn.mock.calls.flat().join(' ')).toMatch(/read the file/);
  });

  it('ignores a read that arrives after the limit', async () => {
    let release;
    const late = new Promise(r => (release = r));
    const h = handle({ getFile: () => late });
    mountBrowser(h);
    await pass(FILE_READ_TIMEOUT_MS + 100);
    expect(screen.getByText('Reactivate file access')).toBeTruthy();
    await act(async () => {
      release({ name: 'plan.md', lastModified: 1, text: async () => PLAN });
    });
    await pass(2000);
    expect(screen.getByText('Reactivate file access')).toBeTruthy();
    expect(screen.queryByText('Alpha Task')).toBeNull();
    expect(h.createWritable).not.toHaveBeenCalled();
  });

  it('starts without a mount when the handle store never answers', async () => {
    vi.stubGlobal('indexedDB', { open: () => ({}) });
    render(
      <I18nProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </I18nProvider>,
    );
    await pass(FILE_READ_TIMEOUT_MS + 100);
    expect(screen.queryByText('Restoring project context...')).toBeNull();
    expect(screen.queryByText('Reactivate file access')).toBeNull();
    expect(console.warn.mock.calls.flat().join(' ')).toMatch(/stored file handle/);
  });

  it('still loads the file on the normal path', async () => {
    mountApp(handle({ getFile: okFile }));
    await pass(50);
    expect(screen.getByText('Alpha Task')).toBeTruthy();
    await pass(FILE_READ_TIMEOUT_MS + 100);
    expect(screen.getByText('Alpha Task')).toBeTruthy();
  });

  it('reactivate: a hanging read shows a message and frees the button again', async () => {
    let hang = true;
    const h = handle({ getFile: () => (hang ? never() : okFile()) });
    mountBrowser(h);
    await pass(FILE_READ_TIMEOUT_MS + 100);
    const btn = () => screen.getByRole('button', { name: /Reactivate file access|Reading file/ });
    await act(async () => {
      fireEvent.click(btn());
    });
    await pass(10);
    expect(btn().disabled).toBe(true);
    await pass(FILE_READ_TIMEOUT_MS + 100);
    expect(screen.getByRole('alert').textContent).toMatch(/did not load in time/i);
    expect(btn().disabled).toBe(false);
    expect(screen.getByText('Discard mount')).toBeTruthy();
    // Trying again works once the file answers.
    hang = false;
    await act(async () => {
      fireEvent.click(btn());
    });
    await pass(50);
    expect(screen.getByText('Alpha Task')).toBeTruthy();
  });

  it('reactivate: a broken file names the cause instead of asking to try again', async () => {
    let broken = false;
    const h = handle({
      name: 'plan.json',
      getFile: () => (broken ? Promise.resolve({ name: 'plan.json', lastModified: 1, text: async () => '{' }) : never()),
    });
    mountBrowser(h);
    await pass(FILE_READ_TIMEOUT_MS + 100);
    broken = true;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reactivate file access' }));
    });
    await pass(50);
    const alert = screen.getByRole('alert').textContent;
    expect(alert).toMatch(/could not be read: /i);
    expect(alert).not.toMatch(/in time/i);
    expect(screen.getByText('Discard mount')).toBeTruthy();
  });

  it('hosted: a slow file offers to try again, without the browser hint or a discard', async () => {
    mountApp(handle({ getFile: never }));
    await pass(FILE_READ_TIMEOUT_MS + 100);
    expect(screen.getByText('plan.md')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText(/Browser security/)).toBeNull();
    expect(screen.queryByText('Discard mount')).toBeNull();
    expect(screen.getByText(/taking long to load/)).toBeTruthy();
  });
});
