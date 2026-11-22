/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { CommandPalette } from '../components/shared/CommandPalette.jsx';
import { useGlobalKeys } from '../app/useGlobalKeys.js';

let calls;
function ctxFor(overrides = {}) {
  return {
    saveToFile: vi.fn(),
    loadFromFile: vi.fn(),
    setTab: vi.fn(),
    setModal: vi.fn(),
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
    setSearchIdx: vi.fn(),
    searchRef: { current: null },
    tab: 'tree',
    search: '',
    ...overrides,
  };
}

function Harness({ ctx }) {
  useGlobalKeys(ctx);
  return (
    <div>
      <input aria-label="field" />
      <CommandPalette commands={[]} />
    </div>
  );
}

function mount(ctx) {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <Harness ctx={ctx} />
      </ThemeProvider>
    </I18nProvider>,
  );
}

// Keys are dispatched on `body`, or on the focused input; the listener sits on window.
const press = (target, key, mods = {}) => fireEvent.keyDown(target, { key, metaKey: true, ...mods });

describe('global shortcuts on the page body', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    calls = ctxFor();
    mount(calls);
  });
  afterEach(cleanup);

  it('⌘S saves, ⇧⌘S saves as', () => {
    press(document.body, 's');
    expect(calls.saveToFile).toHaveBeenCalledTimes(1);
    expect(calls.saveToFile).toHaveBeenLastCalledWith();
    press(document.body, 'S', { shiftKey: true });
    expect(calls.saveToFile).toHaveBeenCalledTimes(2);
    expect(calls.saveToFile).toHaveBeenLastCalledWith(true);
  });

  it('Ctrl does the same as ⌘', () => {
    press(document.body, 's', { metaKey: false, ctrlKey: true });
    expect(calls.saveToFile).toHaveBeenCalledTimes(1);
  });

  it('⌘E opens the report, ⌘, the settings, ⌘O the file picker', () => {
    press(document.body, 'e');
    expect(calls.setTab).toHaveBeenCalledWith('report');
    press(document.body, ',');
    expect(calls.setModal).toHaveBeenCalledWith('settings');
    press(document.body, 'o');
    expect(calls.loadFromFile).toHaveBeenCalledTimes(1);
  });

  it('⌘K opens the command palette and a second ⌘K closes it', () => {
    const open = () => document.querySelector('input:not([aria-label="field"])');
    expect(open()).toBeNull();
    press(document.body, 'k');
    expect(open()).not.toBeNull();
    press(document.body, 'k');
    expect(open()).toBeNull();
  });

  it('⌘Z undoes, ⇧⌘Z and ⌘Y redo, and the browser default is stopped', () => {
    expect(press(document.body, 'z')).toBe(false);
    expect(calls.handleUndo).toHaveBeenCalledTimes(1);
    press(document.body, 'z', { shiftKey: true });
    press(document.body, 'y');
    expect(calls.handleRedo).toHaveBeenCalledTimes(2);
    expect(calls.handleUndo).toHaveBeenCalledTimes(1);
  });

  it('a key without ⌘ or Ctrl does nothing', () => {
    fireEvent.keyDown(document.body, { key: 's' });
    fireEvent.keyDown(document.body, { key: 'z' });
    expect(calls.saveToFile).not.toHaveBeenCalled();
    expect(calls.handleUndo).not.toHaveBeenCalled();
  });
});

describe('global shortcuts inside a text field', () => {
  let input;
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    calls = ctxFor();
    const view = mount(calls);
    input = view.getByLabelText('field');
    input.focus();
  });
  afterEach(cleanup);

  it('undo and redo stay with the field: not called, not prevented', () => {
    expect(press(input, 'z')).toBe(true);
    expect(press(input, 'z', { shiftKey: true })).toBe(true);
    expect(press(input, 'y')).toBe(true);
    expect(calls.handleUndo).not.toHaveBeenCalled();
    expect(calls.handleRedo).not.toHaveBeenCalled();
  });

  it('⌘S still saves from a field', () => {
    press(input, 's');
    expect(calls.saveToFile).toHaveBeenCalledTimes(1);
  });

  it('⌘E, ⌘, and ⌘O are left to the field', () => {
    press(input, 'e');
    press(input, ',');
    press(input, 'o');
    expect(calls.setTab).not.toHaveBeenCalled();
    expect(calls.setModal).not.toHaveBeenCalled();
    expect(calls.loadFromFile).not.toHaveBeenCalled();
  });
});
